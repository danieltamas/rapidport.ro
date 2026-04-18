# Questions for Dani

Non-blocking open questions surfaced during Phase 0 discovery. None of these block Phase 1 from starting.

---

## Open (Non-Blocking)

_All Phase 0 open questions resolved as of 2026-04-18. See Resolved section below._

---

## Resolved

- **A1 vs A2 for `ARTICOLE.COD`** — resolved 2026-04-18. v1 defaults to A2 (populate from `CodExtern`), surfaced as per-job UI toggle. See `docs/adr-001-code-mapping.md`.

- **Warehouse codes (`GESTIUNI.COD`)** — resolved 2026-04-18. Apply the same A1/A2 pattern from articles: v1 defaults to populating `GESTIUNI.COD` from WinMentor's `NGEST.CodGest`, surfaced as a per-job UI toggle in the validation phase. Phase 1 generator for gestiuni follows ADR-001 pattern.

- **Single-run guarantee** — resolved 2026-04-18. Phase 1 generator emits a visible migration-lock warning in `report.json` (e.g., top-level `"warning": "single-use — do not re-import these files into SAGA more than once; the mapping CSVs are only valid for one import run"`). Exact wording deferred to Phase 1 generator task.

- **SAGA import format: DBF vs XML for Terți/Articole** — resolved 2026-04-18. **XML** for all entities (Terți, Articole, Articole Contabile, Intrări, Ieșiri, Încasări, Plăți). Rationale: XML is Unicode-clean, human-readable, easier to diff/validate, avoids the encoding pitfalls of the Paradox-lineage DBF format. Per `docs/saga-schemas.md` SAGA accepts XML for every entity we ship.

- **Foreign-currency invoices in scope for v1** — resolved 2026-04-18. **In scope.** Phase 1 generator supports RON (`INTRARI`/`IESIRI` in SAGA FDB) and foreign currency (`INTRD`/`INTRD_DET` for EUR/USD and other foreign-currency purchase invoices). Rationale: we do not want to assume what currency a company's suppliers invoice in; limiting to RON would exclude any accountant with EU suppliers. Phase 1 parser scope must include the foreign-currency WinMentor source tables — update the Phase 1 parser-scope list in `docs/winmentor-tables.md` accordingly during Phase 1 setup.

- **CONTURI pre-existence assumption** — resolved 2026-04-18. **Assume pre-loaded.** Every SAGA company has the Romanian chart of accounts (Plan de Conturi Românesc) loaded at company creation — it is required for recording any transaction. Phase 1 generator does NOT produce a standard CONTURI import file. Exception: if the WinMentor source contains user-added sub-accounts (e.g., `5121.1`, `5121.2` for separate bank accounts), the generator emits those as additions on top of the assumed base chart.

- **Donor sample consent** — resolved 2026-04-18. Donor explicitly consented. The WinMentor backup was provided by an accountant who asked Daniel Tamas for help migrating from WinMentor to SAGA — that request is what prompted building this paid migration tool. See `samples/winmentor/donor-01/SOURCE.md` for the consent record.
