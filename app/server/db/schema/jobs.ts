import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

// Minimal jobs table — worker-facing columns only.
// Phase 2 schema-jobs-payments task will add: userId, anonymousAccessToken,
// uploadFilename, billingEmail, stripePriceId, stripePaidAt, etc. via ALTER TABLE ADD COLUMN.
export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status').notNull(),
  progressStage: text('progress_stage'),
  progressPct: integer('progress_pct').default(0),
  workerVersion: text('worker_version'),
  canonicalSchemaVersion: text('canonical_schema_version'),
  deltaSyncsUsed: integer('delta_syncs_used').default(0),
  deltaSyncsAllowed: integer('delta_syncs_allowed').default(3),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
