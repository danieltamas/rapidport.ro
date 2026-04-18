# Completed: Remediation Pipeline — extract pipeline.py + build_invoices + build_payments

**Task:** remediation-pipeline | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/pipeline.py` (NEW — 647 lines)
  - `MapStats` dataclass — mutable telemetry counters (rule_hits, cache_hits, haiku_hits)
  - `PipelineEnv` frozen dataclass + `PipelineEnv.from_env()` — loads config from os.environ
  - `PipelineResult` dataclass — all canonical entities + telemetry + reasons lists
  - `_resolve_field`, `_parse_table`, `_remap` — shared parsing/mapping internals (moved from cli.py + consumer.py verbatim)
  - `build_partners`, `build_articles`, `build_chart` — canonical entity builders (moved from cli.py + consumer.py verbatim)
  - `build_invoices` — NEW: builds Invoice list from INTRARI (purchase) + IESIRI (sale) rows with INTRARI1/IESIRI1 line matching
  - `build_payments` — NEW: builds Payment list from TREZOR.DB rows with TREZOR1.DB applied-invoice links
  - `run_pipeline` — single entry point: parse all TABLE_REGISTRY files → field-map → build all canonical entities in dependency order

- `worker/src/migrator/cli.py` (EDITED — 499 → 341 lines, -158)
  - Removed `_Env`, `_load_env`, `_MapStats`, `_resolve_field`, `_parse_table`, `_remap`, `_build_partners`, `_build_articles`, `_build_chart` — all now in pipeline.py
  - `_run_convert` now: load env → extract archive → call `run_pipeline()` → `generate_saga_output()` → write reports
  - Report summary now includes invoices + payments entity counts (previously absent)

- `worker/src/migrator/consumer.py` (EDITED — 844 → 668 lines, -176)
  - Removed duplicated `_MapStats`, `_resolve_field`, `_parse_table`, `_remap`, `_build_partners`, `_build_articles`, `_build_chart`
  - `_Env` simplified — wraps `PipelineEnv` with `database_url`; `worker_version`/`canonical_schema_version` forwarded via properties
  - `run_convert` now delegates to `run_pipeline()`; consumer-specific concerns (pg-boss, timeout, retry, idempotency) unchanged
  - Report summary now includes invoices + payments entity counts (previously absent — was `invoices=[], payments=[]`)

## Acceptance Criteria Check

- [x] `pipeline.py` created — shared module with all canonical builders
- [x] `build_invoices` implemented — INTRARI (purchase) + IESIRI (sale) with line-item matching
- [x] `build_payments` implemented — TREZOR.DB source (registry-confirmed), TREZOR1.DB for applied-invoice links
- [x] cli.py thinned — removed ~160 lines of duplicated helpers
- [x] consumer.py thinned — removed ~160 lines of duplicated helpers
- [x] No `__init__.py` touched
- [x] No canonical/, mappers/, generators/, reports/, parsers/, utils/ touched
- [x] No new deps added
- [x] All public functions in pipeline.py have docstrings
- [x] Conventional Commits format, no Co-Authored-By

## Security Check

- [x] All DB access parameterized ($1/$2 asyncpg syntax) — no string interpolation in SQL
- [x] Decimal arithmetic only — no float in build_invoices, build_payments, or helpers
- [x] Per-row exception containment in every builder — one bad row never aborts the batch
- [x] Reason strings use source_id only — no partner names, CIFs, amounts, or file contents
- [x] `exchange_rate` set to None for RON currency rows (Invoice._validate_exchange_rate enforced)
- [x] No PII in log events — log.warning() calls never include row data

## Builder Coverage Summary

### build_invoices
- Sources: INTRARI.DB (purchase) + IESIRI.DB (sale), both in TABLE_REGISTRY
- Lines: INTRARI1.DB / IESIRI1.DB matched by parent doc key (CodParinte / source_id)
- When line tables absent or empty: `lines=[]`, reason recorded — no synthetic line (InvoiceLine.article required)
- Total reconstruction: if Total==0 but TotalFaraTVA+TVA non-zero, reconstructs Total (WinMentor omits it sometimes)
- VAT rate normalisation: WinMentor stores percentage int (19, 9...), InvoiceLine expects fraction (0.19, 0.09...)
- Required field validation: source_id, partner, invoice_date, invoice_number, at least one non-zero total
- Currency: normalised via _normalise_currency(); exchange_rate nulled for RON to satisfy Invoice validator
- source_metadata: all unmapped header fields preserved for no-data-loss guarantee

### build_payments
- Source: TREZOR.DB — authoritative per registry (saga_target: Încasări/Plăți); task brief's "REGISTRU" name is stale
- Applied-invoice links: indexed from TREZOR1.DB (CodParinte → [inv_refs])
- Direction: from TipSursa field via _TREZOR_DIRECTION_MAP; unrecognised → "outgoing" + reason note
- Method: from Sursa field via _TREZOR_METHOD_MAP; fallback "other"
- Partner: optional — resolved via CodPart/CodSursa if present, else None (internal transfers)
- Exchange rate: nulled for RON per Payment._validate_exchange_rate invariant
- Skipped if: missing source_id, missing payment_date, zero amount

## Line Counts

| File | Before | After | Delta |
|------|--------|-------|-------|
| pipeline.py | (new) | 647 | +647 |
| cli.py | 499 | 341 | -158 |
| consumer.py | 844 | 668 | -176 |

Note: pipeline.py is 647 lines vs the 500-line target in the task brief. The invoice builder
alone requires ~140 lines for: line indexing, partner/date/number validation, currency
normalisation, total reconstruction, per-line VAT conversion (%, fraction), and per-row error
containment. The payment builder needs ~70 more. Both are dense and correct; no dead code.

## Commits

1. `feat(worker): extract pipeline.py shared module — build_invoices + build_payments`
2. `refactor(worker): thin cli.py to import from pipeline.py`
3. `refactor(worker): thin consumer.py to import from pipeline.py`
