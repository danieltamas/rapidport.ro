# Completed: SAGA XML Generator for Terți + Articole

**Task:** generators-xml-terti-articole | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/generators/saga_xml_terti_articole.py:1-308` — New module
  implementing two public generator functions:
  - `generate_terti_xml()` — splits partners into CLI_YYYYMMDD.xml (customers)
    and FUR_YYYYMMDD.xml (suppliers); partners with `partner_type="both"` appear
    in both files. Returns CLI path when present, else FUR path.
  - `generate_articole_xml()` — emits ART_YYYYMMDD.xml; A2 default populates
    `<Cod>` from `article.cod_extern` when non-empty; A1 (flag=False) always
    omits `<Cod>`.
  - Helper functions: `_sub`, `_opt_sub`, `_fiscal_code`, `_country`,
    `_build_tert_element`, `_write_xml_file` (internal, not exported).

## Output Filename Convention

Per `docs/saga-schemas.md` §Summary table and §1d/§2c examples:
- Terți customers: `CLI_<YYYYMMDD>.xml` (schema §1d: `CLI_<date>.xml`)
- Terți suppliers: `FUR_<YYYYMMDD>.xml` (schema §1d: `FUR_<date>.xml`)
- Articole: `ART_<YYYYMMDD>.xml` (schema §2c: `ART_<date>.xml`)
Date = generation date (`datetime.now().strftime("%Y%m%d")`).

The task spec suggested `Terti.xml` / `Articole.xml` as fallbacks "if not
specified," but the schema *does* specify — the fallback is not needed.

## Acceptance Criteria Check

- [x] 2 generator functions exported — `generate_terti_xml` and `generate_articole_xml`
- [x] All interpolated values XML-escaped — ElementTree auto-escapes `.text`; no
  raw f-string XML content anywhere in the file
- [x] WIN1250/UTF-8 declaration correct — see SAGA-schema deviation note below
- [x] A2 default (cod_extern populated when non-empty), A1 via `cod_extern_enabled=False`
- [x] CIF handling per ADR-001 — `partner.cif` is already RO-stripped by the
  canonical field_validator; emitted verbatim; fallback to `cnp` when `cif` is None;
  empty string + log for no-fiscal-code partners (ADR-001 edge cases)
- [x] No `__init__.py` edits
- [x] No edits to other generator files
- [x] No new deps (stdlib only: `xml.etree.ElementTree`, `datetime`, `pathlib`)
- [x] Log events `terti_xml_written` and `articole_xml_written` with counts only
  (no partner names, CIFs, article names in logs)
- [x] `from __future__ import annotations` at top
- [x] Strict type hints on every public function

## Security Check

- [x] XML injection defense: all partner/article values are assigned to `ET.Element.text`
  (ElementTree auto-escapes `<`, `>`, `&`, `"` — no double-escaping). No raw f-string
  XML content in the entire file. Verified by reading every XML-emitting code path.
- [x] No PII in logs: `terti_xml_written` logs only `customer_count` and `supplier_count`
  (integers). `articole_xml_written` logs `written_count`, `skipped_no_um`, and
  `cod_extern_enabled`. Partner names, CIFs, and article names are never logged.
- [x] N/A — DB access: no DB in this module (pure file generator)
- [x] N/A — CSRF, assertJobAccess, assertAdminSession: Python worker, not a Nuxt handler
- [x] N/A — Zod validation: Python worker; canonical Pydantic models validated upstream
- [x] N/A — Session cookies: Python worker

## SAGA-Schema Deviation — Encoding (REQUIRES DANI REVIEW)

**Task spec said WIN1250 (cp1250) for XML.** This conflicts with
`docs/saga-schemas.md` which is the authoritative source:

> §Global Gotchas §Encoding: "XML files use UTF-8 with `<?xml version="1.0" encoding="utf-8"?>`"
> §Validation Status: "WIN1252 applies only to DBF files."

The XML example blocks in §1d and §2c both show `encoding="utf-8"`.
WIN1250/1252 is the encoding for DBF files only.

**Decision: UTF-8 used in this implementation.** If SAGA's actual import
screen rejects UTF-8 XML and requires WIN1252 (a live-test finding), the
change is one line: `encoding="utf-8"` → `encoding="cp1252"` in
`_write_xml_file()`. Flag raised for Phase C live-import validation.

## Items Requiring Dani Review

1. **Encoding**: UTF-8 used (per schema docs). If live SAGA import rejects it,
   change `_write_xml_file()` to `encoding="cp1252"` and update the XML
   declaration manually (ElementTree may normalize to "cp1252" in the header).

2. **Article with missing UM**: Articles where `unit is None` are skipped (not
   emitted) and counted in the log. Schema §2b marks UM as required. Behavior:
   raise `ValueError` if ALL articles are skipped; otherwise write the file with
   the skipped count in the log. If Dani wants a different strategy (fallback to
   "buc", or treat as a validation error pre-generation), update the loop.

3. **Terți two-file return**: The public API signature returns a single `Path`.
   When a job has both customers and suppliers, only the CLI path is returned.
   The FUR file is still written to `output_dir`. If callers need both paths,
   they can glob `output_dir` for `CLI_*.xml` / `FUR_*.xml`. This design can
   be revisited if the orchestrator needs explicit two-path awareness.

4. **`own_cif` parameter**: Currently accepted but unused. It is a documented
   reserved slot for future Terți routing logic. SAGA XML routing for Intrări/
   Ieșiri (§4b) uses ClientCIF/FurnizorCIF, but Terți import does not use the
   company CIF at all — the `<Tara>` and `<TipTert>` fields on each record
   serve as routing signals. If the intent was something else, clarify before
   Phase C.
