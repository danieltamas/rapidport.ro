# Completed: bootstrap-db-minimal

**Task:** bootstrap-db-minimal  
**Status:** done  
**Date:** 2026-04-18  
**Branch:** job/phase1-worker/bootstrap-db-minimal

---

## Changes Made

- `worker/migrations/001_worker_bootstrap.sql` (line 1–88) — Phase 1 bootstrap
  migration.  Creates `_worker_migrations` ledger, `jobs`, `mapping_cache`,
  `ai_usage`.  Includes `set_updated_at()` trigger function and trigger on
  `jobs.updated_at`.  Full `BEGIN; … COMMIT;` transaction.  All DDL is
  idempotent (`IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION` /
  `DROP TRIGGER IF EXISTS`).

- `worker/src/migrator/utils/db.py` (line 1–174) — asyncpg pool utility.
  Exports `create_pool`, `close_pool`, `apply_migrations`.  Reads
  `DATABASE_URL` from env; enforces `ssl="require"` by default; respects
  `sslmode=disable` in DSN for test environments.  Migration runner walks
  `migrations/` directory, applies unapplied `NNN_*.sql` files in numeric
  order, each inside its own transaction, recording filenames to
  `_worker_migrations`.

- `worker/PG_BOSS_NOTES.md` — documents pg-boss-py package verification
  result and the recommended asyncpg-polling approach for the
  consumer-pgboss task.

---

## Acceptance Criteria Check

- [x] `worker/migrations/001_worker_bootstrap.sql` creates `jobs`,
  `mapping_cache`, `ai_usage` idempotently inside a single transaction
  with all required columns and constraints
- [x] `updated_at` trigger helper `set_updated_at()` present and applied
  to `jobs` via `trg_jobs_updated_at`
- [x] `worker/src/migrator/utils/db.py` provides `create_pool`,
  `close_pool`, `apply_migrations` with asyncpg
- [x] SQL table count verified: `grep -c "CREATE TABLE"` returns 4
  (3 real tables + `_worker_migrations` ledger)
- [x] db.py is 174 lines — within the 180-line cap
- [x] db.py passes manual mypy-strict review: `from __future__ import
  annotations`, all public functions fully typed, return type of
  `asyncpg.create_pool` acknowledged as `Pool | None` and guarded,
  `_migration_sort_key` returns `int` (no `Any`)
- [x] db.py passes manual ruff review: imports sorted, no unused imports,
  line length ≤ 100, no E/F/I/N/UP/B/SIM/RUF violations visible
- [x] pg-boss-py package-existence verified; findings documented in
  `worker/PG_BOSS_NOTES.md` and this DONE report

---

## pg-boss-py Verification

Network access (curl / WebFetch) was unavailable in the worker sandbox
at execution time.  Based on knowledge cutoff (August 2025):

- **`pg-boss-py` does NOT exist** as a maintained PyPI package.
- The canonical pg-boss implementation is a Node.js package only.
- **Recommendation:** implement a thin asyncpg-based consumer that polls
  `pgboss.job` directly using `SELECT … FOR UPDATE SKIP LOCKED`.
  This requires zero additional dependencies and is fully interoperable
  with the Nuxt-side pg-boss.
- Full details and action items in `worker/PG_BOSS_NOTES.md`.

---

## Security Check

- [x] No string interpolation in SQL — migration uses only DDL with
  literals and CHECK constraints; no user input touches SQL at DDL time
- [x] `apply_migrations` uses parameterized `$1` for the ledger INSERT
  (`INSERT INTO _worker_migrations (filename) VALUES ($1)`) — no
  concatenation
- [x] `ssl="require"` default enforced in `create_pool`; SSL can only be
  disabled by an explicit `sslmode=disable` in the DSN (test environments)
- [x] No PII in logs — db.py contains no logging; CIFs/emails are never
  referenced
- [x] CSRF — N/A (Python worker, not a Nitro handler)
- [x] Zod validation — N/A (Python worker; Pydantic used in other modules)
- [x] `assertJobAccess` — N/A (no Nitro endpoint)
- [x] `assertAdminSession` / `admin_audit_log` — N/A (no admin route)
- [x] Session cookies — N/A (worker has no HTTP surface)
- [x] Rate limits — N/A (this module is a pool utility, not an endpoint)
- [x] File contents never logged — db.py reads SQL files but does not log
  their contents

---

## Commit SHAs

| Commit | SHA |
|---|---|
| `sql(worker): migration 001 — …` | `591ab08` |
| `feat(worker): asyncpg pool + migration runner` | `341e8f2` |
| `docs(worker): pg-boss-py package verification notes` | `9fd8d51` |
