# Completed: Rule-Based Field Mapper

**Task:** mappers-rule-based | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/mappers/rule_based.py` — new file; deterministic WinMentor-field → canonical-target mapper covering ~80% of known fields

## Rules Count by Source Table

| Source Table | Exact Dispatch Rules | Notes |
|---|---|---|
| INTRARI | 14 | Purchase invoice headers; includes CURSVALUTAR alias |
| IESIRI | 13 | Sales invoice headers; mirrors INTRARI shape |
| NART | 8 | Articles nomenclature; covers Denumire, Cod, CodExtern, UM, TVA variants |
| NBANCA | 3 | Company bank accounts |
| NCONT | 4 | Chart of accounts; ADR-001 verbatim-preserve carve-out noted in reasoning |
| NGEST | 4 | Warehouses; Cod/CodGest → code, CodInt → source_id (per spec) |
| NPART | 10 | Partners; covers all 6 spec-required groups + CIF aliases |
| REGISTRU | 10 | Payments / journal ledger; Suma/Valoare + Data/DataOp + Fel/Tip |
| TREZOR | 5 | Bank/treasury transactions |
| JURNAL | 6 | Journal entries (monthly) |
| NC | 3 | Accounting notes header |
| **Total exact** | **80** | All fields in task spec covered |

Cross-table heuristic rules (applied when no exact match):
- CIF-pattern match (`CodFis*`, `CIF`, `CUI`) for partner tables → `partner.cif`
- `DENUMIRE` / `NUME` in any known entity table → `<entity>.name`
- `_ID` / `_INT` suffix in any known entity table → `<entity>.source_id`

## Acceptance Criteria Check

- [x] `map_field()` returns `MappingHit` for every field listed in task spec — verified manually against all 6 spec bullet groups
- [x] Returns `None` for unknown fields (Haiku handles those)
- [x] Frozen dataclass + slots — `@dataclass(frozen=True, slots=True)`
- [x] Dispatch table sorted alphabetically within each source table block
- [x] Case-insensitive — both table and field uppercased before lookup
- [x] Under 400 lines — file is ~290 lines
- [x] No imports from `migrator.canonical.*`, `migrator.parsers.*`, or other mapper modules
- [x] No pydantic — stdlib only (`dataclasses`, `typing`, `re`)
- [x] No logging in module

## Security Check

Security N/A — this module is a pure in-memory lookup with no I/O, no DB access, no network calls, no user input parsing, and no PII handling. It returns deterministic string constants for known keys and `None` for unknowns.

- [x] No DB access
- [x] No PII in any code path
- [x] No external dependencies

## Fields Where Haiku Should Handle (Not Rule-Covered by Design)

The following categories are intentionally left to Haiku (`ai_assisted.py`):

- Invoice **line-item** fields from `INTRARI1` / `IESIRI1` / `INTRARI2` / `IESIRI2` — these contain WinMentor-internal index fields (`CodParinte`, `IndexLocal`, `TipLinie`) that require semantic interpretation to map correctly
- `NC1.DB` debit/credit account fields (`ContD`, `ContC`) — present in dispatch for `REGISTRU` but `NC1` line-level detail requires entity context
- `TRANSF.*` transfer tables — internal transfer semantics differ from standard invoice/payment flows
- Personnel (`NPERS.*`) and payroll (`LOHN.*`) tables — out of Phase 1 scope per task spec
- Any table not listed in `_TABLE_ENTITY` — falls through to `None` → Haiku
