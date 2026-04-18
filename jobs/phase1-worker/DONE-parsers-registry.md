# Completed: Table Registry for Phase 1 Parser Scope

**Task:** parsers-registry | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/parsers/registry.py` (385 lines) — static table registry with
  `Classification`, `ParserKind`, `Scope` StrEnums; `TableEntry` frozen+slotted dataclass;
  `TABLE_REGISTRY` dict; `MONTHLY_TABLES` frozenset; `lookup`, `by_classification`,
  `by_scope` helpers; `__main__` smoke-test block.

## Registry Stats

| Category | Count |
|----------|-------|
| Total entries | 28 |
| CORE_NOMENCLATURE | 12 |
| TRANSACTIONAL | 16 |
| ROOT-scoped | 12 |
| MONTHLY-scoped | 16 |
| MONTHLY_TABLES frozenset | 16 |
| Parser kind: STANDARD | 28 (all) |
| Parser kind: FALLBACK | 0 |

## Acceptance Criteria Check

- [x] `TABLE_REGISTRY` populated with every Phase 1 in-scope table from the doc's "Phase 1 Parser Scope" section
- [x] All three StrEnums populated (`Classification`, `ParserKind`, `Scope`)
- [x] `TableEntry` is `frozen=True, slots=True`
- [x] Helper functions typed and smoke-tested via `__main__` guard
- [x] `MONTHLY_TABLES` correctly derived from registry
- [x] Dict keys sorted alphabetically
- [x] `from __future__ import annotations` at top
- [x] No third-party imports; no imports from other migrator modules
- [x] 385 lines — under 600 limit; no companion file needed
- [x] `lookup()` normalizes to uppercase (handles mixed-case disk paths like `Jurnal.DB`)

## Deviations and Notes

### 67 vs 28 table count discrepancy

The task brief references ~67 tables. This matches the full inventory counts:
20 CORE NOMENCLATURE + 47 TRANSACTIONAL = 67. However, the doc's "Phase 1 Parser
Scope" section (the named authoritative source) lists 28 tables as the active scope,
plus 5 tables under "Deferred (Phase 1 stretch — implement only if spec explicitly
requires)." This registry ships the 28-table explicit scope.

Tables present in the full classification (67) but excluded from this registry:
AVANS.DB, AVANS0.DB, AVANSCO.DB, AVANSCO1.DB (deferred — payroll module),
CASH.DB, CASH1.DB, CASH2.DB (root accumulator, not in scope list),
DECONTR.DB, DECONTR1.DB, DECONTR2.DB (deferred — travel module),
IESIRI2.DB, IESIRI3.DB, IESIRI4.DB (extended/payment fields not in active list),
INTRARI2.DB (payment terms — not in active list),
JURNAL1.DB, JURNAL2.DB (alternate journal variants),
LOHN.DB, LOHN1.DB (deferred — production module),
NARTAMB.DB, NARTDC.DB, NARTDF.DB (article config not in scope list),
NIR2.DB, NIR21.DB, NIRSER.DB (NIR extended not in scope list),
NPARTD.DB, NPARTTR.DB, NPERSACT.DB, NPERSCV.DB, NSUBUNIT.DB (nomenclature not in scope list),
PONTAJ.DB, PONTAJ1.DB, PONTAJTM.DB (deferred — payroll module),
REGLEAS.DB, REGLEAS1.DB (deferred — leasing module),
RESTANT.DB, RESTANT1.DB (outstanding balances),
SURSA.DB, SURSA1.DB, SURSASER.DB (source traceability),
TRANSF3.DB, TRANSF4.DB (transfer extended),
TREZOR2.DB (treasury extended).

**Action needed:** Phase 1 gate verification should confirm whether the full 67-table
set needs to be wired in a subsequent iteration, especially for tables like TREZOR2.DB,
IESIRI2-4.DB, INTRARI2.DB that provide extended payment/terms data.

### Foreign-currency invoice tables (INTRD/INTRD_DET)

Dani confirmed (questions-for-dani.md, 2026-04-18) that foreign-currency invoices
are in v1 scope. INTRD/INTRD_DET referenced in that note are SAGA *target* tables,
not WinMentor source tables. Foreign-currency purchase invoices are stored in the
same INTRARI.DB/INTRARI1.DB as RON invoices (fields include Moneda, Curs).
No phantom source tables were added. The INTRARI.DB entry's purpose field notes
multi-currency support. The Phase 1 INTRARI parser must handle multi-currency rows.

### Non-standard / fallback parsers

docs/winmentor-tables.md §"Non-Standard Parser Flags" states: "All 768 tables
opened successfully with pypxlib (0 failures). No tables require a fallback parser
for basic header/field access." All 28 entries use `ParserKind.STANDARD`. BUGET1.DB
was mentioned as a known quirk but opens cleanly; it is out of Phase 1 scope anyway.

### JURNAL.DB canonical name

The Paradox file on disk is `Jurnal.DB` (mixed-case). The registry key and
`filename` field are both `JURNAL.DB` (canonical uppercase). The `lookup()` helper
normalizes input via `.upper()`, so `lookup("Jurnal.DB")` works correctly.

## Security Check

Security checklist is N/A — this is a pure static data module with no I/O, no
network access, no Drizzle, no endpoints, no auth. The module is imported by
parsers; no mutation surface exists.
