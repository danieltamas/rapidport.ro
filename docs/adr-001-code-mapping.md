# ADR-001: Code Mapping Strategy for WinMentor → SAGA Migration

**Status:** Accepted
**Date:** 2026-04-18
**Deciders:** Daniel Tamas
**Spec refs:** SPEC §0.4

---

## Context

WinMentor uses integer-based internal codes for its master data: `NPART.DB` carries a `Cod` field (integer partner code) alongside `CodFiscal` (CIF/CNP); `NART.DB` carries a `Cod` field (integer article code) alongside `CodExtern` (customer-facing SKU or barcode reference). SAGA has its own code space with different rules per entity type.

The concrete problem is threefold:

1. **SAGA's transactional PKs are always auto-assigned.** `docs/saga-schemas.md` Global Gotchas §PK generation: "Every table with a `PK INTEGER` column has a corresponding trigger + generator (e.g. `GEN_INTRARI_PK`). Import files do NOT provide PKs — SAGA auto-assigns them via generators." This covers `INTRARI.ID_INTRARE`, `IESIRI.ID_IESIRE`, and `REGISTRU.PK`. There is no mechanism to supply these values at import time — they are architecturally out of scope for any code-mapping decision.

2. **Master-data codes for partners and articles are user-supplied strings, not ints.** SAGA's `CLIENTI.COD` and `FURNIZORI.COD` are `VARCHAR(8)`; `ARTICOLE.COD` is `VARCHAR(16)`. These are the codes the generator can choose to set, leave blank, or populate from WinMentor source data.

3. **Accountants need an audit trail.** A migration cannot simply discard WinMentor codes: when an accountant queries a pre-migration invoice in their archive and then looks up the same partner in SAGA, they need a way to match them. Wrong strategy = permanent reconciliation burden. Right strategy = one-time lookup in the conversion report.

The decision is: what values do we write to `CLIENTI.COD`, `FURNIZORI.COD`, and `ARTICOLE.COD` in the SAGA import files?

---

## Options Considered

### Option A: Fresh Target

Drop WinMentor's integer codes entirely. When generating import files:
- Leave `COD` blank for partners and articles.
- SAGA auto-assigns codes on import (or prompts the user to assign a code series prefix in the SAGA UI — this is a one-time SAGA setup step outside the importer's scope).
- The conversion report maps `winmentor_cod` → `saga_cod` per entity so accountants can look up the assignment.

**Pros:**
- Aligns with SAGA's import design. `docs/saga-schemas.md` §1c confirms `COD` is optional for both partners (DBF import) and articles — "If blank, SAGA auto-assigns." No import file gymnastics needed.
- Deduplication on partners works correctly: SAGA deduplicates on `COD_FISCAL` (CIF), not `COD`. So a blank or fresh `COD` does not prevent correct identification — the CIF is the canonical key.
- Avoids the `VARCHAR(8)` overflow risk for offset codes (see Option B).
- Clean SAGA database: no legacy prefixes visible to the accountant in drop-downs and reports.

**Cons:**
- Accountants cannot guess the new code from the old one. They must use the conversion report to resolve historical code references.
- SAGA's auto-assigned codes may be non-intuitive (sequential numbers vs. the accountant's preferred mnemonic). The SAGA setup step (choose a code series) falls on the accountant, not Rapidport.

**Pipeline impact:**
- Generator leaves `COD` field blank in DBF files and omits `<Cod>` in XML files for partners and articles.
- Canonical schema carries `source_id` (WinMentor integer `Cod`) as a non-PK metadata field so it can be emitted in `report.json`.

---

### Option B: Offset Codes (`WM_` Prefix)

Prefix every WinMentor integer code with `WM_` to create a SAGA-side code that is traceable back to the source without a lookup file. For example, WinMentor partner `Cod = 12345` becomes SAGA `COD = WM_12345`.

**Pros:**
- Accountant can read any SAGA partner code and immediately know which WinMentor partner it was, without opening a report.
- No external lookup needed for common reconciliation.

