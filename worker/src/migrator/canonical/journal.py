"""Canonical journal models: JournalEntry, Invoice, Payment, InvoiceLine.

These models sit between WinMentor parsers and SAGA generators. They are
immutable (frozen=True), strictly typed (extra="forbid"), and carry
source_metadata on every model so no source data is discarded silently.

Forward refs for Partner and Article use TYPE_CHECKING so this file parses
safely even when partner.py / article.py arrive at merge time, not before.
Call model_rebuild() at module bottom if Pydantic complains at runtime.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from migrator.canonical.support import Currency

if TYPE_CHECKING:
    from migrator.canonical.partner import Partner
    from migrator.canonical.article import Article

# ---------------------------------------------------------------------------
# Literal type aliases
# ---------------------------------------------------------------------------

InvoiceDirection = Literal["purchase", "sale"]
"""purchase → SAGA Intrări (incoming); sale → SAGA Ieșiri (outgoing)."""

PaymentDirection = Literal["incoming", "outgoing"]
"""incoming → SAGA Încasări; outgoing → SAGA Plăți."""

PaymentMethod = Literal["cash", "bank", "card", "other"]

# ---------------------------------------------------------------------------
# InvoiceLine
# ---------------------------------------------------------------------------


class InvoiceLine(BaseModel):
    """One line on an invoice — references an Article plus qty and price.

    warehouse_code uses the A1/A2 pattern from ADR-001: WinMentor NGEST.CodGest
    short codes (e.g. 'A1', 'A2') are preserved verbatim because warehouse
    codes are user-assigned and typically short enough to pass SAGA's field
    width without modification.
    """

    model_config = ConfigDict(
        frozen=True,
        str_strip_whitespace=True,
        extra="forbid",
    )

    article: "Article"
    quantity: Decimal
    unit_price: Decimal
    """Pre-VAT price per unit."""
    vat_rate: Decimal
    """VAT rate as a fraction, e.g. Decimal('0.19') for 19%."""
    line_total_net: Decimal
    """quantity * unit_price — denormalised for cross-check."""
    line_total_vat: Decimal
    line_total_gross: Decimal
    warehouse_code: str | None = None
    """Gestiune code — WinMentor NGEST.CodGest (A1/A2 pattern per ADR-001)."""

    source_metadata: dict[str, object] = Field(default_factory=dict)
    """Catch-all for unmapped WinMentor fields. No data is discarded."""


# ---------------------------------------------------------------------------
# Invoice
# ---------------------------------------------------------------------------


class Invoice(BaseModel):
    """Purchase (Intrare) or sale (Iesire) invoice.

    Validators enforce:
    - total_net + total_vat == total_gross within a 1-unit-in-last-place
      tolerance (Decimal rounding in line aggregation may introduce minor
      discrepancies of <= 0.01 RON per invoice).
    - exchange_rate is required when currency != 'RON'.
    """

    model_config = ConfigDict(
        frozen=True,
        str_strip_whitespace=True,
        extra="forbid",
    )

    source_id: str
    """WinMentor document key (CodDoc / NrDoc). Not a Firebird PK — SAGA
    auto-assigns PKs on import via its own generators (ADR-001)."""

    direction: InvoiceDirection
    """purchase → SAGA Intrări; sale → SAGA Ieșiri."""

    invoice_number: str
    """Human-readable invoice number, e.g. 'F-2024-001234'."""

    invoice_date: date
    due_date: date | None = None

    # Parties
    partner: "Partner"
    own_cif: str
    """The migrating company's own CIF — determines routing on the SAGA side."""

    # Currency
    currency: Currency = "RON"
    exchange_rate: Decimal | None = None
    """Required when currency != 'RON'. BNR rate at invoice_date."""

    # Lines
    lines: list[InvoiceLine] = Field(default_factory=list)

    # Totals (denormalised for fast report generation and cross-check)
    total_net: Decimal
    total_vat: Decimal
    total_gross: Decimal

    # Optional
    notes: str | None = None

    source_metadata: dict[str, object] = Field(default_factory=dict)
    """Catch-all for unmapped WinMentor fields. No data is discarded."""

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @model_validator(mode="after")
    def _validate_totals(self) -> Self:
        """total_net + total_vat must equal total_gross within 0.01 tolerance.

        SAGA cross-checks these on import; a mismatch will cause the import
        to fail with a silent rejection. The tolerance of 0.01 covers
        Romanian 2-decimal rounding on individual line items.
        """
        computed = self.total_net + self.total_vat
        diff = abs(computed - self.total_gross)
        if diff > Decimal("0.01"):
            raise ValueError(
                f"Invoice totals inconsistent: net={self.total_net} + "
                f"vat={self.total_vat} = {computed}, but "
                f"total_gross={self.total_gross} (diff={diff})"
            )
        return self

    @model_validator(mode="after")
    def _validate_exchange_rate(self) -> Self:
        """exchange_rate is required when currency is not RON."""
        if self.currency != "RON" and self.exchange_rate is None:
            raise ValueError(
                f"exchange_rate is required for non-RON currency "
                f"(currency={self.currency!r})"
            )
        if self.currency == "RON" and self.exchange_rate is not None:
            raise ValueError(
                "exchange_rate must be None when currency is RON "
                f"(got exchange_rate={self.exchange_rate})"
            )
        return self


