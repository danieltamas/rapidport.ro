// POST /api/admin/jobs/[id]/refund — full Stripe refund + SmartBill reversal, admin-only.
//
// Decision policy (per PLAN-stripe-elements-and-refund-storno.md):
//   - **Full refunds only (D3).** The endpoint no longer accepts an `amount`.
//     Stripe refunds the remaining balance; SmartBill's reversal is always
//     full. Partial refunds produce asymmetric fiscal state (Romanian
//     creditNotes can't partial a single-line invoice) so we disallow them.
//   - **Query-first cancel-vs-storno (SBC).** We ask SmartBill for the
//     eFactura status and branch:
//       pending    → DELETE invoice (pre-SPV)
//       validated  → POST /invoice/reverse (issue storno / creditNote)
//       rejected   → no reversal (original was never accepted by ANAF)
//       unknown    → fall back to 4h timer using smartbill_issued_at
//   - **Pre-migration rows (SBB):** if `smartbill_issued_at` is null on a row
//     that predates migration 0006, we default to the storno path — safer
//     than a cancel that SmartBill then rejects.
//
// Side-effects are ordered so recovery stays possible:
//   1. Stripe refund (OUTSIDE any DB tx — money can't roll back).
//   2. SmartBill reversal (also outside tx).
//   3. DB tx: update payments + insert admin_audit_log.
// If the DB tx fails after Stripe / SmartBill succeeded, we log loudly —
// operator must reconcile. A second refund click short-circuits because
// payments.refundedAt / smartbill_canceled_at / storno_invoice_id are set.
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRequestIP,
  getValidatedRouterParams,
  readValidatedBody,
} from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { adminAuditLog } from '~/server/db/schema/admin_audit_log';
import { payments } from '~/server/db/schema/payments';
import { getAdminSession } from '~/server/utils/auth-admin';
import {
  cancelInvoice,
  getEfacturaStatus,
  isSmartBillConfigured,
  reverseInvoice,
  SmartBillError,
  splitInvoiceId,
} from '~/server/utils/smartbill';
import { stripe } from '~/server/utils/stripe';

const USER_AGENT_MAX = 500;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({
  // Partials are disallowed (plan decision D3). `amount` is explicitly rejected
  // here — older clients that still send it get a 400 pointing at the new
  // contract rather than silently full-refunding.
  amount: z.never().optional(),
  reason: z.string().min(5).max(500),
});

type ReversalKind = 'cancel' | 'storno' | 'none';

type ReversalResult = {
  kind: ReversalKind;
  invoiceId?: string;
  invoiceUrl?: string | null;
  note?: string;
};

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

/**
 * Decide cancel vs. storno. Query-first; fall back to 4h timer on unknown.
 * Pre-0006 rows with no issuedAt default to storno (safer).
 */
async function decideReversal(
  smartbillInvoiceId: string,
  smartbillIssuedAt: Date | null,
): Promise<ReversalKind> {
  const { series, number } = splitInvoiceId(smartbillInvoiceId);

  let status: 'pending' | 'validated' | 'rejected' | 'unknown' = 'unknown';
  try {
    status = await getEfacturaStatus(series, number);
  } catch {
    status = 'unknown';
  }

  if (status === 'pending') return 'cancel';
  if (status === 'validated') return 'storno';
  // ANAF rejected the original — there's nothing to creditNote on ANAF's side.
  // Still cancel on SmartBill so the local record matches the refund (money is
  // gone; invoice should be gone too). If SmartBill's own state doesn't allow
  // DELETE-on-rejected (rare), the cancel→storno upgrade in executeReversal
  // catches it.
  if (status === 'rejected') return 'cancel';

  // Unknown → 4h timer fallback.
  if (smartbillIssuedAt === null) return 'storno';
  const age = Date.now() - smartbillIssuedAt.getTime();
  return age < FOUR_HOURS_MS ? 'cancel' : 'storno';
}

/**
 * Execute the reversal. Handles cancel-rejection-to-storno upgrade when
 * SmartBill refuses the DELETE (race between our status query and SPV submit).
 */
