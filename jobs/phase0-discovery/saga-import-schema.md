---
title: Reverse-engineer SAGA C 3.0 import schema
priority: critical
status: todo
group: discovery
phase: 0
spec-ref: SPEC §0.2
---

## Description

Install SAGA C 3.0. Create a blank test company. Enter a few records per entity type (partner, article, journal entry, invoice, payment). Export each entity's import template. Inspect the resulting DBF/XML structure and reverse-engineer the field mapping.

Per SPEC, format priorities per entity type:

| Entity | Format | Filename pattern |
| --- | --- | --- |
| Terți (partners) | DBF | — |
| Articole | DBF | — |
| Articole contabile | CSV/XLS | — |
| Intrări/Ieșiri (invoices) | XML | `F_<cif>_<nr>_<data>.xml` |
| Încasări | XML | `I_<data>.xml` |
| Plăți | XML | `P_<data>.xml` |

Document every field name, type, constraint, and format quirk. SAGA will reject files that don't match exactly — Phase 1 cannot ship without this.

## Why It Matters

SAGA is the target. If we generate files SAGA rejects, the product fails its core promise. Phase 1 generators are built directly from this schema.

## Acceptance Criteria

- [ ] SAGA C 3.0 installed and runnable on Dani's machine
- [ ] Test SAGA company created with at least 3 records per entity type
- [ ] Export samples stored at `samples/saga/import-templates/<entity>/*` (gitignored)
- [ ] For each entity type: a manually-crafted import file successfully imports into SAGA with zero errors (proves the schema is correct)
- [ ] `docs/saga-schemas.md` (committed to main) documents:
  - Every SAGA entity and its import format (DBF/CSV/XLS/XML)
  - Every field: name, type, max length, required/optional, format quirks (date format, decimal separator, encoding)
  - Sample file for each entity type (embedded or linked)
  - Any SAGA-specific gotchas (e.g., CIF prefix handling, VAT rate codes, account plan codes)
- [ ] At least 3 entity types validated end-to-end (import succeeds)
- [ ] Encoding confirmed (SAGA likely expects CP1252 or UTF-8 — document which)

## Files to Touch

- `samples/saga/import-templates/*` (gitignored)
- `docs/saga-schemas.md` (new, committed to main)
- `jobs/phase0-discovery/DONE-saga-import-schema.md`

## Notes

- If SAGA install via UTM/CrossOver is unstable, fallback to a Windows VM (Parallels/VMWare) or request access to an existing SAGA installation.
- SAGA PS is out of v1 scope (SPEC Open Question #2) — only document SAGA C 3.0.
- Date/decimal format quirks are a common source of import rejection — document them explicitly.
- If SAGA rejects any manually-crafted file, capture the exact error message + field + value in `docs/saga-rejections.md` (future Phase 1 reference).
