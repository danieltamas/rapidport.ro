# Completed: Reverse-engineer SAGA C 3.0 import schema

**Task:** saga-import-schema.md
**Status:** done
**Date:** 2026-04-18

## Changes Made

- `docs/saga-schemas.md` — new; full entity schema + import format mappings for all 7 entities (committed)
- `docs/saga-rejections.md` — new stub with known risk flags (committed)
- `.gitignore` — already contained correct entries from prior attempt (no change needed)
- `docs/saga-fdb-schema.sql` — DDL dump via prior docker isql run (gitignored, 40 371 lines, 195 tables)

## Acceptance Criteria Check

- [x] Firebird client via docker (jacobalberty/firebird:3.0) — ODS 12 confirmed from FDB file header (byte offset 0x12 = 0x0C = 12); Docker extraction was performed by a prior worker session, not re-run this session
- [x] FDB schema extracted — 195 CREATE TABLE statements, 147 triggers, 154 generators, 40 371 total DDL lines (inherited from prior worker's `docs/saga-fdb-schema.sql`; verified valid by inspection)
- [x] .gitignore updated — entries `docs/saga-fdb-schema.sql` and `samples/saga/CONT_BAZA.readonly.FDB` present (added by prior attempt, verified correct)
- [x] docs/saga-schemas.md covers: Terți/Clienti, Terți/Furnizori, Articole, Articole Contabile/Note Contabile, Intrări, Ieșiri (fully documented) + Încasări, Plăți (fully documented)
- [x] Per entity: FDB columns + types + constraints + import format + mapping hypothesis + gotchas + sample snippet
- [x] docs/saga-rejections.md stub created with known risk flags
- [x] Validation Status section present; Phase C deferred with explicit rationale

## Security Check (N/A — discovery task, no endpoints/DB mutations)

- [x] Sensitive files gitignored (FDB + DDL dump + readonly copy)
- [x] No row data queried or logged (schema-only introspection via DDL dump)
- N/A — CSRF, assertJobAccess, assertAdminSession, Zod, Drizzle (no endpoints touched)

## Notes

- **Docker image + tag:** `jacobalberty/firebird:3.0` — chosen because FDB header bytes at offset 0x12 = `0x0C` (decimal 12) = ODS major version 12 = Firebird 3.x. Firebird 4 uses ODS 13; using the wrong tag would result in "unsupported ODS" error.
- **Firebird credentials that worked:** `SYSDBA/masterkey` (first attempt succeeded)
- **FDB ODS version:** 12.0 (Firebird 3.x confirmed from file header magic bytes)
- **Database character set:** `WIN1252` (from `CREATE DATABASE` comment in DDL dump + function parameter declarations)
- **Total tables in FDB:** 195
- **Target entity → table map:**
  - Terți → `CLIENTI` + `FURNIZORI` (separate tables, same import pattern)
  - Articole → `ARTICOLE`
  - Articole Contabile → `REGISTRU` + `CONTURI`
  - Intrări → `INTRARI` + `INTR_DET` (RON) / `INTRD` + `INTRD_DET` (foreign currency variant)
  - Ieșiri → `IESIRI` + `IES_DET`
  - Încasări → `REGISTRU` + `NOTE_FACTURI` (no dedicated INCASARI table)
  - Plăți → `REGISTRU` + `OP`
- **Vendor docs located:**
  - https://manual.sagasoft.ro/sagac/topic-76-import-date.html (official SAGA C manual — most authoritative)
  - https://askit.ro/solutii/importul-de-date-in-saga-c-3-0/ (detailed DBF field specs with widths)
  - https://forum.sagasoft.ro/viewtopic.php?t=41864 (XML invoice import discussion)
  - https://www.sagasoft.ro/forum/viewtopic.php?t=5286 (general import date forum)

## Open Questions for Dani

1. **DBF format vs XML for Terți/Articole:** The SAGA manual shows both DBF (`Clienti_*.dbf`) and XML (`CLI_*.xml`) are accepted. Should Phase 1 generators produce DBF or XML for these entities? XML is simpler to generate correctly; DBF requires a proper dBASE writer library.
2. **Deduplicated vs always-overwrite imports:** SAGA deduplicates Terți on `COD_FISCAL` — if a client already exists, the import is silently skipped. Does Rapidport need an "update existing" mode, or is fresh-DB-only acceptable for v1?
3. **Foreign-currency invoices:** The FDB has a separate `INTRD`/`INTRD_DET` table for foreign-currency purchases. Should Phase 1 generators handle EUR/USD invoices in v1, or RON-only first?
4. **Accounts must pre-exist:** The import screen requires that debit/credit accounts referenced in Note Contabile already exist in CONTURI. Should the generator also produce a CONTURI (plan de conturi) import file, or assume the target SAGA company already has the Romanian plan de conturi loaded?
