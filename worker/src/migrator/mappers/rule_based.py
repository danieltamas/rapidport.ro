"""Deterministic WinMentor-field → canonical-target field mapper.

This module provides the hot-path rule lookup that resolves ~80% of known
WinMentor fields to their canonical target without calling Haiku.  Callers
invoke ``ai_assisted.py`` only when :func:`map_field` returns ``None``.

Design constraints:
- Pure function, deterministic, no I/O, no logging.
- Case-insensitive: both *source_table* and *source_field* are uppercased
  before the lookup.
- Max confidence for rule hits is 1.0 (exact, deterministic).
- No imports from ``migrator.canonical.*`` — target_field is a plain string.
- Stdlib only (dataclasses, typing) — no pydantic, no third-party deps.
- Strict mypy + ruff compliant.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Final, Literal

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------

TargetEntity = Literal[
    "partner",
    "article",
    "invoice",
    "payment",
    "journal_entry",
    "gestiune",
    "cash_register",
    "bank_account",
    "chart_of_accounts",
]


@dataclass(frozen=True, slots=True)
class MappingHit:
    """Result of a successful deterministic rule lookup.

    Attributes:
        target_field:  Canonical field name (snake_case string).
        target_entity: Canonical entity the field belongs to.
        confidence:    1.0 for rule-based hits; Haiku may return < 1.0.
        reasoning:     Human-readable note for audit / debug.
    """

    target_field: str
    target_entity: TargetEntity
    confidence: float = 1.0
    reasoning: str = "rule_based"


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

# Regex patterns used by the cross-table heuristic matching stage.
_RE_CIF: Final[re.Pattern[str]] = re.compile(
    r"(COD.*FIS|CIF|CUI)", re.IGNORECASE
)
_RE_SOURCE_ID_SUFFIX: Final[re.Pattern[str]] = re.compile(
    r"(_ID|_INT)$", re.IGNORECASE
)


def _hit(
    target_field: str,
    target_entity: TargetEntity,
    reasoning: str = "rule_based",
) -> MappingHit:
    """Convenience constructor — confidence is always 1.0 for rule hits."""
    return MappingHit(
        target_field=target_field,
        target_entity=target_entity,
        confidence=1.0,
        reasoning=reasoning,
    )


# ---------------------------------------------------------------------------
# Dispatch table — keyed by (SOURCE_TABLE_UPPER, SOURCE_FIELD_UPPER)
# Sorted alphabetically within each source-table block.
# ---------------------------------------------------------------------------

# Type alias for the dispatch key.
_Key = tuple[str, str]

_DISPATCH: Final[dict[_Key, MappingHit]] = {
    # ------------------------------------------------------------------
    # INTRARI — purchase invoice headers (monthly)
    # ------------------------------------------------------------------
    ("INTRARI", "COD"): _hit("partner", "invoice", "FK reference — partner source_id"),
    ("INTRARI", "CODPART"): _hit("partner", "invoice", "FK reference — partner source_id"),
    ("INTRARI", "CURS"): _hit("exchange_rate", "invoice"),
    ("INTRARI", "CURSVALUTAR"): _hit("exchange_rate", "invoice"),
    ("INTRARI", "DATA"): _hit("invoice_date", "invoice"),
    ("INTRARI", "DATAFACTURA"): _hit("invoice_date", "invoice"),
    ("INTRARI", "DATASCADENTA"): _hit("due_date", "invoice"),
    ("INTRARI", "MONEDA"): _hit("currency", "invoice"),
    ("INTRARI", "NET"): _hit("total_net", "invoice"),
    ("INTRARI", "NUMAR"): _hit("invoice_number", "invoice"),
    ("INTRARI", "NRFACTURA"): _hit("invoice_number", "invoice"),
    ("INTRARI", "PARTENER"): _hit("partner", "invoice", "FK reference — partner source_id"),
    ("INTRARI", "SCADENTA"): _hit("due_date", "invoice"),
    ("INTRARI", "TOTAL"): _hit("total_gross", "invoice"),
    ("INTRARI", "TOTALCUTVA"): _hit("total_gross", "invoice"),
    ("INTRARI", "TOTALFARATVA"): _hit("total_net", "invoice"),
    ("INTRARI", "TVA"): _hit("total_vat", "invoice"),
    ("INTRARI", "TOTALTVA"): _hit("total_vat", "invoice"),
    ("INTRARI", "CODMONEDA"): _hit("currency", "invoice"),
    # ------------------------------------------------------------------
    # IESIRI — sales invoice headers (monthly)
    # ------------------------------------------------------------------
    ("IESIRI", "COD"): _hit("partner", "invoice", "FK reference — partner source_id"),
    ("IESIRI", "CODMONEDA"): _hit("currency", "invoice"),
    ("IESIRI", "CODPART"): _hit("partner", "invoice", "FK reference — partner source_id"),
    ("IESIRI", "CURS"): _hit("exchange_rate", "invoice"),
    ("IESIRI", "CURSVALUTAR"): _hit("exchange_rate", "invoice"),
    ("IESIRI", "DATA"): _hit("invoice_date", "invoice"),
    ("IESIRI", "DATAFACTURA"): _hit("invoice_date", "invoice"),
    ("IESIRI", "DATASCADENTA"): _hit("due_date", "invoice"),
    ("IESIRI", "MONEDA"): _hit("currency", "invoice"),
    ("IESIRI", "NET"): _hit("total_net", "invoice"),
    ("IESIRI", "NUMAR"): _hit("invoice_number", "invoice"),
    ("IESIRI", "NRFACTURA"): _hit("invoice_number", "invoice"),
    ("IESIRI", "PARTENER"): _hit("partner", "invoice", "FK reference — partner source_id"),
    ("IESIRI", "SCADENTA"): _hit("due_date", "invoice"),
    ("IESIRI", "TOTAL"): _hit("total_gross", "invoice"),
    ("IESIRI", "TOTALCUTVA"): _hit("total_gross", "invoice"),
    ("IESIRI", "TOTALFARATVA"): _hit("total_net", "invoice"),
    ("IESIRI", "TVA"): _hit("total_vat", "invoice"),
    ("IESIRI", "TOTALTVA"): _hit("total_vat", "invoice"),
    # ------------------------------------------------------------------
    # NART — articles nomenclature (root)
    # ------------------------------------------------------------------
    ("NART", "COD"): _hit("source_id", "article"),
    ("NART", "CODEXTERN"): _hit("cod_extern", "article"),
    ("NART", "CODINT"): _hit("source_id", "article"),
    ("NART", "COTATVA"): _hit("vat_rate", "article"),
    ("NART", "DENUMIRE"): _hit("name", "article"),
    ("NART", "NUME"): _hit("name", "article"),
    ("NART", "TVA"): _hit("vat_rate", "article"),
    ("NART", "UM"): _hit("unit", "article"),
    ("NART", "UNITATEMASURA"): _hit("unit", "article"),
    # ------------------------------------------------------------------
    # NBANCA — company bank accounts (root)
    # ------------------------------------------------------------------
    ("NBANCA", "COD"): _hit("source_id", "bank_account"),
    ("NBANCA", "CODBANCA"): _hit("bank_code", "bank_account"),
    ("NBANCA", "DENUMIRE"): _hit("name", "bank_account"),
    # ------------------------------------------------------------------
    # NCONT — chart of accounts (root; codes preserved verbatim — ADR-001)
    # ------------------------------------------------------------------
    ("NCONT", "COD"): _hit("code", "chart_of_accounts", "account code — preserved verbatim per ADR-001"),
    ("NCONT", "DENUMIRE"): _hit("name", "chart_of_accounts"),
    ("NCONT", "SIMBOL"): _hit("code", "chart_of_accounts", "account code synonym — preserved verbatim per ADR-001"),
    ("NCONT", "CONT"): _hit("code", "chart_of_accounts", "account code synonym — preserved verbatim per ADR-001"),
    # ------------------------------------------------------------------
    # NGEST — warehouses / storage locations (root)
    # ------------------------------------------------------------------
    ("NGEST", "COD"): _hit("code", "gestiune"),
    ("NGEST", "CODGEST"): _hit("code", "gestiune"),
    ("NGEST", "CODINT"): _hit("source_id", "gestiune"),
    ("NGEST", "DENUMIRE"): _hit("name", "gestiune"),
    # ------------------------------------------------------------------
    # NPART — partners nomenclature (root)
    # ------------------------------------------------------------------
    ("NPART", "ADRESA"): _hit("billing_address.street", "partner"),
    ("NPART", "CIF"): _hit("cif", "partner"),
    ("NPART", "COD"): _hit("source_id", "partner"),
    ("NPART", "CODFISCAL"): _hit("cif", "partner"),
    ("NPART", "CODFIS"): _hit("cif", "partner"),
    ("NPART", "CODINT"): _hit("source_id", "partner"),
    ("NPART", "DENUMIRE"): _hit("name", "partner"),
    ("NPART", "EMAIL"): _hit("email", "partner"),
    ("NPART", "NUME"): _hit("name", "partner"),
    ("NPART", "SEDIU"): _hit("billing_address.street", "partner"),
    ("NPART", "TELEFON"): _hit("phone", "partner"),
    # ------------------------------------------------------------------
    # REGISTRU — accounting journal / payments ledger (monthly)
    # Used for both journal_entry and payment entities depending on TipDoc.
    # Field-level rules target the most common intent; callers that need
    # entity disambiguation based on TipDoc value must do so downstream.
    # ------------------------------------------------------------------
    ("REGISTRU", "CONTC"): _hit("credit_account", "journal_entry"),
    ("REGISTRU", "CONTD"): _hit("debit_account", "journal_entry"),
    ("REGISTRU", "DATA"): _hit("payment_date", "payment"),
    ("REGISTRU", "DATAOP"): _hit("payment_date", "payment"),
    ("REGISTRU", "DOCUMENT"): _hit("reference_number", "payment"),
    ("REGISTRU", "EXPLICATIE"): _hit("description", "journal_entry"),
    ("REGISTRU", "FEL"): _hit("method", "payment", "cash/bank/card — heuristic downstream"),
    ("REGISTRU", "NRDOC"): _hit("reference_number", "payment"),
    ("REGISTRU", "SUMA"): _hit("amount", "payment"),
    ("REGISTRU", "TIP"): _hit("method", "payment", "cash/bank/card — heuristic downstream"),
    ("REGISTRU", "VALOARE"): _hit("amount", "payment"),
    # ------------------------------------------------------------------
    # TREZOR — treasury / bank transactions (monthly)
    # ------------------------------------------------------------------
    ("TREZOR", "COD"): _hit("source_id", "payment"),
    ("TREZOR", "CONT"): _hit("account_code", "payment"),
    ("TREZOR", "CURS"): _hit("exchange_rate", "payment"),
    ("TREZOR", "DATA"): _hit("payment_date", "payment"),
    ("TREZOR", "SUMA"): _hit("amount", "payment"),
    ("TREZOR", "VALOARE"): _hit("amount", "payment"),
    # ------------------------------------------------------------------
    # Jurnal — accounting journal entries (monthly; Paradox table name
    # preserves mixed-case "Jurnal" in filenames but we match uppercased)
    # ------------------------------------------------------------------
    ("JURNAL", "COD"): _hit("account_code", "journal_entry"),
    ("JURNAL", "CONTC"): _hit("credit_account", "journal_entry"),
    ("JURNAL", "CONTD"): _hit("debit_account", "journal_entry"),
    ("JURNAL", "DATA"): _hit("entry_date", "journal_entry"),
    ("JURNAL", "SUMA"): _hit("amount", "journal_entry"),
    ("JURNAL", "ZI"): _hit("entry_date", "journal_entry"),
    # ------------------------------------------------------------------
    # NC — accounting notes header (monthly)
    # ------------------------------------------------------------------
    ("NC", "NRDOC"): _hit("reference_number", "journal_entry"),
    ("NC", "PART"): _hit("partner", "journal_entry", "FK reference — partner source_id"),
    ("NC", "ZI"): _hit("entry_date", "journal_entry"),
}

# ---------------------------------------------------------------------------
# Cross-table heuristic rules (pattern-based, applied when no exact match)
# ---------------------------------------------------------------------------

# Patterns that identify CIF-like fields regardless of table.
_CIF_PATTERNS: Final[list[re.Pattern[str]]] = [
    re.compile(r"COD.{0,3}FIS", re.IGNORECASE),  # CodFis, CodFiscal, Cod_Fis*
    re.compile(r"\bCIF\b", re.IGNORECASE),
    re.compile(r"\bCUI\b", re.IGNORECASE),
]


def _is_cif_field(field_upper: str) -> bool:
    """Return True if the field name pattern strongly implies a CIF/CUI."""
    for pat in _CIF_PATTERNS:
        if pat.search(field_upper):
            return True
    return False


def _is_name_field(field_upper: str) -> bool:
    """Return True if the field is clearly a name/description field."""
    return field_upper in {"DENUMIRE", "NUME"}


def _is_source_id_field(field_upper: str) -> bool:
    """Return True if the field looks like a primary-key carry-over."""
    return bool(_RE_SOURCE_ID_SUFFIX.search(field_upper))


# Mapping of WinMentor table → canonical entity for heuristic fallthrough.
_TABLE_ENTITY: Final[dict[str, TargetEntity]] = {
    "NPART": "partner",
    "NPARTB": "partner",
    "NPARTCF": "partner",
    "NPARTD": "partner",
    "NPARTTR": "partner",
    "NPARTX": "partner",
    "NART": "article",
    "NARTAMB": "article",
    "NARTCLI": "article",
    "NARTDC": "article",
    "NARTDF": "article",
    "NARTFURN": "article",
    "INTRARI": "invoice",
    "INTRARI1": "invoice",
    "INTRARI2": "invoice",
    "IESIRI": "invoice",
    "IESIRI1": "invoice",
    "IESIRI2": "invoice",
    "IESIRI3": "invoice",
    "REGISTRU": "payment",
    "TREZOR": "payment",
    "TREZOR1": "payment",
    "TREZOR2": "payment",
    "JURNAL": "journal_entry",
    "JURNAL1": "journal_entry",
    "JURNAL2": "journal_entry",
    "NC": "journal_entry",
    "NC1": "journal_entry",
    "NGEST": "gestiune",
    "NCONT": "chart_of_accounts",
    "NBANCA": "bank_account",
    "CASH": "cash_register",
    "CASH1": "cash_register",
    "CASH2": "cash_register",
}


def _heuristic_lookup(
    table_upper: str, field_upper: str
) -> MappingHit | None:
    """Apply cross-table heuristic rules when no exact dispatch hit exists.

    Rules applied in order:
    1. CIF-pattern field in any partner-like table → partner.cif
    2. DENUMIRE / NUME in any known table → <entity>.name
    3. Fields ending _ID or _INT in any known table → <entity>.source_id

    Returns None if no heuristic applies — caller should send to Haiku.
    """
    entity = _TABLE_ENTITY.get(table_upper)
    if entity is None:
        return None

    if _is_cif_field(field_upper) and entity == "partner":
        return _hit("cif", "partner", "heuristic: CIF-pattern field name")

    if _is_name_field(field_upper):
        return _hit("name", entity, "heuristic: Denumire/Nume field")

    if _is_source_id_field(field_upper):
        return _hit("source_id", entity, "heuristic: _ID/_INT suffix")

    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def map_field(
    source_table: str,
    source_field: str,
) -> MappingHit | None:
    """Return a :class:`MappingHit` if a deterministic rule matches, else None.

    Lookup is case-insensitive — both *source_table* and *source_field* are
    uppercased before the dispatch table is consulted.

    Callers invoke Haiku (``ai_assisted.py``) only when this returns ``None``.

    Args:
        source_table: WinMentor table name (e.g. ``"NPART"``, ``"INTRARI"``).
        source_field: WinMentor column/field name (e.g. ``"CodFiscal"``).

    Returns:
        A frozen :class:`MappingHit` if a rule matches, otherwise ``None``.
    """
    table_upper = source_table.upper()
    field_upper = source_field.upper()

    # 1. Exact dispatch table lookup (highest priority).
    hit = _DISPATCH.get((table_upper, field_upper))
    if hit is not None:
        return hit

    # 2. Cross-table heuristic patterns.
    return _heuristic_lookup(table_upper, field_upper)
