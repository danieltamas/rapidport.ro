# Completed: Google OAuth callback handler (GET /api/auth/google/callback)
**Task:** auth-google-callback.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/api/auth/google/callback.get.ts:1-109` — new handler. Validates query (zod), one-shot state lookup-and-delete with 10-min TTL, exchangeCode → fetchUserInfo, `email_verified` enforcement, ADMIN_EMAILS allowlist re-check, creates admin session, writes `admin_audit_log` on success and on every denial path (`oauth_provider_error`, `oauth_state_invalid`, `oauth_token_exchange_failed`, `oauth_userinfo_failed`, `oauth_email_not_verified`, `oauth_not_allowlisted`, `admin_login_succeeded`), redirects to `/admin` on success and `/admin/login?error=oauth_declined` when Google signals `error`.

## Acceptance Criteria Check
- [x] Zod query schema with code/state/error — `error` path redirects to `/admin/login?error=oauth_declined` (303). Missing code/state short-circuit to 400 + audit.
- [x] State verify — TTL check `createdAt > now() - 10 min`; missing/expired → 400 + audit `oauth_state_invalid`.
- [x] One-shot state — `db.delete(...).returning()` removes the row before any Google call, so replay of a leaked state finds nothing.
- [x] `exchangeCode(code, codeVerifier)` called; failures captured, audited as `oauth_token_exchange_failed`, 400.
- [x] `fetchUserInfo(access_token)` called; failures audited as `oauth_userinfo_failed`, 400.
- [x] `userinfo.email_verified === true` enforced; else 403 + audit `oauth_email_not_verified` (email lowercased).
- [x] `env.ADMIN_EMAILS.includes(email)` re-checked; else 403 + audit `oauth_not_allowlisted`.
- [x] `createAdminSession(email, event)` sets cookie via existing util.
- [x] `admin_audit_log` row `admin_login_succeeded` written before redirect.
- [x] `sendRedirect(event, '/admin', 303)` on success.
- [x] No tokens / codes / state values ever logged — only action strings + generic details.

## Security Check
- [x] All DB access goes through Drizzle (`db.delete(adminOauthState)`, `db.insert(adminAuditLog)`)
- [x] Every mutation endpoint is CSRF-protected — N/A: OAuth callback is GET; CSRF is replaced by signed state + one-shot delete + 10-min TTL + PKCE verifier.
- [x] Every job endpoint calls `assertJobAccess` — N/A: this is the admin auth bootstrap.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A for login bootstrap; session does not exist yet. Every path still writes to `admin_audit_log` with the appropriate action (denials use `adminEmail = 'unknown'` when identity isn't established).
- [x] All inputs Zod-validated — `getValidatedQuery(event, QuerySchema.parse)`.
- [x] No PII in logs — no `console.log` anywhere; errors never include tokens/codes.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — delegated to `createAdminSession` (HttpOnly, Secure, SameSite=lax, 8h TTL).
- [x] Rate limits applied where the task spec requires — spec does not require rate limiting on the callback.

## Verification
- `npx nuxi typecheck` — green (no type errors reported).
- `npx nuxi build` — green. Built chunk `routes/api/auth/google/callback.get.mjs` (4.53 kB).