**Cons:**
- **Mechanical overflow.** SAGA `CLIENTI.COD` and `FURNIZORI.COD` are `VARCHAR(8)` (`docs/saga-schemas.md` §1a, §1b). `WM_12345` occupies exactly 8 characters. Any WinMentor company with a partner `Cod` value ≥ 100,000 (6 digits) overflows the field. Real-world WinMentor databases frequently have 4–5 digit partner codes; 6-digit codes are not hypothetical in companies with thousands of partners. This is a silent data-truncation bug waiting in production.
- **Permanent UI pollution.** Every SAGA drop-down, every report, every invoice shows `WM_12345` as the partner code — forever. Accountants will want to rename these manually over time, which undermines the "traceable" benefit and creates operational overhead.
- **No equivalent exists for transactional PKs.** Even if used for master data, offset codes cannot apply to `INTRARI.ID_INTRARE`, `IESIRI.ID_IESIRE`, or `REGISTRU.PK` — these are always generator-assigned. The strategy would be partial at best.
- **Article COD collision.** SAGA deduplicates articles on `COD`. A `WM_`-prefixed code guarantees no collision with existing SAGA records, but it means the article catalog looks synthetic. Articles' external/barcode codes (`CodExtern` in WinMentor) would be discarded in favor of the internal integer prefix.

---

### Option C: Merge Mode (Match by CIF / Name)

Attempt to match WinMentor partners to already-existing SAGA partners by CIF, and WinMentor articles to already-existing SAGA articles by name or barcode, then update the existing SAGA records rather than inserting new ones. This is the delta-sync scenario.

**Pros:**
- Enables migration into a SAGA instance that already has partial data (e.g., accountant has been using SAGA for new clients since the decision to migrate was made).
- "True merge" — no duplicate partner records, invoices link to existing SAGA counterparties.
- The v2 differentiator described in SPEC §0.4.

