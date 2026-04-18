# Completed: Canonical Partner + Address Models

**Task:** canonical-partner | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/canonical/partner.py:1-200` — New file. Defines `Address`
  and `Partner` Pydantic v2 models for the canonical schema layer between WinMentor
  parsers and SAGA generators. Both models use `ConfigDict(frozen=True,
  str_strip_whitespace=True, extra="forbid")`.

## Acceptance Criteria Check

- [x] Partner + Address are Pydantic v2 models — `model_config = ConfigDict(frozen=True, ...)`
- [x] `cif`, `cnp` both optional — model accepts both None to support foreign partners
  and Romanian natural persons; validation-phase UI concern noted in docstring
- [x] `source_metadata` present with `default_factory=dict`
- [x] `model_dump()` roundtrip clean — CIF is stored stripped, so re-validating a
  dumped dict finds no `RO` prefix to strip and the value passes `validate_cif_length`
- [x] `source_id` required, `min_length=1`, no default
- [x] `partner_type` has no default — Literal["customer","supplier","both"] with `...`
- [x] Max 200 lines — exactly 200 lines
- [x] No new dependencies — only `pydantic>=2.7` (already in pyproject.toml)
- [x] No imports from parallel workers (parsers, article, journal, support)
- [x] `from __future__ import annotations` present

## Security Check

- [x] No PII in logs — `email` field docstring explicitly notes SHA-256 hashing requirement
- [x] `cif` strips `RO` prefix on storage matching SAGA's COD_FISCAL invariant
- [x] No DB access, no mutation endpoints, no webhooks — pure Pydantic schema, N/A for most security checks
- [x] `extra="forbid"` on both models prevents unexpected fields from passing through undetected

## Validation Rules Chosen

### CIF format
SAGA's `COD_FISCAL` column (`CLIENTI`, `FURNIZORI`) stores CIF without the `RO` prefix
(confirmed: `docs/saga-schemas.md §1a`: "CIF/CNP, no RO prefix stored"). The `cif`
field validator strips any leading `RO`/`ro` prefix when the character immediately after
is a digit (heuristic to avoid stripping `RO...` VAT prefixes of non-Romanian EU
companies like Romanian-registered entities with text in the remainder). Length validated
as 2-10 after stripping.

Empty string after stripping is normalised to `None` in the `mode="before"` validator
to keep the type consistent (`str | None`, never `""`).

### CNP
No structural validation — stored as `str | None` to allow flexible ingestion. The
ADR-001 edge case documents that 13-digit CNPs are emitted as-is into SAGA `COD_FISCAL`.

### source_id type: str (not int)
ADR-001 §"Phase 1 Canonical Schema Impact" states `CanonicalPartner.source_id: int`
(WinMentor `NPART.Cod` is an integer). The task spec overrides this with `str` for
maximum flexibility — WinMentor codes might arrive as strings from the Paradox parser,
and `str` with `min_length=1` avoids any int/str coercion surface. **Deviation from
ADR-001 noted here** for reviewer awareness; the reconciliation CSV output remains
correct either way because the value is preserved verbatim.

## Deviations from SPEC.md §1.4

SPEC.md §1.4 shows a simpler shape:
- `is_supplier: bool` + `is_customer: bool` → replaced by `partner_type: Literal["customer","supplier","both"]`
  (more precise, prevents the invalid `is_supplier=False, is_customer=False` state)
- Single `address: Address` → split into `billing_address` + `shipping_address`
  (matches WinMentor's actual field set; SAGA only uses billing fields in import)
- Added `cnp`, `is_foreign`, `email`, `phone` fields not in §1.4 spec sketch
  (required by ADR-001 edge cases for natural persons and foreign partners)
- `source_id: str` not `int` as noted above

These additions are backwards-compatible refinements, not contradictions. The SPEC §1.4
sketch is described as "minimal but complete" and explicitly defers field completeness
to implementation.
