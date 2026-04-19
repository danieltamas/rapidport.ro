# Completed: Google OAuth start handler (GET /api/auth/google/start)
**Task:** auth-google-start.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/api/auth/google/start.get.ts:1-24` — new Nitro handler. Calls `createPkce()` to mint `{state, codeVerifier, codeChallenge}`, inserts a row into `admin_oauth_state` (PK=state, code_verifier, default now()), builds the authorize URL via `buildAuthorizeUrl(state, codeChallenge)`, and `sendRedirect(event, url, 302)`. DB failure → `createError` 503 with `google_oauth_start_db_failed` warn log (no PII, no secret). Success path logs `google_oauth_start`. Uses `~/server/db/client` and re-export `adminOauthState` from `~/server/db/schema`.

## Acceptance Criteria Check
- [x] `createPkce()` called — see handler line 12.
- [x] Row inserted into `admin_oauth_state` with `state` + `codeVerifier`; `createdAt` defaults to `now()` via schema — line 15. PK collision implausible (32-byte random); DB error → 503 — lines 16-19.
- [x] Authorize URL built via `buildAuthorizeUrl(state, codeChallenge)` — line 21.
- [x] `sendRedirect(event, url, 302)` — line 23.
- [x] No PII / no secret in logs. Only `google_oauth_start` event label logged; DB failure logs only `google_oauth_start_db_failed` — no state/verifier/URL emitted.
- [x] No extra rate-limit logic — relies on global middleware for `/admin/login` bucket (per spec).
- [x] Under 40 lines (24 lines including header comment).
- [x] English only.
- [x] No forbidden files edited (only the new handler file + DONE report).

## Security Check
- [x] All DB access goes through Drizzle (`db.insert(adminOauthState).values(...)`).
- [x] Every mutation endpoint is CSRF-protected — N/A: this is `GET`, initiator of an OAuth redirect; CSRF middleware exempts GETs by design. PKCE+state in `admin_oauth_state` protects the callback step.
- [x] Every job endpoint calls `assertJobAccess` — N/A (not a job endpoint).
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A: this is the pre-auth OAuth entry; admin session does not yet exist. Consistent with `auth-admin.ts` middleware which whitelists `/api/auth/google/*`.
- [x] All inputs Zod-validated — N/A: no inputs consumed (no body, no query, no params).
- [x] No PII in logs — verified. Neither `state`, `codeVerifier`, `codeChallenge`, authorize URL, nor IP is logged.
- [x] Session cookies — N/A (no cookies set here).
- [x] Rate limits applied where the task spec requires — handled by existing global middleware for `/admin/login`; task spec explicitly defers additional logic.

## Verification
- `npx nuxi typecheck` → exit 0.
- `npx nuxi build` → exit 0.

## Notes
- Branch: `job/phase2-nuxt/auth-admin-auth-google-start` (pre-existing, from `job/phase2-nuxt/auth-admin`).
- Scope: `auth`. Two commits: implementation + DONE report.
- No Co-Authored-By trailer (per project rule).
