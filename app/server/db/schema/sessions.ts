import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

// User sessions only — admin sessions live in a separate table (schema-admin task).
// tokenHash is SHA-256 hex of the cookie value; the plaintext token is in the cookie,
// the DB stores only the hash. No IP binding for user sessions (unlike admin).
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (t) => ({
    userIdIdx: index().on(t.userId),
    expiresAtIdx: index().on(t.expiresAt),
  }),
);
