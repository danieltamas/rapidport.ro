---
title: Phase 0 gate review
priority: blocking
status: todo
group: discovery
phase: 0
spec-ref: SPEC §0.5
depends-on: winmentor-sample, saga-import-schema, table-inventory, code-mapping-adr
---

## Description

Terminal task of Phase 0. Verifies every gate criterion from SPEC §0.5 is satisfied before Phase 1 starts. If any criterion fails, Phase 1 stays blocked until the failure is remediated (typically by respawning the relevant Phase 0 task).

This is an **orchestrator task** — no implementation, just verification and a written report.

## Why It Matters

Phase 1 spends 5–7 days building a pipeline on Phase 0's assumptions. If the gate passes prematurely, Phase 1 builds on sand. The gate is the hard handoff.

## Acceptance Criteria

All four items from SPEC §0.5 must be independently verified and documented:

- [ ] **Real WinMentor company folder locally** — verify `samples/winmentor/<company>/` exists, contains expected file set, and is gitignored (not in `git ls-files`)
- [ ] **SAGA accepts manually-crafted import for 3+ entity types** — verify `docs/saga-schemas.md` documents which 3+ entity types were test-imported, with proof (screenshot or SAGA import log excerpt)
- [ ] **Table inventory complete** — verify `docs/winmentor-tables.md` covers every `.DB` file in the sample with classification + parser hint
- [ ] **Code mapping strategy decided** — verify `docs/adr-001-code-mapping.md` has status "Accepted" and a concrete v1 strategy chosen

Additionally:

- [ ] `docs/questions-for-dani.md` exists and is either empty or contains only non-blocking items (blockers escalate — do not close the gate with open blockers)
- [ ] `docs/saga-rejections.md` exists (may be empty — Phase 1 will populate it)
- [ ] `jobs/INDEX.md` updated: `phase0-discovery` status flipped from `in_progress` to `done`; `phase1-worker` status flipped from `blocked on phase0` to `pending`

## Deliverable

`jobs/phase0-discovery/GATE.md` — a one-page verification report listing each criterion with a Pass/Fail verdict and a note citing the artifact that proves it.

Format:

```markdown
# Phase 0 Gate Review

**Date:** YYYY-MM-DD
**Verdict:** passed | failed

## Criteria

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| WinMentor sample available | pass/fail | `samples/winmentor/<company>/` exists, N files, verified gitignored |
| SAGA accepts 3+ entity imports | pass/fail | `docs/saga-schemas.md` §X documents successful imports of [Terți, Articole, ...] |
| Table inventory complete | pass/fail | `docs/winmentor-tables.md` covers N files |
| Code mapping strategy decided | pass/fail | `docs/adr-001-code-mapping.md` — strategy: [fresh target/offset/merge] |

## Open Items

(blockers escalated, non-blockers listed)

## Next Phase

If verdict = passed: unblock `phase1-worker` and proceed.
If verdict = failed: list remediation tasks and keep Phase 1 blocked.
```

## Files to Touch

- `jobs/phase0-discovery/GATE.md` (new)
- `jobs/INDEX.md` (update statuses)
- `jobs/phase0-discovery/DONE-phase0-gate.md`

## Notes

- This task does NOT write implementation code. It reads artifacts produced by the four prior Phase 0 tasks and verifies them.
- If the orchestrator is doing single-agent mode, still use a proper self-review pass — re-read each criterion file.
- On `failed` verdict: the orchestrator creates remediation task files in `jobs/phase0-discovery/` and leaves this task open until remediation merges and re-review passes.
