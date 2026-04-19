import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';

// Sliding-window rate limit state. Pruned by `cleanup-cron-support`.
// Used by `app/server/middleware/rate-limit.ts`.
export const rateLimits = pgTable(
  'rate_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').default(1).notNull(),
  },
  (t) => ({
    keyWindowIdx: index().on(t.key, t.windowStart),
  }),
);
