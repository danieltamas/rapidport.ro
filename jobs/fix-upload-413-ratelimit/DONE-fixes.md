# Completed: fix upload 413 + disable rate limit in dev
**Task:** ad-hoc bugfix (no spec) | **Status:** done | **Date:** 2026-04-21

## Problem 1 — 413 still happening after the previous fix

Previous commit `4f113ff` set a `/api/jobs/**/upload` override on nuxt-security's `requestSizeLimiter` to bump the cap to 500 MB. The override didn't take effect: an 8.1 MB upload still tripped the 8 MB default. Compiled bundle inspection (`app/.nuxt/dev/index.mjs:650-658`) showed the rule *was* registered, but the path match at request time failed.

**Root cause:** nuxt-security's rule resolver uses radix3 (`toRouteMatcher(createRouter({routes: nitroAppSecurityOptions}))` at `index.mjs:3148`). Radix3 only supports `**` at the **end** of a path. A mid-path `**` like `/api/jobs/**/upload` silently doesn't match — `/api/jobs/{uuid}/upload` hits the 8 MB default because the resolver falls back to the `/**` catch-all.

## Problem 2 — developer rate-limited after 2 real attempts

SPEC §S.10 caps PUT `/api/jobs/*/upload` at 3/h/IP and the middleware stores entries in a Postgres table. 3 attempts while debugging = blocked for an hour. In dev this is pure friction; the limit's threat model (scripted abuse) doesn't apply on localhost.

## Changes Made
- `app/nuxt.config.ts:157-181` — broadened the `routeRules` glob from `/api/jobs/**/upload` to `/api/jobs/**`. All `/api/jobs/*` endpoints now get the 500 MB body cap at the security middleware layer. Safe because every other `/api/jobs/*` endpoint has its own input validation + the upload handler still enforces the real 500 MB Content-Length cap + defensive post-multipart size check.
- `app/server/middleware/rate-limit.ts:45-52` — added `RATE_LIMIT_ENABLED = process.env.NODE_ENV === 'production'` constant and an early-return at the top of the middleware. Dev bypasses the whole thing — no DB query, no 429. Prod behaviour unchanged.

## Acceptance Criteria Check
- [x] 500 MB cap actually applies at path `/api/jobs/{uuid}/upload` (glob now ends in `**`)
- [x] Other `/api/jobs/*` endpoints still have handler-level validation, so the relaxed cap doesn't weaken them
- [x] Dev iterations on the upload flow no longer trip the 3/h/IP rate limit
- [x] Prod still enforces all rate limits (the constant is computed at module load, `NODE_ENV === 'production'` check is identical to nuxt-security's own prod gate)
- [x] `npx nuxi typecheck` passes

## Security Check
- [x] All DB access goes through Drizzle — rate-limit middleware still uses Drizzle's `sql` template when enabled; the dev bypass skips the DB call entirely
- [x] Every mutation endpoint is CSRF-protected — unchanged
- [x] Every job endpoint calls `assertJobAccess` — unchanged; upload handler still runs auth first
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — unchanged
- [x] All inputs Zod-validated — unchanged
- [x] No PII in logs — unchanged
- [x] Session cookies are HttpOnly + Secure + correct SameSite — unchanged
- [x] Rate limits applied where the task spec requires — **prod unchanged**. Dev is bypassed by design (SPEC §S.10's threat model is abuse from the internet, which dev isn't exposed to).
- [x] Scope creep check: the widened `/api/jobs/**` glob only affects nuxt-security's `requestSizeLimiter`; CSRF, auth, and rate-limit middleware run independently and are untouched.

## For Dani
- HMR should pick up both changes without a rundev restart. If the `rate_limits` table still has stale rows for Dani's IP, they're now harmless (middleware short-circuits before reading the table) — no cleanup needed.
- Next attempt should upload cleanly: 500 MB cap applied → our handler's own check is the real gate → progress bar works → navigate to `/job/{id}/discovery`.
