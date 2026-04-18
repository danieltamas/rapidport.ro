# SAGA C 3.0 Import Schema Reference

**Purpose:** Reverse-engineered field-level schema for SAGA C 3.0's *Import Date* screen. Used by Phase 1 generator workers to produce valid DBF/XML import files.

**Source data:** `samples/saga/CONT_BAZA.FDB` (Firebird 3.0 production database, ODS 12, donor-supplied). Schema extracted via `isql` inside Docker container `jacobalberty/firebird:3.0`. DDL dump: `docs/saga-fdb-schema.sql` (gitignored, 40 371 lines, 195 tables, 147 triggers, 154 generators).

**Validation Status:** Phase C (end-to-end import test against a live SAGA C 3.0 installation) is **deferred to Phase 1 `generators-*` tasks**. SAGA C 3.0 is not installed on the development machine. All import format mappings in this document are hypotheses cross-referenced against the official SAGA C manual (`manual.sagasoft.ro`) and forum posts — marked **[UNVALIDATED]** where not confirmed by a live import test.

---

## Global Gotchas

| Topic | Rule |
|-------|------|
| **Encoding** | Firebird DB uses `WIN1252` (Windows-1252). DBF files must also be written in `WIN1252` (standard for Romanian dBASE files). XML files use UTF-8 with `<?xml version="1.0" encoding="utf-8"?>`. |
| **Date format** | DBF: native Firebird `DATE` type (YYYY-MM-DD internally); DBF column declared as `D` (8-byte). XML: `dd.mm.yyyy` string format (e.g. `15.04.2025`) per SAGA manual examples. |
| **Decimal separator** | DBF: period `.` (standard dBASE numeric). XML: period `.` (SAGA parses locale-independently). |
| **CIF format** | Stored in FDB as plain string without `RO` prefix (e.g. `12345678`). SAGA import screen accepts both `12345678` and `RO12345678` — strip prefix when writing DBF; keep or omit for XML (both accepted per forum). |
| **VAT rates** | Stored as numeric percentage: `19`, `9`, `5`, `0`. SAGA uses these raw numeric values in import files. No string labels. |
| **Account codes** | Romanian Plan de Conturi (OMFP 1802/2014). Up to 20 chars in SAGA (`CONT VARCHAR(20)`). Analytical accounts extend with `.` separator (e.g. `401.FURNIZOR`). |
| **PK generation** | Every table with a `PK INTEGER` column has a corresponding trigger + generator (e.g. `GEN_INTRARI_PK`). Import files do NOT provide PKs — SAGA auto-assigns them via generators. |
| **NULL semantics** | Most columns default to `0` or `''` — genuinely NULLable columns are rare (DATE fields are the exception: `DATA`, `SCADENT`, `DATA_DOC` can be NULL). |

---

## 1. Terți — Partners (Clients + Suppliers)

SAGA stores clients and suppliers in **two separate tables** (`CLIENTI` and `FURNIZORI`). The import screen accepts two separate DBF files or, for XML, a combined file routed by `<TipTert>`.

### 1a. FDB Table: `CLIENTI`

Primary key: `COD VARCHAR(8)` (NOT NULL)

| Column | Type | Default | NOT NULL | Notes |
|--------|------|---------|----------|-------|
| COD | VARCHAR(8) | '' | YES | Internal client code (up to 8 chars) |
| DENUMIRE | VARCHAR(64) | '' | — | Company/person name |
| COD_FISCAL | VARCHAR(20) | '' | — | CIF/CNP, no RO prefix stored |
| REG_COM | VARCHAR(16) | '' | — | Trade register number (J40/…) |
| ANALITIC | VARCHAR(20) | '' | — | Analytical account override |
| ZS | SMALLINT | 0 | — | Payment due days |
| DISCOUNT | NUMERIC(6,2) | 0 | — | Default discount % |
| ADRESA | VARCHAR(100) | '' | — | Street address |
| JUDET | VARCHAR(36) | '' | — | County name |
| BANCA | VARCHAR(48) | '' | — | Bank name |
| CONT_BANCA | VARCHAR(36) | '' | — | IBAN |
| FILIALA | VARCHAR(36) | '' | — | Bank branch |
| DELEGAT | VARCHAR(36) | '' | — | Default delegate name |
| BI_SERIE | CHAR(2) | '' | — | ID card series |
| BI_NUMAR | VARCHAR(16) | '' | — | ID card number |
| BI_POL | VARCHAR(16) | '' | — | ID card issuer |
| MASINA | VARCHAR(16) | '' | — | Vehicle plate |
| INF_SUPL | VARCHAR(200) | '' | — | Additional info |
| AGENT | VARCHAR(4) | '' | — | Agent code |
| DEN_AGENT | VARCHAR(36) | '' | — | Agent name |
| GRUPA | VARCHAR(16) | '' | — | Group code |
| TIP_TERT | CHAR(1) | '' | — | `I` = internal, `E` = external |
| TARA | CHAR(2) | '' | — | ISO-3166-1 alpha-2 country code |
| TEL | VARCHAR(20) | '' | — | Phone |
| EMAIL | VARCHAR(100) | '' | — | Email |
| IS_TVA | SMALLINT | 0 | — | 1 = VAT payer |
| BLOCAT | SMALLINT | 0 | — | 1 = blocked |
| DATA_V_TVA | DATE | NULL | — | VAT validity start |
| DATA_S_TVA | DATE | NULL | — | VAT validity end |
| C_LIMIT | NUMERIC(15,2) | 0 | — | Credit limit |
| LOCALITATE | VARCHAR(46) | '' | — | City |
| COD_POST | VARCHAR(8) | '' | — | Postal code |
| IS_EFACT | SMALLINT | 0 | — | 1 = e-Factura participant |
| ID_EFACT | VARCHAR(13) | '' | — | e-Factura ID |
| C_SAFT | VARCHAR(30) | '' | — | SAF-T classification |
| A_UNIC | SMALLINT | 0 | — | Unique analytical account flag |

