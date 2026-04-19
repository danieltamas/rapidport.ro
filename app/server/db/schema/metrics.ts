import { pgTable, uuid, text, timestamp, real, jsonb, index } from 'drizzle-orm/pg-core';

// Time-series metric samples for the admin dashboard (jobs/hour, success rate,
// conversion time, payment success, Haiku calls per job, etc.).
export const metrics = pgTable(
  'metrics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    metric: text('metric').notNull(),
    value: real('value').notNull(),
    meta: jsonb('meta'),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    metricRecordedAtIdx: index().on(t.metric, t.recordedAt),
  }),
);
