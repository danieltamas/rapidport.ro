# Completed: Canonical support models

**Task:** canonical-support | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/canonical/support.py:1–201` — New file. Four frozen Pydantic v2 models (`Gestiune`, `CashRegister`, `BankAccount`, `ChartOfAccountsEntry`) plus two exported Literal type aliases (`Currency`, `VatRate`).

## Acceptance Criteria Check

- [x] 4 Pydantic models present: `Gestiune`, `CashRegister`, `BankAccount`, `ChartOfAccountsEntry`
- [x] 2 Literal type aliases exported: `Currency`, `VatRate`
- [x] All models frozen (`ConfigDict(frozen=True, ...)`)
- [x] All models strict-extra (`extra="forbid"`)
- [x] All models whitespace-stripped (`str_strip_whitespace=True`)
- [x] `source_metadata: dict[str, object]` on every model
- [x] No `float` anywhere — amounts use `str` or `Decimal` at call sites; no numeric fields in these models
- [x] `from __future__ import annotations` at top of file
- [x] 201 lines — within 220-line limit
- [x] IBAN validator: normalises to uppercase, strips spaces, rejects non-alphanumeric, enforces 15–34 char length; no strict checksum (Phase 1 permissive per spec)
- [x] `ChartOfAccountsEntry.code` uses `Field(min_length=1)` — non-empty enforced post-strip
- [x] No imports from `migrator.parsers.*`, `migrator.canonical.partner`, `.article`, `.journal` — self-contained
- [x] Gestiune fields match ADR-001 warehouse resolution: `source_id` = `NGEST.CodInt`, `code` = `NGEST.CodGest`; comments explain A1/A2 toggle
- [x] `ChartOfAccountsEntry` scoped to user-added sub-accounts only (CONTURI pre-loaded assumption from questions-for-dani.md)

## Security Check

Security items are not applicable for a pure Pydantic canonical model file:
- [x] No DB access, no endpoints, no mutations, no user input paths, no PII fields
- [x] No new dependencies added

## Notes — Currency/VatRate Duplication Risk

`Currency` and `VatRate` are defined in this file and documented as the canonical source. Parallel workers (`canonical-partner`, `canonical-article`, `canonical-journal`) may define their own copies of these aliases independently — the task spec explicitly acknowledges this risk.

**Action required at merge time (orchestrator):**
1. Check whether `journal.py`, `article.py`, or `partner.py` define `Currency` or `VatRate`.
2. If they do, remove the duplicate definitions from those files and replace with:
   ```python
   from migrator.canonical.support import Currency, VatRate
   ```
3. Run `ruff check` + `mypy` on all affected canonical files after the substitution.

This file (`support.py`) is the authoritative source and should not be changed in this reconciliation — the parallel workers should import from here.

## Deviation from Spec Template

The spec template included `from decimal import Decimal` in its imports. This import was intentionally dropped — none of the four models in this file have numeric fields requiring `Decimal`. All amounts and rates are computed at call sites (parsers or generators), not stored in the canonical support models. Ruff would flag an unused import (F401) and the gate would block.