### 1b. FDB Table: `FURNIZORI`

Primary key: `COD VARCHAR(8)` (NOT NULL). Same shape as CLIENTI minus `DISCOUNT`, `DELEGAT`, `BI_*`, `MASINA` fields; adds `TIP_IMP CHAR(1)`, `DATA_TVAI DATE`, `D_TVAI_SF DATE`.

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| COD | VARCHAR(8) | '' | NOT NULL — supplier code |
| DENUMIRE | VARCHAR(64) | '' | |
| COD_FISCAL | VARCHAR(20) | '' | CIF, no RO prefix |
| REG_COM | VARCHAR(16) | '' | |
| ANALITIC | VARCHAR(20) | '' | |
| ZS | SMALLINT | 0 | Payment due days |
| JUDET | CHAR(2) | '' | County 2-letter code for FURNIZORI (not full name) |
| ADRESA | VARCHAR(100) | '' | |
| BANCA | VARCHAR(48) | '' | |
| CONT_BANCA | VARCHAR(36) | '' | IBAN |
| FILIALA | VARCHAR(36) | '' | |
| GRUPA | VARCHAR(16) | '' | |
| TIP_TERT | CHAR(1) | '' | `I`/`E` |
| TARA | CHAR(2) | '' | ISO country code |
| TEL | VARCHAR(20) | '' | |
| EMAIL | VARCHAR(100) | '' | |
| IS_TVA | SMALLINT | 0 | 1 = VAT payer |
| TIP_IMP | CHAR(1) | '' | Import type (internal use) |
| DATA_TVAI / D_TVAI_SF | DATE | NULL | ANAF VAT inactivity dates |
| DATA_V_TVA / DATA_S_TVA | DATE | NULL | VAT validity dates |
| LOCALITATE | VARCHAR(46) | '' | |
| COD_POST | VARCHAR(8) | '' | |

### 1c. Import File Format — DBF

**File names:** `Clienti_DD-MM-YYYY_DD-MM-YYYY.dbf` / `Furnizori_DD-MM-YYYY_DD-MM-YYYY.dbf`

DBF field specs (import screen expects these column names — [UNVALIDATED for exact field widths]):

| DBF Field | dBASE Type | Width | Required | Notes |
|-----------|-----------|-------|----------|-------|
| COD | C | 8 | — | If blank, SAGA auto-assigns |
| DENUMIRE | C | 48 | **YES** | Truncated to 48 in import |
| COD_FISCAL | C | 13 | **YES** | Import deduplicates on this |
| REG_COM | C | 16 | — | |
| ANALITIC | C | 16 | — | |
| ZS | N | 3,0 | — | |
| ADRESA | C | 48 | — | |
| BANCA | C | 48 | — | |
| CONT_BANCA | C | 36 | — | |
| FILIALA | C | 36 | — | |
| GRUPA | C | 16 | — | |
| TIP_TERT | C | 1 | — | `I` or `E` |
| TARA | C | 2 | **YES** | `RO` for Romania |
| TEL | C | 20 | — | |
| EMAIL | C | 100 | — | |
| IS_TVA | N | 1,0 | — | 0 or 1 |
| AGENT | C | 4 | — | |
| DISCOUNT | N | 6,2 | — | Clienti only |

**Import rule:** SAGA deduplicates on `COD_FISCAL`. If a client/supplier with that CIF already exists, it is NOT reimported. If `COD` conflicts with an existing record from a different fiscal code, SAGA may auto-recode with a `T` prefix.

### 1d. Import File Format — XML (alternative, newer)

