---
job: phase0-discovery
phase: 0
title: Discovery & Validation
status: pending
duration-estimate: 2-3 days
gate: SPEC §0.5
---

# Phase 0 — Discovery & Validation

Goal: validate the core hypothesis before writing pipeline code. Without a real WinMentor sample and a working SAGA import path, every line we write is speculation. Phase 0 produces ground truth.

**Reference:** SPEC.md §"PHASE 0 — Discovery & Validation"

---

## Group: `discovery`

One group, five sequential-ish tasks. The first two can run in parallel if Dani has access to both SAGA and a WinMentor sample.

| # | Task | File | Branch | Parallel with | Priority |
| --- | --- | --- | --- | --- | --- |
| 1 | Collect real WinMentor data sample(s) | [winmentor-sample.md](./winmentor-sample.md) | `job/phase0-discovery/discovery-winmentor-sample` | saga-import-schema | critical |
| 2 | Reverse-engineer SAGA C 3.0 import schema | [saga-import-schema.md](./saga-import-schema.md) | `job/phase0-discovery/discovery-saga-import-schema` | winmentor-sample | critical |
| 3 | Classify WinMentor .DB files by role | [table-inventory.md](./table-inventory.md) | `job/phase0-discovery/discovery-table-inventory` | — (needs sample) | high |
| 4 | Decide code mapping strategy (ADR) | [code-mapping-adr.md](./code-mapping-adr.md) | `job/phase0-discovery/discovery-code-mapping-adr` | — (needs sample + inventory) | high |
| 5 | Phase 0 gate review | [phase0-gate.md](./phase0-gate.md) | `job/phase0-discovery/discovery-phase0-gate` | — (terminal) | blocking |

---

## Parallelism Map

```
winmentor-sample     ──┐
                       ├──► table-inventory ──► code-mapping-adr ──► phase0-gate
saga-import-schema   ──┘
```

Tasks 1 and 2 are disjoint (different subjects, different files) — run in parallel.
Task 3 (table-inventory) needs the WinMentor sample; blocks until task 1 is done.
Task 4 (code-mapping-adr) needs both the sample and the inventory; blocks until task 3 is done.
Task 5 (gate) runs after all four prior tasks are merged.

---

## Gate Criteria (SPEC §0.5)

Phase 0 is complete when ALL of these are true:

- [ ] Real WinMentor company folder is available locally in `samples/winmentor/`
- [ ] SAGA accepts a manually-crafted import for at least 3 entity types (Terți, Articole, Articole Contabile minimum)
- [ ] `docs/winmentor-tables.md` classifies every discovered .DB file
- [ ] `docs/adr-001-code-mapping.md` documents the code-mapping strategy with rationale
- [ ] `docs/saga-schemas.md` records the reverse-engineered SAGA import structure

The `phase0-gate` task verifies each bullet independently.

---

## Risks & Open Questions

- **No sample yet.** Phase 0 cannot start until Dani has at least one real WinMentor company folder. Offer free migrations to inbound accountants in exchange for samples.
- **SAGA install.** SAGA C 3.0 must be installed via UTM/CrossOver on macOS. Alternative: Windows VM or access to an existing SAGA installation.
- **Encoding uncertainty.** WinMentor uses CP852 primary with CP1250 fallback. Phase 0 is the right time to detect and document which encoding each table uses — feeds into Phase 1 parser design.

Unknowns discovered during Phase 0 go into `docs/questions-for-dani.md` — do not guess.