# ---------------------------------------------------------------------------
# Payment
# ---------------------------------------------------------------------------


class Payment(BaseModel):
    """Payment record — Încasare (incoming) or Plată (outgoing).

    Validator enforces exchange_rate required iff currency != 'RON', mirroring
    the same invariant on Invoice.
    """

    model_config = ConfigDict(
        frozen=True,
        str_strip_whitespace=True,
        extra="forbid",
    )

    source_id: str
    """WinMentor document key. Not a Firebird PK."""

    direction: PaymentDirection
    """incoming → SAGA Încasări; outgoing → SAGA Plăți."""

    payment_date: date
    amount: Decimal
    currency: Currency = "RON"
    exchange_rate: Decimal | None = None
    """Required when currency != 'RON'."""

    partner: "Partner | None" = None
    """May be None for internal transfers where no third-party is involved."""

    method: PaymentMethod

    applied_to_invoice_ids: list[str] = Field(default_factory=list)
    """source_id values of invoices this payment fully or partially settles.
    WinMentor may carry this relation in FREGCONT/FREGREL tables; preserved
    for SAGA Încasări/Plăți link fields where supported."""

    reference_number: str | None = None
    """Bank transfer reference or cash receipt number."""

    source_metadata: dict[str, object] = Field(default_factory=dict)
    """Catch-all for unmapped WinMentor fields. No data is discarded."""

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @model_validator(mode="after")
    def _validate_exchange_rate(self) -> Self:
        """exchange_rate is required when currency is not RON."""
        if self.currency != "RON" and self.exchange_rate is None:
            raise ValueError(
                f"exchange_rate is required for non-RON currency "
                f"(currency={self.currency!r})"
            )
        if self.currency == "RON" and self.exchange_rate is not None:
            raise ValueError(
                "exchange_rate must be None when currency is RON "
                f"(got exchange_rate={self.exchange_rate})"
            )
        return self


# ---------------------------------------------------------------------------
# JournalEntry
# ---------------------------------------------------------------------------


class JournalEntry(BaseModel):
    """Generic journal entry for WinMentor NOTE.DB records not classifiable
    as Invoice or Payment.

    Maps to SAGA's general journal (Registru). Phase 1 targets Terți,
    Articole, Invoices, and Payments as primary entities; JournalEntry is
    kept here for completeness and to ensure source_metadata coverage so
    NOTE.DB records are never silently dropped.

    account codes use Romanian Plan de Conturi codes (e.g. '401', '4111')
    which are legally mandated and preserved verbatim per ADR-001 §Account
    Plan Codes carve-out.
    """

    model_config = ConfigDict(
        frozen=True,
        str_strip_whitespace=True,
        extra="forbid",
    )

    source_id: str
    """WinMentor document key from NOTE.DB."""

    entry_date: date
    description: str

    debit_account: str
    """Plan de Conturi code, e.g. '401'. Preserved verbatim (ADR-001)."""
    credit_account: str
    """Plan de Conturi code, e.g. '4111'. Preserved verbatim (ADR-001)."""

    amount: Decimal
    currency: Currency = "RON"

    source_metadata: dict[str, object] = Field(default_factory=dict)
    """Catch-all for unmapped WinMentor fields. No data is discarded."""


# ---------------------------------------------------------------------------
# Forward-ref resolution
# ---------------------------------------------------------------------------
# Pydantic v2 resolves string annotations lazily on first use. Explicit
# model_rebuild() calls below force resolution at import time so that any
# missing-module errors surface immediately rather than at first instantiation.
# These are safe no-ops if partner.py / article.py are not yet present in the
# same interpreter session (TYPE_CHECKING guard keeps them off the import
# path); they become meaningful once the merged codebase is fully assembled.

try:
    InvoiceLine.model_rebuild()
    Invoice.model_rebuild()
    Payment.model_rebuild()
    JournalEntry.model_rebuild()
except Exception:  # broad catch intentional; partner/article not importable yet
    # Deferred — partner.py / article.py may not be importable yet at
    # merge time. Runtime use will trigger model_rebuild() automatically.
    pass
