// POST /api/admin/jobs/[id]/refund — Stripe refund, admin-only.
// Spec: PLAN-api-admin-wave-b.md Task 1.
//
// Ordering (load-bearing):
//   1. Validate params + body (Zod).
//   2. getAdminSession defensively (middleware already enforces; we need email).
//   3. Look up succeeded payment for the job.
//   4. Compute refund amount (default = remaining).
//   5. Call stripe.refunds.create OUTSIDE any DB tx (external side-effect —
//      never rollback money). Idempotency key is `refund_{paymentId}_{amount}`.
//   6. Open a DB tx: UPDATE payments + INSERT admin_audit_log. If the tx fails
//      after Stripe succeeded, log loudly — Stripe has the source of truth and
//      the next click will 409 on `already_fully_refunded` after manual DB fix.
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRequestHeader, getRequestIP, getValidatedRouterParams, readValidatedBody } from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { adminAuditLog } from '~/server/db/schema/admin_audit_log';
import { payments } from '~/server/db/schema/payments';
import { getAdminSession } from '~/server/utils/auth-admin';
import { stripe } from '~/server/utils/stripe';

const USER_AGENT_MAX = 500;

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({
  amount: z.number().int().positive().optional(),
  reason: z.string().min(5).max(500),
});

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);
  const body = await readValidatedBody(event, BodySchema.parse);

  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  // Find a succeeded payment for this job. Historically there should be at
  // most one — take the first match.
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
  const refundAmount = body.amount ?? remaining;

  if (refundAmount <= 0 || refundAmount > remaining) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'already_fully_refunded' },
    });
  }

  // Stripe call — OUTSIDE DB tx. External side-effects don't roll back.
  const refund = await stripe.refunds.create(
    {
      payment_intent: succeeded.stripePaymentIntentId,
      amount: refundAmount,
      reason: 'requested_by_customer',
    },
    { idempotencyKey: `refund_${succeeded.id}_${refundAmount}` },
  );

  const ipHash = sha256Hex(getRequestIP(event, { xForwardedFor: true }) ?? '');
  const userAgent = (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX) || null;

  const newRefundedTotal = (succeeded.refundedAmount ?? 0) + refundAmount;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ refundedAmount: newRefundedTotal, refundedAt: new Date() })
        .where(eq(payments.id, succeeded.id));

      await tx.insert(adminAuditLog).values({
        adminEmail: session.email,
        action: 'job_refunded',
        targetType: 'job',
        targetId: id,
        details: { amount: refundAmount, reason: body.reason, stripeRefundId: refund.id },
        ipHash,
        userAgent,
      });
    });
  } catch (err) {
    // Money already left Stripe. Surface loud warning — operator must reconcile
    // the payments row manually. Cause-only log; no PII.
    console.error('refund_db_failed_after_stripe', {
      paymentId: succeeded.id,
      stripeRefundId: refund.id,
      name: (err as Error).name,
    });
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      data: { error: 'refund_db_reconcile_required', stripeRefundId: refund.id },
    });
  }

  return {
    ok: true,
    refundId: refund.id,
    amount: refundAmount,
    refundedTotal: newRefundedTotal,
  };
});
