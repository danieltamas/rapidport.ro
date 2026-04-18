# Completed: Decide code mapping strategy (ADR)

**Task:** code-mapping-adr.md
**Status:** done
**Date:** 2026-04-18

## Changes Made

- `docs/adr-001-code-mapping.md` — new; ADR-001 documenting the three options (fresh target, offset codes, merge mode) and deciding v1 ships Option A (fresh target); includes Context, Options Considered, Decision, Rationale, Consequences, Edge Cases, Phase 1 Canonical Schema Impact, Merge Mode v2 Plan, Open Questions

## Acceptance Criteria Check

- [x] `docs/adr-001-code-mapping.md` committed — follows standard Michael Nygard ADR format with Title, Status (Accepted), Context, Decision, Consequences
- [x] Three options enumerated with pros/cons each (Option A: Fresh Target, Option B: Offset Codes, Option C: Merge Mode)
- [x] Chosen strategy for v1 explicit and reasoned — Option A, with rationale grounded in saga-schemas.md evidence (VARCHAR(8) overflow, blank COD in import spec, CIF-based dedup)
- [x] Edge cases documented: partners without CIF (CNP or blank handling), articles without code (A1 vs A2 sub-question flagged), duplicate CIFs (validation error surfaced), foreign partners (TARA field, non-Romanian VAT numbers), account plan codes (mandatory carve-out from fresh-target, OMFP 1802/2014)
- [x] Phase 1 canonical schema impact noted — source_id as non-PK metadata on CanonicalPartner, CanonicalArticle, CanonicalAccount; SAGA generator discards source_id for partners/articles, emits mapping CSVs; accounts pass through verbatim
- [x] "How merge mode would work (v2)" section — match-by-CIF for partners, match-by-code for articles, diff-before-import UI, match_candidates table, new failure modes, scope estimate

## Security Check (N/A — discovery/documentation task, no endpoints or DB mutations)

- [x] No code written, no endpoints added, no DB schema changed
- N/A — CSRF, assertJobAccess, assertAdminSession, Zod, Drizzle, PII logging, session cookies, rate limits (none applicable to ADR authoring)

## Notes

- **Chosen strategy:** Option A — Fresh Target (leave COD blank for partners and articles; SAGA auto-assigns on import)
- **Key rationale:** SAGA's `CLIENTI.COD` / `FURNIZORI.COD` are VARCHAR(8); the `WM_NNNNN` prefix overflows for any 6-digit WinMentor code, making Option B mechanically broken before aesthetic concerns apply. Transactional PKs (INTRARI, IESIRI, REGISTRU) are always generator-assigned and unreachable by any option — fresh target is the only consistent strategy. Reconciliation is solved by per-entity mapping CSVs in the job output.
- **Biggest open question for Dani:** A1 vs A2 for articles — should SAGA `ARTICOLE.COD` be left blank (full fresh) or populated with WinMentor's `CodExtern` when non-empty? Depends on whether `CodExtern` in the donor sample carries meaningful barcodes/SKUs or is effectively unused.