**Cons:**
- **Ambiguous matches are the rule, not the exception.** CIF-based matching works for Romanian legal entities but fails for: natural persons (no CIF, only CNP), foreign partners (no Romanian CIF), partners with typos in stored CIF, partners with multiple fiscal codes (WinMentor's `NPARTCF.DB` stores multi-CIF partners).
- **Requires a diff-before-import UI.** Merge produces a list of match candidates — the accountant must approve each match before import runs. This is a separate UX flow that v1 does not have.
- **Out of scope for v1.** SPEC §0.4 explicitly defers this to v2. Nothing in the schema evidence contradicts that deferral — the complexity is real.

---

## Decision

**v1 ships Option A: Fresh Target.**

For partners (`CLIENTI`, `FURNIZORI`) and articles (`ARTICOLE`), the generator leaves `COD` blank; SAGA auto-assigns on import. The conversion report provides the `winmentor_cod → saga_cod` mapping as the accountant's audit trail. Chart-of-accounts codes (`CONTURI.CONT`) are preserved verbatim — this is a carve-out, not an exception (see below).

---

## Rationale

**Option B fails on VARCHAR(8).** `CLIENTI.COD` is 8 characters (`docs/saga-schemas.md` §1a). `WM_NNNNN` format exhausts the field at 5-digit codes; any code ≥ 100,000 silently truncates. This is not a theoretical risk — production WinMentor databases exceed this routinely. Even if the truncation were addressed with a shorter prefix (`W_` = 2 chars), the approach still permanently pollutes every SAGA UI element with synthetic codes the accountant never assigned. Option B is rejected on mechanical grounds first, aesthetic grounds second.

**Option A aligns with SAGA's own import design.** The `COD` field is explicitly optional in both the DBF format (`docs/saga-schemas.md` §1c: "If blank, SAGA auto-assigns") and the XML format (where `<Cod>` is listed as optional). SAGA's deduplication key for partners is `COD_FISCAL` — the CIF — not the `COD` field. This means a fresh-target import is guaranteed to produce correct partner identity as long as CIFs are present, which is the normal case for Romanian legal entities.

**SAGA's transactional PKs make Option B partially irrelevant anyway.** `INTRARI.ID_INTRARE`, `IESIRI.ID_IESIRE`, and `REGISTRU.PK` are all auto-generated by Firebird triggers at import time (`docs/saga-schemas.md` Global Gotchas §PK generation). No import file can supply these values. The "offset codes" strategy cannot apply to any transactional entity — it would only partially cover the master data, leaving transactional cross-references resolved by SAGA generators regardless. A partial-offset strategy gives no reconciliation benefit for invoices, journal entries, or payments.

**The reconciliation problem is solved by the conversion report.** Option B's stated advantage — traceable codes — is achievable without polluting SAGA's code space. The conversion pipeline already produces `report.json` per job. Adding per-entity mapping CSV files (`partners.csv`, `articles.csv`) to the job output solves the audit trail at zero cost to SAGA's UX. Each row: `winmentor_cod, winmentor_codfiscal, saga_cod, denumire`. One-time reference, not a permanent pollution.

---

## Consequences

### Positive

- SAGA import files are simpler to generate: `COD` field is omitted or blank. No prefix-calculation logic required.
- SAGA's deduplication behavior (`COD_FISCAL` for partners, `COD` for articles) works correctly for the fresh-target case — no collision handling needed.
- Accountants see clean, SAGA-native codes in their UI: the software they're migrating to doesn't carry visible remnants of the software they're leaving.
- No VARCHAR overflow risk.

### Negative / Costs

- Accountants must use the conversion report to match historical WinMentor records to SAGA records. For the first 1–3 months post-migration, this adds friction to any reconciliation task involving pre-migration data.
- SAGA's auto-assigned codes may be sequential integers (`C001`, `C002`, etc.) or follow a prefix the accountant configures in SAGA settings. Rapidport cannot control this — it is a post-import SAGA setup concern.
- If an accountant runs the migration twice (e.g., test import then production import), SAGA may assign different codes each time, invalidating the first conversion report. Phase 1 must document that migration should be run once into the production database.

### How Accountants Reconcile (Key Concern)

The conversion pipeline emits, in `report.json` and as separate CSV files in `output/`:

- `partners.csv`: `winmentor_cod, winmentor_codfiscal, winmentor_denumire, saga_cod`
- `articles.csv`: `winmentor_cod, winmentor_cod_extern, winmentor_denumire, saga_cod`
- `accounts.csv`: `winmentor_cont_cod, winmentor_simbol, winmentor_denumire` (accounts are preserved verbatim — see carve-out below)

When an accountant finds a pre-migration invoice referencing WinMentor partner `Cod = 145`, they look up row 145 in `partners.csv` to find the SAGA-assigned `COD` they now need. The CSVs are included in the downloadable job output ZIP alongside the SAGA import files.

---

## Edge Cases

### Partners Without CIF

Romanian natural persons acting as clients or suppliers may have no CIF — only a CNP (personal identification number) or no fiscal code at all. WinMentor's `NPART.DB` stores `CodFiscal` for this; the field may be blank or contain a CNP rather than a CUI.

For these partners:
- If `CodFiscal` is a CNP (13 digits): emit it as-is in `COD_FISCAL`. SAGA accepts CNPs in this field.
- If `CodFiscal` is blank: emit the partner with blank `COD_FISCAL`. SAGA will import without deduplication (blank CIF = no dedup key). **Flag in conversion report** as "partner imported without fiscal code — verify manually in SAGA."
- SAGA's `COD` deduplication only fires when `COD_FISCAL` matches an existing record, so blank-CIF partners always insert as new records. This is correct behavior.

### Articles Without Code

SAGA `ARTICOLE` deduplicates on `COD` (`docs/saga-schemas.md` §2b: "Articles are deduplicated on `COD`. If a matching `COD` exists, SAGA skips the record."). Under Option A, we leave `COD` blank and let SAGA assign codes. If `COD` is blank in the import file, SAGA will assign a new code regardless of `DENUMIRE` — there is no name-based deduplication for articles. This is correct for v1: fresh target means no collision concern.

**Resolution (A1 vs A2 — decided 2026-04-18):** v1 implements **A2** as the default: populate SAGA `ARTICOLE.COD` with WinMentor's `CodExtern` when non-empty, fall back to blank otherwise. The value fits within `VARCHAR(16)` (WinMentor `CodExtern` is a short barcode or supplier SKU). The WinMentor internal integer `Cod` is never written to SAGA `ARTICOLE.COD` — it is only preserved in `articles.csv` as the reconciliation key.

This is not a hardcoded developer decision — it surfaces as a per-job UI toggle in the mapping validation phase. The client (accountant) confirms or overrides the mapping before conversion runs. Phase 1 must expose this as a per-job setting in the mapping profile and plumb it through the SAGA article generator. Default = A2 (populate from `CodExtern`); override = A1 (leave blank, SAGA auto-assigns).

### Duplicate CIFs in WinMentor

WinMentor's `NPARTCF.DB` (52 records in the donor sample) provides multi-CIF support — a single partner `Cod` may have multiple fiscal codes across time (e.g., company changed CIF after restructuring) or across roles (parent/subsidiary sharing a code). The `NPART.DB` primary `CodFiscal` field is the active/primary CIF; `NPARTCF.DB` rows are supplementary.

Strategy:
- Use `NPART.DB.CodFiscal` as the primary CIF for the SAGA import.
- Log supplementary CIFs from `NPARTCF.DB` in the conversion report as "additional fiscal codes — review manually."
- If two `NPART.DB` rows have the same `CodFiscal` (data quality issue), **surface as a validation error** before generating import files: "Duplicate CIF `RO12345678` across partners `Cod=X` and `Cod=Y` — resolve in source data before migrating."

### Foreign Partners (No Romanian CIF)

Foreign partners in WinMentor have `CodFiscal` that is not a Romanian CUI — it may be a VAT number from another EU country (e.g., `DE123456789`) or blank. SAGA's `CLIENTI` and `FURNIZORI` tables accept any string in `COD_FISCAL`; the `TARA` (country code, ISO-3166-1 alpha-2) field disambiguates.

For foreign partners:
- Emit `COD_FISCAL` as-is (preserve the foreign VAT number if present).
- Set `TARA` to the partner's country code from WinMentor's locality data. If not determinable, emit `TIP_TERT = E` (external) as a signal.
- If `COD_FISCAL` is blank for a foreign partner, emit with blank CIF and flag in the conversion report.
- SAGA will not attempt Romanian CUI validation for records where `TARA != 'RO'`.

### Account Plan Codes (Plan de Conturi) — Mandatory Carve-Out

**This is an explicit exception to Option A.** The Romanian Chart of Accounts (Plan de Conturi, governed by OMFP 1802/2014) uses legally mandated account codes. Account `401` is always "Furnizori," account `4111` is always "Clienți," etc. These codes are not auto-assigned by software — they are fixed by Romanian accounting law and must be identical in both WinMentor and SAGA for any compliant company.

WinMentor stores these in `NCONT.DB` (root, 552 records). SAGA stores them in `CONTURI` (`CONT VARCHAR(20)`, primary key). The generator must preserve all account codes verbatim: `CONT` in the SAGA import file = `Cod` (or `Simbol`) from `NCONT.DB`.

Fresh-target (Option A) does not apply to `CONTURI`. Account codes are identity-preserving by legal requirement.

Analytical account extensions (e.g., `401.FURNIZOR_EXEMPLU`) use the same root code with a period-separated suffix — also preserved verbatim. SAGA supports up to 20 chars in `CONT`, which accommodates the deepest WinMentor analytical hierarchies.

---

## Phase 1 Canonical Schema Impact

The canonical schema (the internal Python dataclass / Pydantic model that sits between the WinMentor parsers and the SAGA generators) must carry `source_id` as a non-PK metadata field on every master-data entity:

- `CanonicalPartner.source_id: int` — WinMentor `NPART.Cod` (integer)
- `CanonicalArticle.source_id: int` — WinMentor `NART.Cod` (integer)
- `CanonicalArticle.source_extern_id: str | None` — WinMentor `NART.CodExtern` (populated into SAGA `ARTICOLE.COD` under A2 when non-empty; only preserved in `articles.csv` under A1)
- `CanonicalAccount.source_id: str` — WinMentor `NCONT.Cod` (string, preserved verbatim)

For transactional entities (`CanonicalInvoice`, `CanonicalJournalEntry`), `source_id` captures the WinMentor document key (`CodDoc`, `NrDoc` etc.) — not a Firebird PK — because SAGA will assign new PKs on import and no cross-reference to WinMentor PKs is needed post-migration.

The SAGA generator does NOT re-emit `source_id` in any SAGA import field for partners or articles (it is discarded after the mapping CSV is produced). For accounts, `source_id` is identical to the SAGA `CONT` value — it passes through verbatim.

The `report.json` per job carries:
```json
{
  "strategy": "fresh-target",
  "mapping_files": ["partners.csv", "articles.csv", "accounts.csv"],
  "validation_errors": [],
  "worker_version": "...",
  "canonical_schema_version": "..."
}
```

---

## Phase 2 UI Impact

The mapping review page (`/job/[id]/mapping`, per SPEC §2) must include a per-entity-class toggle for article code mapping:

- **Toggle label:** "Preserve article codes from WinMentor (CodExtern)?"
- **Default:** ON (A2 — populate `ARTICOLE.COD` from `CodExtern` when non-empty)
- **Off state:** A1 — leave `ARTICOLE.COD` blank; SAGA auto-assigns on import

This toggle is stored in the job's mapping profile and read by the SAGA article generator at conversion time. The generator must branch on this setting before populating `ARTICOLE.COD`. If A2 is selected and a given article has an empty `CodExtern`, the generator falls back to blank silently (no validation error — blank is valid per SAGA import spec).

Phase 1 must wire the setting through the canonical schema (`CanonicalArticle.source_extern_id`), the mapping profile DB column, and the generator — even if Phase 2's UI toggle is not yet built, so that Phase 1's integration tests can exercise both paths.

---

## Merge Mode (v2 Plan)

Merge mode enables a migration where the target SAGA database already contains records — partial data entered directly in SAGA after the migration decision was made. Rather than inserting fresh records, the importer matches WinMentor entities to existing SAGA entities and updates them.

**What v2 needs:**

1. **Match-by-CIF for partners.** Query the target SAGA Firebird DB for all `CLIENTI.COD_FISCAL` and `FURNIZORI.COD_FISCAL` before generating import files. For each WinMentor partner, attempt an exact CIF match. If found, populate the partner record with WinMentor history; if not found, insert as fresh. This requires the SAGA Firebird DB to be accessible at job time — either as an FDB upload or via a SAGA-side export of the partner list.

2. **Match-by-code for articles.** Article dedup is on `COD`, not CIF. Merge mode for articles requires the user to provide a code-mapping table (WinMentor `Cod` → target SAGA `COD`) or to run a fuzzy-name match with human approval. Automatic matching is error-prone.

3. **Diff report before import.** Merge produces a three-way diff: (a) records that match cleanly, (b) records that match ambiguously (multiple candidates), (c) new records with no match. The accountant reviews categories (b) before the import runs. This requires a new UI step (`/job/[id]/review-matches`) not present in v1.

4. **New data structures.** A `match_candidates` table in Postgres stores the pending matches for each job: `job_id`, `entity_type`, `winmentor_id`, `saga_cod_candidate`, `match_confidence`, `status` (pending/approved/rejected). The accountant's approval screen writes to this table; the final generator reads from it.

5. **New failure modes.** Ambiguous CIF (two SAGA partners share a CIF — a data quality issue in SAGA), name-only match with very low confidence, CIF format mismatch (WinMentor stores CIF with `RO` prefix, SAGA without). Each is a distinct rejection category the UI must surface.

The v2 feature requires: a second FDB upload step (or SAGA export), a new `/job/[id]/review-matches` page, the `match_candidates` DB table, and at minimum 2–3 weeks of additional Phase 1 generator work. The incremental revenue from v2 (accountants who have been partially using SAGA) likely justifies the investment, but the complexity is real and v1's launch timeline should not slip for it.

---

## Open Questions for Dani

1. **Warehouse codes (`GESTIUNI.COD`).** WinMentor's `NGEST.DB` has 3 warehouses with user-assigned codes. These codes appear in every invoice line item (`GESTIUNE` field). Should SAGA warehouse codes be preserved verbatim from WinMentor (3 records, all short codes), or is there a SAGA-side warehouse naming convention to follow? Fresh-target would leave warehouse `COD` blank; preserve-verbatim would carry WinMentor codes directly. This is a smaller decision than partner/article codes but should be explicit.

2. **Single-run guarantee.** The conversion report's `partners.csv` is only valid for the specific SAGA import run it was generated for. If an accountant imports the same file twice, SAGA assigns different codes (or deduplicates on CIF for partners). Should Phase 1 add a "migration lock" warning to `report.json` — "these codes are only valid for a single production import run"?
