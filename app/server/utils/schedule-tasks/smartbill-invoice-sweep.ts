// smartbill.invoice-sweep — issues SmartBill invoices for payments that have
// succeeded but haven't got an invoice id yet. Retries transparently via its
// own 5-min cadence; N consecutive failures per payment bubble up as an
// admin_audit_log row for visibility.
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { adminAuditLog, jobs, payments } from '../../db/schema';
import { createInvoice, SmartBillError, type SmartBillClient } from '../smartbill';

const SWEEP_BATCH = 20;
const STUCK_THRESHOLD = 20; // consecutive failures before we surface to admin

type BillingInfo = Partial<{
  entity: 'pj' | 'pf';
  name: string;
  cui: string;
  address: string;
  regCom: string;
  email: string;
}>;

function buildClient(bi: BillingInfo | null, fallbackEmail: string | null): SmartBillClient {
  if (bi?.entity === 'pj' && bi.name && bi.cui && bi.address) {
    return {
      entity: 'pj',
      name: bi.name,
      cui: bi.cui,
      address: bi.address,
      regCom: bi.regCom,
      email: bi.email ?? fallbackEmail ?? undefined,
    };
  }
  // Fallback: persoană fizică. Name = email-local-part or 'Client'.
  const email = bi?.email ?? fallbackEmail ?? null;
  const name = bi?.name ?? (email ? email.split('@')[0] : 'Client');
  return {
    entity: 'pf',
    name: name || 'Client',
    address: bi?.address,
    email: email ?? undefined,
  };
}

export async function runSmartBillInvoiceSweep(): Promise<{ issued: number; failed: number }> {
  const pending = await db
    .select({
      paymentId: payments.id,
      jobId: payments.jobId,
      amount: payments.amount,
      billingInfo: payments.billingInfo,
      billingEmail: jobs.billingEmail,
      stripePaymentIntentId: payments.stripePaymentIntentId,
    })
    .from(payments)
    .innerJoin(jobs, eq(jobs.id, payments.jobId))
    .where(
      and(
        eq(payments.status, 'succeeded'),
        isNull(payments.smartbillInvoiceId),
        gt(payments.createdAt, sql`now() - interval '7 days'`),
      ),
    )
    .orderBy(desc(payments.createdAt))
    .limit(SWEEP_BATCH);

  let issued = 0;
  let failed = 0;

  for (const row of pending) {
    const reference = `job:${row.jobId} pi:${row.stripePaymentIntentId ?? 'none'}`;
    const client = buildClient(row.billingInfo as BillingInfo | null, row.billingEmail);
    const totalRon = row.amount / 100; // bani → RON

    try {
      const invoice = await createInvoice({ reference, client, totalRon });
      await db
        .update(payments)
        .set({
          smartbillInvoiceId: invoice.number,
          smartbillInvoiceUrl: invoice.url,
        })
        .where(eq(payments.id, row.paymentId));
      issued += 1;
    } catch (err) {
      failed += 1;
      const kind = err instanceof SmartBillError ? err.kind : 'unknown';
      console.warn('smartbill_invoice_issue_failed', {
        paymentId: row.paymentId,
        kind,
      });

      // Count consecutive failures on this payment via audit log. If the last
      // STUCK_THRESHOLD entries for this payment all say 'smartbill_invoice_stuck',
      // skip adding another row (idempotent escalation).
      const [recent] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(adminAuditLog)
        .where(
          and(
            eq(adminAuditLog.action, 'smartbill_invoice_stuck'),
            eq(adminAuditLog.targetType, 'payment'),
            eq(adminAuditLog.targetId, row.paymentId),
            gt(adminAuditLog.createdAt, sql`now() - interval '1 day'`),
          ),
        );
      if ((Number(recent?.n ?? 0)) < STUCK_THRESHOLD) {
        try {
          await db.insert(adminAuditLog).values({
            adminEmail: 'system',
            action: 'smartbill_invoice_stuck',
            targetType: 'payment',
            targetId: row.paymentId,
            details: { kind },
          });
        } catch {
          // audit insert failure is non-fatal for the sweep
        }
      }
    }
  }

  return { issued, failed };
}
