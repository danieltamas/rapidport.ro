# SAGA C 3.0 Import Rejections Log

**Purpose:** Catalog of import files that SAGA C 3.0 rejected during validation, including the exact error message, the offending file/field, and the fix applied. Used by Phase 1 generator workers to avoid known failure modes.

**Status:** Empty — Phase C validation is deferred to Phase 1 `generators-*` tasks. No rejection data available yet.

---

## Rejection Format

Each entry will follow this template:

```
## REJECTION-001

**Date:** YYYY-MM-DD
**Entity:** <entity type>
**File:** <filename>
**SAGA Error:** <exact error text from SAGA>
**Root cause:** <what was wrong>
**Fix applied:** <what changed in the generator>
**Confirmed fixed:** Yes/No
```

---

## Known Risks (Pre-validation, from Phase 0 analysis)

The following items are flagged as **likely rejection candidates** pending Phase C validation:

| Risk | Entity | Field/Rule | Reference |
|------|--------|-----------|-----------|
| DBF field width mismatch | Terți, Articole | DENUMIRE may need ≤48 chars in import vs 64 in FDB | askit.ro |
| DBF column order | All DBF formats | SAGA parser may expect fixed column order | [UNVALIDATED] |
| CIF format with `RO` prefix | Terți (DBF) | `RO` prefix behavior in DBF import unconfirmed | Forum posts |
| XML date format | Intrări, Ieșiri, Încasări, Plăți | `dd.mm.yyyy` vs ISO `yyyy-mm-dd` | Manual examples |
| TipDeducere enumeration | Intrări, Ieșiri | Only `N50` and `I` documented; full list unknown | Manual |
| Account codes must pre-exist | Articole Contabile, Intrări, Ieșiri | SAGA rejects entries with accounts not in CONTURI | Logical inference |
| Article code must pre-exist | Intrări, Ieșiri line items | Line items referencing unknown article codes fail | Logical inference |
| Partner code must pre-exist | Intrări, Ieșiri headers | COD must match CLIENTI/FURNIZORI or be importable | Forum posts |
