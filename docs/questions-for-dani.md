# Questions for Dani

Non-blocking open questions surfaced during Phase 0 discovery. None of these block Phase 1 from starting.

---

## Open (Non-Blocking)

1. **Warehouse codes (`GESTIUNI.COD`).** Source: `docs/adr-001-code-mapping.md` Open Questions §1. WinMentor's `NGEST.DB` has 3 warehouses with user-assigned codes that appear in every invoice line item. Should Phase 1 preserve these verbatim or leave warehouse `COD` blank (fresh target)? The A2/A1 toggle pattern from articles could apply here. Decision can be deferred to Phase 1 `generators-*` task for gestiuni.

2. **Single-run guarantee.** Source: `docs/adr-001-code-mapping.md` Open Questions §2. Should `report.json` include a "migration lock" warning that the mapping CSVs are only valid for a single production SAGA import run? Low-effort addition; confirm desired wording.

3. **SAGA import format: DBF vs XML for Terți/Articole.** Source: `jobs/phase0-discovery/DONE-saga-import-schema.md` Open Questions §1. The SAGA manual accepts both DBF and XML. XML is simpler to generate. Confirm preferred format for v1.

4. **Foreign-currency invoices in scope for v1?** Source: `jobs/phase0-discovery/DONE-saga-import-schema.md` Open Questions §3. FDB has a separate `INTRD`/`INTRD_DET` table for EUR/USD purchases. RON-only first, or include foreign-currency in v1?

5. **CONTURI pre-existence assumption.** Source: `jobs/phase0-discovery/DONE-saga-import-schema.md` Open Questions §4. Should the generator produce a CONTURI (Plan de Conturi) import file, or assume the target SAGA company has the Romanian chart of accounts already loaded?

6. **Donor sample consent.** Source: `samples/winmentor/donor-01/SOURCE.md`. The consent line is PENDING. Paste anonymized consent quote before the group branch merges to main.

---

## Resolved

- **A1 vs A2 for `ARTICOLE.COD`** — resolved 2026-04-18. v1 defaults to A2 (populate from `CodExtern`), surfaced as per-job UI toggle. See `docs/adr-001-code-mapping.md`.
