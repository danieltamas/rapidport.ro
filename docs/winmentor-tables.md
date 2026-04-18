# WinMentor Table Inventory — donor-01

> **Donor sparsity warning:** Record counts below reflect a sanitized donor sample, not a real customer database. Production WinMentor installations will have 2–4 orders of magnitude more records (e.g., thousands of partners, tens of thousands of invoices per year). Phase 1 parser benchmarks and memory limits must be sized against production volumes, not these test counts.

## Header Summary

| Item | Value |
|------|-------|
| WinMentor version | 3226022,01 |
| Sample date range | 2021-12 through 2026-02 (51 monthly folders) |
| Root `.DB` files | 422 |
| Monthly `.DB` files (per folder) | 377 |
| Total distinct schemas | 768 |
| pypxlib success rate | 768/768 (100%) |
| Paradox sort order | 0x4C (International/OEM) — all files |
| Encoding | CP852 (Eastern European OEM/DOS) — see note |
| Schema drift across months | None observed (spot-check: 2022-01, 2024-06, 2026-02) |

**Encoding note:** All files report Paradox sort order `0x4C` (International) with code-page byte `0x00` (unspecified). pypxlib defaults to `cp850`; WinMentor on Romanian Windows uses CP852 (Eastern European DOS superset of CP850). Byte-frequency analysis of NLOCALIT confirms more CP852 Romanian diacritics (ă â î ș ț) than CP1250 matches. Phase 1 should decode all text fields as CP852.

**pypxlib header discrepancy:** pypxlib emits `Number of records counted in blocks does not match number of records in header (N != 0)` for most files — the header's record-count field at byte offset 24 is zero (Paradox stores 0 in that field when the table was last written by WinMentor). pypxlib correctly uses block-scan for `len()`. Phase 1 must use block-scan (not header field) for record counts.

---

## Volume Summary (donor-01 sample)

| Entity | Table(s) | Count (sample) | Notes |
|--------|----------|----------------|-------|
| Partners (Terți) | `NPART.DB` | 53 | Root only |
| Articles (Articole) | `NART.DB` | 25 | Root only |
| Accounts (Plan de conturi) | `NCONT.DB` | 552 (root) / 27,600 (monthly) | 552 per root instance; monthly copies replicated across 50 months |
| Localities | `NLOCALIT.DB` | 13,756 | Static Romanian locality list |
| Purchase invoices (Intrări) | `INTRARI.DB` + `INTRARI1.DB` | 146 + 167 total | Across 50 months |
| Sales invoices (Ieșiri) | `IESIRI.DB` + `IESIRI1.DB` | 51 + 51 total | Across 50 months |
| Journal entries | `Jurnal.DB` | 1,494 total | Across 51 months |
| Accounting notes | `NC.DB` + `NC1.DB` | 29 + 35 total | Across 51 months |
| Transfers | `TRANSF.DB` + `TRANSF1.DB` | 35 + 35 total | Across 51 months |
| Bank transactions | `TREZOR.DB` + `TREZOR1.DB` + `TREZOR2.DB` | 266 + 457 + 497 | Across 51 months |
| Payroll (salarii) | `LOHN.DB` | 0 total | Unused in this donor |
| Monthly folders | — | 51 | 2021-12 → 2026-02 |

---

## Full Classification Table

Sorted by classification, then alphabetical within each group. Tables marked `?` have ambiguous classification and are documented in the notes column.

### CORE NOMENCLATURE

Master data that must be converted to SAGA. These tables exist in the root folder and represent the company's permanent reference data.

| Filename | Scope | Records | Fields (sample) | Purpose |
|----------|-------|---------|-----------------|---------|
| `NART.DB` | root only | 25 | Cod, Denumire, CodExtern, UM, Clasa, TipArticol | Articles nomenclature — items, services, assets; primary product catalog |
| `NCONT.DB` | root only | 552 | Cod, Clasa, Simbol, Denumire | Chart of accounts (plan de conturi) — master account list; root instance is authoritative; monthly copies in CACHE are running-balance snapshots only |
| `NARTAMB.DB` | root only | 0 | CodArticol, CodAmbalaj, UMSec | Article packaging/unit equivalences |
| `NARTCLI.DB` | root only | 0 | Art, Part, Denumire, CodExtern | Article overrides per client (custom names/codes) |
| `NARTDC.DB` | root only | 0 | Art, Part, Categorie | Article deductions config per partner |
| `NARTDF.DB` | root only | 0 | Art, Part, Categorie | Article deductions config per supplier |
| `NARTFURN.DB` | root only | 18 | Art, Part, Denumire, CodExtern | Article overrides per supplier (supplier codes) |
| `NBANCA.DB` | root only | 5 | Cod, Denumire, Codbanca, Localit | Company bank accounts |
| `NGEST.DB` | root only | 3 | Cod, Denumire, Localitate, Clasa | Warehouse/storage locations (gestiuni) |
| `NPART.DB` | root only | 53 | Cod, CodExtern, Denumire, Localit, CodFiscal | Partners nomenclature — clients and suppliers |
| `NPARTB.DB` | root only | 0 | CodParinte, IndexLocal, CodBanca | Partner bank accounts |
| `NPARTCF.DB` | root only | 52 | CodParinte, IndexLocal, CodFiscal | Partner fiscal codes (multi-CIF support) |
| `NPARTD.DB` | root only | 0 | CodParinte, Indexlocal, CategDisc | Partner discount categories |
| `NPARTTR.DB` | root only | 0 | CodParinte, IndexLocal, Delegat | Partner transport delegates |
| `NPARTX.DB` | root only | 0 | Cod, TVAIncasare | Partner VAT-on-collection flag |
| `NPERS.DB` | root only | 2 | Cod, Nume, Prenume, Marca, CNP | Personnel/employees master |
| `NPERSACT.DB` | root only | 0 | CodParinte, IndexLocal, Mutatie, DataStart | Employee activity history |
| `NPERSCV.DB` | root only | 0 | CodPers, Tip, IndexLocal | Employee CV / qualifications |
| `NSEDSEC.DB` | root only | 1 | Cod, Denumire, Localit, CIF | Company secondary locations (sedii secundare) |
| `NSUBUNIT.DB` | root only | 2 | Cod, Denumire, Localit, CategPret | Company sub-units (subunități) |

### TRANSACTIONAL

Monthly data that must be converted. These tables exist in monthly folders (`YYYY_MM/`) and contain period-specific accounting data.

