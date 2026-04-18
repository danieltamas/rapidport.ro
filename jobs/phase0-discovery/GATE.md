# Phase 0 Gate Review

**Date:** 2026-04-18
**Verdict:** passed (with deferral — SAGA Phase C validation carried to Phase 1)

---

## Criteria

| Criterion | Verdict | Evidence |
| --- | --- | --- |
| WinMentor sample available, gitignored | **pass** | `samples/winmentor/donor-01/` exists: 19,600 files (422 root `.DB`, 21 `.MB`, 51 monthly folders × ~385 files). `git check-ignore -v` confirms `.gitignore:78:samples/`. `git ls-files samples/` returns 0 tracked files. See `jobs/phase0-discovery/DONE-winmentor-sample.md`. |
| SAGA accepts 3+ entity imports (with proof) | **partial — deferred to Phase 1** | SAGA C 3.0 is Windows-only; not installed on the development machine. Schema for 7 entity types documented in `docs/saga-schemas.md:1-619` via Firebird FDB introspection and official SAGA C manual cross-reference. All mappings marked `[UNVALIDATED]` pending live import. Phase C deferral is explicitly stated at `docs/saga-schemas.md:7` and `:620-622`, and documented in `jobs/phase0-discovery/DONE-saga-import-schema.md` (Validation Status section). Remediation: Phase 1 `generators-*` tasks must include a test fixture that submits each entity type to a real SAGA C 3.0 install (Dani to acquire via UTM, CrossOver, or Windows VM — or first-customer pilot). |
| Table inventory complete | **pass** | `docs/winmentor-tables.md` covers all 768 distinct schemas from donor-01: 422 root + 377 monthly. Classification Count Summary at `docs/winmentor-tables.md:402-413`: CORE NOMENCLATURE (20), TRANSACTIONAL (47), LOOKUP (20), CONFIG (28), CACHE (51), DECLARATION (109), SPECIALTY MODULES (493). Appendix A at `docs/winmentor-tables.md:417-end` lists all 493 specialty-module schemas with filename, scope, record count, and first 4 fields. 100% pypxlib parse success rate. |
| Code mapping strategy decided | **pass** | `docs/adr-001-code-mapping.md` status: Accepted (2026-04-18). v1 strategy: Option A — Fresh Target. Partners and accounts covered. A1/A2 resolution added 2026-04-18: v1 defaults to A2 (populate SAGA `ARTICOLE.COD` from WinMentor `CodExtern` when non-empty), surfaced as per-job UI toggle. See `docs/adr-001-code-mapping.md:145-153` (Resolution block) and Phase 2 UI Impact section. |

---

## Additional Checks

| Check | Status | Note |
| --- | --- | --- |
| `docs/questions-for-dani.md` exists | **pass** | Created 2026-04-18. Contains 6 non-blocking open items (warehouse codes, single-run guarantee, import format choice, foreign currency scope, CONTURI assumption, donor consent). No blocking items. |
| `docs/saga-rejections.md` exists | **pass** | Stub created by saga-import-schema task. Status: empty — Phase C validation deferred. `docs/saga-rejections.md:1-7`. |

---

## Open Items

### Deferred (Non-Blocking for Phase 1 Start)

- **SAGA Phase C validation** — end-to-end import test against a live SAGA C 3.0 installation. Deferred to Phase 1 `generators-*` tasks. Each generator task must include a test fixture that submits the generated import file(s) to a real SAGA C 3.0 instance and confirms acceptance. Dani to acquire SAGA C 3.0 access (UTM/CrossOver/Windows VM or first-customer pilot environment) before the first generator task closes. This is a sub-criterion carried forward from Phase 0 — the overall Phase 1 gate (`SPEC §1.10`) cannot pass until at least 3 entity types have a confirmed live import record in `docs/saga-rejections.md`.

### Non-Blocking Open Questions

- See `docs/questions-for-dani.md` for 6 non-blocking items (warehouse codes, import format, foreign currency, CONTURI pre-existence, consent, single-run warning). None block Phase 1 from starting.

---

## Next Phase

**Verdict = passed (with deferral).** Phase 1 (`phase1-worker`) is unblocked. Criteria 1, 3, and 4 pass fully. Criterion 2 (SAGA Phase C) is Partial — the schema is documented and technically grounded but the live import validation is deferred to Phase 1 generator tasks.

**Phase 1 must:**
1. Implement the Paradox parser, canonical schema, and SAGA generators.
2. Expose the A2/A1 article code toggle as a per-job mapping profile setting.
3. Complete Phase C validation (live SAGA import of Terți, Articole, and at least one transactional entity) before the Phase 1 gate (`SPEC §1.10`) can pass. Record outcomes in `docs/saga-rejections.md`.
