"""
Table registry for Phase 1 parser scope.

Authoritative, static mapping of WinMentor Paradox table filenames to their
classification, scope, parser kind, and SAGA migration target.

Source of truth: docs/winmentor-tables.md §"Phase 1 Parser Scope".

NOTE — ~67 table discrepancy: The task brief mentions ~67 tables (20 CORE
NOMENCLATURE + 47 TRANSACTIONAL in the full inventory). The doc's "Phase 1
Parser Scope" section lists 28 tables as the authoritative active scope. This
registry matches the doc's explicit scope list. The full classification counts
include tables not in Phase 1 scope (AVANS*, PONTAJ*, LOHN*, DECONTR*,
REGLEAS*, NIR2/NIR21/NIRSER, IESIRI2/3/4, INTRARI2, JURNAL1/2, RESTANT*,
SURSA*, TRANSF3/4, TREZOR2, NARTAMB, NARTDC, NARTDF, NPARTD, NPARTTR,
NPERSACT, NPERSCV, NSUBUNIT). Phase 1 gate verification should determine if
the full 67-table set needs to be wired in a future iteration.

NOTE — foreign-currency invoices: Dani confirmed (questions-for-dani.md) that
foreign-currency invoice support is in v1 scope. INTRD/INTRD_DET referenced
there are SAGA *target* tables, not WinMentor source tables. Foreign-currency
purchase invoices exist in the same INTRARI.DB/INTRARI1.DB tables as RON
invoices (fields include Moneda/Curs). No phantom source tables needed; the
parser for INTRARI.DB must handle multi-currency rows.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class Classification(StrEnum):
    CORE_NOMENCLATURE = "core_nomenclature"
    TRANSACTIONAL = "transactional"
    LOOKUP = "lookup"


class ParserKind(StrEnum):
    STANDARD = "standard"
    FALLBACK = "fallback"


class Scope(StrEnum):
    ROOT = "root"
    MONTHLY = "monthly"
    BOTH = "both"


@dataclass(frozen=True, slots=True)
class TableEntry:
    filename: str  # uppercase, no path — e.g. "NPART.DB"
    classification: Classification
    scope: Scope
    parser: ParserKind
    purpose: str  # short English description
    saga_target: str | None = None  # e.g. "CLIENTI", "ARTICOLE"; None for LOOKUP


# ---------------------------------------------------------------------------
# Registry — sorted alphabetically by filename key
# Source: docs/winmentor-tables.md §"Phase 1 Parser Scope"
# ---------------------------------------------------------------------------

TABLE_REGISTRY: dict[str, TableEntry] = {
    # ------------------------------------------------------------------
    # CORE NOMENCLATURE — root-folder master data (12 active tables)
    # ------------------------------------------------------------------
    "NART.DB": TableEntry(
        filename="NART.DB",
        classification=Classification.CORE_NOMENCLATURE,
        scope=Scope.ROOT,
        parser=ParserKind.STANDARD,
        purpose="Articles catalog — items, services, assets; primary product catalog",
        saga_target="Articole",
    ),
    "NARTCLI.DB": TableEntry(
        filename="NARTCLI.DB",
        classification=Classification.CORE_NOMENCLATURE,
        scope=Scope.ROOT,
        parser=ParserKind.STANDARD,
        purpose="Article overrides per client (custom names/codes)",
        saga_target="Articole",
    ),
    "NARTFURN.DB": TableEntry(
        filename="NARTFURN.DB",
        classification=Classification.CORE_NOMENCLATURE,
        scope=Scope.ROOT,
        parser=ParserKind.STANDARD,
        purpose="Article overrides per supplier (supplier codes)",
        saga_target="Articole",
    ),
    "NBANCA.DB": TableEntry(
        filename="NBANCA.DB",
        classification=Classification.CORE_NOMENCLATURE,
        scope=Scope.ROOT,
        parser=ParserKind.STANDARD,
        purpose="Company bank accounts",
        saga_target="Conturi bancare",
    ),
    "NCONT.DB": TableEntry(
        filename="NCONT.DB",
        classification=Classification.CORE_NOMENCLATURE,
        scope=Scope.ROOT,
        parser=ParserKind.STANDARD,
        purpose=(
            "Chart of accounts root instance (552 rows); "
            "monthly copies in CACHE are running-balance snapshots only"
        ),
        saga_target="CONTURI",
    ),
    "NGEST.DB": TableEntry(
        filename="NGEST.DB",
        classification=Classification.CORE_NOMENCLATURE,
        scope=Scope.ROOT,
        parser=ParserKind.STANDARD,
        purpose="Warehouse/storage locations (gestiuni)",
        saga_target="Gestiuni",
    ),
    "NPART.DB": TableEntry(
        filename="NPART.DB",
        classification=Classification.CORE_NOMENCLATURE,
        scope=Scope.ROOT,
        parser=ParserKind.STANDARD,
        purpose="Partners nomenclature — clients and suppliers",
        saga_target="Terți",
    ),
    "NPARTB.DB": TableEntry(
        filename="NPARTB.DB",
        classification=Classification.CORE_NOMENCLATURE,
        scope=Scope.ROOT,
        parser=ParserKind.STANDARD,
        purpose="Partner bank accounts",
        saga_target="Terți",
    ),
    "NPARTCF.DB": TableEntry(
        filename="NPARTCF.DB",
        classification=Classification.CORE_NOMENCLATURE,
        scope=Scope.ROOT,
        parser=ParserKind.STANDARD,
        purpose="Partner fiscal codes (multi-CIF support)",
        saga_target="Terți",
    ),
    "NPARTX.DB": TableEntry(
        filename="NPARTX.DB",
        classification=Classification.CORE_NOMENCLATURE,
        scope=Scope.ROOT,
        parser=ParserKind.STANDARD,
        purpose="Partner VAT-on-collection flag",
        saga_target="Terți",
    ),
    "NPERS.DB": TableEntry(
        filename="NPERS.DB",
        classification=Classification.CORE_NOMENCLATURE,
        scope=Scope.ROOT,
        parser=ParserKind.STANDARD,
        purpose="Personnel/employees master",
        saga_target="Angajați",
    ),
    "NSEDSEC.DB": TableEntry(
        filename="NSEDSEC.DB",
        classification=Classification.CORE_NOMENCLATURE,
        scope=Scope.ROOT,
        parser=ParserKind.STANDARD,
        purpose="Company secondary locations (sedii secundare)",
        saga_target="Terți",
    ),
    # ------------------------------------------------------------------
    # TRANSACTIONAL — monthly-folder documents (16 active tables)
    # ------------------------------------------------------------------
    "COMPENS.DB": TableEntry(
        filename="COMPENS.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Compensation documents header (compensări)",
        saga_target="Compensări",
    ),
    "COMPENS1.DB": TableEntry(
        filename="COMPENS1.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Compensation document detail lines",
        saga_target="Compensări",
    ),
    "IESIRI.DB": TableEntry(
        filename="IESIRI.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Sales invoice headers (ieșiri)",
        saga_target="Ieșiri",
    ),
    "IESIRI1.DB": TableEntry(
        filename="IESIRI1.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Sales invoice lines",
        saga_target="Ieșiri",
    ),
    "INTRARI.DB": TableEntry(
        filename="INTRARI.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose=(
            "Purchase invoice headers (intrări); "
            "includes foreign-currency rows (Moneda/Curs fields)"
        ),
        saga_target="Intrări",
    ),
    "INTRARI1.DB": TableEntry(
        filename="INTRARI1.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Purchase invoice lines",
        saga_target="Intrări",
    ),
    "JURNAL.DB": TableEntry(
        filename="JURNAL.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Accounting journal entries (jurnal contabil)",
        saga_target="Note contabile",
    ),
    "NC.DB": TableEntry(
        filename="NC.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Accounting notes header (note contabile)",
        saga_target="Note contabile",
    ),
    "NC1.DB": TableEntry(
        filename="NC1.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Accounting note debit/credit lines",
        saga_target="Note contabile",
    ),
    "NIR.DB": TableEntry(
        filename="NIR.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Goods received notes header (NIR — notă de intrare-recepție)",
        saga_target="Intrări",
    ),
    "NIR1.DB": TableEntry(
        filename="NIR1.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="NIR line details",
        saga_target="Intrări",
    ),
    "TRANSF.DB": TableEntry(
        filename="TRANSF.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Internal transfers header (transferuri interne)",
        saga_target="Transferuri",
    ),
    "TRANSF1.DB": TableEntry(
        filename="TRANSF1.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Transfer lines",
        saga_target="Transferuri",
    ),
    "TRANSF2.DB": TableEntry(
        filename="TRANSF2.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Transfer payment info",
        saga_target="Transferuri",
    ),
    "TREZOR.DB": TableEntry(
        filename="TREZOR.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Treasury/bank account transactions header",
        saga_target="Încasări/Plăți",
    ),
    "TREZOR1.DB": TableEntry(
        filename="TREZOR1.DB",
        classification=Classification.TRANSACTIONAL,
        scope=Scope.MONTHLY,
        parser=ParserKind.STANDARD,
        purpose="Treasury transaction lines",
        saga_target="Încasări/Plăți",
    ),
}

# ---------------------------------------------------------------------------
# Derived sets
# ---------------------------------------------------------------------------

MONTHLY_TABLES: frozenset[str] = frozenset(
    e.filename
    for e in TABLE_REGISTRY.values()
    if e.scope in (Scope.MONTHLY, Scope.BOTH)
)


# ---------------------------------------------------------------------------
# Convenience accessors
# ---------------------------------------------------------------------------


def lookup(filename: str) -> TableEntry | None:
    """Return the entry for *filename*, case-insensitive, or None if not in scope."""
    return TABLE_REGISTRY.get(filename.upper())


def by_classification(c: Classification) -> list[TableEntry]:
    """Return all entries with the given classification, in filename order."""
    return sorted(
        (e for e in TABLE_REGISTRY.values() if e.classification == c),
        key=lambda e: e.filename,
    )


def by_scope(s: Scope) -> list[TableEntry]:
    """Return all entries with the given scope, in filename order."""
    return sorted(
        (e for e in TABLE_REGISTRY.values() if e.scope == s),
        key=lambda e: e.filename,
    )


# ---------------------------------------------------------------------------
# Smoke tests (run with: python -m migrator.parsers.registry)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    total = len(TABLE_REGISTRY)
    print(f"Registry entries: {total}")
    assert total == 28, f"Expected 28 entries, got {total}"

    core = by_classification(Classification.CORE_NOMENCLATURE)
    assert len(core) == 12, f"Expected 12 CORE_NOMENCLATURE, got {len(core)}"

    txn = by_classification(Classification.TRANSACTIONAL)
    assert len(txn) == 16, f"Expected 16 TRANSACTIONAL, got {len(txn)}"

    monthly = by_scope(Scope.MONTHLY)
    assert len(monthly) == 16, f"Expected 16 MONTHLY-scoped, got {len(monthly)}"

    root = by_scope(Scope.ROOT)
    assert len(root) == 12, f"Expected 12 ROOT-scoped, got {len(root)}"

    assert len(MONTHLY_TABLES) == 16, (
        f"MONTHLY_TABLES frozenset: expected 16, got {len(MONTHLY_TABLES)}"
    )

    # Lookup — case-insensitive
    assert lookup("npart.db") is not None
    assert lookup("NPART.DB") is not None
    assert lookup("Jurnal.DB") is not None  # mixed-case on disk, UPPERCASE key
    assert lookup("MISSING.DB") is None

    # Jurnal.DB must be keyed as JURNAL.DB (canonical UPPERCASE)
    assert "JURNAL.DB" in TABLE_REGISTRY
    assert TABLE_REGISTRY["JURNAL.DB"].filename == "JURNAL.DB"

    # All entries have saga_target populated (LOOKUP entries would have None)
    for entry in TABLE_REGISTRY.values():
        if entry.classification != Classification.LOOKUP:
            assert entry.saga_target is not None, (
                f"{entry.filename} missing saga_target"
            )

    # No fallback parsers — all standard per winmentor-tables.md §Non-Standard Parser Flags
    assert all(e.parser == ParserKind.STANDARD for e in TABLE_REGISTRY.values())

    print("All assertions passed.")