File names: `CLI_<date>.xml` / `FUR_<date>.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<Terti>
  <Tert>
    <Denumire>SC EXEMPLU SRL</Denumire>
    <Cod_fiscal>RO12345678</Cod_fiscal>
    <Tara>RO</Tara>
    <!-- Optional fields: -->
    <Cod>CLI001</Cod>
    <Localitate>Bucuresti</Localitate>
    <Adresa>Str. Exemplu nr. 1</Adresa>
    <Cont_banca>RO49AAAA1B31007593840000</Cont_banca>
    <Banca>BCR</Banca>
    <Tel>0721000000</Tel>
    <Email>contact@exemplu.ro</Email>
    <Informatii>Note suplimentare</Informatii>
    <Guid_cod>external-uuid-here</Guid_cod>
  </Tert>
</Terti>
```

**Required XML fields:** `Denumire`, `Cod_fiscal`, `Tara`

---

## 2. Articole — Products / Items

### 2a. FDB Table: `ARTICOLE`

Primary key: `COD VARCHAR(16)` (NOT NULL)

| Column | Type | Default | NOT NULL | Notes |
|--------|------|---------|----------|-------|
| COD | VARCHAR(16) | '' | YES | Internal article code (up to 16 chars) |
| DENUMIRE | VARCHAR(60) | '' | — | Article name |
| UM | VARCHAR(5) | '' | — | Unit of measure (buc, kg, l, m, etc.) |
| TVA | NUMERIC(5,2) | 0 | — | VAT rate %: 19, 9, 5, or 0 |
| DEN_TIP | VARCHAR(36) | '' | — | Type description |
| TIP | CHAR(2) | '' | — | Article type code (FK → ART_TIP.COD) |
| STOC | NUMERIC(14,3) | 0 | — | Current stock quantity |
| PRET_VANZ | NUMERIC(15,4) | 0 | — | Sale price ex-VAT |
| PRET_V_TVA | NUMERIC(15,4) | 0 | — | Sale price inc-VAT |
| PRET_VANZ2 | NUMERIC(15,4) | 0 | — | Second sale price ex-VAT |
| PRET_V_TV2 | NUMERIC(15,4) | 0 | — | Second sale price inc-VAT |
| IS_VALUTA | SMALLINT | 0 | — | 1 = foreign currency prices |
| BLOCAT | SMALLINT | 0 | — | 1 = blocked |
| PLU | NUMERIC(16,0) | 0 | — | PLU number (POS) |
| COD_BARE | NUMERIC(16,0) | 0 | — | Barcode (EAN) |
| BRUT | NUMERIC(14,3) | 0 | — | Gross weight (kg) |
| CANT_MIN | NUMERIC(14,3) | 0 | — | Minimum stock alert |
| GRUPA | VARCHAR(16) | '' | — | Group code |
| TEXT_SUPL | VARCHAR(200) | '' | — | Additional text |
| GARANTIE | NUMERIC(6,0) | 0 | — | Warranty months |
| GREUTATE | NUMERIC(10,3) | 0 | — | Net weight (kg) |
| OK | SMALLINT | 0 | — | Active flag |
| IS_LOT | SMALLINT | 0 | — | 1 = lot/batch tracked |
| COD_CER | VARCHAR(8) | '' | — | Customs tariff code |
| CATEGORIE | VARCHAR(16) | '' | — | Category |
| COD_FE | CHAR(8) | '' | — | FE code |
| COD_CPV | CHAR(10) | '' | — | CPV procurement code |
| COD_SGR | VARCHAR(16) | '' | — | SGR (container deposit) code |
| VOLUM | NUMERIC(14,3) | 0 | — | Volume |
| TIP_A | VARCHAR(16) | '' | — | Article type variant |
| TARA_ORIG | VARCHAR(2) | '' | — | Country of origin ISO code |
| GREUTATE_B | NUMERIC(10,3) | 0 | — | Brut weight variant |

### 2b. Import File Format — DBF

**File name:** `Articole_DD-MM-YYYY_DD-MM-YYYY.dbf`

| DBF Field | dBASE Type | Width | Required | Notes |
|-----------|-----------|-------|----------|-------|
| COD | C | 16 | — | Import deduplicates on COD |
| DENUMIRE | C | 60 | **YES** | |
| UM | C | 5 | **YES** | `buc`, `kg`, `l`, `m`, `m2`, `m3`, etc. |
| TVA | N | 5,2 | — | 19 / 9 / 5 / 0 |
| TIP | C | 2 | — | Must exist in ART_TIP |
| DEN_TIP | C | 36 | — | |
| PRET_VANZ | N | 15,4 | — | |
| PRET_V_TVA | N | 15,4 | — | |
| COD_BARE | C | 16 | — | As string for leading zeros |
| CANT_MIN | N | 14,3 | — | |
| GRUPA | C | 16 | — | |

**Import rule:** Articles are deduplicated on `COD`. If a matching `COD` exists, SAGA skips the record. All locations sharing the import must use identical code configurations — no remapping.

