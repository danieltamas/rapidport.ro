# Completed: ai_usage recorder — per-call row, per-job aggregates

**Task:** mappers-ai-usage | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/mappers/usage.py` — new file, 4 async public functions
  - `record_call`: INSERT one row per Haiku call (success or failure); DB fills id + created_at
  - `count_for_job`: COUNT(*) for per-job cap enforcement in ai_assisted.py
  - `total_cost_for_job`: COALESCE(SUM(cost_usd), 0) for report.json
  - `total_tokens_for_job`: COALESCE on both token columns, returns (int, int) for report.json

## Acceptance Criteria Check

- [x] 4 public async functions with correct signatures matching spec
- [x] All SQL parameterized via asyncpg positional $1/$2/... — no f-strings, no %s, no .format()
- [x] All aggregates use COALESCE so empty result = zero, never None
- [x] File is ≤150 lines (actual: 79 lines)
- [x] `from __future__ import annotations` present
- [x] No imports from canonical/*, parsers/*, or other mappers (parallel workers)
- [x] No __init__.py edits
- [x] No new dependencies (asyncpg already required)

## Security Check

- [x] All DB access parameterized — INSERT and SELECT use $1..$5 positional args
- [x] No SQL string interpolation — audit: `grep -nE 'f".*\$|%s|format.*SELECT|format.*INSERT'` returns nothing
- [x] No PII logged — no log calls at all; raw job_id (UUID, not personal data) is the only identifier passed
- [x] No mutation endpoint involved (worker-side DB write)
- [x] CSRF not applicable (no HTTP endpoint — internal pool call)
- [x] assertJobAccess not applicable (called by consumer.py which already verified job ownership)

## Notes

**COALESCE rationale:** asyncpg returns `None` for aggregate functions (SUM, COUNT) when the WHERE clause matches zero rows. Without COALESCE the callers would receive `None` and would need to handle it everywhere. Forcing zero at the DB level (`COALESCE(SUM(...), 0)`) makes the Python return types `int` and `Decimal` unconditionally, which satisfies mypy and simplifies callers.
