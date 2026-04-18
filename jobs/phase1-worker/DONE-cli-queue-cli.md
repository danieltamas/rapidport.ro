# Completed: CLI convert + inspect subcommands — full pipeline wiring

**Task:** cli-queue-cli | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/cli.py:1-500` — Full replacement of the Wave 1 stub. Implements `convert` and `inspect` subcommands via `argparse`. `main()` is the pyproject.toml entry point.

### Pipeline stages wired in `convert`:
1. `_load_env()` — reads `DATABASE_URL`, `WORKER_VERSION`, `CANONICAL_SCHEMA_VERSION`, `MAX_HAIKU_CALLS_PER_JOB`; fails fast on missing required vars
2. `create_pool()` / `apply_migrations()` — asyncpg pool, migration ledger
3. Archive extraction — calls `migrator.utils.archive.extract_archive()` (see open question below); falls back gracefully if input is a directory
4. `detect_version()` — WinMentor version + eFactura detection
5. Registry-filtered `.DB` file collection + `_parse_table()` per file (encoding detection → `read_standard` / `read_fallback` → field-level mapping)
6. `_resolve_field()` — `rule_based.map_field()` first, falls back to `ai_assisted.suggest_mapping()` with cache; counts `rule_hits` / `cache_hits` / `haiku_hits`
7. `_build_partners()` / `_build_articles()` / `_build_chart()` — linear pass per table; validation errors logged and skipped
8. `generate_saga_output()` — CanonicalData → SAGA XML
9. `write_report_json()` + `write_report_pdf()` — both ReportInput shapes constructed from shared pipeline state
10. `jobs` row updated to `succeeded` on success; `failed` + optional `failure_reason` column write on error

Progress stages written to `jobs.progress_stage`: `extracting` (0→10%), `parsing` (10→40%), `mapping` (40→70%), `generating` (70→90%), `reporting` (90→100%), `done` (100%). All progress writes are best-effort (never abort the job on UPDATE failure).

### `inspect` subcommand:
- No DB access, no output files. Detects version, walks `.DB` files, classifies against registry, prints counts.

## Acceptance Criteria Check

- [x] Both subcommands present via argparse; `--help` works
- [x] Full pipeline wired end-to-end in `convert` (partners, articles, chart-of-accounts)
- [x] `inspect` does NOT touch DB or write outputs
- [x] Progress stage writes are best-effort (wrapped in try/except)
- [x] Exit codes 0/1/2 — 1 on user error (missing path), 2 on pipeline failure
- [x] `__main__` block at bottom

## Security Check

- [x] No PII in stderr — progress output shows stage/pct only; error logging uses exception type only (`type(exc).__name__`), never message or row data
- [x] No row data in logs — `table_parse_error` logs `db_path.stem`, not row contents
- [x] Pool-scoped DB access only — no raw SQL with string interpolation; all parameterized via asyncpg `$N` placeholders
- [x] Job status updates use UUID-typed parameter (`UUID(job_id)`) — not raw string interpolation
- [x] `failure_reason` write handles missing column via `asyncpg.UndefinedColumnError` fallback
- [x] `ANTHROPIC_API_KEY` not logged — `_load_env()` checks existence but never logs the value

## Known Gaps / Open Questions

**archive.py API assumption:** `migrator.utils.archive.extract_archive(input_path, extract_dir)` is called with `(Path, Path)`. The parallel worker `archive-extractor` is writing this module. At merge time, verify the function signature matches. If the function is named differently or takes different args, update `cli.py` lines 274-276 (convert) and 430-431 (inspect). Error is caught at import time (`ImportError`), not at call time.

**Invoice/Payment canonical building deferred:** `invoices=[]` and `payments=[]` are passed to `CanonicalData`. INTRARI/IESIRI/TREZOR rows are parsed and field-mapped but not assembled into `Invoice`/`Payment` objects because header-only construction requires matching line tables (INTRARI1/IESIRI1) and complex FK resolution. This is a v1 known gap — generation still runs (0 invoices → empty SAGA invoice XML), and the report reflects actual counts. Flag for v2.

**`--save-profile` is a no-op:** No mapping profile persistence module exists on main. `--save-profile` logs a warning and continues. Flag for `profiles-manager` task.

**`--mapping-profile` is auto-only:** `auto` maps to `MappingProfile()` defaults (A2 for both articles and warehouses). Named profiles not implemented.

**ReportInput divergence handled:** `conversion_report_json.ReportInput` and `conversion_report_pdf.ReportInput` have different shapes (documented in `conversion_report_pdf.py` coordination comment). Both are constructed independently from the same pipeline state: json's uses `GenerationStats + rule_hits/cache_hits/haiku_hits`; pdf's uses `summary dict + AiUsage`. No unification attempted — per task spec.

**`failure_reason` column:** The bootstrap migration (`001_worker_bootstrap.sql`) does not include a `failure_reason` column. `_mark_failed()` handles this gracefully via `asyncpg.UndefinedColumnError` fallback. A future migration can add the column without breaking existing behavior.

**Mypy note:** `asyncpg.Pool` used without type arguments throughout — suppressed with `# type: ignore[type-arg]` per project pattern. `migrator.utils.archive` import uses `# type: ignore[import-not-found]` since the module is from a parallel branch.
