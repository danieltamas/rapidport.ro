# Completed: SAGA XML Generator — Articole Contabile (user sub-accounts only)

**Task:** generators-xml-articole-contabile | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/generators/saga_xml_articole_contabile.py:1-111` — New generator module.
  Implements `generate_articole_contabile_xml(entries, output_dir) -> Path`.
  Filters `ChartOfAccountsEntry` list to `analytical=True` only; base-chart entries
  (pre-loaded by SAGA at company creation) are counted but never emitted.
  Writes `ArticoleContabile.xml` encoded as `cp1250` (WIN1250) with correct XML
  declaration. Account codes written verbatim per ADR-001 / OMFP 1802/2014.
  All XML values escaped via `xml.sax.saxutils.escape`. Empty-body XML emitted
  when no analytical entries exist to keep the output directory set consistent.

## Acceptance Criteria Check

- [x] Single generator function exported — `generate_articole_contabile_xml` in `__all__`
- [x] Filters to `analytical=True` only — line 90 list comprehension
- [x] Base-chart entries skipped and counted — `skipped_count` logged at line 107
- [x] All XML values escaped — `escape()` applied to `code`, `name`, `parent_code` (lines 57-60)
- [x] WIN1250 encoding — `_ENCODING_DECLARATION = "WIN1250"` in declaration; file written as `cp1250`
- [x] Output filename `ArticoleContabile.xml` — `_OUTPUT_FILENAME` constant, line 30
- [x] Log event `"articole_contabile_xml_written"` with `analytical_count` + `base_chart_skipped` — lines 103-108
- [x] No entries logged (no PII) — only counts are logged
- [x] Max 200 lines — 111 lines
- [x] `from __future__ import annotations` — line 18
- [x] Strict mypy compatible — all public functions annotated, no `Any`, explicit list type hints
- [x] No new deps — stdlib `pathlib`, `xml.sax.saxutils` only; internal `migrator.*`

## Security Check

- [x] All DB access goes through Drizzle (or parameterized `sql` template) — N/A (generator, no DB access)
- [x] Every mutation endpoint is CSRF-protected — N/A (worker module, no HTTP endpoints)
- [x] Every job endpoint calls `assertJobAccess` — N/A
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A
- [x] All inputs Zod-validated (body + query + params) — N/A (Python module, inputs are typed Pydantic models)
- [x] No PII in logs — only counts logged; no account codes, names, or content emitted to logs
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A
- [x] Rate limits applied where the task spec requires — N/A

## XML Escape Audit

Every user-controlled string field written into XML is passed through `xml.sax.saxutils.escape`:
- `entry.code` → CODCONT
- `entry.name` → DENCONT
- `entry.parent_code` → CONTPARINTE (only when not None)

The `escape()` function replaces `&`, `<`, `>` with `&amp;`, `&lt;`, `&gt;` respectively.
Attribute values are not used (element-content only), so `quoteattr` is not needed.

## Base-Chart-Skip Policy Rationale

Per `docs/questions-for-dani.md` §"CONTURI pre-existence assumption" (resolved 2026-04-18):
every SAGA company has Plan de Conturi Românesc pre-loaded at company creation — it is
required for recording any transaction. Emitting base-chart accounts would cause SAGA
import conflicts (duplicate key on `CONTURI.CONT`). The generator therefore emits ONLY
entries with `analytical=True` (user-added sub-accounts such as `5121.01`, `5121.02`)
and silently skips `analytical=False` entries, counting them for the audit log.
