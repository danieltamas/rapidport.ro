"""Canonical support models for Rapidport Phase 1.

Supporting entities that do not belong in partner, article, or journal:
  - Gestiune (warehouse)
  - CashRegister (casa de marcat / casa de numerar)
  - BankAccount (cont bancar)
  - ChartOfAccountsEntry (cont adaugat de utilizator)

Also exports shared Literal aliases:
  - Currency — canonical source for currency codes across all canonical modules
  - VatRate  — string-typed VAT rate percentages

Downstream canonical modules (journal, article, partner) that need Currency or
VatRate SHOULD import from here to avoid divergence. If a parallel worker has
already defined its own copy, reconcile at merge time and keep this file as the
single source. See DONE-canonical-support.md for the duplication risk note.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------------------
# Shared type aliases — exported for reuse across canonical modules
# ---------------------------------------------------------------------------

Currency = Literal["RON", "EUR", "USD", "GBP", "CHF"]
"""ISO 4217 currency codes supported in Phase 1.

This is the canonical source for Currency across all canonical models.
journal.py and article.py should import from here rather than defining their
own Literal, so that adding a new code is a one-file change.
"""

VatRate = Literal["0", "5", "9", "19"]
"""Romanian VAT rate percentages as strings.

String-typed for serialisation stability (Pydantic, JSON, DBF all round-trip
strings without precision loss). At arithmetic time, callers do
``Decimal(vat_rate) / 100``.  SAGA stores these as plain numeric percentages
(19, 9, 5, 0) in both DBF and XML formats — see docs/saga-schemas.md §2a.
"""


# ---------------------------------------------------------------------------
# Gestiune — Warehouse
# ---------------------------------------------------------------------------


class Gestiune(BaseModel):
    """Warehouse (Romanian: gestiune).  Maps to SAGA GESTIUNI.

    ADR-001 §"Warehouse codes" resolution (2026-04-18):
    v1 defaults to **A2** — populate SAGA ``GESTIUNI.COD`` from WinMentor
    ``NGEST.CodGest`` — surfaced as a per-job UI toggle.  The generator reads
    ``code`` and the mapping-profile toggle to decide whether to emit the code
    or leave it blank for SAGA auto-assign.

    ``source_id`` carries ``NGEST.CodInt`` (WinMentor internal integer key) and
    is never written to any SAGA import field; it only appears in the
    reconciliation report (``accounts.csv`` / ``report.json``).
    """

    model_config = ConfigDict(frozen=True, str_strip_whitespace=True, extra="forbid")

    source_id: str
    """WinMentor ``NGEST.CodInt`` — internal warehouse key, not user-visible."""

    code: str
    """WinMentor ``NGEST.CodGest`` — the user-facing warehouse code.
    Passed to SAGA ``GESTIUNI.COD`` (max 4 chars in SAGA) under A2.
    The generator enforces the 4-char limit; the canonical model is
    source-shaped, not target-shaped."""

    name: str
    """Warehouse description (``NGEST.Denumire``)."""

    is_default: bool = False
    """True for the warehouse flagged as the company default in WinMentor."""

    source_metadata: dict[str, object] = Field(default_factory=dict)
    """Unmapped WinMentor fields — zero data loss guarantee."""


# ---------------------------------------------------------------------------
# CashRegister — Casa de numerar
# ---------------------------------------------------------------------------


class CashRegister(BaseModel):
    """Cash register (Romanian: casa de marcat / casa de numerar).

    Maps to SAGA ``CASE``.  In SAGA this entity is company-level cash desk
    bookkeeping (not POS hardware).  A company may have multiple cash desks
    (e.g. one per currency).
    """

    model_config = ConfigDict(frozen=True, str_strip_whitespace=True, extra="forbid")

    source_id: str
    """WinMentor internal cash-desk identifier."""

    name: str
    """Display name, e.g. ``Casa RON Sediu Central``."""

    currency: Currency = "RON"
    """Currency in which the cash register operates."""

    source_metadata: dict[str, object] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# BankAccount — Cont bancar
# ---------------------------------------------------------------------------


class BankAccount(BaseModel):
    """Bank account (Romanian: cont bancar).  Maps to SAGA ``BANCI``.

    IBAN is validated permissively in Phase 1 — see ``_normalize_iban``.
    Strict checksum validation is deferred to Phase 2 or a future ANAF
    integration that confirms account details.
    """

    model_config = ConfigDict(frozen=True, str_strip_whitespace=True, extra="forbid")

    source_id: str
    """WinMentor internal bank-account identifier."""

    name: str
    """Human-readable label, e.g. ``BCR Lei Operativ``."""

    iban: str | None = None
    """IBAN if present.  Normalised to uppercase, no spaces.
    Length must be between 15 and 34 characters (ISO 13616 range).
    No checksum validation — Phase 1 keeps this permissive."""

    bank_name: str | None = None
    """Bank institution name, e.g. ``Banca Comerciala Romana``."""

    currency: Currency = "RON"
    """Currency denomination of the account."""

    source_metadata: dict[str, object] = Field(default_factory=dict)

    @field_validator("iban", mode="after")
    @classmethod
    def _normalize_iban(cls, v: str | None) -> str | None:
        """Upper-case and strip whitespace; validate length and charset."""
        if v is None:
            return None
        normalised = v.upper().replace(" ", "")
        if not normalised.isalnum():
            raise ValueError(
                f"IBAN must contain only alphanumeric characters (got {v!r})"
            )
        if not (15 <= len(normalised) <= 34):
            raise ValueError(
                f"IBAN length must be 15–34 characters (got {len(normalised)} for {v!r})"
            )
        return normalised


# ---------------------------------------------------------------------------
# ChartOfAccountsEntry — Cont adaugat de utilizator
# ---------------------------------------------------------------------------


class ChartOfAccountsEntry(BaseModel):
    """One user-added sub-account in the Romanian Chart of Accounts (Plan de
    Conturi Românesc, governed by OMFP 1802/2014).

    Phase 1 generator does NOT emit the full standard chart — SAGA pre-loads it
    at company creation (see docs/questions-for-dani.md §"CONTURI pre-existence
    assumption").  Only user-added analytical accounts (e.g. ``5121.01``) are
    exported; the generator skips base accounts already present in SAGA.

    Account codes are preserved verbatim per ADR-001 §"Account Plan Codes
    (Plan de Conturi) — Mandatory Carve-Out" — OMFP 1802/2014 mandates fixed
    codes.  The generator writes ``code`` directly to SAGA ``CONTURI.CONT``
    (VARCHAR(20); maximum analytical depth fits within this limit).
    """

    model_config = ConfigDict(frozen=True, str_strip_whitespace=True, extra="forbid")

    code: str = Field(min_length=1)
    """Account code, e.g. ``5121.01``.  Preserved verbatim — OMFP 1802/2014."""

    parent_code: str | None = None
    """Parent account code, e.g. ``5121`` for ``5121.01``."""

    name: str
    """Romanian accounting description of the account."""

    analytical: bool = False
    """True when this is a user-added sub-account (not a base-chart account)."""

    source_metadata: dict[str, object] = Field(default_factory=dict)
