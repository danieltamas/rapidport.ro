---
title: Reverse-engineer SAGA C 3.0 import schema
priority: critical
status: todo
group: discovery
phase: 0
spec-ref: SPEC §0.2
---

## Background — Sample Acquired, Approach Updated

A real SAGA Firebird database is available at `samples/saga/CONT_BAZA.FDB` (37 MB). Magic bytes confirm Firebird binary format — this is SAGA's internal storage, not an import file.

**Architectural decision (orchestrator-approved):** Rapidport v1 ships **import files only** (DBF/XML/CSV via SAGA's *Import Date* screen). We do NOT write directly to the Firebird database in v1 — that would bypass SAGA validation, require customer FDB write access, and void their SAGA support. The FDB here is used as a **schema source**, not a write target.

This changes the Phase 0 approach from the original SPEC §0.2:
- **Out:** install SAGA, create blank company, enter records, export templates
- **In:** introspect the existing FDB directly via `isql-fb` (or Python `firebird-driver`) to extract table names, columns, types, constraints, foreign keys. Then cross-reference against SAGA's *Import Date* field-mapping documentation (or its UI) to map internal fields to the import file format.

This is faster, more authoritative (real production schema instead of a blank company's subset), and doesn't require SAGA installed on Dani's Mac. SAGA install is still useful for *validating* the generated import files at the end of this task — but it's no longer the starting point.

## Description

Two phases inside this task:

### Phase A — Extract SAGA schema from Firebird

1. Install Firebird client: `brew install firebird` (macOS) — provides `isql-fb`, `gbak`, `gfix`
2. Open the DB in read-only mode (do NOT modify `CONT_BAZA.FDB` — treat as a reference; copy to `samples/saga/CONT_BAZA.readonly.FDB` if needed)
3. Dump the full schema: `isql-fb -u SYSDATE -p masterkey samples/saga/CONT_BAZA.FDB -x > docs/saga-fdb-schema.sql` (adjust creds per Firebird defaults — SAGA may use different ones; `brute-force` with the SAGA manual's `admin/admin` or `sysdba/masterkey` first)
4. For each SAGA entity we need to import (Terți, Articole, Articole Contabile, Intrări, Ieșiri, Încasări, Plăți): identify the target table(s), columns, types, constraints, foreign keys, default values
5. Pay special attention to:
   - Encoding (Firebird character sets — SAGA likely uses WIN1250 or UTF8)
   - Date/time types (`DATE` vs `TIMESTAMP`)
   - Numeric precision (`NUMERIC(15,2)` etc. — decimals matter for invoices)
   - Foreign key constraints (which table is the source of truth?)
   - Primary key generation (sequence/generator — SAGA auto-assigns or expects caller to provide?)
   - NOT NULL columns (we must never omit these in generated imports)

### Phase B — Map SAGA schema to import file formats

SAGA's *Import Date* screen reads specific file formats per entity. These formats are a *projection* of the internal schema (not identical to FDB tables — the import flattens joins, uses human-readable codes instead of FK IDs, etc.). Per SPEC §1.6:

| Entity | Format | Filename pattern |
| --- | --- | --- |
| Terți (partners) | DBF | — |
| Articole | DBF | — |
| Articole contabile | CSV/XLS | — |
| Intrări/Ieșiri (invoices) | XML | `F_<cif>_<nr>_<data>.xml` |
| Încasări | XML | `I_<data>.xml` |
| Plăți | XML | `P_<data>.xml` |

For each entity:
1. Document the import file's expected field names + types + constraints (from SAGA's import documentation or by reverse-engineering a sample template)
2. Cross-reference to the FDB table columns (which import field maps to which DB column?)
3. Note every SAGA-specific gotcha: CIF format (with/without `RO`), VAT rate codes (`19`, `9`, `5`, `0` or names?), account plan codes (Plan de Conturi Romanian), date format (`dd.mm.yyyy` vs `yyyy-mm-dd`), decimal separator (`,` vs `.`)

### Phase C — Validate end-to-end (optional but recommended for gate)

Only if SAGA C 3.0 can be installed on Dani's machine (UTM/CrossOver/Parallels/Windows VM):
1. Restore a fresh copy of `CONT_BAZA.FDB` into a new SAGA company
2. For each entity type, craft a minimal valid import file by hand
3. Run SAGA's *Import Date* screen against each — confirm zero errors
4. If SAGA rejects a file, capture full error + input in `docs/saga-rejections.md` before moving on

If SAGA install is a blocker, Phase C can slip to the start of Phase 1's `generators-*` tasks — but note the risk in Phase 0 gate.

## Why It Matters

SAGA is the target. If we generate files SAGA rejects, the product fails its core promise. Phase 1 generators are built directly from this schema. The FDB gives us near-perfect ground truth — don't guess when we can introspect.

## Acceptance Criteria

- [ ] Firebird client tools (`isql-fb` at minimum) installed on Dani's machine
- [ ] `docs/saga-fdb-schema.sql` (gitignored — it's a full schema dump that may contain table hints considered proprietary by SAGA; keep private) — extracted via `isql-fb`
- [ ] `docs/saga-schemas.md` (committed to main) documents per entity:
  - FDB table name + columns + types + constraints + FK relationships
  - Matching import file format (DBF/CSV/XLS/XML) + field names + field mapping to FDB columns
  - Encoding (WIN1250 / UTF8 / CP1252)
  - Date format, decimal separator, CIF format, VAT code format
  - Required vs optional fields (NOT NULL columns, defaults)
  - Sample import file snippet for each entity type (synthesized, not copied from real data)
- [ ] At least 3 entity types (Terți, Articole, Articole Contabile minimum) have complete schema + import format documentation
- [ ] `docs/saga-rejections.md` exists (may be empty — future Phase 1 reference)
- [ ] (optional — Phase C) SAGA C 3.0 accepts a manually-crafted import file for at least 3 entity types; if not done, documented as deferred to `generators-*` validation in Phase 1

## Files to Touch

- `docs/saga-schemas.md` (new, committed to main)
- `docs/saga-fdb-schema.sql` (gitignored — Firebird schema dump)
- `docs/saga-rejections.md` (new, committed to main; may be empty)
- `samples/saga/import-templates/*` (gitignored — if created during Phase C)
- `jobs/phase0-discovery/DONE-saga-import-schema.md`

## Notes

- **FDB file is privileged data.** Even though `CONT_BAZA.FDB` is from Dani's donor and presumably consented-to, treat it as sensitive. Never commit it. Never share the schema dump publicly (it may reveal SAGA internals the vendor considers proprietary).
- **Firebird credentials.** SAGA typically ships with default Firebird credentials (`SYSDBA/masterkey` or similar). If these don't work on the donor's FDB, check the SAGA installation docs — the credentials may have been customized. Do not brute-force remote DBs.
- **Schema for ALL entities, not just the 3 minimum.** The inventory doesn't need to be exhaustive for gate-pass, but the more we extract now, the less we discover-and-scramble in Phase 1.
- **Version-specific schema.** This FDB is from one SAGA installation. A second donor's FDB may reveal schema version differences. Note any fields/tables that look optional or version-gated.
- **Option B (direct FDB writes) is out of scope for v1** but the schema work done here is a prerequisite for ever shipping Option B in v1.1 — good long-term investment.
- SAGA PS is out of v1 scope (SPEC Open Question #2) — only document SAGA C 3.0.
