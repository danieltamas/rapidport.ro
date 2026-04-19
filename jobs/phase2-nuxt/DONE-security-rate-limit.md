# Completed: Rate limit middleware

**Task:** security-rate-limit.md | **Status:** done | **Date:** 2026-04-19

## Changes Made

- `app/server/middleware/rate-limit.ts:1` — created Nitro middleware implementing a sliding-window rate limiter against the `rate_limits` Postgres table. Three explicit route rules (POST `/api/jobs`, PUT `/api/jobs/{id}/upload`, GET `/admin/login`); fail-closed for the admin route. Returns 429 with `Retry-After` header and `{ error: 'rate_limited', retryAfter }` JSON; 503 with `Retry-After: 5` on DB error for fail-closed rules; logs and passes through on DB error for non-fail-closed rules.

## Acceptance Criteria Check

- [x] Default export via `defineEventHandler` — line 70.
- [x] Hardcoded route table at the top of the file (matches the task spec, omitting the magic-link `body.email` row by design — see Notes).
- [x] First-match-wins rule lookup (`findRule`); pass through on no match.
- [x] IP key resolved via `getRequestIP(event, { xForwardedFor: true })`, falls back to `'unknown'`.
- [x] Sliding window count + min(window_start) computed in a single parameterized SELECT; INSERT on success — both via Drizzle `sql` template, no string interpolation into SQL.
- [x] On `used >= limit`: 429 with `Retry-After` header equal to seconds until the oldest entry expires (≥1).
- [x] Fail-closed: DB error on a `failClosed: true` rule → 503 + `Retry-After: 5`. Fail-open: log + pass through for other rules.
- [x] 429 response body shape `{ error: 'rate_limited', retryAfter }`.
- [x] File header comment cites SPEC §S.10 and notes fail-closed behavior.
- [x] No `process.env` access (uses the shared `db` from `app/server/db/client.ts`).
- [x] `cd app && npx nuxi typecheck` exits 0.
- [x] `cd app && npm run build` exits 0.
- [x] `grep -E "sql\.raw|concat|\+.*key|\$\{"` shows only safe matches (TS template strings for the cache key and logs, plus `${...}` parameter holes inside Drizzle `sql` templates which are parameterized, not interpolated).

## Security Check

- [x] All DB access goes through Drizzle (`sql` template tag with `${...}` parameter holes — never string concatenation).
- [x] Every mutation endpoint is CSRF-protected — N/A here (this middleware does not introduce endpoints).
- [x] Every job endpoint calls `assertJobAccess` — N/A here (no handlers added).
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A here.
- [x] All inputs Zod-validated — N/A; middleware reads only method/path and `getRequestIP`.
- [x] No PII in logs — log line includes only the rule's method + pathPrefix and the DB error message; no IP, no email, no body.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A; no cookies set.
- [x] Rate limits applied where the task spec requires — three of four spec rules implemented in middleware; the magic-link `body.email` rule is deferred to the handler per spec (see Notes).

## Notes

- **Magic-link `body.email` rate limit deferred to the handler.** The task spec explicitly allows this: middleware runs before body parsing, and reading the body in middleware would force a second parse and undermine Zod validation. Per spec §"Out of scope" and the keying note, this rule will live inside the `POST /api/auth/magic-link` handler when the `auth-magic-link-request` task lands.
- **`rate_limits` table is referenced via raw `sql` against the table name.** SPEC.md §2.1 documents the schema (`id`, `key`, `window_start`, `count`); the Drizzle table definition does not yet exist in `app/server/db/schema/` (out of scope — schema work is a separate group, and this task is forbidden from editing `app/server/db/**`). The runtime SQL is parameterized and matches the documented columns.
- **Fail-open log line is intentionally low-detail.** Only the rule identifier + DB error message are emitted — no IP, no key, no path beyond the rule prefix.
- **Catch-all 300/min GET and 60/min mutation limits deferred** to a follow-up task per spec.
- **Cleanup of stale `rate_limits` rows** is owned by the `cleanup-cron-support` task.
- File length: 116 lines (under the 140-line spec target).