async function executeReversal(
  kind: ReversalKind,
  smartbillInvoiceId: string,
): Promise<ReversalResult> {
  if (kind === 'none') return { kind: 'none' };

  const { series, number } = splitInvoiceId(smartbillInvoiceId);

  if (kind === 'cancel') {
    try {
      await cancelInvoice(series, number);
      return { kind: 'cancel' };
    } catch (err) {
      // SmartBill rejected DELETE — most likely the invoice reached SPV
      // between our status query and this call. Upgrade to storno.
      if (err instanceof SmartBillError && err.kind === 'validation') {
        const storno = await reverseInvoice(series, number);
        return {
          kind: 'storno',
          invoiceId: storno.number,
          invoiceUrl: storno.url,
          note: 'cancel_upgraded_to_storno',
        };
      }
      throw err;
    }
  }

  // storno
  const storno = await reverseInvoice(series, number);
  return {
    kind: 'storno',
    invoiceId: storno.number,
    invoiceUrl: storno.url,
  };
}

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);
  const body = await readValidatedBody(event, BodySchema.parse);

  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  // 1. Find a succeeded payment for this job.
  const [succeeded] = await db
    .select()
    .from(payments)
    .where(and(eq(payments.jobId, id), eq(payments.status, 'succeeded')))
    .limit(1);

  if (!succeeded || !succeeded.stripePaymentIntentId) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'no_succeeded_payment' },
    });
  }

  const remaining = succeeded.amount - (succeeded.refundedAmount ?? 0);
  if (remaining <= 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'already_fully_refunded' },
    });
  }

  // 2. Stripe refund (full remaining). External side-effect — never in a tx.
  const refund = await stripe.refunds.create(
    {
      payment_intent: succeeded.stripePaymentIntentId,
      amount: remaining,
      reason: 'requested_by_customer',
    },
    { idempotencyKey: `refund_${succeeded.id}_${remaining}` },
  );

  // 3. SmartBill reversal — only if we have an issued invoice AND SmartBill
  // is actually configured. Dev stays silent; prod runs the real flow.
  //
  // Idempotency: if the DB already records a canceled_at or storno_invoice_id,
  // a prior refund run already reversed the invoice (likely a post-Stripe DB
  // tx failure followed by a retry). Skip the reversal call so we don't
  // double-action SmartBill.
  let reversal: ReversalResult = { kind: 'none' };
  const alreadyReversed =
    succeeded.smartbillCanceledAt !== null ||
    succeeded.smartbillStornoInvoiceId !== null;

  if (succeeded.smartbillInvoiceId && isSmartBillConfigured() && !alreadyReversed) {
    try {
      const kind = await decideReversal(
        succeeded.smartbillInvoiceId,
        succeeded.smartbillIssuedAt,
      );
      reversal = await executeReversal(kind, succeeded.smartbillInvoiceId);
    } catch (err) {
      // Reversal failed — Stripe has already refunded. Record the failure,
      // let the admin retry manually via SmartBill UI. The audit row below
      // captures the failure cause; the response surfaces it to the admin.
      const cause = err instanceof SmartBillError ? err.kind : 'unknown';
      reversal = { kind: 'none', note: `reversal_failed_${cause}` };
    }
  } else if (alreadyReversed) {
    reversal = { kind: 'none', note: 'reversal_already_done' };
  }

  const ipHash = sha256Hex(getRequestIP(event, { xForwardedFor: true }) ?? '');
  const userAgent =
    (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX) || null;

  const newRefundedTotal = (succeeded.refundedAmount ?? 0) + remaining;

  // 4. DB tx: commit the refund + reversal bookkeeping atomically.
  try {
    await db.transaction(async (tx) => {
      const now = new Date();
      const updates: Partial<typeof payments.$inferInsert> = {
        refundedAmount: newRefundedTotal,
        refundedAt: now,
      };
      if (reversal.kind === 'cancel') {
        updates.smartbillCanceledAt = now;
      } else if (reversal.kind === 'storno' && reversal.invoiceId) {
        updates.smartbillStornoInvoiceId = reversal.invoiceId;
        updates.smartbillStornoInvoiceUrl = reversal.invoiceUrl ?? null;
        updates.smartbillStornoedAt = now;
      }

      await tx.update(payments).set(updates).where(eq(payments.id, succeeded.id));

      await tx.insert(adminAuditLog).values({
        adminEmail: session.email,
        action: 'job_refunded',
        targetType: 'job',
        targetId: id,
        details: {
          amount: remaining,
          reason: body.reason,
          stripeRefundId: refund.id,
          reversal: {
            kind: reversal.kind,
            invoiceId: reversal.invoiceId,
            note: reversal.note,
          },
        },
        ipHash,
        userAgent,
      });
    });
  } catch (err) {
    console.error('refund_db_failed_after_external', {
      paymentId: succeeded.id,
      stripeRefundId: refund.id,
      reversalKind: reversal.kind,
      reversalInvoiceId: reversal.invoiceId,
      name: (err as Error).name,
    });
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      data: {
        error: 'refund_db_reconcile_required',
        stripeRefundId: refund.id,
        reversal,
      },
    });
  }

  return {
    ok: true,
    refundId: refund.id,
    amount: remaining,
    refundedTotal: newRefundedTotal,
    reversal,
  };
});
