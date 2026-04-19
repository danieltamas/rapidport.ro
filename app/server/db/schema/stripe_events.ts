import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Stripe webhook idempotency log — primary key is the Stripe event ID, which
// lets the webhook handler dedup retried deliveries via INSERT ... ON CONFLICT.
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
});
