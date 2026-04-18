# Completed: pg-boss Consumer (direct asyncpg) + SIGTERM/SIGINT + 15-min timeout

**Task:** consumer-pgboss + consumer-timeout-signals (combined)
**Status:** done
**Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/consumer.py` (845 lines) — full replacement of Wave 1 stub.
  - `run_consumer()` — async main loop, polls `pgboss.job` with `SELECT … FOR UPDATE SKIP LOCKED`,
    exponential backoff (2–30 s) on empty polls, immediate re-poll after a job.
  - `main()` — sync entry point for `python -m migrator.consumer`.
  - `run_convert(pool, payload, env)` — full WinMentor → SAGA pipeline (Option B: direct pipeline
    API calls, not importing `cli.py`). Mirrors `cli._run_convert()` structure.
  - `ConvertPayload` / `DiscoverPayload` — Pydantic models for pg-boss job data fields.
  - SIGTERM/SIGINT graceful shutdown: sets `asyncio.Event`, loop checks between polls. Second
    signal within 5 s → hard `sys.exit(1)`.
  - Per-job 15-min hard kill via `asyncio.wait_for(..., timeout=900)`.
  - pg-boss retry policy: retrycount/retrylimit/retrydelay honored. Payload validation failures
    and timeouts exhaust retrylimit immediately (no retry benefit). All SQL parameterized ($1/$2).
  - Idempotency: checks `jobs.status` before running; skips and completes pg-boss row if already
    `'succeeded'`.
  - `'discover'` job type: accepted, logs `"discover_not_implemented"`, marks permanently failed.

## Tradeoff Notes

**Option B (pipeline duplication):** `run_convert()` and `cli._run_convert()` both call the
underlying pipeline APIs directly. They share no code. This is intentional — the consumer is
the production entry point and must not depend on CLI argument-parsing infrastructure. The
duplication is ~150 lines of helper functions (`_parse_table`, `_resolve_field`, `_build_*`,
`_remap`) that are identical to their cli.py counterparts. Future refactoring path: extract to
`pipeline.py` shared module, but that requires touching cli.py (not in this task's scope).

**Retry policy choices:**
- `convert`: retrylimit=3 (transient DB/network failures often resolve)
- `discover`: retrylimit=1 (not implemented, retry won't help)
- `retrydelay`: 60 seconds (give transient infra issues time to clear)
- Invalid payload / timeout: immediate exhaustion (retrycount=retrylimit) — structural problems
  don't benefit from retry cycles.

**`'discover'` scope decision:** Accepted + immediately failed with clear reason rather than
dropping silently. This prevents jobs from stalling in `'active'` state if Node.js pg-boss sends
discover jobs during future feature work. A TODO comment marks the implementation point.

**pg-boss state for permanent failures:** `'failed'` (not `'completed'`). pg-boss distinguishes
between `'completed'` (success) and `'failed'` (terminal error). Retry-eligible failures reset
to `'created'` with incremented retrycount and updated startafter.

## Pipeline Feature Parity vs cli.py

| Feature | cli.py | consumer.py |
|---|---|---|
| Archive extraction | via `utils.archive.extract_archive` | same |
| WinMentor version detection | `detect_version` | same |
| Table scanning (28 in-scope) | TABLE_REGISTRY filter | same |
| Paradox parsing (CP852/CP1250) | `read_standard` / `read_fallback` | same |
| Rule-based field mapping | `rule_based.map_field` | same |
| AI-assisted mapping (Haiku) | `ai_assisted.suggest_mapping` | same |
| Canonical model building | `_build_partners/articles/chart` | same |
| SAGA XML generation | `generate_saga_output` | same |
| report.json write | `write_report_json` | same |
| report.pdf write | `write_report_pdf` | same |
| Progress updates → DB | `_progress` | same |
| Invoices / Payments | `invoices=[], payments=[]` stub | same (known gap from cli.py) |

Both consumer and CLI leave `invoices=[]` and `payments=[]` — this is a known v1 limitation,
not introduced here. The canonical pipeline wires invoices/payments in a later task.

## Acceptance Criteria Check

- [x] `run_consumer` + `main` entry points present with correct signatures
- [x] Poll loop with `FOR UPDATE SKIP LOCKED`, all SQL parameterized ($1/$2)
- [x] `'convert'` job type fully wired via direct pipeline calls
- [x] `'discover'` job type: accepts, marks failed, logs `"discover_not_implemented"`
- [x] 15-min timeout per job (`asyncio.wait_for`, 900 s)
- [x] SIGTERM/SIGINT handlers → graceful shutdown (finish current job first)
- [x] pg-boss retry policy: retrycount/retrylimit/retrydelay honored
- [x] Idempotency check against rapidport `jobs` row
- [x] PII-safe logging: no payload contents logged, no data file contents, no emails/CIFs in logs

## Security Check

- [x] All DB access goes through asyncpg parameterized queries ($1/$2) — no string interpolation
- [x] Every mutation endpoint is CSRF-protected (N/A — worker process, no HTTP endpoints)
- [x] Every job endpoint calls `assertJobAccess` (N/A — worker process, not Nitro)
- [x] Every admin endpoint calls `assertAdminSession` (N/A — worker process)
- [x] All inputs Zod-validated (Python equivalent: Pydantic `model_validate` on ConvertPayload)
- [x] No PII in logs: pg-boss job IDs logged (UUIDs, not PII), rapidport job IDs logged (UUIDs),
      payload fields (input_path, output_dir) never logged, no emails, no CIFs
- [x] Session cookies: N/A — worker process
- [x] Rate limits: N/A — consumer is internal, not internet-facing
- [x] `FOR UPDATE SKIP LOCKED` prevents double-dispatch (at-most-once delivery)
- [x] pg-boss `output` field receives `{"error": "...", "pii_redacted": true}` — never raw exception messages
- [x] SIGKILL-safe: in-flight job state is `'active'` in pg-boss; pg-boss's own stall detection
      will re-queue after `expire_in` if the worker is killed mid-job
