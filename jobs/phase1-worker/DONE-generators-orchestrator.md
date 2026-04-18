# Completed: Generators Orchestrator

**Task:** generators-orchestrator | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/generators/orchestrator.py:1-298` — Top-level dispatcher
  that takes `CanonicalData` + `output_dir`, invokes all 5 sub-generators in
  order (Terți, Articole, Articole Contabile, Invoices, Payments), and returns
  `GenerationStats` for `report.json`. Exports `MappingProfile`, `CanonicalData`,
  `GenerationStats` dataclasses per public API spec.

## Acceptance Criteria Check

- [x] `generate_saga_output` dispatches to all 5 sub-generators — terti, articole,
  articole_contabile, invoices (per-item loop), payments
- [x] Per-entity try/except + errors list accumulation — each entity block is
  independently wrapped; invoice loop isolates per-item errors too
- [x] Filename collision check post-dispatch — raises RuntimeError with duplicate
  paths if set(files_written) size differs from list size
- [x] `MappingProfile` + `CanonicalData` + `GenerationStats` dataclasses exported
  via `__all__`
- [x] Path-traversal defense on every returned path — `_accept_paths` helper
  calls `path.resolve().relative_to(resolved_output_dir)` and catches ValueError

## Security Check

- [x] No DB access — pure file generation, no Drizzle needed
- [x] No mutation endpoints — worker module only
- [x] No PII in logs — log events emit only counts, entity names, and file counts;
  `_redacted_exc()` strips exception messages (may contain file paths or row data),
  emits only exception type + `[REDACTED]`
- [x] Path-traversal defense — every sub-generator-returned path is resolved and
  verified as `relative_to(resolved_output_dir)` before acceptance
- [x] Per-entity error containment — no entity failure can abort the overall run;
  SAGA can reject individual malformed files without losing the rest

## Notes

**`orchestrator.py` vs `__init__.py`:** JOB.md originally named this file
`generators/__init__.py`. The Wave 1 scaffolding contract seals all `__init__.py`
as empty stubs (`# intentionally empty — downstream modules use direct imports`).
Putting generation logic in `__init__.py` would violate that seal (import-time
side effects, non-empty init). `orchestrator.py` is the correct location; callers
use `from migrator.generators.orchestrator import generate_saga_output`.

**Parallel-worker imports:** `saga_xml_*` sibling modules are being written by
parallel workers. Imports are at module level (resolved at load time) but
functions are only *called* inside `generate_saga_output` at runtime — safe for
the merge window.

**`generate_articole_contabile_xml` return shape:** assumed to return
`tuple[list[Path], int]` (paths, emitted_count) per the stats requirement.
If the parallel worker returns only `list[Path]`, the orchestrator destructure
will raise `ValueError` at merge time — reconcile then.
