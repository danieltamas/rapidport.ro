---
title: Google OAuth start handler (GET /api/auth/google/start)
priority: critical
status: todo
group: auth-admin
phase: 2
branch: job/phase2-nuxt/auth-admin-auth-google-start
spec-ref: SPEC.md §S.4; CODING.md §13.7
---

## Description

Create `app/server/api/auth/google/start.get.ts` — issues PKCE state + verifier, persists in `admin_oauth_state`, 302-redirects to Google's authorize URL.

## Acceptance Criteria

### File: `app/server/api/auth/google/start.get.ts` (NEW)

- [ ] Call `createPkce()` from `~/server/utils/google-oauth` → `{ state, codeVerifier, codeChallenge }`.
- [ ] Insert row into `admin_oauth_state`: `state`, `codeVerifier`, `createdAt = now()`. PK collision is effectively impossible (32-byte random); on the off-chance of DB error → 503.
- [ ] Build authorize URL via `buildAuthorizeUrl(state, codeChallenge)`.
- [ ] `sendRedirect(event, authorizeUrl, 302)`.
- [ ] **No PII / no secret in logs.** Log only `event: 'google_oauth_start'`.
- [ ] **Rate limit:** handled in middleware for `GET /admin/login` at 10/hour per IP; this endpoint is not explicitly in SPEC §S.10 but inherits the same spirit — leave explicit rate-limit work to the existing middleware (no additional logic here).

### Files you MAY NOT edit

- `app/server/utils/env.ts`, `google-oauth.ts`, `auth-admin.ts`, `assert-admin-session.ts`, `middleware/*` — read-only.
- Schema, `package.json`, sibling handlers.

## Notes

- **English-only.**
- `adminOauthState` import from `~/server/db/schema`.
- Keep under 40 lines — this is a thin handler.
- **NEVER Co-Authored-By.**

## Worker Rules

- **Branch:** `job/phase2-nuxt/auth-admin-auth-google-start`. Verify.
- **Commits:** 1-2, scope `auth`.
- **DONE report:** `jobs/phase2-nuxt/DONE-auth-google-start.md`.
- **Verification:** typecheck + build green.
- **No dev/preview, no db: scripts.**
