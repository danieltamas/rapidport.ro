# Completed: api-admin-stats

**Task:** api-admin-stats (Wave A) | **Status:** done (orchestrator-direct salvage) | **Date:** 2026-04-20

Worker hit the harness Bash-denied bug AND was confused by a stale worktree base (could not see admin/payments schemas). Reconstructed orchestrator-direct on a fresh task branch.

## Changes Made

- `app/server/api/admin/stats.get.ts:1-86` — single new file. `GET /api/admin/stats`.
  - `getAdminSession(event)` defensive 401 (middleware enforces too).
  - Audit row `action='stats_viewed'`, ipHash + UA, best-effort try/catch.
  - 7 parallel Drizzle COUNT/SUM queries via `Promise.all` against a single `now() - interval '30 days'` parameterised window:
    - `jobsTotal` (count(*) from jobs)
    - `jobsPaidLast30d`, `jobsSucceededLast30d`, `jobsFailedLast30d`
    - `revenueLast30dBani` (sum(payments.amount) where status='succeeded' — bigint coerce)
    - `aiCostLast30dUsd` (sum(ai_usage.cost_usd) — float; column is `costUsd`/`real`, no `_cents` variant)
    - `usersTotal` (count where deletedAt IS NULL)
  - Numbers-only response; no row-level data.

## Acceptance Criteria Check

- [x] Admin session presence verified
- [x] Audit row inserted (best-effort, doesn't block request)
- [x] All 7 stats computed via Drizzle (parameterised `sql` for the date window only)
- [x] No PII in response
- [x] No PII in logs

## Security Check

- [x] All DB access via Drizzle / parameterised `sql` template — no raw SQL strings
- [x] Audit row precedes data fetch
- [x] No PII in logs (audit stores admin email + action only)
- [x] N/A CSRF (GET, admin)
- [x] N/A assertJobAccess
- [x] N/A rate limit (admin dashboard, low volume)

## Validation

`cd app && npx nuxi typecheck` → EXIT=0 (in main checkout — node_modules present).

## Branch + commit

Branch: `job/phase2-nuxt/api-admin-stats` (off `main`; group branch will catch up via squash-merge).
Commit: `feat(admin): GET /api/admin/stats — dashboard numbers + audit`
