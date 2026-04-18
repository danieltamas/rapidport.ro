"""Canonical Partner and Address models for the WinMentor → SAGA migration pipeline.

Maps to SAGA CLIENTI / FURNIZORI tables (§1a, §1b in docs/saga-schemas.md).
Follows ADR-001 Fresh-Target strategy: source_id preserved for reconciliation
CSV only; SAGA COD is left blank in generated import files.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Address(BaseModel):
    """Physical address — street, city, county, country, postal code.

    Maps to SAGA CLIENTI/FURNIZORI columns: ADRESA, LOCALITATE, JUDET,
    TARA, COD_POST.
    """

    model_config = ConfigDict(
        frozen=True,
        str_strip_whitespace=True,
        extra="forbid",
    )

    street: str | None = Field(
        default=None,
        description="Street address — maps to SAGA ADRESA (VARCHAR 100).",
    )
    city: str | None = Field(
        default=None,
        description="City / locality — maps to SAGA LOCALITATE (VARCHAR 46).",
    )
    county: str | None = Field(
        default=None,
        description=(
            "Romanian județ. CLIENTI: full name; FURNIZORI: 2-letter code. "
            "Generator adapts at emit time."
        ),
    )
    country: str = Field(
        default="RO",
        description="ISO 3166-1 alpha-2 country code — maps to SAGA TARA (CHAR 2).",
        min_length=2,
        max_length=2,
    )
    postal_code: str | None = Field(
        default=None,
        description="Postal code — maps to SAGA COD_POST (VARCHAR 8).",
    )


class Partner(BaseModel):
    """Customer or supplier — maps to SAGA CLIENTI / FURNIZORI.

    ADR-001 (Fresh Target): source_id carries WinMentor NPART.Cod as a
    non-PK metadata field. The SAGA generator leaves COD blank so SAGA
    auto-assigns on import. source_id is only emitted in the reconciliation
    partners.csv file included in the job output ZIP.

    CIF format: stored without the 'RO' prefix (matching SAGA's COD_FISCAL
    column which never stores the prefix). The cif field_validator strips
    any leading 'RO' or 'ro' at assignment time to guarantee this invariant.

    For partners without a CIF (Romanian natural persons, certain foreign
    partners), cnp carries the personal fiscal code (CNP, 13 digits for
    Romanian nationals). Both cif and cnp may be None for foreign partners
    where the fiscal code is unknown — the generator will flag these records
    in report.json as requiring manual review in SAGA.
    """

    model_config = ConfigDict(
        frozen=True,
        str_strip_whitespace=True,
        extra="forbid",
    )

    # --- Identity ---

    source_id: str = Field(
        ...,
        min_length=1,
        description=(
            "WinMentor NPART.Cod. Required, non-empty. Used only in "
            "partners.csv — never written to SAGA COD (ADR-001 Fresh Target)."
        ),
    )
    cif: str | None = Field(
        default=None,
        description=(
            "Romanian CIF/CUI — stored WITHOUT 'RO' prefix (matches SAGA "
            "COD_FISCAL). Length 2-10 after stripping. None for foreign "
            "partners or Romanian natural persons who use cnp instead."
        ),
    )
    cnp: str | None = Field(
        default=None,
        description=(
            "Romanian personal fiscal code (CNP, 13 digits). For natural "
            "persons without a CUI. Emitted as-is into SAGA COD_FISCAL."
        ),
    )
    name: str = Field(
        ...,
        min_length=1,
        description="Company or person name — maps to SAGA DENUMIRE (VARCHAR 64).",
    )

    # --- Classification ---

    partner_type: Literal["customer", "supplier", "both"] = Field(
        ...,
        description="CLIENTI, FURNIZORI, or both. No default — must be explicit.",
    )
    is_foreign: bool = Field(
        default=False,
        description=(
            "Non-Romanian VAT ID or registered abroad. Generator sets "
            "SAGA TIP_TERT='E' and TARA to the partner's country code."
        ),
    )

    # --- Address ---

    billing_address: Address | None = Field(
        default=None,
        description="Primary billing address — maps to SAGA ADRESA/LOCALITATE/JUDET.",
    )
    shipping_address: Address | None = Field(
        default=None,
        description=(
            "Shipping address when different from billing. Not a SAGA "
            "import field — preserved via source_metadata for no data loss."
        ),
    )

    # --- Contact (enriches UI; optional) ---

    email: str | None = Field(
        default=None,
        description="Contact email — SAGA EMAIL. Hashed in logs (SHA-256, 8-char prefix).",
    )
    phone: str | None = Field(
        default=None,
        description="Contact phone number — maps to SAGA TEL (VARCHAR 20).",
    )

    # --- Catch-all for unmapped WinMentor fields ---

    source_metadata: dict[str, object] = Field(
        default_factory=dict,
        description=(
            "All WinMentor NPART fields not mapped above (ADR-001 no-data-loss "
            "guarantee). E.g. BANCA, CONT_BANCA, ZS, BI_*, NPARTCF rows. "
            "Never emitted in SAGA import files."
        ),
    )

    # --- Validators ---

    @field_validator("cif", mode="before")
    @classmethod
    def strip_ro_prefix(cls, v: object) -> object:
        """Strip the 'RO' prefix from CIF before storage.

        SAGA COD_FISCAL never stores the 'RO' prefix (docs/saga-schemas.md §1a).
        Accepts None, empty string (normalised to None), and any case variant
        ('RO', 'ro', 'Ro').
        """
        if v is None:
            return None
        if not isinstance(v, str):
            return v
        stripped = v.strip()
        if not stripped:
            return None
        upper = stripped.upper()
        if upper.startswith("RO"):
            # Only strip if what remains looks like a numeric CIF, not a
            # foreign VAT number that happens to start with the letters "RO"
            # (e.g. Romanian-registered foreign entity). Heuristic: if the
            # next character after "RO" is a digit, it is the RO prefix.
            remainder = stripped[2:]
            if remainder and remainder[0].isdigit():
                stripped = remainder
        return stripped

    @field_validator("cif", mode="after")
    @classmethod
    def validate_cif_length(cls, v: str | None) -> str | None:
        """Enforce CIF length 2-10 characters after prefix stripping."""
        if v is None:
            return None
        if not (2 <= len(v) <= 10):
            raise ValueError(
                f"CIF must be 2-10 characters after stripping the 'RO' prefix; "
                f"got {len(v)!r} characters: {v!r}"
            )
        return v