### 2c. Import File Format — XML (alternative)

File name: `ART_<date>.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<Articole>
  <Articol>
    <Denumire>Hartie A4 80g</Denumire>
    <UM>top</UM>
    <!-- Optional: -->
    <Cod>ART001</Cod>
    <Cod_NC>4802200000</Cod_NC>
    <Cod_CPV>30197630-1</Cod_CPV>
    <Tip>MF</Tip>
    <TVA>19</TVA>
    <Pret>18.50</Pret>
    <Pret_TVA>22.02</Pret_TVA>
    <Cod_bare>5901234123457</Cod_bare>
    <Informatii>Hartie copiator premium</Informatii>
    <Guid_cod>external-uuid-here</Guid_cod>
  </Articol>
</Articole>
```

**Required XML fields:** `Denumire`, `UM`

---

## 3. Articole Contabile — Accounting Journal Entries

SAGA stores journal entries across several tables: `REGISTRU` (the core double-entry ledger) with header context from `NOTE_FACTURI` (payment notes linked to invoices). For the *Import Date* screen this entity maps to **Note Contabile** imported via DBF or CSV.

### 3a. FDB Table: `REGISTRU`

Primary key: `PK INTEGER` (auto-generated by trigger `TRGREGISTRU_PK`)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| ID_NOTA | NUMERIC(10,0) | 0 | Journal entry group ID |
| VALIDAT | CHAR(1) | '' | `V` = validated |
| IP | VARCHAR(2) | '' | I=Intrare, P=Plata, etc. |
| CONT_D | VARCHAR(20) | '' | Debit account (Plan de Conturi) |
| CONT_C | VARCHAR(20) | '' | Credit account |
| SUMA | NUMERIC(15,2) | 0 | Amount in RON |
| COD_VALUTA | VARCHAR(3) | '' | Currency code (RON, EUR, etc.) |
| CURS | NUMERIC(15,4) | 0 | Exchange rate |
| SUMA_VAL | NUMERIC(14,2) | 0 | Amount in foreign currency |
| TVA | NUMERIC(15,2) | 0 | VAT portion |
| EXPLICATIE | VARCHAR(70) | '' | Description |
| DATA | DATE | NULL | Accounting date |
| ID_CONT_D | VARCHAR(20) | '' | Analytical debit account |
| ID_CONT_C | VARCHAR(20) | '' | Analytical credit account |
| CATEGORIE | VARCHAR(16) | '' | Budget category |
| NDP | VARCHAR(16) | '' | Document reference number |
| FEL_D | VARCHAR(20) | '' | Document type |
| TIP | CHAR(1) | '' | Entry type |
| COD | VARCHAR(8) | '' | Partner code |
| TIP_O | VARCHAR(3) | '' | Operation type |
| plan / SECTOR / SURSA / CAPITOL / ARTICOL | VARCHAR | '' | Budget classification fields |

### 3b. FDB Table: `CONTURI` (Chart of Accounts)

Primary key: `CONT VARCHAR(20)` (NOT NULL)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| CONT | VARCHAR(20) | '' | Account number (Plan de Conturi) |
| DENUMIRE | VARCHAR(64) | '' | Account name |
| TIP | CHAR(1) | '' | `A`=activ, `P`=pasiv, `B`=bifunctional |
| DEB_INIT | NUMERIC(15,2) | 0 | Opening debit balance |
| CRED_INIT | NUMERIC(15,2) | 0 | Opening credit balance |
| DEB_PREC | NUMERIC(15,2) | 0 | Prior year debit |
| CRED_PREC | NUMERIC(15,2) | 0 | Prior year credit |
| CONT_INCH | VARCHAR(20) | '' | Closing account |
| DEB_INIT_V / CRED_INIT_V | NUMERIC(14,2) | 0 | Opening balances in foreign currency |
| COD_VALUTA | VARCHAR(3) | '' | Currency if foreign-currency account |
| BLOCAT | SMALLINT | 0 | 1 = blocked |

### 3c. Import File Format — DBF (Note Contabile)

**File name:** `NC_DD-MM-YYYY_DD-MM-YYYY.dbf`

| DBF Field | dBASE Type | Width | Required | Notes |
|-----------|-----------|-------|----------|-------|
| NDP | C | 16 | — | Document reference |
| CONT_D | C | 20 | **YES** | Debit account code |
| CONT_C | C | 20 | **YES** | Credit account code |
| SUMA | N | 15,2 | **YES** | Amount in RON |
| COD_VALUTA | C | 3 | — | `RON`, `EUR`, `USD`, etc. |
| CURS | N | 15,4 | — | Exchange rate (1.0 for RON) |
| SUMA_VAL | N | 14,2 | — | Amount in foreign currency |
| DATA | D | 8 | **YES** | Accounting date |
| EXPLICATIE | C | 48 | — | Description |
| GRUPA | C | 16 | — | Budget group |

