# Completed: Classify WinMentor .DB files by role

**Task:** table-inventory.md | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `docs/winmentor-tables.md` — new; full classification of all 768 distinct WinMentor schemas with purpose, record counts, encoding, scope, and Phase 1 parser list

## Acceptance Criteria Check

- [x] `docs/winmentor-tables.md` committed, lists every distinct schema from donor-01 sample
- [x] Each row: filename, classification, purpose (English, one line), approximate record count, standard/non-standard flag, encoding, scope — present in table
- [x] Table sorted by classification then alphabetical — done
- [x] Non-standard Paradox files explicitly flagged — 5 quirks documented in "Non-Standard Parser Flags" section; 0 tables require fallback parser (all opened cleanly)
- [x] Monthly schema consistency spot-check across 3 months (2022-01, 2024-06, 2026-02) — no drift observed in 15 key tables
- [x] Phase 1 parser scope listed as final section — done (CORE NOMENCLATURE + TRANSACTIONAL tables, with SAGA target entity mapping)
- [x] Volume summary at top: partners, articles, invoices, journal entries — done

## Security Check (N/A — discovery task)

- N/A — no endpoints, no Drizzle mutations, no auth, no CSRF, no Zod, no DB writes
- [x] No row data logged or committed (schema + field names only; record counts are numeric aggregates, no content)
- [x] venv at `samples/winmentor/.venv/` is gitignored
- [x] Spike scripts at `samples/winmentor/*.py` are gitignored
- [x] JSON data files at `samples/winmentor/*.json` are gitignored
- [x] `git status` clean before commit — verified

## Notes

### Key findings

- **768 distinct schemas** total (422 root-only + 346 monthly-only + 31 in both)
- **pypxlib success: 100%** (768/768) — no fallback parser needed for this WinMentor version
- **Encoding: CP852 uniformly** — all files use Paradox sort order 0x4C (International/OEM) with zero code-page byte. Byte-frequency analysis on NLOCALIT confirms CP852 over CP1250. pypxlib defaults to cp850; Phase 1 must override to cp852.
- **Header record-count field = 0 in all files** — pypxlib warns about this but still reads correctly via block-scan. Phase 1 must not use the header count field; use `len(table)` instead.
- **No monthly schema drift** — identical field schemas across 2022-01, 2024-06, 2026-02 for all 14 spot-checked tables. WinMentor v3226022,01 is schema-stable.
- **Phase 1 must parse ~67 tables** (20 core nomenclature including `NCONT.DB` root + 47 transactional) out of 768 total

### Classification breakdown

| Classification | Count |
|---------------|-------|
| CORE NOMENCLATURE | 20 |
| TRANSACTIONAL | 47 |
| LOOKUP | 20 |
| CONFIG | 28 |
| CACHE | 51 |
| DECLARATION | 109 |
| SPECIALTY MODULES | 493 |
| **Total** | **768** |

### UNKNOWN parser tables

None. All 768 tables opened with pypxlib without error.

### Record volumes (donor sample — sanitized, not production scale)

| Entity | Count |
|--------|-------|
| Partners (NPART) | 53 |
| Articles (NART) | 25 |
| Gestiuni | 3 |
| Purchase invoices total (INTRARI) | 146 across 50 months |
| Sales invoices total (IESIRI) | 51 across 50 months |
| Journal entries total (Jurnal.DB) | 1,494 across 51 months |
| Accounting notes (NC.DB) | 29 across 51 months |
| Monthly folders | 51 (2021-12 → 2026-02) |

**Production scale warning:** these are sanitized donor counts. Real customer databases will be 2–4 orders of magnitude larger (thousands of partners, tens of thousands of invoices per year).

### Open questions for Dani

1. **NLOCALIT (13,756 rows) and NTARI (246 rows):** classified as LOOKUP (skip). Confirm SAGA ships its own locality and country lists, so these do not need to be seeded as part of migration.

2. **NPERS.DB (employees):** classified CORE NOMENCLATURE but listed as "if SAGA supports." Does Rapidport v1 need to migrate employee records, or is this payroll-only territory?

3. **NCONT.DB in monthly folders (monthly copies of chart of accounts):** has 27,600 rows across 50 months — almost entirely the same 552 account records replicated monthly. Phase 1 should read the root `NCONT.DB` (552 rows) rather than monthly copies. Confirm this is the correct approach.

4. **`.MB` memo files:** 321 root-level `.MB` files exist (paired with `.DB`). pypxlib handles these transparently. No issues found in this sample, but Phase 1 should handle the case where a `.MB` file is missing (graceful degradation to empty memo field, not parser crash).

5. **Mixed-case filenames (`Jurnal.DB`, `Stoc.DB`, `SoldPart.DB`):** Windows filesystem is case-insensitive; Linux (production Docker) is not. Phase 1 glob pattern must be case-insensitive or glob both `jurnal.db` and `Jurnal.db`.
