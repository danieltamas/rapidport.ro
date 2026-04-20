import { pgTable, uuid, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

// Payments table — one row per Stripe PaymentIntent attached to a job.
// All monetary fields are RON cents (integer). billingInfo holds either a PJ
// (company) or PF (person) form blob captured at checkout for SmartBill.
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id),
    stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
    stripeFeeAmount: integer('stripe_fee_amount'),
    smartbillInvoiceId: text('smartbill_invoice_id'),
    smartbillInvoiceUrl: text('smartbill_invoice_url'),
    // Stamped by the invoice sweep when an invoice is issued. Load-bearing for
    // the 4h eFactura cutoff heuristic used as a fallback when the eFactura
    // status API is unreachable — before-SPV = DELETE, after = storno.
    smartbillIssuedAt: timestamp('smartbill_issued_at', { withTimezone: true }),
    // Reversal bookkeeping (exactly one set at most — canceled XOR stornoed).
    //   canceled  → SmartBill DELETE succeeded while the invoice was pre-SPV
    //   storno    → SmartBill reverse/creditNote issued when invoice was at SPV
    smartbillCanceledAt: timestamp('smartbill_canceled_at', { withTimezone: true }),
    smartbillStornoInvoiceId: text('smartbill_storno_invoice_id'),
    smartbillStornoInvoiceUrl: text('smartbill_storno_invoice_url'),
    smartbillStornoedAt: timestamp('smartbill_stornoed_at', { withTimezone: true }),
    amount: integer('amount').notNull(),
    currency: text('currency').default('ron').notNull(),
    status: text('status').notNull(),
    refundedAmount: integer('refunded_amount').default(0).notNull(),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    billingInfo: jsonb('billing_info'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    jobIdIdx: index().on(t.jobId),
    statusIdx: index().on(t.status),
  }),
);
