# Completed: SAGA XML Generator for Intrări + Ieșiri Invoices

**Task:** generators-xml-invoices | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/generators/saga_xml_invoices.py:1-445` — new file implementing the full SAGA XML invoice generator with filename sanitization, path-traversal defense, direction-based party routing, foreign-currency support, and Decimal arithmetic throughout.

## Acceptance Criteria Check

- [x] **Filename sanitizer present, rejects empty / traversal-unsafe components with ValueError** — `_sanitize_cif` and `_sanitize_invoice_number` both raise `ValueError` when the sanitized result is empty. `_SAFE_FILENAME_RE` replaces every non-`[A-Za-z0-9_-]` character with `_`, then leading/trailing underscores are stripped. CIF also strips the `RO` prefix.
- [x] **Direction routing: sale → FurnizorCIF=own_cif; purchase → FurnizorCIF=partner.cif** — implemented in `_build_invoice_xml` lines 281-295. Verified against the task spec routing table.
- [x] **Foreign currency: exchange_rate emitted only if currency != RON** — `<Moneda>` and `<CursSchimb>` elements are inside `if invoice.currency != "RON":` block (lines 298-301).
- [x] **Decimal arithmetic throughout (no floats)** — `_fmt_decimal` uses `Decimal.quantize`, `_fmt_vat_rate` uses `Decimal("100")` multiplication. All canonical model fields are `Decimal` by contract.
- [x] **XML escape audit complete** — all text content is set via ElementTree's `.text` assignment, which escapes `&`, `<`, `>`, `"`, `'` automatically. No string interpolation into XML fragments anywhere.

## Security Check

- [x] No PII in logs — log events emit only `count` integers; no invoice numbers, CIFs, partner names, or file contents are logged. Events: `invoice_xml_written` (count), `invoice_xml_rejected` (reason + detail strings — detail contains only the ValueError message, not raw invoice data).
- [x] Path-traversal defense — two-layer defense: (1) filename sanitizer replaces all path-separator characters with underscores before the filename is constructed; (2) `_verify_output_path` compares `output_path.resolve().parent` against `output_dir.resolve()` post-construction, catching any residual traversal vector including symlink chains.
- [x] No DB access, no endpoints, no auth surfaces — not applicable.
- [x] All DB access goes through Drizzle — N/A (Python worker file).
- [x] Every mutation endpoint is CSRF-protected — N/A.
- [x] All inputs Zod-validated — N/A (Pydantic canonical models validate inputs upstream).

## Path-Traversal Walk-Through

**Malicious invoice_number = `"../../etc/passwd"`:**
1. `_sanitize_invoice_number("../../etc/passwd")`
2. No null bytes → raw = `"../../etc/passwd"`
3. Regex substitution: every `.` and `/` → `_` → `"______etc_passwd"`
4. Strip leading/trailing `_` → `"etc_passwd"` (non-empty → no ValueError)
5. Filename: `F_12345678_etc_passwd_18042026.xml` — no separators, flat name
6. `output_dir / filename` resolves as a flat child of output_dir
7. `_verify_output_path`: `resolve().parent == output_dir.resolve()` → True — passes

**Malicious cif = `"../.."`:**
1. Does not start with RO+digit, so no stripping
2. Regex substitution: `.` and `/` → `_` → `"_____"`
3. Strip `_` → `""` (empty)
4. Raises `ValueError` — invoice is logged as `invoice_xml_rejected` and skipped ✓

**Malicious invoice_number = `""`:**
1. `not number` is True → raises `ValueError` immediately ✓

## Notes — SAGA-CONFIRM Items (docs/saga-schemas.md gap)

`docs/saga-schemas.md` does not exist yet (Phase 0 task is incomplete). The following XML element names were derived from the task spec's inline guidance and Romanian SAGA C 3.0 conventions. Each is marked `# SAGA-CONFIRM` in the source:

| Element | Assumed value | Confidence |
|---|---|---|
| Root element | `<Factura>` | High — standard Romanian accounting term |
| Due-date field | `<Scadenta>` | High |
| Supplier name | `<FurnizorNume>` | High |
| Client name | `<ClientNume>` | High |
| Line items container | `<Linii>` | Medium — could be `<Detalii>` |
| Single line item | `<Linie>` | Medium — could be `<Detaliu>` |
| Article code field | `<Articol>` | Medium — could be `<CodArticol>` |
| Notes field | `<Observatii>` | Medium |
| Decimal separator | `.` (period) | Medium — XML format may differ from DBF (comma) |
| VAT rate format | Integer string (`"19"`) | High |
| Own-company name in XML | Empty string `""` | Unknown — SAGA may require it for validation |

**Action required:** Validate these element names against a real SAGA C 3.0 import session before Phase 1 gate. If SAGA rejects any generated file, capture the error in `docs/saga-rejections.md`.

## File divergence note

Phase 1 JOB.md lists this generator as a function inside `saga_xml.py` (shared with `generators-xml-payments`). The task spec delivered to this worker specifies a separate file `saga_xml_invoices.py`. This divergence is noted for the orchestrator — the `generators-orchestrator` task will need to import from `saga_xml_invoices` rather than `saga_xml`. No `__init__.py` edits were made per task constraints.
