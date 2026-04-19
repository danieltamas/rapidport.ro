---
title: Rate limit middleware (app/server/middleware/rate-limit.ts)
priority: critical
status: todo
group: security-baseline
phase: 2
branch: job/phase2-nuxt/security-baseline-security-rate-limit
spec-ref: SPEC.md §S.10 "Rate Limiting", CODING.md §1 "Request Lifecycle"
---

## Description

Create `app/server/middleware/rate-limit.ts` — a Nitro middleware implementing a sliding-window rate limiter backed by the `rate_limits` Postgres table (already defined in `app/server/db/schema.ts`). Per-route limits match SPEC §S.10. **Fails closed** for auth paths — DB error = 503, not bypass.

## Why It Matters

Without rate limiting, `POST /api/jobs` can be flooded to exhaust disk quota, `POST /api/auth/magic-link` can be used for email-bomb attacks, and `GET /admin/login` can be brute-forced. Failing open (letting requests through on DB error) is worse than failing closed on auth paths.

## Acceptance Criteria

### File: `app/server/middleware/rate-limit.ts`

- [ ] Default export via `defineEventHandler`.
- [ ] **Route → limit table** (hardcoded in this file, constant at top):
  ```ts
  const ROUTES = [
    { method: 'POST',   pathPrefix: '/api/jobs',              match: 'exact',  limit: 10,  windowSec: 3600, keyBy: 'ip'    },
    { method: 'PUT',    pathPrefix: '/api/jobs/',             match: 'suffix', suffix: '/upload', limit: 3,   windowSec: 3600, keyBy: 'ip' },
    { method: 'POST',   pathPrefix: '/api/auth/magic-link',   match: 'exact',  limit: 5,   windowSec: 3600, keyBy: 'body.email', failClosed: true },
    { method: 'GET',    pathPrefix: '/admin/login',           match: 'exact',  limit: 10,  windowSec: 3600, keyBy: 'ip',        failClosed: true },
  ] as const;
  ```
  Adjust the typing as needed — this is the shape, not required verbatim. Keep the routes readable.
- [ ] On each request, find the first matching route rule. If no match → pass through.
- [ ] Compute the rate-limit key:
  - `ip` → use `getRequestIP(event, { xForwardedFor: true })`. Fall back to a constant like `'unknown'` if missing.
  - `body.email` → for the magic-link route only, read the validated JSON body and use `body.email.toLowerCase().trim()`. If reading the body is awkward here (it is — middleware runs before handler), instead pass the route through and let the handler do its own rate check. **Easier approach (prefer this):** keep the magic-link rate limit in the handler itself — document that in the DONE report, and leave the `body.email` row out of middleware.
- [ ] **Sliding window algorithm:**
  - `key` = `${method}:${pathPrefix}:${actualKey}` (e.g. `POST:/api/jobs:1.2.3.4`).
  - In a transaction: `SELECT COUNT(*) FROM rate_limits WHERE key = $1 AND window_start > now() - ($2 || ' seconds')::interval` → `used`.
  - If `used >= limit` → return 429 with `Retry-After: <seconds until oldest entry in window expires>`.
  - Else: `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, now(), 1)` and pass through.
  - Use parameterized SQL via the shared pool (acquire via `app/server/db/client.ts` — inspect the file to find the exported pool/drizzle instance, use Drizzle `sql` template for the SELECT/INSERT).
- [ ] **Fail-closed behavior:** if the DB query throws AND the matched rule has `failClosed: true`, return 503 with `Retry-After: 5`. For non-fail-closed rules, log + pass through (availability > strictness for non-auth).
- [ ] 429 response body: `{ error: 'rate_limited', retryAfter: <seconds> }`. Set `Retry-After` header.
- [ ] Short comment block at top: purpose, SPEC §S.10 reference, note on fail-closed.
- [ ] No `process.env` access.

### Verification

- [ ] `cd app && npx nuxi typecheck` passes.
- [ ] `cd app && npm run build` passes.
- [ ] `grep -En "sql\\.raw|concat|\\+.*key|\\\$\\{" app/server/middleware/rate-limit.ts` — returns no SQL-injection-shaped matches.

### Out of scope

- Magic-link `body.email` rate limit — keep in handler when that handler lands (`auth-magic-link-request` task). Document this explicitly in the DONE report.
- `Other GETs 300/min` and `Other mutations 60/min` catch-all limits — defer to a follow-up task. The four explicit rules above cover the abuse vectors.
- Cleanup cron for old `rate_limits` rows — owned by `cleanup-cron-support`.
- Tests — `ci-security-tests`.

## Files to Create

- `app/server/middleware/rate-limit.ts`

## Files to Touch

None.

## Notes

- **Drizzle `sql` template with parameters** for every query. Never string-concatenate into SQL.
- Use `app/server/db/client.ts` for the DB handle — read the file to see what it exports; reuse, don't create a new pool.
- Keep the file under 140 lines.
- **English-only identifiers and comments.**

## Worker Rules

- **Branch:** `job/phase2-nuxt/security-baseline-security-rate-limit` (pre-created). Verify with `git branch --show-current`.
- **Files you may edit:** ONLY `app/server/middleware/rate-limit.ts` and this task's `DONE-security-rate-limit.md`.
- **Files you MUST NOT edit:** `app/server/middleware/security-headers.ts`, `app/server/middleware/csrf.ts`, `app/server/db/**`, `app/server/db/client.ts`, `nuxt.config.ts`, `package.json`.
- **You MAY read:** `app/server/db/client.ts`, `app/server/db/schema.ts`, `app/server/db/schema/*.ts`, `app/server/utils/env.ts`, `SPEC.md`, `CODING.md`, `CLAUDE.md`.
- **Permission denials:** stop and report.
- **Commit granularity:** 2 commits max. Conventional Commits with scope `sec`.
- **DONE report:** `jobs/phase2-nuxt/DONE-security-rate-limit.md`.
- **No dev/preview server.**
