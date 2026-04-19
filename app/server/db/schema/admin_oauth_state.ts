import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Rows expire after 10 min via `cleanup-cron-support` — not enforced in schema.
// PKCE state + verifier for the Google OAuth admin login flow. The `state`
// value is the random opaque token sent in the OAuth redirect; on callback
// the row is looked up by PK, the codeVerifier is sent to Google's token
// endpoint, and the row is deleted (single-use).
export const adminOauthState = pgTable('admin_oauth_state', {
  state: text('state').primaryKey(),
  codeVerifier: text('code_verifier').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
