import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

// Email is stored lowercased in handlers before insert; uniqueness is enforced
// at the app layer (no citext extension). emailHash is SHA-256 hex used for
// log redaction lookup. deletedAt is the GDPR soft-delete marker (null = active).
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    emailHash: text('email_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    emailHashIdx: index().on(t.emailHash),
  }),
);
