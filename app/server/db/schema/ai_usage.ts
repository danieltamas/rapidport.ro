import { pgTable, uuid, text, integer, real, timestamp } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

export const aiUsage = pgTable('ai_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  // NOTE: costUsd uses real (single-precision float) per spec. If precision requirements
  // increase in future, consider migrating to numeric(12,6).
  jobId: uuid('job_id').references(() => jobs.id),
  model: text('model').notNull(),
  tokensIn: integer('tokens_in').notNull(),
  tokensOut: integer('tokens_out').notNull(),
  costUsd: real('cost_usd').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