| Filename | Scope | Records (total) | Fields (sample) | Purpose |
|----------|-------|-----------------|-----------------|---------|
| `AVANS.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat | Salary advance payments |
| `AVANS0.DB` | per monthly folder | 0 | Cod, Obs, Curs, DataCurs | Advance payment header |
| `AVANSCO.DB` | per monthly folder | 0 | Angajat, An, Luna, Brut | Advance on commission |
| `AVANSCO1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, An, Luna | Advance on commission detail |
| `CASH.DB` | root only | 0 | Cod, Nr, DataI, DataS | Cash register transactions (root accumulator) |
| `CASH1.DB` | root only | 0 | CodParinte, IndexLocal, Data, SoldI | Cash register detail |
| `CASH2.DB` | root only | 0 | CodParinte, Index, IndexLocal, Tip | Cash register extra |
| `COMPENS.DB` | per monthly folder | 15 | Cod, CarnetPV, NrPv, ZiPv | Compensation documents (compensări) |
| `COMPENS1.DB` | per monthly folder | 39 | Cod, Tip, IndexLocal, Moneda | Compensation detail lines |
| `DECONTR.DB` | per monthly folder | 0 | Cod, Zi, NrDoc, Sofer | Expense reports (deconturi) |
| `DECONTR1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Tara | Expense report lines |
| `DECONTR2.DB` | per monthly folder | 0 | CodParinte, IndexDoc, IndexLocal | Expense report supporting docs |
| `IESIRI.DB` | per monthly folder | 51 | CodDoc, TipDoc, Anulat, Blocat | Sales invoices header (ieșiri) |
| `IESIRI1.DB` | per monthly folder | 51 | CodParinte, IndexLocal, TipLinie | Sales invoice lines |
| `IESIRI2.DB` | per monthly folder | 48 | CodParinte, CodLocatie, Partener | Sales invoice extended fields |
| `IESIRI3.DB` | per monthly folder | 15 | CodParinte, Termen, Majorari | Sales invoice payment terms |
| `IESIRI4.DB` | per monthly folder | 0 | CodParinte, IndexLocal, SACom | Sales invoice commission links |
| `INTRARI.DB` | per monthly folder | 146 | CodDoc, TipDoc, Anulat, Blocat | Purchase invoices header (intrări) |
| `INTRARI1.DB` | per monthly folder | 167 | CodParinte, IndexLocal, TipLinie | Purchase invoice lines |
| `INTRARI2.DB` | per monthly folder | 0 | CodParinte, Termen, Majorari | Purchase invoice payment terms |
| `Jurnal.DB` | per monthly folder | 1,494 | TipDoc, CodDoc, Cod, Index, Jurnal, Zi | Accounting journal entries (jurnal contabil) |
| `JURNAL1.DB` | per monthly folder | 0 | TipDoc, CodDoc, Cod, Index | Journal entries variant 1 (alternate journal) |
| `JURNAL2.DB` | per monthly folder | 0 | TipDoc, CodDoc, Cod, Index | Journal entries variant 2 |
| `LOHN.DB` | per monthly folder | 0 | Cod, Zi, NrDoc, CarnetDoc | Work orders / manufacturing orders |
| `LOHN1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodExp | Work order lines |
| `NC.DB` | per monthly folder | 29 | Cod, NrDoc, Zi, Part, JurnalTVA, AnNC | Accounting notes header (note contabile) |
| `NC1.DB` | per monthly folder | 35 | CodParinte, IndexLocal, ContD, ContC | Accounting note debit/credit lines |
| `NIR.DB` | per monthly folder | 10 | CodParinte, IndexLocal, CarnetDoc, NrDoc | Goods received notes (NIR — notă de intrare-recepție) |
| `NIR1.DB` | per monthly folder | 12 | CodParinte, IndexNIR, IndexLocal, PozSursa | NIR line details |
| `NIR2.DB` | per monthly folder | 0 | CodParinte, IndexNIR, IndexNIR1 | NIR additional lines |
| `NIR21.DB` | per monthly folder | 0 | CodParinte, IndexNIR, IndexNIR1, IndexAnaliza | NIR analysis detail |
| `NIRSER.DB` | per monthly folder | 0 | CodParinte, IndexNIR, LinieNIR | NIR serial number tracking |
| `PONTAJ.DB` | per monthly folder | 0 | Cod, Tip, Formatie, TotalL | Timesheet header (pontaj) |
| `PONTAJ1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodAng, TotalL | Timesheet per employee |
| `PONTAJTM.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodAng, Zi1 | Timesheet per day (time machine) |
| `REGLEAS.DB` | per monthly folder | 0 | Cod, Tip, NrDoc, Zi | Lease regularization documents |
| `REGLEAS1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Part | Lease regularization lines |
| `RESTANT.DB` | per monthly folder | 0 | Part, TipDoc, CodDoc, NrFact | Outstanding receivables/payables |
| `RESTANT1.DB` | per monthly folder | 0 | Part, TipDoc, CodDoc, CodPlata | Outstanding detail with payment links |
| `SURSA.DB` | per monthly folder | 35 | CodParinte, IndexLocal, PozSursa, UMSec | Source document links (traceability) |
| `SURSA1.DB` | per monthly folder | 35 | CodParinte, IndexLivr, IndexLocal | Source document extended |
| `SURSASER.DB` | per monthly folder | 0 | CodParinte, IndexLivr, LinieLivr | Source serial number links |
| `TRANSF.DB` | per monthly folder | 35 | CodDoc, TipDoc, Anulat, Blocat | Internal transfers header (transferuri interne) |
| `TRANSF1.DB` | per monthly folder | 35 | CodParinte, IndexLocal, UMSec | Transfer lines |
| `TRANSF2.DB` | per monthly folder | 26 | CodParinte, TipPlata, Casa | Transfer payment info |
| `TRANSF3.DB` | per monthly folder | 0 | CodParinte, CodFactura | Transfer invoice links |
| `TRANSF4.DB` | per monthly folder | 0 | CodParinte, ProcTVA, ValBon | Transfer bonus lines |
| `TREZOR.DB` | per monthly folder | 266 | Cod, Sursa, CodSursa, TipSursa | Treasury/bank account transactions header |
| `TREZOR1.DB` | per monthly folder | 457 | CodParinte, IndexLocal, TipTranz | Treasury transaction lines |
| `TREZOR2.DB` | per monthly folder | 497 | CodParinte, IndexDoc, IndexLocal | Treasury extended detail |

### LOOKUP

Static reference data. Skip for migration if SAGA has an equivalent built-in table; may need to seed SAGA's table if not.

| Filename | Scope | Records | Purpose | SAGA equivalent? |
|----------|-------|---------|---------|------------------|
| `NATR.DB` | root only | 1 | Article attribute types | No direct equivalent — consider skipping |
| `NATR1.DB` | root only | 0 | Attribute type sub-items | No direct equivalent |
| `NBANCI.DB` | root only | 45 | Romanian bank codes (BNR/BIC list) | SAGA ships its own bank list — skip |
| `NBANCI1.DB` | root only | 0 | Bank branch detail | Skip |
| `NBAZACAL.DB` | root only | 3 | Payroll calculation base types | Payroll-specific — skip |
| `NCALIFIC.DB` | root only | 11 | Employee qualification categories | HR-specific — skip |
| `NJURNALE.DB` | root only | 27 | Journal/ledger book types | SAGA has its own journal config |
| `NLOCALIT.DB` | root only | 13,756 | Romanian localities (all communes/cities) | SAGA ships own locality list — skip |
| `NMONEDE.DB` | root only | 3 | Currency list | SAGA has built-in currencies — skip |
| `NMONEDE1.DB` | root only | 0 | Exchange rate history | Skip — SAGA has BNR rate import |
| `NNOTE.DB` | root only | 17 | Accounting note types | SAGA has own note types |
| `NTARI.DB` | root only | 246 | Country list (with ISO codes) | SAGA ships own country list — skip |
| `NUM.DB` | root only | 2 | Units of measure | SAGA has own UM list — verify |
| `NUM1.DB` | root only | 2 | UOM sub-items (conversion rates) | SAGA has conversions — verify |
| `NZONE.DB` | root only | 1 | Geographic zones | Skip |
| `INTRERUP.DB` | root only | 17 | Payroll interruption types | HR-specific — skip |
| `NFUNCTII.DB` | root only | 3 | Job titles/functions | HR-specific — skip |
| `NACTIVIT.DB` | root only | 1 | Activity types | Skip |
| `TIPPLATI.DB` | root only | 76 | Payment type definitions | SAGA has own payment types |
| `NOPS.DB` | root only | 1 | Operation types | Skip |

### CONFIG

WinMentor application configuration tables. Skip — these settings do not transfer to SAGA.

| Filename | Scope | Records | Purpose |
|----------|-------|---------|---------|
| `CFGART.DB` | root only | 0 | Article UI field configuration |
| `CFGTBL.DB` | root only | 0 | Table UI configuration (column visibility) |
| `CFGTBL1.DB` | root only | 0 | Table column config detail |
| `CFGTBL2.DB` | root only | 0 | Table column config values |
| `CONFIG.DB` | root only | 0 | Company configuration (header/footer text) |
| `CONFIG1.DB` | root only | 0 | Config sub-items |
| `CONFIG2.DB` | root only | 0 | Config article assignments |
| `DOCCTRL.DB` | root only | 0 | Document number control |
| `DOCFREE.DB` | root only | 15 | Document number free ranges |
| `DOCLINK.DB` | root only | 25 | Document type dialog links |
| `DOCRANGE.DB` | root only | 16 | Document number range definitions |
| `DOCUSED.DB` | root only | 0 | Used document numbers |
| `LUNACUR.DB` | root only | 1 | Current accounting month |
| `LUNAINI.DB` | root only | 1 | Initial accounting month |
| `LunaLock.DB` | root only | 1 | Month lock flag |
| `NCLASEA.DB` | root only | 1 | Article classification A |
| `NCLASEB.DB` | root only | 1 | Article classification B |
| `NCLASEG.DB` | root only | 1 | Article classification G (gesturi) |
| `NCLASEO.DB` | root only | 1 | Article classification O |
| `NCLASEP.DB` | root only | 2 | Article classification P (price category) |
| `NDOC.DB` | root only | 0 | Document type definitions |
| `NSABLON.DB` | root only | 140 | Accounting formula templates (șabloane) |
| `NLOCATII.DB` | root only | 0 | Storage locations config |
| `NRTABLE.DB` | per monthly folder | 0 | Document number sequence table |
| `PATCH.DB` | root only | 6 | DB version/patch history |
| `SATCUR.DB` | root only | 1 | Current satellite ID |
| `SATELITI.DB` | root only | 1 | Multi-entity satellite config |
| `SMARTKEY.DB` | root only | 0 | License/activation key |
| `SYSID.DB` | root only | 270 | System-generated IDs table |
| `TIPSEDII.DB` | root only | 1 | Secondary location types |
| `VERSION.DB` | per monthly folder | 50 | Month version ID |

### CACHE

Derived/temporary data computed by WinMentor. Skip — rebuilt by SAGA after import.

| Filename | Scope | Records | Purpose |
|----------|-------|---------|---------|
| `BUFFER.DB` | root only | 5 | Exchange rate buffer cache |
| `CACHE.DB` | per monthly folder | 0 | Generic computation cache |
| `DIRTY.DB` | per monthly folder | 50 | Dirty-flag for incremental recalculation |
| `GestTot.DB` | per monthly folder | 0 | Warehouse totals cache |
| `IOART.DB` | per monthly folder | 1,159 | Article I/O balance cache |
| `IOBANCA.DB` | per monthly folder | 450 | Bank account balance cache |
| `IOFILIAL.DB` | per monthly folder | 50 | Subsidiary balance cache |
| `IOPART.DB` | per monthly folder | 100 | Partner balance (receivable/payable) cache |
| `IOPERS.DB` | per monthly folder | 100 | Employee balance cache |
| `KONST.DB` | per monthly folder | 46,170 | User preference constants (UI state) |
| `LOG.DB` | root only | 1,420 | Audit log (table-level change log) |
| `LOG1.DB` | per monthly folder | 7 | Monthly audit log |
| `LUNADOC.DB` | per monthly folder | 0 | Month document lock cache |
| `NCONT.DB` | per monthly folder | 27,600 | Account plan with running balances (monthly copy) |
| `NCONT1.DB` | per monthly folder | 50 | Account plan extra fields (monthly) |
| `NCONT2.DB` | per monthly folder | 50 | Account plan extra fields 2 (monthly) |
| `NMIFIX.DB` | per monthly folder | 303 | Fixed assets position cache |
| `NPART1.DB` | per monthly folder | 1,138 | Partner extended data with balances (monthly) |
| `NPERS1.DB` | per monthly folder | 50 | Personnel data with payroll fields (monthly) |
| `NRINVTMP.DB` | root only | 0 | Temporary invoice number lock |
| `NTAXE.DB` | per monthly folder | 150 | Tax values cache |
| `NTVA.DB` | per monthly folder | 368 | VAT rates cache |
| `ObligF.DB` | per monthly folder | 742 | Supplier obligation cache |
| `ObligPI.DB` | per monthly folder | 930 | Partner payment instrument obligations |
| `PartTot.DB` | per monthly folder | 371 | Partner totals cache |
| `PersTot.DB` | per monthly folder | 49 | Personnel totals cache |
| `RECYCLED.DB` | root only | 28 | Soft-deleted records buffer |
| `RESTTEMP.DB` | per monthly folder | 0 | Temporary overtime cache |
| `RETTEMP.DB` | per monthly folder | 0 | Temporary withholding cache |
| `SOLDGEST.DB` | per monthly folder | 0 | Warehouse balance cache |
| `SOLDNEX.DB` | per monthly folder | 8 | Uncleared document balance cache |
| `SOLDNEX1.DB` | per monthly folder | 8 | Uncleared TVA balance cache |
| `SoldBac.DB` | per monthly folder | 0 | Employee advance balance cache |
| `SoldPart.DB` | per monthly folder | 462 | Partner balance cache (detailed) |
| `SoldPers.DB` | per monthly folder | 141 | Personnel balance cache |
| `SPORTMP.DB` | per monthly folder | 0 | Temporary bonus cache |
| `SPORTMP1.DB` | per monthly folder | 0 | Temporary bonus detail cache |
| `SPORTMP2.DB` | per monthly folder | 0 | Temporary bonus extra cache |
| `STATDESC.DB` | root only | 46 | Load/unload status log |
| `STATDIES.DB` | root only | 34 | Load/unload status (outgoing) |
| `Stoc.DB` | per monthly folder | 322 | Stock quantity cache (by article/attribute) |
| `StocAlt.DB` | per monthly folder | 0 | Alternative stock cache |
| `StocCli2.DB` | per monthly folder | 0 | Client stock serial cache |
| `StocFact.DB` | per monthly folder | 0 | Invoice stock cache |
| `StocMore.DB` | per monthly folder | 0 | Additional stock attributes cache |
| `StocSer.DB` | per monthly folder | 0 | Serial number stock cache |
| `StocTot.DB` | per monthly folder | 322 | Total stock cache |
| `StocVal.DB` | per monthly folder | 0 | Stock value cache |
| `TIMEDLOG.DB` | root only | 0 | Scheduled task execution log |

### DECLARATION

Romanian tax declaration tables. Skip — SAGA generates its own declarations from imported data.

| Filename | Scope | Records | Purpose |
|----------|-------|---------|---------|
| `D100DEC.DB` | root only | 1 | D100 declaration header (corporate tax) |
| `D100DEC1.DB` | root only | 1 | D100 obligation detail |
| `D100DEC2.DB` | root only | 0 | D100 county/UAT detail |
| `D100OBL1.DB` | per monthly folder | 1 | D100 account mapping (monthly) |
| `D112AB11.DB` | root only | 0 | D112 section AB11 (payroll tax) |
| `D112AR.DB` | root only | 0 | D112 employer record |
| `D112ARA.DB`–`D112ARG.DB` | root only | 0 each | D112 employer sub-sections A–G |
| `D112AT.DB` | root only | 0 | D112 employee individual record |
| `D112ATA.DB`–`D112ATE4.DB` | root only | 0 each | D112 employee sub-sections |
| `D112COAT.DB` | root only | 0 | D112 co-insured persons |
| `D112DEC.DB` | root only | 0 | D112 declaration header |
| `D112DET1.DB` | root only | 0 | D112 detachment records |
| `D112TB41.DB` | root only | 0 | D112 table B41 detail |
| `D112VF.DB` | per monthly folder | 0 | D112 receivables (monthly) |
| `D205DEC.DB`–`D205DECI.DB` | root only | 0 each | D205 declaration (income beneficiaries) |
| `D208DEC.DB`–`D208MTR1.DB` | root only | 0–4 each | D208 declaration (agricultural income) |
| `D300DEC.DB` | root only | 16 | D300 declaration (VAT return) |
| `D392DEC.DB` | root only | 0 | D392 declaration (recapitulative) |
| `D394.DB` | root only | 0 | D394 declaration header |
| `D39416.DB` | root only | 17 | D394 section 16 header |
| `D39416G.DB`–`D39416UE.DB` | both | 0–34 each | D394 sub-sections G, G1–G3, I, I0–I4, N, R, RN, RP, UE |
| `D394DEC1.DB` | per monthly folder | 0 | D394 Intrastat declaration detail |
| `D394DET.DB`–`D394DEV1.DB` | per monthly folder | 0 each | D394 detailed lines by transaction type |
| `D394EXCL.DB` | root only | 0 | D394 article exclusion list |
| `D394NS2.DB`–`D394UES2.DB` | both | 0–53 each | D394 recapitulative sub-sections |
| `D406DEC.DB` | root only | 4 | D406 declaration (SAF-T) |
| `DATEXTVA.DB` | root only | 0 | Extended VAT rate mapping |
| `DBIL.DB` | root only | 4 | Balance sheet declaration header |
| `DBIL1.DB` | root only | 511 | Balance sheet line definitions |
| `DBIL1N.DB` | root only | 0 | Balance sheet note lines |
| `DBIL1NO.DB` | root only | 0 | Balance sheet note observations |
| `DECLTVA.DB` | per monthly folder | 985 | Monthly VAT declaration values |
| `TAXDECL.DB` | per monthly folder | 253 | Tax declaration mapping per document |
| `VIES.DB`–`VIES3.DB` | root only | 0 each | VIES (EU VAT recapitulative) declaration |

---

## Non-Standard Parser Flags

All 768 tables opened successfully with pypxlib (0 failures). No tables require a fallback parser for basic header/field access.

**Known quirks requiring Phase 1 attention:**

1. **Header record-count field = 0 universally.** All files store `0` at the standard Paradox header offset for record count. Phase 1 must use pypxlib's block-scan `len()` — never read the header field directly.

2. **BUGET1.DB — WinMentor-specific extension.** The task spec mentioned BUGET1 as a known non-standard variant. In this sample, pypxlib opens it cleanly (non-standard header bytes were apparently a concern for other Paradox tools). Fields: `CodParinte, AnFiscal, ValPlan1, ValPlan2`. Mark as standard in Phase 1.

3. **Memo files (.MB) not inspected.** The root folder contains 321 `.MB` files (Paradox memo blobs paired with `.DB` files). pypxlib reads text fields that reference `.MB` automatically. Phase 1 must ensure `.MB` files are co-located with their `.DB` counterparts when parsing.

4. **Mixed-case filenames.** Some files use mixed case (`Jurnal.DB`, `Stoc.DB`, `SoldPart.DB`). Phase 1 should use case-insensitive path resolution on all platforms.

5. **Sort order 0x4C + zero code-page byte.** All files. pypxlib defaults to `cp850`; Phase 1 must override to `cp852` when reading text fields. See encoding section above.

---

## Monthly Consistency Spot-Check

Checked schema (field names and order) for 15 key tables across three monthly folders:

| Month | Path |
|-------|------|
| 2022-01 | `samples/winmentor/donor-01/2022_01/` |
| 2024-06 | `samples/winmentor/donor-01/2024_06/` |
| 2026-02 | `samples/winmentor/donor-01/2026_02/` |

**Result: No schema drift observed.**

All 15 spot-checked tables (`INTRARI.DB`, `IESIRI.DB`, `Jurnal.DB`, `NC.DB`, `TRANSF.DB`, `NIR.DB`, `TREZOR.DB`, `PONTAJ.DB`, `LOHN.DB`, `AVANS.DB`, `NPART1.DB`, `NCONT1.DB`, `Stoc.DB`, `SoldPart.DB`, `CASH.DB`/not present in those months) showed identical field names and field order across all three spot-check months.

Field counts per spot-checked table:
- `INTRARI.DB`: 56 fields (2022-01, 2024-06, 2026-02 — identical)
- `IESIRI.DB`: 71 fields (identical across 3 months)
- `Jurnal.DB`: 18 fields (identical)
- `NC.DB`: 18 fields (identical)
- `TRANSF.DB`: 36 fields (identical)
- `NIR.DB`: 9 fields (identical)
- `TREZOR.DB`: 16 fields (identical)
- `PONTAJ.DB`: 28 fields (identical)
- `LOHN.DB`: 8 fields (identical)
- `AVANS.DB`: 10 fields (identical)
- `NPART1.DB`: 17 fields (identical)
- `NCONT1.DB`: 43 fields (identical)
- `Stoc.DB`: 24 fields (identical)
- `SoldPart.DB`: 5 fields (identical)

**Conclusion:** WinMentor v3226022,01 does not change monthly table schemas between periods. Phase 1 can safely parse all 51 months using the schema from any single sample month.

---

## Phase 1 Parser Scope

**Authoritative list** of tables Phase 1 must build parsers for. Only CORE NOMENCLATURE + TRANSACTIONAL. All other classifications (LOOKUP, CONFIG, CACHE, DECLARATION) are excluded.

### From CORE NOMENCLATURE (root folder)

| Table | Purpose | SAGA target entity |
|-------|---------|-------------------|
| `NART.DB` | Articles catalog | `Articole` |
| `NCONT.DB` | Chart of accounts (root instance, 552 rows) | `CONTURI` |
| `NARTFURN.DB` | Supplier article codes | `Articole` (enrichment) |
| `NARTCLI.DB` | Client article codes | `Articole` (enrichment) |
| `NBANCA.DB` | Company bank accounts | `Conturi bancare` (if SAGA supports) |
| `NGEST.DB` | Warehouses (gestiuni) | `Gestiuni` |
| `NPART.DB` | Partners (clients + suppliers) | `Terți` |
| `NPARTB.DB` | Partner bank accounts | `Terți` (enrichment) |
| `NPARTCF.DB` | Partner fiscal codes | `Terți` (enrichment) |
| `NPARTX.DB` | Partner VAT-on-collection | `Terți` (enrichment) |
| `NPERS.DB` | Employees | `Angajați` (if SAGA supports) |
| `NSEDSEC.DB` | Secondary company locations | `Terți` (self as supplier) |

### From TRANSACTIONAL (monthly folders)

| Table | Purpose | SAGA target entity |
|-------|---------|-------------------|
| `INTRARI.DB` | Purchase invoice headers | `Intrări` |
| `INTRARI1.DB` | Purchase invoice lines | `Intrări` (lines) |
| `IESIRI.DB` | Sales invoice headers | `Ieșiri` |
| `IESIRI1.DB` | Sales invoice lines | `Ieșiri` (lines) |
| `Jurnal.DB` | Accounting journal entries | `Note contabile` |
| `NC.DB` | Accounting notes header | `Note contabile` |
| `NC1.DB` | Accounting note lines | `Note contabile` (lines) |
| `NIR.DB` | Goods received notes header | `Intrări` (NIR link) |
| `NIR1.DB` | NIR lines | `Intrări` (NIR lines) |
| `TRANSF.DB` | Internal transfers header | `Transferuri` |
| `TRANSF1.DB` | Transfer lines | `Transferuri` (lines) |
| `TRANSF2.DB` | Transfer payment info | `Transferuri` (payment) |
| `TREZOR.DB` | Bank/treasury transactions | `Încasări/Plăți` |
| `TREZOR1.DB` | Treasury transaction lines | `Încasări/Plăți` (lines) |
| `COMPENS.DB` | Compensation documents | `Compensări` |
| `COMPENS1.DB` | Compensation lines | `Compensări` (lines) |

### Deferred (Phase 1 stretch — implement only if spec explicitly requires)

| Table | Purpose | Blocker |
|-------|---------|---------|
| `AVANS.DB`/`AVANSCO.DB` | Salary advances | Requires payroll module |
| `PONTAJ.DB`/`PONTAJ1.DB` | Timesheets | Requires payroll module |
| `LOHN.DB` | Work/manufacturing orders | Requires production module |
| `DECONTR.DB` | Expense reports | Requires travel module |
| `REGLEAS.DB` | Lease regularization | Requires leasing module |

---

## Classification Count Summary

| Classification | Distinct schemas | Notes |
|---------------|-----------------|-------|
| CORE NOMENCLATURE | 20 | All root-only; includes `NCONT.DB` root instance (chart of accounts) |
| TRANSACTIONAL | 47 | Mostly monthly; CASH is root |
| LOOKUP | 20 | Mostly root-only |
| CONFIG | 28 | Mix of root + monthly |
| CACHE | 51 | Mix of root + monthly; includes `NCONT.DB` monthly copies (balance snapshots) |
| DECLARATION | 109 | D100, D112, D205, D208, D300, D394, D406 families + DBIL, VIES, DECLTVA, TAXDECL |
| SPECIALTY MODULES | 493 | See Appendix A below — salary/payroll, POS/restaurant, fleet, medical, budgeting, production, service orders, e-commerce, HR/contract management, and other optional modules |
| **Total** | **768** | |

---

## Appendix A — Specialty Module Tables (493 schemas)

These tables belong to optional WinMentor modules not used by typical Romanian accountants migrating to SAGA. All are classified **skip** for Phase 1. Every distinct schema from the donor-01 sample is listed below with filename, scope, record count in the sample, and first four field names.

> **Module identification:** Table names and field prefixes identify the module. Key prefixes: `LIKI*`/`LKSAL*` = salary/payroll liquidation; `SACOM*`/`MANCMD*` = service orders; `FAZ*`/`TRASEE*` = fleet/transport; `MEDIC*`/`NOMBOLI*` = medical; `BUGET*`/`BGRECT*` = budgeting; `PRODUCT*`/`CONSMAT*` = production/manufacturing; `PLU*`/`00PLU*`/`MESE*` = POS/restaurant; `ARC*`/`ARCTR*` = land registry/arenda; `A1*`/`A2*` = D112 salary contract detail; `LOHN*` (beyond LOHN.DB/LOHN1.DB) = advanced work orders.

| Filename | Scope | Records | Fields (first 4) |
|----------|-------|---------|-----------------|
| `00PLUDEF.DB` | root only | 0 | Cod, PLU, Dep, Art |
| `01PLUCNT.DB` | root only | 0 | Cod, PLU, ItemCode, Art |
| `8IMCASE.DB` | root only | 0 | Cod, Denumire, NrCasa, CasaBanca |
| `8IMUS.DB` | root only | 0 | Cod, PLU, Dep, Art |
| `A1.DB` | per monthly folder | 0 | CodContract, AN, LN, CF |
| `A1_2004.DB` | per monthly folder | 0 | CodContract, LD, AD, CF |
| `A1_2006.DB` | per monthly folder | 0 | CodContract, LD, AD, CF |
| `A1_2007.DB` | per monthly folder | 0 | CodContract, LD, AD, CF |
| `A1_2009.DB` | per monthly folder | 0 | CodContract, TipContract, LD, AD |
| `A2.DB` | per monthly folder | 0 | NRI, DATAI, AN, LN |
| `A2_2004.DB` | per monthly folder | 0 | LD, AD, DEN, CF |
| `A2_2006.DB` | per monthly folder | 0 | LD, AD, DEN, CF |
| `A2_2007.DB` | per monthly folder | 0 | LD, AD, DEN, CF |
| `A2_2009.DB` | per monthly folder | 0 | LD, AD, DEN, CF |
| `ADAOSM.DB` | per monthly folder | 0 | Cod, Data |
| `ADAOSM1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, LimSup, CotaAdaosT |
| `AGENDAS1.DB` | root only | 0 | CodParinte, IndexLocal, TipLucrare, Start |
| `AGENDAS2.DB` | root only | 0 | CodParinte, IndexAgendaS1, IndexLocal, Angajat |
| `AGENDASA.DB` | root only | 0 | Cod, Client, Contact, CarnetDoc |
| `AMB.DB` | root only | 0 | CodParinte, IndexLocal, DataStart, DataStop |
| `AMBNART.DB` | root only | 0 | CodParinte, TipAmb, CodAmb, IndexLocal |
| `ARCTR.DB` | root only | 0 | Cod, CarnetDoc, SerieDoc, Numar |
| `ARCTR1.DB` | root only | 0 | CodParinte, IndexLocal, Tarla, DenParcela |
| `ARCTR11.DB` | root only | 0 | CodParinte, IndexCtr1, IndexLocal, Lat |
| `ARCTR2.DB` | root only | 0 | CodParinte, IndexLocal, AnArenda, ValHa |
| `ARCTR3.DB` | root only | 0 | CodParinte, IndexLocal, AnFacturat, CodDoc |
| `ARCTRDOC.DB` | root only | 0 | CodParinte, IndexLocal, Denumire, FileName |
| `ARNART.DB` | root only | 0 | Cod, DataStart, DataStop |
| `ARNART1.DB` | root only | 0 | CodParinte, Art, UM, Cant |
| `ARPRETCJ.DB` | root only | 0 | Cod, Judet, CatPret |
| `ARTARLA.DB` | root only | 0 | Cod, Localit, Denumire, Identificare |
| `ARTARLA1.DB` | root only | 0 | CodParinte, IndexLocal, Lat, Long |
| `ARTREDUC.DB` | root only | 0 | Art, CodReduc, PretReferinta, Implicit |
| `ASIGSOC.DB` | per monthly folder | 0 | Cod, TipIntrerup, Neoperat |
| `ASIGSOC1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, BazaCalcul, CodAngajat |
| `ASIGSOC2.DB` | per monthly folder | 0 | CodParinte, IndexAsig1, IndexLocal, CodAsig |
| `ASIGSOC3.DB` | per monthly folder | 0 | CodParinte, IndexAsig1, IndexLocal, Zile21 |
| `AUTOM.DB` | root only | 1 | Cod, Marca |
| `AUTOM1.DB` | root only | 1 | CodUnic, CodSursa, Model |
| `AWB.DB` | per monthly folder | 0 | CodParinte, Format, Operat, DataOp |
| `AWBM.DB` | per monthly folder | 0 | CodParinte, Format, Curier, AWB |
| `Attach.DB` | per monthly folder | 0 | CodDoc, TipDoc, IndexLocal, FName |
| `BACSIS.DB` | per monthly folder | 0 | Cod, CodFormatie, Zi, Total |
| `BACSIS1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, Valoare |
| `BANG.DB` | root only | 0 | Cod, CarnetDoc, NrDoc, Zi |
| `BANG1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Art, CapB |
| `BDISP.DB` | per monthly folder | 0 | CodParinte, CapB, ValAng, ValAngB |
| `BGCORESP.DB` | per monthly folder | 0 | Tip, Cod, IndexLocal, Formatie |
| `BGRECT.DB` | per monthly folder | 0 | Cod, Tip, NrDoc, DataDoc |
| `BGRECT1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Buget, ValPlan1 |
| `BILANT.DB` | root only | 0 | Cod, NrLin, NrCol, Valoare |
| `BLANG.DB` | root only | 0 | CodP, CapB, TipDoc, CodDoc |
| `BLOCAJ.DB` | per monthly folder | 0 | CodStoc, UserId, StocBlocaj |
| `BLOCAJE.DB` | per monthly folder | 0 | Tip, Blocat |
| `BUGET.DB` | root only | 1 | Cod, CodSursa, IndexSursa, Simbol |
| `BUGET1.DB` | per monthly folder | 0 | CodParinte, AnFiscal, ValPlan1, ValPlan2 |
| `BUGETDOC.DB` | both | 0 | Cod, Tipdoc, CodDoc, IndexLocal |
| `BUGETREP.DB` | both | 0 | CodParinte, IndexLocal, Centru, Valoare |
| `BUGETREX.DB` | both | 0 | CodParinte, IndexCentru, IndexLocal, TipDescript |
| `CASEONL.DB` | root only | 0 | CodCasa, ComPort, Activa |
| `CASEPREG.DB` | root only | 0 | Tipcasa, CodCasa, DenCasa |
| `CASHCURS.DB` | root only | 0 | CodParinte, Moneda, CursMediu |
| `CASHFLF.DB` | root only | 0 | Cod, Denumire, TipAnaliza, AnInceput |
| `CASHFLF1.DB` | root only | 0 | CodParinte, Element, IndexLocal, Descript |
| `CASHIMP.DB` | root only | 0 | CodDoc, Tabla, Importat |
| `CASHIP.DB` | root only | 0 | CodParinte, Index1, Index2, IndexLocal |
| `CASHIP2.DB` | root only | 0 | CodParinte, IndexLocal, Explic, Part |
| `CENTREF.DB` | root only | 0 | Cod, Denumire, Valuta |
| `CENTREF1.DB` | root only | 0 | CodParinte, Element |
| `CERTIFM.DB` | root only | 0 | Angajat, An, Luna, De_la |
| `CLASA9.DB` | both | 0 | Tip, CodParinte, Index1, Index2 |
| `CLASECH.DB` | root only | 0 | Cod, Simbol, Denumire, Name |
| `CMDINCH.DB` | per monthly folder | 0 | Cod, IndexLocal, CantInit, DataDoc |
| `CNDCOR1.DB` | root only | 62 | Cod, IdxLocal, Rnd1, Col1 |
| `COEFDED.DB` | per monthly folder | 0 | CodAng, CoefTotal |
| `COEFDED1.DB` | per monthly folder | 0 | CodParinte, IndexPers, DedS, TipHandicap |
| `COHIST.DB` | per monthly folder | 0 | CodParinte, An, ZProgramate, ZEfectuate |
| `COLBILAN.DB` | root only | 12 | Cod, NrCol, Denumire, TipCol |
| `COLETE.DB` | per monthly folder | 0 | CodParinte, TipColet, Greutate, GreutArt |
| `COMAND.DB` | per monthly folder | 0 | Cod, TipDoc, CarnetDoc, NrDoc |
| `COMAND1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Art, Atrib10 |
| `COMANDC.DB` | per monthly folder | 0 | Cod, Seriesasiu, Tipauto, Nrauto |
| `COMANDC1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Obsart |
| `COMANDI1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Aaa bbbbbbbb |
| `COMISION.DB` | root only | 0 | Cod, Denumire, Procent |
| `CONCEDO.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodAng, DurataAnPrec |
| `CONSGEST.DB` | root only | 0 | CodReteta, IndexLocal, Gest |
| `CONSMAN1.DB` | root only | 0 | CodReteta, IndexGest, NrOperatie, Detaliu |
| `CONSMAT.DB` | root only | 0 | CodReteta, CodProd, Data, Satelit |
| `CONSMAT1.DB` | root only | 0 | CodReteta, IndexGest, IndexLocal, Art |
| `CONSREZ1.DB` | root only | 0 | CodReteta, IndexGest, IndexLocal, Art |
| `CONSSDV.DB` | root only | 0 | CodReteta, IndexGest, NrOperatie, Detaliu |
| `CONST.DB` | per monthly folder | 24 | Cod, Sectiune |
| `CONST1.DB` | per monthly folder | 1508 | User, CodParinte, IndexLocal, Simbol |
| `CONST2.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Maketa |
| `CONTCH.DB` | root only | 0 | Cod, Denumire, An, Luna |
| `CONTCH1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Cont1, Sold |
| `CONTR1.DB` | root only | 0 | CodParinte, IndexLocal, Articol, Atr10 |
| `CONTR2.DB` | root only | 0 | CodParinte, IndexContr1, IndexLocal, Sediu |
| `CONTR3.DB` | root only | 0 | CodParinte, IndexLocal, Data, Dobanda |
| `CONTR4.DB` | root only | 0 | CodContract, CodDoc, IndexLocal, TipDoc |
| `CONTR5.DB` | root only | 0 | CodParinte, IndexContr1, IndexContr2, IndexLocal |
| `CONTR6.DB` | root only | 0 | CodParinte, IndexContr1, IndexContr2, Termen |
| `CONTRACT.DB` | root only | 0 | Cod, TipContract, TipDoc, Partener |
| `CONTREP.DB` | per monthly folder | 0 | ContParinte, Analitic, Procent, ProcentRulaj |
| `CONTRF.DB` | root only | 0 | CodParinte, CodFactura, LunaAn |
| `CONTRPP.DB` | per monthly folder | 0 | Cod, Sucursala |
| `CONTRPP1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, NrContract |
| `CORELAT1.DB` | root only | 93 | Cod, IdxLocal, Rnd1, Col1 |
| `CORELAT2.DB` | root only | 3 | Nr, CodF1, Rnd1, Col1 |
| `CORPP.DB` | per monthly folder | 0 | Cod, Sucursala, ZiInreg, Curs |
| `CORPP1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, Contract |
| `CORVOL.DB` | root only | 0 | Cod, Tip, Dens |
| `CORVOL1.DB` | root only | 0 | CodParinte, Temp, Coef |
| `CRITERII.DB` | root only | 6 | Criteriu, Denumire, ExcludVolTr, ExcludCantFact |
| `CULORI.DB` | root only | 0 | Cod, Denumire |
| `CUPLAJE.DB` | per monthly folder | 0 | Destinatie, DataCuplaj, Modificari |
| `CalcC.DB` | per monthly folder | 0 | Tip, Ord, Facil, FSpec |
| `CalcD.DB` | per monthly folder | 0 | Tip, Ord, Facil, FSpec |
| `Contr1L.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Achiz |
| `CostDes1.DB` | root only | 0 | IdCost, IndexLocal, CodArt, Cost |
| `CostDesf.DB` | root only | 0 | IdCost, CodPart, DataI, DataStart |
| `DED.DB` | root only | 0 | CodParinte, IndexParinte, IndexLocal, Nume |
| `DED02CAL.DB` | root only | 0 | NrCrt, CNP, Luna, Calitate |
| `DED02INV.DB` | root only | 0 | NrCrt, CNP, Luna, Invalid |
| `DED2002.DB` | root only | 0 | Cnp_Ang, CodContract, CNP_Pers, Nume |
| `DEDGEN.DB` | per monthly folder | 0 | Cod, Denumire, Contract, Conventie |
| `DEDGEN1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Pers, LimitaSup |
| `DEDLUNAR.DB` | root only | 0 | CodParinte, IndexAng, IndexParinte, Luna |
| `DEDUCERI.DB` | root only | 0 | CodAng, CodContract, CNP, Nume |
| `DEGRES.DB` | root only | 1 | Cod, Luna, An |
| `DEGRES1.DB` | root only | 59 | Cod, IndexLocal, Utilizare, CotaLin |
| `DETET.DB` | per monthly folder | 0 | CodDetaliu, TipDoc, CodDoc, CodLocInc |
| `DETET1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, DATATRANSPORT, NRAUTO |
| `DISCIES.DB` | root only | 0 | Criteriu, IndexInterv, IndexLocal, Lim2 |
| `DISCIES1.DB` | root only | 0 | Criteriu, IndexInterv, IndexLocal, Art |
| `DISTRIB.DB` | per monthly folder | 0 | Cod, Denumire, Tip, Gestiune |
| `DISTRIB1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Gestiune, Pchelt |
| `DIURNE.DB` | per monthly folder | 0 | Cod, Denumire |
| `DIURNE1.DB` | per monthly folder | 0 | Cod, IndexLocal, Angajat, Valoare |
| `DIURNE2.DB` | per monthly folder | 0 | Cod, IndexLocal, Contrib |
| `DREPPERS.DB` | per monthly folder | 0 | Codpers, CodDrep, CodBuget |
| `DSER.DB` | root only | 0 | Cod, Luna, An, DataPrel |
| `DSERE.DB` | per monthly folder | 0 | CodParinte, CodPunctDeLucru, CIM, PersFiz |
| `DSERM.DB` | per monthly folder | 0 | CodParinte, CodPunctDeLucru, CIM, Stoc |
| `DSERP.DB` | per monthly folder | 0 | CodParinte, CodSedSec, SIUI, DataURaport |
| `DVI.DB` | per monthly folder | 0 | CodParinte, Vama, NrDoc, CursVama |
| `DVI1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, PozSursa, TipLinie |
| `DVOT.DB` | root only | 0 | CodDVOT, Termen, Data, Moneda |
| `EAWB.DB` | per monthly folder | 0 | CodAWB, Identif, Data, Fact |
| `EAWB1.DB` | per monthly folder | 0 | CodAWB, IndexLocal, Luna, An |
| `ETARIF.DB` | per monthly folder | 0 | CodTarif, Tip, CodSC, Moneda |
| `ETARIF1.DB` | per monthly folder | 0 | CodParinte, CodZona |
| `ETARIF2.DB` | per monthly folder | 0 | CodParinte, CodZona, TipT, Masa |
| `EURO.DB` | root only | 0 | Cod, PLU, Dep, TVACasa |
| `EUROCASE.DB` | root only | 0 | Cod, Denumire, NrCasa, CasaBanca |
| `EZONE.DB` | per monthly folder | 0 | Cod, CodTr, TipZT |
| `EZONE1.DB` | per monthly folder | 0 | CodZona, CodParinte, Denumire, Simbol |
| `EZONE2.DB` | per monthly folder | 0 | CodZona, CodC |
| `E_390_94.DB` | per monthly folder | 0 | TIP, NUMAR_INREGISTRARE, DATA_INREGISTRARE, AN |
| `E_AMEF.DB` | per monthly folder | 0 | DATA_Z, NUI, NR_Z, VALOARE_19 |
| `E_ETR.DB` | per monthly folder | 0 | DENUMIRE, DOMICILIU, NUMAR_TRN, PC_COD |
| `E_FACT.DB` | per monthly folder | 0 | COD, DUMMY, DATA_SELECTIE, DATA_INCEPUT |
| `E_FACT1.DB` | per monthly folder | 0 | COD, CodF, BAZA_LEI, BAZA_CALCUL |
| `E_LOC.DB` | per monthly folder | 0 | DENUMIRE, DOMICILIU, DATA_INREGISTRARE, NUMAR_INCHEIERE_AUTENTIF |
| `E_TVA.DB` | per monthly folder | 0 | CIF, AN, LUNA, DATA_INCARCARE |
| `E_VAMA_E.DB` | per monthly folder | 0 | NR_MRN, DATA_MRN, VALOARE, MONEDA |
| `E_VAMA_I.DB` | per monthly folder | 0 | NR_MRN, DATA_MRN, ARTICOL, VAL_IMPOZABILA |
| `FACTSTC1.DB` | per monthly folder | 0 | UserId, IndexLocal, Art, Atr10 |
| `FAZ.DB` | per monthly folder | 0 | Cod, CarnetDoc, NrDoc, Zi |
| `FAZ1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Km, Incarcat |
| `FAZ2.DB` | per monthly folder | 0 | CodParinte, Remorca1, Remorca2, ParcursR1 |
| `FAZ3.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodInstal, CantPrest |
| `FAZ4.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodTraseu, Parcurgeri |
| `FF102ANG.DB` | root only | 0 | NrCRT, CodAng, Marca |
| `FF102CHP.DB` | root only | 0 | NrCrt, Luna, ChProf |
| `FF12002.DB` | root only | 0 | CodAng, CodContract, Nume, Prenume |
| `FF1LUNAR.DB` | root only | 0 | CodParinte, IndexParinte, Luna, Venit |
| `FF202ANG.DB` | root only | 0 | NrCRT, CodAng, Marca |
| `FF22002.DB` | root only | 0 | Cnp_ANG, CodContract, Nume, Prenume |
| `FF2LUNAR.DB` | root only | 0 | CodParinte, IndexParinte, Luna, Venit |
| `FFISC1.DB` | root only | 0 | CodParinte, IndexLocal, CodAng, CodContract |
| `FFISC2.DB` | root only | 0 | CodParinte, IndexLocal, CodAng, CodContract |
| `FFSIN.DB` | root only | 0 | CodParinte, IndexLocal, Luna, Denumire |
| `FISAMF.DB` | root only | 8 | Nrinv, Codoper, DataOper, GestS |
| `FIesVal.DB` | per monthly folder | 0 | Art, Gest, CodReteta, TipComplex |
| `FLTCFG.DB` | root only | 0 | CodUnic, Parinte, NrOrdine, Text |
| `FLUTCONF.DB` | root only | 0 | CodCat, Spor, DenFlut |
| `FNECONS.DB` | per monthly folder | 0 | Part, Art, TipSursa, CodSursa |
| `FNEFACT.DB` | per monthly folder | 0 | Part, Locatie, Art, TipSursa |
| `FNES2.DB` | per monthly folder | 0 | CodSursa, Art, Atr10, Atr11 |
| `FNESANUL.DB` | per monthly folder | 0 | CodSursa, TipSursa, NrDoc, DataDoc |
| `FNESOSIT.DB` | per monthly folder | 0 | Part, Art, TipSursa, CodSursa |
| `FNUASS.DB` | root only | 0 | Cod, An, Luna, Zi |
| `FNUASS1.DB` | root only | 0 | CodParinte, IndexLocal, CodAng, Nume |
| `FNUASS2.DB` | root only | 0 | CodParinte, IndexAsigurat, IndexLocal, CodCoasig |
| `FNUASS3.DB` | root only | 0 | CodParinte, CasaAsig, NumeCasaAsig, ContribDatFirmaTot |
| `FNecons1.DB` | per monthly folder | 0 | CodSursa, Art, Atr10, Atr11 |
| `FNes0.DB` | per monthly folder | 0 | CodSursa, TipSursa, Art, Cont |
| `FNes1.DB` | per monthly folder | 0 | CodSursa, Art, Atr10, Atr11 |
| `GENART.DB` | root only | 0 | CodU, Art, Atr10, Atr11 |
| `GENCOMC.DB` | root only | 0 | CodTArt, CodCom, Termen, Tip |
| `GENCOMC1.DB` | root only | 0 | CodTArt, CodCom, IndexL, Gest |
| `GENFURN.DB` | root only | 0 | CodTArt, IndexL, CodS0, CodS1 |
| `GENFURN1.DB` | root only | 0 | CodTArt, CodTFurn, CodCom, Cant |
| `GESTCASE.DB` | root only | 0 | CodCasa, TipCasa, Gest |
| `GESTCMD.DB` | per monthly folder | 0 | CodParinte, IndexCmd, IndexLocal, Gest |
| `GESTLIST.DB` | root only | 0 | Cod, Gest, DenGest, ListVer |
| `GESTLSTT.DB` | root only | 0 | Cod, Gest, DenGest, ListVer |
| `HANDSAL.DB` | per monthly folder | 0 | Cod, Data, NrMin, PMin |
| `INCUTIL.DB` | per monthly folder | 0 | Cod, Nr, Data, Gest |
| `INCUTIL1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Utilaj, Comanda |
| `INDINDIV.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodAng, Procent |
| `INVENT1.DB` | root only | 0 | CodParinte, IndexLocal, Art, Atrib10 |
| `INVENT2.DB` | root only | 0 | CodParinte, Cod, Serie, CantS |
| `INVENT3.DB` | root only | 0 | CodParinte, IndexLocal, Art, Atr10 |
| `INVENTAR.DB` | root only | 0 | CodDoc, NrDoc, Data, Gest |
| `ITM.DB` | root only | 0 | Cod, Luna, Anul, CUI |
| `LIKI0.DB` | per monthly folder | 0 | Cod, TipPlata, Obs, Curs |
| `LIKICB.DB` | per monthly folder | 0 | Angajat, Asig, IndexLocal, TipIntr |
| `LIKID.DB` | per monthly folder | 0 | Cod, CodDrept, Ziua, Gest |
| `LIKIDARE.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, ZiPlata |
| `LIKIDREP.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, CantCalc |
| `LIKIREST.DB` | per monthly folder | 0 | Codang, V421, V423, V424 |
| `LIKIRET.DB` | per monthly folder | 0 | Angajat, Ret, Avans, IndexLocal |
| `LIKISAL.DB` | per monthly folder | 0 | Cod, SalRealizat, SalOra, SporSuplim1 |
| `LIKISAL1.DB` | per monthly folder | 0 | Cod, TipCalcul21, VenitBrut21, BazaCAS21 |
| `LIKISALX.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, Luni |
| `LIKISAL_.DB` | per monthly folder | 0 | Cod, SalRealizat, SalOra, SporSuplim1 |
| `LIKISPOR.DB` | per monthly folder | 0 | Angajat, Spor, IndexLocal, OreSpor |
| `LIKISTAT.DB` | per monthly folder | 0 | Angajat, Tip, Cod, IndexLocal |
| `LIKISTAX.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, Tip |
| `LIKISTA_.DB` | per monthly folder | 0 | Angajat, Tip, Cod, IndexLocal |
| `LIKISUPL.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, ZiPlata |
| `LIKIxC.DB` | per monthly folder | 0 | CNP, CodPers, CodD, CodX |
| `LIKIxD.DB` | per monthly folder | 0 | CNP, CodPers, Asig, IndexLocal |
| `LINBILAN.DB` | root only | 129 | Cod, NrLinie, NrRind, Denumire |
| `LIVRARE.DB` | per monthly folder | 0 | CodParinte, IndexLocal, PozSursa, UMSec |
| `LIVRARE1.DB` | per monthly folder | 0 | CodParinte, IndexLivr, IndexLocal, DataIn |
| `LIVRSER.DB` | per monthly folder | 0 | CodParinte, IndexLivr, LinieLivr, IndexLocal |
| `LKSALDF.DB` | per monthly folder | 0 | Cod, SalRealizat, SalOra, SporSuplim1 |
| `LKSTATDF.DB` | per monthly folder | 0 | Angajat, Tip, Cod, IndexLocal |
| `LOCMUNCA.DB` | root only | 0 | CodLocM, Denumire, Simbol, Tip |
| `LOHN2.DB` | per monthly folder | 0 | CodParinte, IndexLocal, IndexLocal1, CodCmd |
| `LOHN3.DB` | per monthly folder | 0 | CodParinte, IndexLocal, IndexLocal1, IndexLocal2 |
| `LOHN4.DB` | per monthly folder | 0 | CodParinte, IndexLocal, IndexLocal1, IndexLocal2 |
| `Liki99x.DB` | per monthly folder | 0 | Cod, Nesc995, Nesc996, Nesc998 |
| `MANCMD.DB` | per monthly folder | 0 | CodParinte, IndexCmd, IndexGest, NrOperatie |
| `MATCMD.DB` | per monthly folder | 0 | CodParinte, IndexCmd, IndexGest, IndexLocal |
| `MEDCASE.DB` | root only | 0 | COD, NUMECASA |
| `MEDICAM.DB` | root only | 0 | COD_COMERC, DENUMIRE, DEN_INTERN, PRODUCATOR |
| `MEDICI.DB` | root only | 0 | MEDIC, NUME, TIP, NR_CONTRAC |
| `MEDSECT.DB` | root only | 0 | COD, DENUMIRE |
| `MEDSPEC.DB` | root only | 0 | COD, DENUMIRE |
| `MESE.DB` | root only | 0 | Cod, Sala, IndexLocal, Stare |
| `MESE1.DB` | root only | 0 | CodParinte, IndexLocal, CodOspatar, Implicit |
| `MESE2.DB` | root only | 0 | CodParinte, DataRezervare, OraRezervare, InfoRezervare |
| `MFCLASIF.DB` | root only | 3 | CodClasif, Simbol, Denumire, Durata |
| `MODIFCM.DB` | per monthly folder | 0 | Cod, NrContract, CodAng, TipCM |
| `MODIFCM1.DB` | per monthly folder | 0 | Cod, Index, Contrib |
| `MODIFCM2.DB` | per monthly folder | 0 | Cod, TipContrITM, RepartizareTM, Interval |
| `MODIFCM3.DB` | per monthly folder | 0 | CodParinte, IndexLocal, NrOldcontr, DataOldContr |
| `MODIFCM4.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Tip, DataSTART |
| `MREG.DB` | per monthly folder | 0 | Cod, Tip, Moneda, Curs |
| `MREZCMD.DB` | per monthly folder | 0 | CodParinte, IndexCmd, IndexGest, IndexLocal |
| `MSTOBLIG.DB` | root only | 0 | Cod, Denumire |
| `NACLAS.DB` | root only | 0 | Cod, Denumire, IP, CodCatPret |
| `NAGENDA.DB` | root only | 59 | CodUnic, CodSursa, Tip, Adresa |
| `NAGENDA1.DB` | root only | 0 | CodAgenda, Poza, Descriere |
| `NAGENDA2.DB` | root only | 0 | CodAgenda, TipId, IdSpec, TipIdArt |
| `NART1.DB` | per monthly folder | 24 | Art, TVA, Accize, PretMaximal |
| `NARTCAL.DB` | root only | 0 | CodParinte, IndexLocal, CodIndicator, TipRefer |
| `NARTCAL1.DB` | root only | 0 | CodParinte, Index, IndexLocal, Marime |
| `NARTCAL2.DB` | root only | 0 | CodParinte, Index, IndexLocal, TipIntrare |
| `NARTCHEL.DB` | per monthly folder | 0 | CodParinte, UMsec, TipAdMax, Valoare |
| `NARTPIC.DB` | root only | 0 | CodArt, Poza, Descriere |
| `NASIG.DB` | per monthly folder | 0 | Cod, Tip, Intrerupere, Bazacalcul |
| `NASIG1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, ModCalcul, Conditionare |
| `NASIG2.DB` | per monthly folder | 0 | CodParinte, Index, IndexLocal, Cuantum |
| `NASIG3.DB` | per monthly folder | 0 | CodParinte, Tip, IndexLocal, ElemCalcul |
| `NBANCA1.DB` | per monthly folder | 4 | CodParinte, Cont, SoldLei, SoldValuta |
| `NBILANT.DB` | root only | 3 | Cod, CodF, Denumire, Sectiune |
| `NC1SABL.DB` | root only | 0 | CodParinte, IndexLocal, ContD, ContC |
| `NCALIT.DB` | root only | 0 | Cod, Denumire, UM, TipIndicator |
| `NCANTARE.DB` | root only | 0 | Cod, Denumire, Canal, CasaMarcat |
| `NCARACT.DB` | root only | 1 | Cod, Denumire, DenUM, Cod1 |
| `NCASE.DB` | root only | 1 | Cod, Denumire, NrCasa, CasaBanca |
| `NCATFCT.DB` | root only | 1 | Cod, Denumire |
| `NCATPRET.DB` | root only | 1 | Cod, Denumire, Tip, Simbol |
| `NCATRET.DB` | root only | 1 | Cod, Denumire, Simbol |
| `NCATSPOR.DB` | root only | 3 | Cod, Denumire, Simbol |
| `NCIAS.DB` | root only | 0 | Cod, NrDoc, Zi, Part |
| `NCIAS1.DB` | root only | 0 | CodParinte, IndexLocal, ContD, ContC |
| `NCLASEG1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Cont, Procent |
| `NCLASEPD.DB` | root only | 0 | CodParinte, Indexlocal, CategDisc |
| `NCONDAS.DB` | per monthly folder | 0 | Cod, Denumire |
| `NCONTCH.DB` | per monthly folder | 0 | Cod, Clasa, Simbol, Denumire |
| `NCONTRIB.DB` | per monthly folder | 0 | Cod, Tip, Denumire, Marime |
| `NCSABL.DB` | root only | 0 | Cod, NrDoc, Zi, Part |
| `NDIGI.DB` | root only | 0 | Cod, Denumire, IP, CodCatPret |
| `NDREP.DB` | per monthly folder | 0 | Cod, Denumire, Tip, Art |
| `NDrep1.DB` | per monthly folder | 0 | Cod, Index, Contrib |
| `NECHIPE.DB` | root only | 1 | Cod, CodGest, Denumire, Simbol |
| `NECHIV.DB` | root only | 0 | Art, ArtEchiv, CodGrupa, Paritate |
| `NERIDIC.DB` | per monthly folder | 0 | Cod, Zi, Obs, ValTot |
| `NERIDIC1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, TipPlatitor, CodPlatitor |
| `NGEST1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Cont, Procent |
| `NGEST9.DB` | per monthly folder | 0 | CodParinte, Tip, Cont |
| `NGRUPE.DB` | root only | 0 | Cod, Denumire, CodExtern |
| `NGest2.DB` | per monthly folder | 0 | CodParinte, CAEN |
| `NIMPOZ.DB` | per monthly folder | 0 | Cod, Denumire, LaContr, LaConv |
| `NIMPOZ1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, LimInf, LimSup |
| `NINTERV.DB` | root only | 0 | Cod, Denumire, ModCalcul, Perioada |
| `NMODC.DB` | per monthly folder | 0 | Cod, Denumire |
| `NNETS.DB` | root only | 0 | Cod, Denumire, IP |
| `NOMBOLI.DB` | root only | 0 | COD, DIAGNOSTIC |
| `NOMDCI.DB` | root only | 0 | CODUNIC, COD, DCI, OPTIUNE |
| `NPARC1.DB` | root only | 0 | Cod, IndexLocal, Art, Cant |
| `NPARC2.DB` | root only | 0 | Cod, IndexLocal, Doc, SN |
| `NPARC3.DB` | root only | 0 | Cod, IndexLocal, Interv, DUI |
| `NPARCAUT.DB` | root only | 0 | Cod, CodArt, NrInv, NrInreg |
| `NPARC_SA.DB` | root only | 2 | Cod, Denumire, SporSpec, NotDelete |
| `NPARC_SD.DB` | root only | 6 | Cod, Categ, CoefDrumSim, CoefDrumVal |
| `NPARC_SI.DB` | root only | 11 | Cod, Denumire, FelPrest, SporSpec |
| `NPARC_ST.DB` | root only | 18 | Cod, Denumire, R1_150, R1_150_215 |
| `NPARC_SU.DB` | root only | 11 | Cod, Denumire, Bucuresti, MunJud |
| `NPARTBON.DB` | root only | 0 | CodBon, NrBon, Data, CodClient |
| `NPARTPIC.DB` | root only | 0 | CodPart, Poza, Descriere |
| `NPERSPIC.DB` | root only | 0 | CodPers, Poza, Password |
| `NPRET.DB` | per monthly folder | 0 | Art, Gest, Pret |
| `NREDMED.DB` | root only | 0 | Cod, Denumire, Plafon, CampMEDEX |
| `NRETIN.DB` | per monthly folder | 0 | Cod, Denumire, Marime, ModCalcul |
| `NRETUR.DB` | root only | 0 | CodRetur, SimbolR, DenumireR |
| `NSEDSEC1.DB` | per monthly folder | 0 | Cod, Activ |
| `NSERII.DB` | root only | 0 | Cod, Serie, Articol, Obs |
| `NSPOR.DB` | per monthly folder | 0 | Cod, Denumire, Tip, TipTransa |
| `NSPOR1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, LimInf, Limsup |
| `NSPOR2.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodExclus |
| `NTVASE.DB` | per monthly folder | 0 | Cod, Tara, Procent, Obs |
| `OFERTE.DB` | root only | 0 | Cod, Tip, Part, Moneda |
| `OFERTE1.DB` | root only | 0 | CodParinte, IndexLocal, Articol, DenLaFurn |
| `OMRON.DB` | root only | 0 | Cod, PLU, Dep, TVACasa |
| `ONLIN1.DB` | both | 0 | CodParinte, IndexLocal, Art, Atr10 |
| `ONLIN2.DB` | both | 0 | CodParinte, TipPlata, Valoare |
| `ONLINE.DB` | both | 0 | Cod, NrBon, Data, TVA |
| `ONLINNR.DB` | root only | 0 | UserID, DataDoc, NrDoc |
| `OPER1.DB` | root only | 6 | Cod, SedSec |
| `OPTIUNI1.DB` | root only | 0 | User, CodParinte, IndexLocal, Simbol |
| `ObligPI2.DB` | per monthly folder | 0 | Part, Moneda, TipDoc, CodDoc |
| `ObligSal.DB` | per monthly folder | 0 | Tip, An, Luna, Angajat |
| `PACKING.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Colet, GreutateC |
| `PACKING1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, IndexLocal1, Articol |
| `PARTCUST.DB` | per monthly folder | 0 | CodPart, ValCustodie |
| `PARTICIP.DB` | per monthly folder | 0 | Denumire, Procent |
| `PARTSAL1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, ZiPlata |
| `PERSINTR.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Nume, Prenume |
| `PLU1020.DB` | root only | 0 | Cod, PLU, Dep, TVACasa |
| `PLUCNT.DB` | root only | 0 | Cod, PLU, ItemCode, Art |
| `PLUDEF.DB` | root only | 0 | Cod, PLU, Dep, Art |
| `PLUSuccesM.DB` | root only | 0 | Cod, PLU, BarCod, Dep |
| `PMP.DB` | per monthly folder | 0 | CodStoc, CantIntr, ValIntr |
| `POSBANCAR.DB` | root only | 0 | Cod, UserId, TipPos, PortSerial |
| `POSURI.DB` | root only | 0 | Cod, Denumire, CasaBanca, Gest |
| `PREAVIZ1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, ZiPlata |
| `PREMII0.DB` | per monthly folder | 0 | Cod, TipPlata, Obs, Curs |
| `PREMII1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, ZiPlata |
| `PRETIN.DB` | root only | 0 | CodDoc, Part, Art, PrefixDoc |
| `PRETM.DB` | root only | 0 | CodArt, IndexLocal, CodPret, Lei |
| `PREZENT.DB` | per monthly folder | 0 | Cod, CodAng, CodEch, Zi |
| `PREZENT1.DB` | per monthly folder | 0 | Cod, Ind, OraIn, OraOut |
| `PRODNET.DB` | per monthly folder | 0 | CodParinte, Comanda, Articol, Reteta |
| `PRODUCT.DB` | per monthly folder | 0 | Cod, Activitate, Denumire, CoefPreluare |
| `PRODUCT1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Sectie, ValProd |
| `PRODUCT2.DB` | per monthly folder | 0 | CodParinte, IndexProd, IndexLocal, CodChelt |
| `PRODUCT3.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodDistrib |
| `PROMO.DB` | root only | 0 | Cod, Tip, Anulat, Blocat |
| `PROMO1.DB` | root only | 0 | CodParinte, IndexLocal, Articol, UMSec |
| `PROMO2.DB` | root only | 0 | CodParinte, IndexPromo1, IndexLocal, Articol |
| `RA.DB` | root only | 0 | Cod, Stare, StareAng, StareContr |
| `RAANG.DB` | root only | 0 | Cod, Id, Nume, Prenume |
| `RACONTR.DB` | root only | 0 | Cod, Id, AngajatID, COR |
| `RAFIRMA.DB` | root only | 0 | Cod, CodWM, ID, Stare |
| `RAPORTP.DB` | per monthly folder | 0 | CodParinte, Numar, Zi, Formatia |
| `RAPORTP1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, TNorma |
| `RAPORTP2.DB` | per monthly folder | 0 | CodParinte, Index, IndexLocal, Comanda |
| `RATE.DB` | root only | 0 | CodParinte, NrContract, Data, Client |
| `RATE1.DB` | root only | 0 | CodParinte, IndexLocal, UMSec, Art |
| `RATEPP.DB` | per monthly folder | 0 | Cod, Sucursala, ZiInreg, Curs |
| `RATEPP1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, Contract |
| `REALIZ0.DB` | per monthly folder | 0 | Cod, AplicaFacil, Neoperat |
| `REALIZAT.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, RealizatR |
| `RECBG1.DB` | per monthly folder | 0 | CodParinte, AnFiscal, ValPlan1, ValPlan2 |
| `REDUCER1.DB` | root only | 0 | Cod, Indexlocal, Sup, Discont |
| `REDUCERI.DB` | root only | 0 | Cod, Part, Art, Criteriu |
| `REG.DB` | root only | 0 | An, TipCM, CodAng, CodContract |
| `REG1.DB` | root only | 0 | An, TipCM, CodAng, CodContract |
| `REGULAR.DB` | per monthly folder | 0 | Cod, CodSursa, TipSursa, Zi |
| `REGZIL.DB` | per monthly folder | 0 | Cod, CodFormatie, CodPlatitor, ZiPlata |
| `REGZIL1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodAngajat, OreLucrate |
| `REP.DB` | root only | 0 | Cod, CodAng, Tip_Ang, Denumire |
| `REP2002.DB` | root only | 0 | CodAng, Tip_Ang, Denumire, Nume |
| `REPFISC.DB` | root only | 0 | CodAng, AngPersJur, AngPersFiz, Denumire |
| `RESTCMD.DB` | root only | 0 | Cod, NrComanda, CodMasa, CodOspatar |
| `RESTCMD1.DB` | root only | 0 | CodParinte, IndexLocal, Art, Atr10 |
| `RESTCMD2.DB` | root only | 0 | CodParinte, IndexLocal, Art, Pret |
| `RESTCMD3.DB` | root only | 0 | CodParinte, IndexLocal, Gest, Art |
| `RESTOBS.DB` | root only | 0 | Art, IndexLocal, Clasa, Obs |
| `RESTTEM1.DB` | per monthly folder | 0 | CodParinte, Numar, Zi, Formatia |
| `RESTTEM2.DB` | per monthly folder | 0 | Cod, Cont, TipPlata, Implicit |
| `RESTTEM3.DB` | per monthly folder | 0 | CodParinte, IndexCmd, IndexGest, NrOperatie |
| `RETPERS.DB` | per monthly folder | 0 | CodPers, CodRetInd |
| `REV.DB` | root only | 0 | Cod, Stare, VerCAEN, VerCOR |
| `REVAng.DB` | root only | 0 | CodParinte, IndexLocal, CNP, RA1 |
| `REVContr.DB` | root only | 0 | CodParinte, IndexRevAng, IndexLocal, CodModifCM |
| `REVSpor.DB` | root only | 0 | CodParinte, IndexRevAng, IndexRevContr, IndexLocal |
| `RestCNP.DB` | root only | 0 | CodComanda, CodCarnet, NrDoc |
| `SABLCOLB.DB` | root only | 8 | Cod, Denumire |
| `SACOM1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Sursa, TipLucrare |
| `SACOMACC.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Art |
| `SACOMAND.DB` | per monthly folder | 0 | Cod, CarnetDoc, NrDoc, DataInreg |
| `SACOMANG.DB` | per monthly folder | 0 | CodParinte, IndexSACom1, IndexLocal, Angajat |
| `SACOMDEF.DB` | per monthly folder | 0 | CodParinte, IndexLocal, IndexSACom1, TipLucrare |
| `SACOMDZ.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Tip, X |
| `SACOMLUC.DB` | per monthly folder | 0 | CodParinte, IndexLocal, IndexSACom1, TipLucrare |
| `SACOMMAN.DB` | per monthly folder | 0 | CodParinte, IndexSACom1, IndexAng, IndexLocal |
| `SACOMMAT.DB` | per monthly folder | 0 | CodParinte, IndexCom, IndexLocal, Art |
| `SACOMREZ.DB` | per monthly folder | 0 | CodParinte, IndexCom, IndexLocal, Art |
| `SACPREL.DB` | per monthly folder | 0 | CodComand, Preluat |
| `SAENERGI.DB` | root only | 0 | Cod, Denumire |
| `SAGEST.DB` | per monthly folder | 0 | CodParinte, IndexCom, Art, Atrib10 |
| `SAINCAR1.DB` | root only | 0 | CodPers, Data, CodAgendaSA, CodAgendaS1 |
| `SAINCARC.DB` | root only | 0 | CodPers, Data, Minut, Blocat |
| `SALI.DB` | root only | 0 | Cod, Denumire, Responsabil, NumarMese |
| `SALMIN.DB` | per monthly folder | 0 | Cod, Valoare, Tip |
| `SALUCRA.DB` | root only | 0 | Cod, ArtAsoc, ArtAsoc2, Denumire |
| `SALUCRA1.DB` | root only | 0 | CodUnic, CodSursa, CodPers |
| `SALock.DB` | root only | 0 | CodCmd, LogonName |
| `SAMATTR.DB` | per monthly folder | 0 | CodComanda, IndexSACom1, IndexSAComMat, CodTransf |
| `SAMPREL.DB` | per monthly folder | 0 | CodParinte, IndexCom, IndexLocal, RestDeLivrat |
| `SANOP.DB` | root only | 1 | Cod, Denumire, CodOp, ClasaOp |
| `SAORE.DB` | per monthly folder | 0 | Cod, Ore |
| `SAPCASE.DB` | root only | 0 | Cod, Denumire, NrCasa, CasaBanca |
| `SAPEL.DB` | root only | 0 | Cod, PLU, Dep, Art |
| `SAPONL.DB` | root only | 0 | Cod, PLU, Dep, DenDep |
| `SASERII.DB` | root only | 0 | Cod, Serie, CodMarca, CodModel |
| `SASERII1.DB` | root only | 0 | CodParinte, IndexLocal, CodComanda, NrComanda |
| `SDVCMD.DB` | per monthly folder | 0 | CodParinte, IndexCmd, IndexGest, NrOperatie |
| `SERNUM.DB` | per monthly folder | 0 | Art, Serie, User, Rezervat |
| `SERVSPL.DB` | root only | 0 | Cod, Denumire, Simbol, Art |
| `SERVSPL1.DB` | root only | 0 | CodParinte, IndexLocal, LimitaSup, Valoare |
| `SPORECH.DB` | per monthly folder | 0 | CodEchipa, CodSpor |
| `SPORPERS.DB` | per monthly folder | 0 | Codpers, CodSpor, ValSporITM |
| `STATDECL.DB` | root only | 0 | Cod, TipDoc, CodDoc, IDINCARCARE |
| `STOCCASE.DB` | root only | 0 | TipCasa, Gest, Art, Cont |
| `STOCCLI.DB` | per monthly folder | 0 | Art, Atr10, Atr11, Atr20 |
| `STOCCLI1.DB` | per monthly folder | 0 | Art, Atr10, Atr11, Atr20 |
| `STOCRFRS.DB` | per monthly folder | 0 | Blocaj |
| `TABELCOD.DB` | per monthly folder | 0 | CodSatelit, NumeTabla, CodSat1, CodSat2 |
| `TARIF.DB` | per monthly folder | 0 | Cod, Luna, An |
| `TARIF1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Dificultate, TarifOrar |
| `TAXEAMB.DB` | per monthly folder | 0 | CodParinte, IndexLocal, LimSup, Valoare |
| `TAXECOL.DB` | per monthly folder | 0 | Cod, Tip, Data, Transe |
| `TAXECOL1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, LimInf, Fractiune |
| `TAXEDI.DB` | root only | 0 | Sablon, TipTaxa, Articol |
| `TEMPLAT1.DB` | root only | 0 | CodParinte, IndexLocal, Denumire, Valoare |
| `TEMPLAT2.DB` | root only | 0 | CodParinte, IndexLocal, Valoare |
| `TEMPLATE.DB` | root only | 0 | Cod, Denumire, Task |
| `TICHETT.DB` | per monthly folder | 0 | Cod, CodCarnet, NrCarnet, SerieCarnet |
| `TICHETT1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodTert, NrTichete |
| `TIMED.DB` | root only | 0 | Cod, Denumire, TipRepetare, RepetareLa |
| `TIMED1.DB` | root only | 0 | CodParinte, IndexLocal, CodTrigger |
| `TRANSECARD.DB` | root only | 0 | CodParinte, IndexLocal, Valoare |
| `TRANSF0.DB` | per monthly folder | 0 | CodParinte, ProcTVA, ValDisc, TVADisc |
| `TRASEE.DB` | root only | 0 | Cod, Simbol, Denumire, KmB |
| `TRASEE1.DB` | root only | 0 | CodParinte, IndexLocal, Km, CatDrum |
| `TVADEP.DB` | root only | 0 | CodCasa, ProcTVA, CodDep |
| `USEDNRCM.DB` | root only | 0 | Cod, NrComanda, CodMasa, UserID |
| `VANZAR.DB` | root only | 0 | Art, Gest, Cont, Pret |
| `VENITSP.DB` | per monthly folder | 0 | Cod, Denumire, TipImpozit, ProcImpozit |
| `VENITSP1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodContrib, Cumulat |
| `VENITSP2.DB` | per monthly folder | 0 | CodParinte, IndexLocal, Angajat, Valoare |
| `VPASIG.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CNP, Nume |
| `VPCONTR.DB` | per monthly folder | 0 | Cod, Part, NrContr, TipContr |
| `VPSTOP.DB` | per monthly folder | 0 | Cod, Data, TotalCAS, TotalSomaj |
| `VPSTOP1.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodContr, DataPlata |
| `VPSTOP2.DB` | per monthly folder | 0 | CodParinte, IndexLocal, CodTitular, TipContr |
| `VTOTAL.DB` | root only | 0 | Interval, Vandut |
| `ZCREDIT.DB` | root only | 0 | Criteriu, IndexInterv, IndexLocal, Lim2 |
| `ZCREDIT1.DB` | root only | 0 | Criteriu, IndexInterv, IndexLocal, Art |
| `ZILECRED.DB` | root only | 2 | Criteriu, Denumire, ExcludVolTr, ExcludCantFact |
| `ZILIERI.DB` | per monthly folder | 0 | Cod, Nume, Prenume, CNP |
| `ZINELUC.DB` | root only | 60 | Cod, An, Luna, OreN |
| `ZINELUC1.DB` | root only | 570 | CodParinte, IndexLocal, Zi |
