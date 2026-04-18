"""Canonical Article model — products/services/materials for SAGA ARTICOLE import."""
from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# Romanian VAT rates (percentages) as defined by Fiscal Code and ANAF norms.
# Coduri TVA aplicabile în România per Codul Fiscal (Legea 227/2015):
#   0  — scutit cu drept de deducere (zero-rated, e.g. exports)
#   5  — cotă redusă (e.g. manuale, acces la muzee, locuințe sociale)
#   9  — cotă redusă (e.g. alimente, medicamente, cazare)
#   19 — cotă standard
VALID_VAT_RATES: frozenset[Decimal] = frozenset(
    {Decimal("0"), Decimal("5"), Decimal("9"), Decimal("19")}
)

# SAGA ART_TIP codes map roughly to these four categories.
# "materials" covers raw materials (materii prime, materiale consumabile)
# tracked separately from finished-goods "product" stock.
ArticleType = Literal["product", "service", "materials", "other"]


class Article(BaseModel):
    """
    Product / service / materials — maps to SAGA ARTICOLE.

    Source: WinMentor NART.DB
    Target: SAGA ARTICOLE table (DBF or XML import format per docs/saga-schemas.md §2)

    Code mapping (ADR-001 A2 decision):
    - ``source_id``   — WinMentor integer Cod, emitted only in articles.csv reconciliation
                        file; NEVER written to SAGA ARTICOLE.COD.
    - ``cod_extern``  — WinMentor CodExtern (barcode / supplier SKU); populated into SAGA
                        ARTICOLE.COD when non-empty under the A2 default.  The per-job UI
                        toggle in the mapping-validation phase can override to A1 (leave
                        ARTICOLE.COD blank and let SAGA auto-assign).
    """

    model_config = ConfigDict(
        frozen=True,
        str_strip_whitespace=True,
        extra="forbid",
    )

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    source_id: str = Field(
        ...,
        description="WinMentor NART.Cod (integer stored as string). "
        "Used only for reconciliation report (articles.csv); never written to SAGA.",
        min_length=1,
    )
    cod_extern: str | None = Field(
        default=None,
        description="WinMentor NART.CodExtern — barcode, supplier SKU, or other "
        "external reference.  Under ADR-001 A2 this value is written to "
        "SAGA ARTICOLE.COD when non-empty (max 16 chars per ARTICOLE.COD "
        "VARCHAR(16)); the per-job toggle may override to A1 (blank).",
    )
    name: str = Field(..., description="SAGA ARTICOLE.DENUMIRE (max 60 chars).", min_length=1)

    # ------------------------------------------------------------------
    # Classification
    # ------------------------------------------------------------------

    article_type: ArticleType = Field(
        ...,
        description="Broad SAGA ART_TIP category. "
        "product=marfă/produs finit, service=serviciu, "
        "materials=materii prime/materiale, other=nespecificat.",
    )
    is_stock: bool = Field(
        ...,
        description="True when the item tracks inventory (stoc). "
        "Services are typically False; products and materials True.",
    )
    unit: str | None = Field(
        default=None,
        description="Unit of measure (SAGA ARTICOLE.UM, max 5 chars). "
        "Examples: buc, kg, l, m, mp, mc, top, set. "
        "Required by SAGA import format (DENUMIRE + UM are the only mandatory fields); "
        "None only when source data is absent — generator must handle the fallback.",
    )

    # ------------------------------------------------------------------
    # Tax
    # ------------------------------------------------------------------

    vat_rate: Decimal = Field(
        ...,
        description="Romanian VAT rate applied to this article. "
        "Must be a member of VALID_VAT_RATES: {0, 5, 9, 19}. "
        "Stored as Decimal for exact arithmetic — never float.",
    )
    account_code: str | None = Field(
        default=None,
        description="Plan de Conturi entry code if explicitly set for this article "
        "(e.g. '371', '371.01').  Optional; format validated by the SAGA article "
        "generator at conversion time, not here.",
    )

    # ------------------------------------------------------------------
    # Catch-all
    # ------------------------------------------------------------------

    source_metadata: dict[str, object] = Field(
        default_factory=dict,
        description="Unmapped WinMentor NART fields preserved verbatim. "
        "Prevents data loss; surfaced in report.json for review.",
    )

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------

    @field_validator("vat_rate", mode="before")
    @classmethod
    def _coerce_and_validate_vat_rate(cls, v: object) -> Decimal:
        """Accept int/str/Decimal; reject anything outside VALID_VAT_RATES."""
        if not isinstance(v, Decimal):
            try:
                v = Decimal(str(v))
            except Exception as exc:
                raise ValueError(
                    f"vat_rate must be numeric; got {v!r}"
                ) from exc
        if v not in VALID_VAT_RATES:
            raise ValueError(
                f"vat_rate {v!r} is not a valid Romanian VAT rate. "
                f"Allowed values: {sorted(VALID_VAT_RATES)}"
            )
        return v
