# Completed: Support tables (rate_limits, metrics)
**Task:** schema-support.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/db/schema/rate_limits.ts:1-16` — new typed Drizzle model for the existing `rate_limits` table consumed (via raw SQL) by `app/server/middleware/rate-limit.ts`. Composite `(key, window_start)` index matches the middleware's lookup pattern; pruning is owned by `cleanup-cron-support`.
- `app/server/db/schema/metrics.ts:1-17` — new time-series metrics table for the admin dashboard (jobs/hour, success rate, conversion time, payment success, Haiku calls per job). `(metric, recorded_at)` index supports range queries per metric.

## Acceptance Criteria Check
- [x] `rateLimits` table named `rate_limits` with id/key/windowStart/count and `(key, window_start)` index — `app/server/db/schema/rate_limits.ts`
- [x] Header comment names the cleanup cron and the consuming middleware
- [x] `metrics` table with id/metric/value/meta(jsonb)/recordedAt and `(metric, recorded_at)` index — `app/server/db/schema/metrics.ts`
- [x] Both files English-only and under 30 lines
- [x] Did NOT touch `app/server/db/schema.ts` (barrel — orchestrator owns)
- [x] Did NOT touch `app/drizzle/**` (no migrations generated)
- [x] Did NOT touch `app/server/middleware/rate-limit.ts` (already on main; rewire is out of scope)
- [x] `cd app && npx nuxi typecheck` → exit 0
- [x] `cd app && npm run build` → exit 0 (Nitro build complete, 6.22 MB)

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — pure schema definition, no runtime queries
- [x] Every mutation endpoint is CSRF-protected — N/A (no endpoints added)
- [x] Every job endpoint calls `assertJobAccess` — N/A
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A
- [x] All inputs Zod-validated (body + query + params) — N/A
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — N/A; `metrics.meta` is jsonb and callers must avoid PII when emitting samples
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A
- [x] Rate limits applied where the task spec requires — N/A; this task defines the storage table, not the policy
