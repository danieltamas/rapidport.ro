import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { jobs } from './jobs';

// Append-only. Anonymized on GDPR deletion (userId set to null). Retention: 2 years.
// userId is intentionally FK-less so a user purge can null this column without
// cascade-deleting historical events. details MUST NEVER contain raw PII —
// hash emails (SHA-256, 8-char prefix), redact CIFs as RO*****, never log file
// contents or decrypted token values.
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id'),
    jobId: uuid('job_id').references(() => jobs.id),
    event: text('event').notNull(),
    details: jsonb('details'),
    ipHash: text('ip_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userIdIdx: index().on(t.userId),
    jobIdIdx: index().on(t.jobId),
    eventIdx: index().on(t.event),
    createdAtIdx: index().on(t.createdAt),
  }),
);
