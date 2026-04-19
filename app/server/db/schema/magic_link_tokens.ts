import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

// Hashed magic-link tokens — plaintext token is emailed to the user and never stored.
// No FK to users: tokens are issued pre-account-creation on first login.
// 15-minute TTL per SPEC; consumedAt enforces single-use claim.
export const magicLinkTokens = pgTable(
  'magic_link_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    ipAddress: text('ip_address'),
  },
  (t) => ({
    emailExpiresAtIdx: index().on(t.email, t.expiresAt),
  }),
);
