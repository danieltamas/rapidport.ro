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
