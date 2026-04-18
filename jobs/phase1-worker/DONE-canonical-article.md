# Completed: Canonical Article Model

**Task:** canonical-article | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/canonical/article.py:1-137` — New file. Pydantic v2 `Article` model with:
  - `VALID_VAT_RATES: frozenset[Decimal]` = `{Decimal("0"), Decimal("5"), Decimal("9"), Decimal("19")}` (Romanian VAT law, Codul Fiscal Legea 227/2015)
  - `ArticleType = Literal["product", "service", "materials", "other"]` — four SAGA ART_TIP categories
  - `source_id: str` — WinMentor NART.Cod; reconciliation only, never written to SAGA
  - `cod_extern: str | None` — WinMentor CodExtern; A2 default: populate SAGA ARTICOLE.COD when non-empty (VARCHAR(16) fits); A1 toggle leaves it blank
  - `vat_rate: Decimal` with `_coerce_and_validate_vat_rate` field_validator that coerces int/str/Decimal before set-membership check; error message names the allowed set
  - `model_config = ConfigDict(frozen=True, str_strip_whitespace=True, extra="forbid")`
  - `source_metadata: dict[str, object]` — catch-all for unmapped NART fields

## Acceptance Criteria Check

- [x] Article model is Pydantic v2 with `frozen=True` config — confirmed
- [x] `VALID_VAT_RATES` exported as `frozenset[Decimal]` of `{0, 5, 9, 19}` using `Decimal("...")` literals (no floats)
- [x] `ArticleType` Literal type defined at module level
- [x] `source_metadata: dict[str, object]` present with `default_factory=dict`
- [x] `vat_rate` validator rejects non-allowed values with clear error message including allowed set
- [x] `from __future__ import annotations` at top
- [x] `extra="forbid"` via ConfigDict
- [x] Max 150 lines — file is 137 lines
- [x] No imports from `migrator.parsers.*`, `migrator.canonical.*` sibling modules — self-contained
- [x] No new deps — only `pydantic>=2.7` + stdlib (`decimal`, `typing`)
- [x] `__init__.py` not touched
- [x] No other `canonical/*.py` files modified

## Security Check

Security N/A — this is a pure Pydantic data model with no I/O, no DB access, no HTTP handlers, no PII processed at this layer.

- [x] No PII logged (model has no logging)
- [x] All DB access N/A (no DB access in this file)
- [x] CSRF N/A (no HTTP endpoints)
- [x] Rate limits N/A (no HTTP endpoints)

## Notes

- **ADR-001 A1/A2 plumbing:** `cod_extern` field is the canonical carrier for the A2 decision. The SAGA article generator reads `cod_extern` and the per-job mapping profile toggle to decide whether to populate `ARTICOLE.COD`. `source_id` is the reconciliation key for `articles.csv` only.
- **VAT rate set:** uses `Decimal("0")` etc. (not `Decimal(0)` from int) for explicit string-constructor semantics; all comparisons in `VALID_VAT_RATES` membership check use the same Decimal-from-string path after coercion.
- **`unit` field:** marked optional (`None`) with a note that SAGA requires UM in the import file — the generator must handle the fallback (e.g., emit `"buc"` or raise a conversion error), not the canonical model.
