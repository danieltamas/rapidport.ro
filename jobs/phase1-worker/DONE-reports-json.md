# Completed: report.json writer with migration-lock warning + AI usage totals

**Task:** reports-json | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/reports/conversion_report_json.py` (new, 195 lines):
  - `ReportIssue` frozen+slots dataclass — severity, category, message
  - `ReportInput` frozen+slots dataclass — all pipeline metadata including `rule_hits`, `cache_hits`, `haiku_hits` (mapping counters) and `warnings: list[str]` (informational notes separate from diagnostic issues)
  - `write_report_json(pool, output_dir, data)` async function — fetches AI usage via three `usage_helpers` calls, assembles SPEC §1.7 JSON structure, writes UTF-8, logs `report_json_written` event with file_path + byte_size only
  - Migration-lock warning hardcoded as `_MIGRATION_LOCK_WARNING` constant — exact text from Phase 0 resolution, comment says "do not alter without a SPEC change"
  - `cost_usd` serialized as `str(Decimal)` — no float drift
  - `generated_at` uses `datetime.now(UTC).isoformat()` — Python 3.12 `UTC` sentinel
  - `files_written` converted to relative strings via `_relative_str()` helper with `ValueError` fallback to absolute

## Acceptance Criteria Check

- [x] `ReportInput` + `ReportIssue` dataclasses exported (frozen + slots) — both in `__all__`
- [x] `write_report_json` async function present — `async def write_report_json(pool, output_dir, data) -> Path`
- [x] Migration-lock warning hardcoded in output — `_MIGRATION_LOCK_WARNING` constant, placed in `rapidport.warning` field
- [x] Decimal `cost_usd` serialized as string — `str(cost_usd)` in `ai_usage.cost_usd`
- [x] AI usage fetched via `usage_helpers` — `count_for_job`, `total_cost_for_job`, `total_tokens_for_job`
- [x] `rule_hits`, `cache_hits`, `haiku_hits` as fields on `ReportInput` — pipeline coordinator injects them
- [x] `warnings: list[str]` as field on `ReportInput` — separate from `issues` list
- [x] `files_written` relative to `output_dir` with safe fallback — `_relative_str()` helper
- [x] `issues` + `warnings` always present as arrays, never omitted — even when empty
- [x] Max 250 lines — 195 lines

## Security Check

- [x] No PII in logs — only `file_path` (non-sensitive path) and `byte_size` are logged; `issues` contents (which may contain user data) are never logged
- [x] Migration-lock warning enforced — hardcoded, cannot be bypassed by callers
- [x] `default=str` in `json.dumps` ensures no unexpected serialization failures that could leak object reprs
- [x] All DB access via `usage_helpers` (asyncpg parameterized queries) — no raw SQL in this module
- [x] No new deps — stdlib + asyncpg + existing migrator modules only
- [x] Worker-only file, no Nitro/CSRF/session concerns apply

## Notes / SPEC §1.7 Coverage Gaps

- JOB.md §reports listed the target file as `conversion_report.py` (the original unsplit name). The task prompt explicitly changed this to `conversion_report_json.py` for parallelism. The sibling `conversion_report_pdf.py` is owned by a separate worker. JOB.md is a planning doc and was not modified per hard rule ("Touch ONLY these two files").
- Three separate DB round-trips for AI usage (count, cost, tokens) — task notes "or combine into one query if obvious" but rules forbid editing `usage.py`. Three queries is acceptable; they run sequentially on a pool connection.
- `source_version: str | None` — passes through to JSON as `null` when not detected; this is correct per SPEC since WinMentor version detection is best-effort.
