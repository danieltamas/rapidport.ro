# Completed: Admin schema (admin_sessions, admin_oauth_state)
**Task:** schema-admin.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/db/schema/admin_sessions.ts:1-26` — new Drizzle table `adminSessions` (`admin_sessions`) with id/email/tokenHash/ipHash/userAgent/createdAt/expiresAt/revokedAt; indexes on `email` and `expiresAt`. Matches the style of `users.ts` / `sessions.ts` exactly (imports, comment block at top, table options pattern).
- `app/server/db/schema/admin_oauth_state.ts:1-13` — new Drizzle table `adminOauthState` (`admin_oauth_state`) with PK `state`, `codeVerifier`, `createdAt`. Comment notes 10-min TTL is enforced by `cleanup-cron-support`, not in schema. No indexes (PK lookup only).

## Acceptance Criteria Check
- [x] `adminSessions` table named `admin_sessions` with all 8 columns per spec — id, email, tokenHash (unique), ipHash, userAgent (nullable), createdAt (defaultNow notNull), expiresAt (notNull), revokedAt (nullable).
- [x] Indexes on `t.email` and `t.expiresAt`.
- [x] No FK on `email` (admins outside `users` table) — comment documents this.
- [x] `adminOauthState` table named `admin_oauth_state` with `state` PK, `codeVerifier` notNull, `createdAt` notNull defaultNow.
- [x] No indexes — PK is enough.
- [x] Comment at top of `admin_oauth_state.ts` notes the 10-min cleanup-cron expiration.
- [x] Did NOT touch `app/server/db/schema.ts` (barrel — orchestrator owns it).
- [x] Did NOT touch `app/drizzle/**`, did NOT run `db:generate` / `db:migrate` / `db:push` / `db:studio`.
- [x] Did NOT edit any other schema sub-file, middleware, handler, page, util, or `package.json`.
- [x] Both files English-only (identifiers + comments).
- [x] Each sub-file under 40 lines (admin_sessions.ts = 26, admin_oauth_state.ts = 13).
- [x] `cd app && npx nuxi typecheck` → exit 0 (vue-tsc emitted no diagnostics).
- [x] `cd app && npm run build` → exit 0 (`✨ Build complete!`, no errors).

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — N/A here, schema-only task; tables are defined via Drizzle `pgTable` so future handlers will use Drizzle naturally.
- [x] Every mutation endpoint is CSRF-protected — N/A, no endpoints added.
- [x] Every job endpoint calls `assertJobAccess` — N/A, no endpoints added.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A, no endpoints added; `adminSessions` is the table the future `assertAdminSession` middleware will read.
- [x] All inputs Zod-validated (body + query + params) — N/A, no handlers.
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — `admin_sessions.email` stores plaintext (intentional, per spec — admin email is the identity), but no logging code is added in this task. `tokenHash` and `ipHash` are SHA-256 hex (handler responsibility) so the DB never stores plaintext cookie token or raw IP.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A, cookie issuance happens in the auth-admin handler; this schema only stores the hash.
- [x] Rate limits applied where the task spec requires — N/A.

## Notes
- Orchestrator must append `export * from './schema/admin_sessions'; export * from './schema/admin_oauth_state';` to `app/server/db/schema.ts` (barrel) at group-merge time, then run `npm run db:generate` to produce the migration.
- No permission denials encountered. (One transient `Bash` denial appeared on a redirected-output command, but the underlying typecheck/build commands ran successfully without redirection — verification is valid.)
