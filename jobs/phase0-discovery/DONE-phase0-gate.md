# Completed: Phase 0 Gate Review

**Task:** phase0-gate.md | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `docs/adr-001-code-mapping.md:145-153` — Replaced "Sub-question for Dani (A1 vs A2)" with Resolution block: v1 defaults to A2 (populate SAGA `ARTICOLE.COD` from `CodExtern` when non-empty, fall back to blank). Surfaced as per-job UI toggle in the mapping validation phase.
- `docs/adr-001-code-mapping.md:189` — Updated `source_extern_id` parenthetical to reflect A2 resolution instead of stale "preserved for A1/A2 decision".
- `docs/adr-001-code-mapping.md:204-220` — Added "Phase 2 UI Impact" section: per-entity-class toggle on `/job/[id]/mapping`, default ON (A2), off state = A1; Phase 1 must wire the setting through canonical schema → mapping profile → generator.
- `docs/adr-001-code-mapping.md:226-232` — Removed A1/A2 entry from Open Questions (resolved). Remaining questions renumbered 1–2.
- `docs/questions-for-dani.md` — New file. Non-blocking open questions (6 items): warehouse codes, single-run guarantee, import format choice, foreign currency scope, CONTURI pre-existence, donor consent. A1/A2 moved to Resolved section.
- `jobs/phase0-discovery/GATE.md` — New file. Gate review report with Pass/Partial/Fail per criterion. Verdict: passed (with deferral).
- `jobs/INDEX.md` — `phase0-discovery` status → `done (group branch pending merge to main pending Dani's final review)`; `phase1-worker` status → `pending` with SAGA Phase C deferral note.

## Acceptance Criteria Check

- [x] WinMentor sample available, gitignored — `samples/winmentor/donor-01/` exists (19,600 files), `.gitignore:78` confirms gitignore, `git ls-files samples/` returns 0. **Pass.**
- [x] SAGA accepts 3+ entity imports — Phase C deferred to Phase 1 generators; schema documented for 7 entity types in `docs/saga-schemas.md` via FDB introspection. **Partial — deferred, documented, non-blocking.**
- [x] Table inventory complete — `docs/winmentor-tables.md` covers 768 distinct schemas (all 7 classifications + Appendix A). **Pass.**
- [x] Code mapping strategy decided — ADR-001 Accepted, Option A (fresh target), A1/A2 resolved as A2 default with UI toggle. **Pass.**
- [x] `docs/questions-for-dani.md` exists with only non-blocking items. **Pass.**
- [x] `docs/saga-rejections.md` exists (stub). **Pass.**
- [x] `jobs/INDEX.md` updated: phase0 → done, phase1 → pending with deferral note. **Pass.**
- [x] `jobs/phase0-discovery/GATE.md` written with table format and Next Phase section. **Pass.**

## Security Check

N/A — documentation task. No endpoints, no DB access, no user input, no production code changes.

## Notes

**Overall verdict: passed (with deferral).** Phase 1 is unblocked.

**One deferred item:** SAGA Phase C (end-to-end live import test against SAGA C 3.0). SAGA C 3.0 is Windows-only and not installed on the dev machine. This is not a blocker for Phase 1 to start — it is a sub-criterion that must be satisfied before the Phase 1 gate (`SPEC §1.10`) can pass. Each `generators-*` task in Phase 1 should include a test fixture that exercises a live SAGA import. Dani to arrange SAGA C 3.0 access (UTM/CrossOver/Windows VM or first-customer pilot) before Phase 1 generator tasks close.

**Open blockers:** None.

**Next-phase recommendation:** Proceed to Phase 1 (`phase1-worker`). The canonical schema, Paradox parser, and SAGA generators can be built on Phase 0 artifacts as-is. The A2/A1 article code toggle must be wired through from Phase 1 (even if Phase 2 UI toggle is not yet built) so that integration tests can exercise both paths. See `docs/adr-001-code-mapping.md` Phase 2 UI Impact section.
