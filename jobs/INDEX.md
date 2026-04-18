# Jobs Index

Master index of all jobs for the rapidport.ro project. See `SPEC.md` for the product spec; this file tracks execution.

---

## Active / Pending

| Job | Phase | Status | Duration | Gate | Job File |
| --- | --- | --- | --- | --- | --- |
| `phase0-discovery` | Phase 0 — Discovery & Validation | **done** — merged to main 2026-04-18 (gate passed with SAGA Phase C deferral) | 2–3 days | SPEC §0.5 | [JOB.md](./phase0-discovery/JOB.md) |
| `phase1-worker` | Phase 1 — Core Pipeline (Python worker) | pending (SAGA Phase C validation — live import against installed SAGA — carried forward to Phase 1 `generators-*` tasks as a sub-criterion per Phase 0 gate partial-pass) | 5–7 days | SPEC §1.10 | [JOB.md](./phase1-worker/JOB.md) |
| `phase2-nuxt` | Phase 2 — Nuxt App, Admin, Productization | `bootstrap` group: **7/7 done on main** ✓. Other groups (security-baseline, schema, auth-*, api-*, pages-*, etc.) blocked on phase1 gate. | 5–7 days | SPEC §2.8 | [JOB.md](./phase2-nuxt/JOB.md) |

## Archived

_none yet_

---

## Execution Rules

1. **Work phase-by-phase for functionality.** Do not start Phase 1 (worker implementation) before Phase 0 gate passes. Do not start Phase 2's implementation groups (`auth-*`, `api-*`, `pages-*`, etc.) before Phase 1 gate passes.
2. **Exception: Phase 2's `bootstrap` group runs immediately** in parallel with Phase 0. Nuxt scaffolding, theme tokens, fonts, primitives, env validation, and Drizzle schema do not depend on any Phase 0 output — starting them early means Phase 1 worker has a full Drizzle schema to target (no raw-SQL stopgap) and Phase 2's later groups layer onto a ready foundation.
3. **Inside a phase, parallelize** tasks that are file-disjoint per each JOB.md's "Parallelism map".
3. **Every task follows the Agent Pipeline** (ONSTART.md §Agent Pipeline) — no orchestrator-written code, every merge gated by a REVIEW verdict.
5. **Task files are expanded just before spawn** for Phase 1/2 — JOB.md rows carry title + acceptance criteria; orchestrator writes the full `<task>.md` right before Phase 2 of the pipeline, using the row as the source of truth.
6. **Phase gates are tasks of their own** — each phase ends with a `gate-review` task that verifies the SPEC gate criteria and blocks further phases until all items pass.

---

## Status Key

| Status | Meaning |
| --- | --- |
| `pending` | Not started |
| `in_progress` | At least one task in the job has started |
| `blocked` | Waiting on an external dependency (previous phase gate, sample data, API credentials) |
| `done` | All tasks completed, gate passed, group branch merged to main |
