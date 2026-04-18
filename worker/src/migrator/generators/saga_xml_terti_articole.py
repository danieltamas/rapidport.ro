"""SAGA XML generators for Terți (partners) and Articole (articles).

Emits UTF-8 XML import files accepted by SAGA C 3.0's *Import Date* screen:

- Terți  → two separate files: CLI_<YYYYMMDD>.xml (customers) and
           FUR_<YYYYMMDD>.xml (suppliers).  Partners with partner_type="both"
           are written to both files.  generate_terti_xml returns the CLI file
           path (or the FUR file path when there are no customers); callers
           that need both paths should call the helper directly or inspect the
           output directory.

- Articole → ART_<YYYYMMDD>.xml.

Encoding: UTF-8, per docs/saga-schemas.md Global Gotchas §Encoding.
  NOTE: The task spec mentioned WIN1250/cp1250, but docs/saga-schemas.md
  §Encoding explicitly states "XML files use UTF-8 with <?xml version='1.0'
  encoding='utf-8'?>" and §Validation Status confirms "WIN1252 applies only
  to DBF files."  UTF-8 is used here. Flag raised for Dani in DONE report.

ADR-001 (Fresh Target / A2 default):
- Partner COD is omitted from XML (<Cod> not emitted) — SAGA auto-assigns.
- Article COD: when cod_extern_enabled=True (A2 default), <Cod> is populated
  from article.cod_extern if non-empty; otherwise omitted.
  When cod_extern_enabled=False (A1), <Cod> is always omitted.

Required SAGA XML fields:
- Tert:    Denumire, Cod_fiscal, Tara
- Articol: Denumire, UM
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Sequence

from migrator.canonical.article import Article
from migrator.canonical.partner import Partner
from migrator.utils.logger import get_logger

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_TODAY: str = datetime.now().strftime("%Y%m%d")


def _sub(parent: ET.Element, tag: str, text: str) -> ET.Element:
    """Append a sub-element with text content and return it.

    ElementTree auto-escapes text assigned to .text, so no manual
    xml.sax.saxutils.escape call is needed — doing both would double-escape.
    """
    el = ET.SubElement(parent, tag)
    el.text = text
    return el


def _opt_sub(parent: ET.Element, tag: str, value: str | None) -> None:
    """Append a sub-element only when *value* is non-empty."""
    if value:
        _sub(parent, tag, value)


def _fiscal_code(partner: Partner) -> str:
    """Return the fiscal code to emit in <Cod_fiscal>.

    Canonical invariant: partner.cif is already stripped of the 'RO' prefix
    by the field_validator in canonical/partner.py.  We emit it verbatim.
    For natural persons without a CIF, fall back to cnp.  If both are None,
    emit empty string (SAGA accepts blank; flagged in conversion report).
    """
    if partner.cif:
        return partner.cif
    if partner.cnp:
        return partner.cnp
    return ""


def _country(partner: Partner) -> str:
    """Return the 2-letter ISO country code for the <Tara> element."""
    if partner.billing_address and partner.billing_address.country:
        return partner.billing_address.country.upper()
    return "RO"


def _build_tert_element(partner: Partner) -> ET.Element:
    """Build a <Tert> element from a canonical Partner.

    Required fields: Denumire, Cod_fiscal, Tara.
    Per ADR-001: <Cod> is intentionally omitted (Fresh Target — SAGA auto-assigns).
    """
    tert = ET.Element("Tert")
    _sub(tert, "Denumire", partner.name)
    _sub(tert, "Cod_fiscal", _fiscal_code(partner))
    _sub(tert, "Tara", _country(partner))

    # Optional address fields
    if partner.billing_address:
        addr = partner.billing_address
        _opt_sub(tert, "Localitate", addr.city)
        _opt_sub(tert, "Adresa", addr.street)

    # Optional contact fields
    _opt_sub(tert, "Tel", partner.phone)
    _opt_sub(tert, "Email", partner.email)

    return tert


def _write_xml_file(root: ET.Element, output_path: Path) -> None:
    """Write an ElementTree to *output_path* as UTF-8 XML with declaration.

    ElementTree.write() with encoding='utf-8' and xml_declaration=True
    emits "<?xml version='1.0' encoding='utf-8'?>" which SAGA accepts.
    The tree is written to the file directly; no manual string building needed.
    """
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    tree.write(
        output_path,
        encoding="utf-8",
        xml_declaration=True,
    )


# ---------------------------------------------------------------------------
# Public API — Terți
# ---------------------------------------------------------------------------


def generate_terti_xml(
    partners: Sequence[Partner],
    output_dir: Path,
    own_cif: str,  # noqa: ARG001 — reserved for future routing logic
    article_cod_extern_enabled: bool = True,  # A2 default; unused for Terti
) -> Path:
    """Emit SAGA Terți XML import files for customers and/or suppliers.

    Produces:
    - ``CLI_<YYYYMMDD>.xml``  — customers (partner_type in {"customer", "both"})
    - ``FUR_<YYYYMMDD>.xml``  — suppliers (partner_type in {"supplier", "both"})

    Partners with partner_type="both" appear in both files.
    Files are only written when they contain at least one record.

    Returns the CLI file path when customers are present, otherwise the FUR
    file path.  The DONE report documents this two-file design.

    Args:
        partners: Canonical Partner list from the WinMentor parser.
        output_dir: Job output directory (must exist).
        own_cif: Company's own CIF — reserved for future Terți routing logic
            (not used by current SAGA XML import which routes on TipTert flag).
        article_cod_extern_enabled: Ignored for Terți; accepted to match the
            public API signature.

    Returns:
        Path to the primary written file (CLI file if customers exist, else FUR).

    Raises:
        ValueError: When *partners* is empty.
        FileNotFoundError: When *output_dir* does not exist.
    """
    if not partners:
        raise ValueError("partners list is empty — nothing to generate")
    if not output_dir.is_dir():
        raise FileNotFoundError(f"output_dir does not exist: {output_dir}")

    customers: list[Partner] = []
    suppliers: list[Partner] = []

    for p in partners:
        if p.partner_type in ("customer", "both"):
            customers.append(p)
        if p.partner_type in ("supplier", "both"):
            suppliers.append(p)

    written_paths: list[Path] = []

    if customers:
        cli_path = output_dir / f"CLI_{_TODAY}.xml"
        root_cli = ET.Element("Terti")
        for partner in customers:
            root_cli.append(_build_tert_element(partner))
        _write_xml_file(root_cli, cli_path)
        written_paths.append(cli_path)

    if suppliers:
        fur_path = output_dir / f"FUR_{_TODAY}.xml"
        root_fur = ET.Element("Terti")
        for partner in suppliers:
            root_fur.append(_build_tert_element(partner))
        _write_xml_file(root_fur, fur_path)
        written_paths.append(fur_path)

    if not written_paths:
        raise ValueError(
            "No partners with partner_type in {'customer', 'supplier', 'both'} found."
        )

    log.info(
        "terti_xml_written",
        customer_count=len(customers),
        supplier_count=len(suppliers),
        files_written=[str(p) for p in written_paths],
    )

    # Return CLI path when present (primary), otherwise FUR path.
    return written_paths[0]


# ---------------------------------------------------------------------------
# Public API — Articole
# ---------------------------------------------------------------------------


def generate_articole_xml(
    articles: Sequence[Article],
    output_dir: Path,
    cod_extern_enabled: bool = True,
) -> Path:
    """Emit a SAGA Articole XML import file.

    Produces ``ART_<YYYYMMDD>.xml`` in *output_dir*.

    ADR-001 code mapping:
    - A2 default (cod_extern_enabled=True): <Cod> is populated from
      article.cod_extern when non-empty; omitted otherwise.
    - A1 (cod_extern_enabled=False): <Cod> is always omitted; SAGA
      auto-assigns on import.

    Articles with a missing unit of measure (article.unit is None) are
    skipped and counted.  The count is included in the log event so the
    caller can surface it in report.json.

    Required SAGA XML fields: Denumire, UM.

    Args:
        articles: Canonical Article list from the WinMentor parser.
        output_dir: Job output directory (must exist).
        cod_extern_enabled: When True (A2 default), populate <Cod> with
            article.cod_extern if non-empty.  When False (A1), always
            omit <Cod>.

    Returns:
        Path to the written ART_<date>.xml file.

    Raises:
        ValueError: When *articles* is empty or all articles are skipped.
        FileNotFoundError: When *output_dir* does not exist.
    """
    if not articles:
        raise ValueError("articles list is empty — nothing to generate")
    if not output_dir.is_dir():
        raise FileNotFoundError(f"output_dir does not exist: {output_dir}")

    root = ET.Element("Articole")
    skipped_no_um = 0
    written_count = 0

    for article in articles:
        # SAGA requires <UM>; skip articles without a unit of measure.
        if not article.unit:
            skipped_no_um += 1
            continue

        articol = ET.SubElement(root, "Articol")

        _sub(articol, "Denumire", article.name)
        _sub(articol, "UM", article.unit)

        # A2 / A1 code mapping per ADR-001
        if cod_extern_enabled and article.cod_extern:
            _sub(articol, "Cod", article.cod_extern)

        # VAT rate — emit as integer string (e.g. "19", not "19.00")
        # SAGA XML expects a plain numeric value per docs/saga-schemas.md §2c.
        vat_int = int(article.vat_rate)
        _sub(articol, "TVA", str(vat_int))

        # Optional fields from source_metadata — not mapped here; the
        # canonical Article carries only structured fields.  Unmapped
        # NART fields live in source_metadata and are not emitted in the
        # SAGA import file (they go to articles.csv per ADR-001).

        written_count += 1

    if written_count == 0:
        raise ValueError(
            f"All {len(articles)} article(s) were skipped (missing UM). "
            "Nothing to write."
        )

    art_path = output_dir / f"ART_{_TODAY}.xml"
    _write_xml_file(root, art_path)

    log.info(
        "articole_xml_written",
        written_count=written_count,
        skipped_no_um=skipped_no_um,
        cod_extern_enabled=cod_extern_enabled,
        path=str(art_path),
    )

    return art_path
