import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

// Admin sessions only — completely separate from user `sessions` per SPEC.
// tokenHash is SHA-256 hex of the cookie value; the plaintext token is in the
// cookie, the DB stores only the hash. ipHash binds the session to the remote
// IP at creation (admin auth requires IP binding, unlike user sessions).
// 8h TTL is enforced by the handler at insert time via expiresAt.
// email is the Google-verified admin email — no FK to users (admins are
// outside the user table).
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    ipHash: text('ip_hash').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => ({
    emailIdx: index().on(t.email),
    expiresAtIdx: index().on(t.expiresAt),
  }),
);
