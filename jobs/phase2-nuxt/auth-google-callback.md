---
title: Google OAuth callback handler (GET /api/auth/google/callback)
priority: critical
status: todo
group: auth-admin
phase: 2
branch: job/phase2-nuxt/auth-admin-auth-google-callback
spec-ref: SPEC.md §S.4; CODING.md §13.7
---

## Description

Create `app/server/api/auth/google/callback.get.ts` — verifies state (anti-CSRF), exchanges code+verifier for tokens, fetches userinfo, enforces `email_verified` + `ADMIN_EMAILS` allowlist, creates admin session, redirects to `/admin`.

## Acceptance Criteria

### File: `app/server/api/auth/google/callback.get.ts` (NEW)

- [ ] Zod query schema: `{ code: z.string().min(1), state: z.string().min(1), error: z.string().optional() }` via `getValidatedQuery`. If `error` param is present (user cancelled / Google error) → redirect to `/admin/login?error=oauth_declined`.
- [ ] **State verify:** `SELECT * FROM admin_oauth_state WHERE state = $1`. Also check `createdAt > now() - interval '10 minutes'` (expiry). Missing or expired → 400 with `admin_audit_log` insert `action: 'oauth_state_invalid'` (no email yet, so `adminEmail = 'unknown'`).
- [ ] **One-shot state:** `DELETE FROM admin_oauth_state WHERE state = $1` — before anything else, so a leaked state can't be replayed.
- [ ] Call `exchangeCode(code, codeVerifier)` from `~/server/utils/google-oauth`. On failure → 400 + `admin_audit_log` `action: 'oauth_token_exchange_failed'`.
- [ ] Call `fetchUserInfo(tokens.access_token)`. On failure → 400 + audit.
- [ ] **Email verification:** `userinfo.email_verified === true` — else 403 + audit `action: 'oauth_email_not_verified'` with `adminEmail: userinfo.email.toLowerCase()`.
- [ ] **Allowlist re-check:** `env.ADMIN_EMAILS.includes(userinfo.email.toLowerCase())` — else 403 + `admin_audit_log` `action: 'oauth_not_allowlisted'` with the attempted email.
- [ ] Call `createAdminSession(userinfo.email.toLowerCase(), event)` from `~/server/utils/auth-admin`.
- [ ] Write `admin_audit_log` row `action: 'admin_login_succeeded'`.
- [ ] `sendRedirect(event, '/admin', 303)`.
- [ ] **No tokens in logs.** Never log `access_token`, `id_token`, `code`, or `state`.

### Files you MAY NOT edit

- Any util file, middleware, schema, `package.json`, sibling handlers.

## Notes

- **English-only.**
- `adminOauthState` + `adminAuditLog` from `~/server/db/schema`.
- Keep under 150 lines — several branches, but each is thin.
- Always insert the audit row BEFORE throwing on denial (and before the state-invalid case, the user isn't identified yet, so use `'unknown'`).
- **NEVER Co-Authored-By.**

## Worker Rules

- **Branch:** `job/phase2-nuxt/auth-admin-auth-google-callback`. Verify.
- **Commits:** 1-2, scope `auth`.
- **DONE report:** `jobs/phase2-nuxt/DONE-auth-google-callback.md`.
- **Verification:** typecheck + build green.
- **No dev/preview, no db: scripts.**