**Alternative formats:** CSV (semicolon-delimited) and XLS are also accepted by SAGA's *Preluare date contabile* screen for initial balances. Column order in CSV must match field order above.

**Sample DBF import snippet (CSV equivalent):**
```
NDP;CONT_D;CONT_C;SUMA;COD_VALUTA;CURS;SUMA_VAL;DATA;EXPLICATIE
001;401;5311;1190.00;RON;1.0000;0.00;15.04.2025;Plata furnizor SC EXEMPLU SRL
002;4426;401;190.00;RON;1.0000;0.00;15.04.2025;TVA deductibila aferenta
```

---

## 4. Intrări — Purchase Invoices (Inbound)

### 4a. FDB Tables: `INTRARI` + `INTR_DET`

`INTRARI` (header): primary key `ID_INTRARE NUMERIC(10,0)` (NOT NULL, auto-generated)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| ID_INTRARE | NUMERIC(10,0) | 0 | PK — auto |
| NR_NIR | VARCHAR(16) | '' | Reception note number |
| NR_INTRARE | VARCHAR(16) | '' | Supplier invoice number |
| COD | VARCHAR(8) | '' | Supplier code (FK → FURNIZORI.COD) |
| DENUMIRE | VARCHAR(64) | '' | Supplier name (denormalized) |
| TVAI | SMALLINT | 0 | 1 = VAT on cash basis |
| DATA | DATE | NULL | Reception date |
| SCADENT | DATE | NULL | Payment due date |
| NEACHITAT | NUMERIC(15,2) | 0 | Unpaid balance |
| BAZA_TVA | NUMERIC(15,2) | 0 | VAT base |
| TRANSP_LEI | NUMERIC(15,2) | 0 | Transport cost |
| TVA | NUMERIC(15,2) | 0 | VAT amount |
| TOTAL | NUMERIC(15,2) | 0 | Total amount |
| VALIDAT | CHAR(1) | '' | `V` = validated |
| CONT_FUR | VARCHAR(20) | '' | Supplier account override |
| TIP | CHAR(1) | '' | Entry type |
| DATA_DOC | DATE | NULL | Document date (supplier's invoice date) |
| INF_SUPLM | VARCHAR(250) | '' | Additional info |
| TIP_O | VARCHAR(3) | '' | Operation type |

`INTR_DET` (line items): primary key `PK INTEGER` (auto-generated)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| ID_U | NUMERIC(10,0) | 0 | Line sequence |
| ID_INTRARE | NUMERIC(10,0) | 0 | FK → INTRARI.ID_INTRARE |
| COD | VARCHAR(16) | '' | Article code (FK → ARTICOLE.COD) |
| DENUMIRE | VARCHAR(60) | '' | Article name (denormalized) |
| GESTIUNE | VARCHAR(4) | '' | Warehouse code (FK → GESTIUNI.COD) |
| DEN_GEST | VARCHAR(24) | '' | Warehouse name (denormalized) |
| DEN_TIP | VARCHAR(36) | '' | Article type name |
| UM | VARCHAR(5) | '' | Unit of measure |
| TVA_ART | SMALLINT | 0 | VAT rate % (integer) |
| CANTITATE | NUMERIC(14,3) | 0 | Quantity |
| PRET_UNITAR | NUMERIC(16,4) | 0 | Unit price ex-VAT |
| VALOARE | NUMERIC(15,2) | 0 | Line value ex-VAT |
| TRANSP_LEI | NUMERIC(15,2) | 0 | Transport apportionment |
| TVA_DED | NUMERIC(15,2) | 0 | Deductible VAT |
| TOTAL | NUMERIC(15,2) | 0 | Line total inc-VAT |
| ADAOS_PROC | NUMERIC(9,4) | 0 | Markup % |
| ADAOS | NUMERIC(16,4) | 0 | Markup amount |
| PRET_VANZ | NUMERIC(16,4) | 0 | Sale price set on receipt |
| CONT | VARCHAR(20) | '' | Account override |
| DISCOUNT | NUMERIC(10,5) | 0 | Discount % |

**Note:** `INTRD` / `INTRD_DET` are foreign-currency variants of `INTRARI` / `INTR_DET` (same semantics plus `COD_VALUTA`, `CURS`, `VAL_VAL`, `VAL_LEI` columns).

### 4b. Import File Format — XML

**File name:** `F_<ClientCIF>_<NrIntrare>_<DataDoc>.xml`

The routing rule: if `<ClientCIF>` matches the company's own CIF → import goes to **Iesiri** (outbound). Otherwise → **Intrari** (inbound). So for purchase invoices, place the **company's CIF** in `<ClientCIF>` and the **supplier's CIF** in `<FurnizorCIF>`.

```xml
<?xml version="1.0" encoding="utf-8"?>
<Facturi>
  <Factura>
    <Antet>
      <FurnizorNume>SC FURNIZOR EXEMPLU SRL</FurnizorNume>
      <FurnizorCIF>RO87654321</FurnizorCIF>
      <FurnizorNrRegCom>J40/9876/2018</FurnizorNrRegCom>
      <FurnizorAdresa>Str. Furnizorului nr. 5, Bucuresti</FurnizorAdresa>
      <FurnizorBanca>BCR</FurnizorBanca>
      <FurnizorIBAN>RO49AAAA1B31007593840001</FurnizorIBAN>
      <ClientNume>SC CUMPARATOR EXEMPLU SRL</ClientNume>
      <ClientCIF>RO12345678</ClientCIF>
      <ClientNrRegCom>J40/1234/2020</ClientNrRegCom>
      <ClientAdresa>Str. Exemplu nr. 1, Bucuresti</ClientAdresa>
      <FacturaNumar>FACT-001</FacturaNumar>
      <FacturaData>15.04.2025</FacturaData>
      <FacturaScadenta>30.04.2025</FacturaScadenta>
      <FacturaTaxareInversa>Nu</FacturaTaxareInversa>
      <FacturaTVAIncasare>Nu</FacturaTVAIncasare>
      <FacturaMoneda>RON</FacturaMoneda>
    </Antet>
    <Detalii>
      <Continut>
        <Linie>
          <LinieNrCrt>1</LinieNrCrt>
          <Gestiune></Gestiune>
          <Descriere>Hartie A4 80g</Descriere>
          <CodArticolFurnizor>ART001</CodArticolFurnizor>
          <CodArticolClient></CodArticolClient>
          <CodBare>5901234123457</CodBare>
          <UM>top</UM>
          <Cantitate>10.000</Cantitate>
          <Pret>18.50</Pret>
          <Valoare>185.00</Valoare>
          <ProcTVA>19</ProcTVA>
          <TVA>35.15</TVA>
          <TipDeducere>N50</TipDeducere>
        </Linie>
      </Continut>
    </Detalii>
    <Sumar>
      <TotalValoare>185.00</TotalValoare>
      <TotalTVA>35.15</TotalTVA>
      <Total>220.15</Total>
    </Sumar>
  </Factura>
</Facturi>
```

**Required XML fields:** `FurnizorNume`, `FurnizorCIF`, `ClientNume`, `ClientCIF`, `FacturaNumar`, `FacturaData`, `Descriere`, `UM`, `Cantitate`, `Pret`, `Valoare`

**Optional but recommended:** `ProcTVA`, `TVA`, `FacturaScadenta`, `CodArticolFurnizor`, `TipDeducere` (`N50` = 50% deductible; `I` = non-deductible)

**`FacturaTaxareInversa`:** `Da` or `Nu` (reverse-charge VAT)
**`FacturaTVAIncasare`:** `Da` or `Nu` (VAT on cash basis)

---

## 5. Ieșiri — Sales Invoices (Outbound)

### 5a. FDB Tables: `IESIRI` + `IES_DET`

`IESIRI` (header): primary key `ID_IESIRE NUMERIC(10,0)` (NOT NULL, auto-generated)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| NR_IESIRE | VARCHAR(16) | '' | Invoice number (user-facing) |
| ID_IESIRE | NUMERIC(10,0) | 0 | PK — auto |
| COD | VARCHAR(8) | '' | Client code (FK → CLIENTI.COD) |
| DENUMIRE | VARCHAR(64) | '' | Client name (denormalized) |
| TVAI | SMALLINT | 0 | 1 = VAT on cash basis |
| DATA | DATE | NULL | Invoice date |
| SCADENT | DATE | NULL | Payment due date |
| BAZA_TVA | NUMERIC(15,2) | 0 | VAT base |
| TVA | NUMERIC(15,2) | 0 | VAT amount |
| TOTAL | NUMERIC(15,2) | 0 | Total inc-VAT |
| NEACHITAT | NUMERIC(15,2) | 0 | Unpaid balance |
| ADAOS | NUMERIC(15,2) | 0 | Total markup |
| CONT_CLI | VARCHAR(20) | '' | Client account override |
| TIP | CHAR(1) | '' | Invoice type |
| ACCIZE | NUMERIC(15,2) | 0 | Excise duty |
| CURS_REF | NUMERIC(15,4) | 0 | Reference exchange rate |
| DATA_DOC | DATE | NULL | Document date |
| INF_SUPLM | VARCHAR(250) | '' | Additional info |
| TIP_O | VARCHAR(3) | '' | Operation type |
| IS_EF | NUMERIC(1,0) | 0 | 1 = e-Factura submitted |

`IES_DET` (line items): primary key `PK INTEGER` (auto-generated)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| ID_U | NUMERIC(10,0) | 0 | Line sequence |
| ID_IESIRE | NUMERIC(10,0) | 0 | FK → IESIRI.ID_IESIRE |
| GESTIUNE | VARCHAR(4) | '' | Warehouse code |
| COD | VARCHAR(16) | '' | Article code |
| DENUMIRE | VARCHAR(60) | '' | Article name |
| UM | VARCHAR(5) | '' | Unit of measure |
| TVA_ART | SMALLINT | 0 | VAT rate % |
| CANTITATE | NUMERIC(14,3) | 0 | Quantity |
| PRET_UNITAR | NUMERIC(16,4) | 0 | Unit price ex-VAT |
| VALOARE | NUMERIC(15,2) | 0 | Line value ex-VAT |
| TVA_DED | NUMERIC(15,2) | 0 | VAT amount |
| TOTAL | NUMERIC(15,2) | 0 | Line total inc-VAT |
| CONT | VARCHAR(20) | '' | Account override |
| DISCOUNT | NUMERIC(10,5) | 0 | Discount % |
| PU_TVA | NUMERIC(16,4) | 0 | Unit price inc-VAT |

### 5b. Import File Format — XML

**File name:** `F_<FurnizorCIF>_<NrIesire>_<DataDoc>.xml`

For outbound invoices: place the **company's own CIF** in `<FurnizorCIF>` and the **client's CIF** in `<ClientCIF>`. The routing rule triggers the Iesiri screen.

Structure is identical to the Intrari XML above (section 4b), with roles reversed:

```xml
<FurnizorCIF>RO12345678</FurnizorCIF>  <!-- company's own CIF -->
<ClientCIF>RO98765432</ClientCIF>       <!-- buyer's CIF -->
```

---

## 6. Încasări — Incoming Payments (Receipts)

### 6a. FDB Context

Payments received from clients are recorded via `REGISTRU` (journal entries) linked to `IESIRI` invoices via `NOTE_FACTURI`. There is no dedicated `INCASARI` table — settlements are journal entries on accounts `411x` (debit) / `5311`/`5121` (credit) or similar.

`NOTE_FACTURI`: primary key `PK INTEGER`

| Column | Type | Notes |
|--------|------|-------|
| ID_NOTA | NUMERIC(10,0) | Journal note group ID |
| ID_FACTURA | NUMERIC(10,0) | FK → IESIRI.ID_IESIRE |
| DATA | DATE | Settlement date |
| SUMA | NUMERIC(15,2) | Amount settled |
| TVAINC | NUMERIC(15,2) | VAT portion |
| TVA_P | NUMERIC(5,2) | VAT rate % |
| IS_STORN | SMALLINT | 1 = reversal |

### 6b. Import File Format — XML

**File name:** `I_<DD-MM-YYYY>.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<Incasari>
  <Linie>
    <Data>15.04.2025</Data>
    <Numar>NC-001</Numar>
    <Suma>220.15</Suma>
    <Cont>5311</Cont>
    <ContClient>4111</ContClient>
    <Explicatie>Incasare fact. FACT-001 SC CUMPARATOR EXEMPLU SRL</Explicatie>
    <FacturaID>12345</FacturaID>
    <FacturaNumar>FACT-001</FacturaNumar>
    <CodFiscal>RO98765432</CodFiscal>
    <Moneda>RON</Moneda>
  </Linie>
</Incasari>
```

**Required fields:** `Data`, `Numar`, `Suma`, `Cont`
**Optional:** `ContClient`, `FacturaID`, `FacturaNumar`, `CodFiscal`, `Moneda`, `Explicatie`

---

## 7. Plăți — Outgoing Payments

### 7a. FDB Context

Payments to suppliers are recorded similarly via `REGISTRU` linked to `INTRARI` via `NOTE_FACTURI` / `NOTE_FACTURI_VAL`. The `OP` table stores payment orders (ordine de plata) which are the source document.

`OP` (payment orders): primary key `PK INTEGER`

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| NR | VARCHAR(10) | '' | Payment order number |
| DATA | DATE | NULL | Date |
| SUMA | NUMERIC(15,2) | 0 | Amount |
| FIRMA / ADRESA | VARCHAR(48) | '' | Payer details |
| COD_FISC_1 | VARCHAR(13) | '' | Payer CIF |
| BANCA_1 / IBAN_1 / BIC_1 | VARCHAR | '' | Payer bank details |
| CLIENT / COD_FISC_2 | VARCHAR | '' | Beneficiary name / CIF |
| BANCA_2 / IBAN_2 / BIC_2 | VARCHAR | '' | Beneficiary bank |
| NR_EVID | VARCHAR(23) | '' | Evidence number |
| EXPLICATIE | VARCHAR(68) | '' | Payment description |

### 7b. Import File Format — XML

**File name:** `P_<DD-MM-YYYY>.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<Plati>
  <Linie>
    <Data>15.04.2025</Data>
    <Numar>OP-001</Numar>
    <Suma>1190.00</Suma>
    <Cont>5121</Cont>
    <ContFurnizor>401</ContFurnizor>
    <Explicatie>Plata fact. FACT-F001 SC FURNIZOR EXEMPLU SRL</Explicatie>
    <FacturaID>67890</FacturaID>
    <FacturaNumar>FACT-F001</FacturaNumar>
    <CodFiscal>RO87654321</CodFiscal>
    <Moneda>RON</Moneda>
  </Linie>
</Plati>
```

**Required fields:** `Data`, `Numar`, `Suma`, `Cont`
**Optional:** `ContFurnizor`, `FacturaID`, `FacturaNumar`, `CodFiscal`, `Moneda`, `Explicatie`

---

## Summary: Entity → Table → Import Format Map

| Entity | FDB Table(s) | Import Format | File Pattern | Status |
|--------|-------------|---------------|--------------|--------|
| Terți (Clienți) | CLIENTI | DBF or XML | `Clienti_DD-MM-YYYY_DD-MM-YYYY.dbf` / `CLI_<date>.xml` | Fully mapped |
| Terți (Furnizori) | FURNIZORI | DBF or XML | `Furnizori_DD-MM-YYYY_DD-MM-YYYY.dbf` / `FUR_<date>.xml` | Fully mapped |
| Articole | ARTICOLE | DBF or XML | `Articole_DD-MM-YYYY_DD-MM-YYYY.dbf` / `ART_<date>.xml` | Fully mapped |
| Articole Contabile | REGISTRU + CONTURI | DBF / CSV / XLS | `NC_DD-MM-YYYY_DD-MM-YYYY.dbf` | Fully mapped |
| Intrări | INTRARI + INTR_DET | XML | `F_<ClientCIF>_<Nr>_<Data>.xml` | Fully mapped |
| Ieșiri | IESIRI + IES_DET | XML | `F_<FurnizorCIF>_<Nr>_<Data>.xml` | Fully mapped |
| Încasări | REGISTRU + NOTE_FACTURI | XML | `I_<DD-MM-YYYY>.xml` | Fully mapped |
| Plăți | REGISTRU + OP | XML | `P_<DD-MM-YYYY>.xml` | Fully mapped |

---

## Validation Status

**Phase C deferred.** End-to-end validation (crafting minimal import files and running them through SAGA C 3.0's *Import Date* screen) requires a SAGA C 3.0 installation. SAGA C 3.0 is a Windows-only application not installed on the development machine. This validation is explicitly deferred to Phase 1 `generators-*` tasks, where each generator will include a test fixture that confirms SAGA acceptance.

**Risks from unvalidated assumptions:**

1. **DBF field widths** — The import screen may enforce stricter field widths than the FDB columns. The askit.ro and forum sources suggest slightly narrower limits for import (e.g. `DENUMIRE` truncated to 48 chars in import vs 64 in FDB). The FDB is the authoritative source for internal storage; import file limits may differ. **[MUST VALIDATE in Phase 1]**

2. **DBF field order** — SAGA's parser may require columns in a specific order. Current mapping uses FDB column order as a baseline; the actual DBF template may differ. **[MUST VALIDATE in Phase 1]**

3. **XML encoding declaration** — Tested only from documentation; `UTF-8` is the standard and consistent with `manual.sagasoft.ro` source. WIN1252 applies only to DBF files.

4. **CIF `RO` prefix** — Forum posts confirm both `RO12345678` and `12345678` are accepted by the XML import. DBF import behavior with `RO` prefix is unconfirmed. **[MUST VALIDATE in Phase 1]**

5. **Date string format in XML** — `dd.mm.yyyy` (e.g. `15.04.2025`) from manual examples. ISO format (`2025-04-15`) may also be accepted. **[MUST VALIDATE in Phase 1]**

6. **`TipDeducere` values** — Values `N50` (50% deductible) and `I` (non-deductible) documented from manual. Full enumeration unknown. **[MUST VALIDATE in Phase 1]**

---

## Vendor Documentation Sources

- Official SAGA C manual: https://manual.sagasoft.ro/sagac/topic-76-import-date.html
- Articole Contabile manual page: https://manual.sagasoft.ro/sagac/topic-27-articole-contabile.html
- askit.ro import tutorial: https://askit.ro/solutii/importul-de-date-in-saga-c-3-0/
- SAGA forum — XML facturi: https://forum.sagasoft.ro/viewtopic.php?t=41864
- SAGA forum — import date general: https://www.sagasoft.ro/forum/viewtopic.php?t=5286
- SAGA forum — furnizori/clienti: https://www.sagasoft.ro/forum/viewtopic.php?t=22601

**Note:** SAGA C 3.0 has no published machine-readable schema or OpenAPI-style specification. All import format documentation is from end-user guides and forum posts. The FDB schema is the authoritative ground truth for internal column types and constraints.
