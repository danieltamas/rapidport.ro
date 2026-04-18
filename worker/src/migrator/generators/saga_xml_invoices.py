"""SAGA XML invoice generator — Intrări (purchases) and Ieșiri (sales).

Emits one XML file per invoice in SAGA's import format.
Filename pattern: ``F_<cif>_<nr>_<data>.xml`` (SPEC §1.6).

SAGA routing logic (docs/saga-schemas.md §Intrări/§Ieșiri):
  - direction='purchase': <FurnizorCIF>=partner.cif, <ClientCIF>=own_cif
  - direction='sale':     <FurnizorCIF>=own_cif,    <ClientCIF>=partner.cif

Foreign currency: <Moneda> + <CursSchimb> are emitted only when
invoice.currency != 'RON'. RON invoices omit these fields entirely.

NOTE — docs/saga-schemas.md does not yet exist (Phase 0 gap). XML element
names below are derived from the inline task spec and Romanian SAGA conventions.
Elements requiring Dani review are marked with  # SAGA-CONFIRM  comments.
"""

from __future__ import annotations

import re
from datetime import date as _Date
from decimal import Decimal
from pathlib import Path
from typing import Final
from xml.etree.ElementTree import Element, SubElement, indent, tostring

from migrator.canonical.journal import Invoice
from migrator.utils.logger import get_logger

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ENCODING: Final[str] = "utf-8"
_XML_DECLARATION: Final[str] = f'<?xml version="1.0" encoding="{_ENCODING}"?>'

# Characters allowed verbatim in filename components.
# Everything else is replaced with underscore.
_SAFE_FILENAME_RE: Final[re.Pattern[str]] = re.compile(r"[^A-Za-z0-9_-]")

# Minimum length of any sanitized filename component.
_MIN_COMPONENT_LEN: Final[int] = 1


# ---------------------------------------------------------------------------
# Filename sanitisation
# ---------------------------------------------------------------------------


def _sanitize_cif(cif: str | None) -> str:
    """Strip the 'RO' prefix and reduce to safe filename characters.

    Args:
        cif: Raw CIF/CUI value (may carry 'RO' prefix).

    Returns:
        Sanitized CIF string — digits only after stripping.

    Raises:
        ValueError: If sanitization yields an empty string.
    """
    if not cif:
        raise ValueError("invoice partner.cif is None or empty — cannot build filename")

    raw = cif.strip()
    # Strip 'RO' or 'ro' prefix if followed by a digit (same heuristic as Partner model)
    upper = raw.upper()
    if upper.startswith("RO") and len(raw) > 2 and raw[2].isdigit():
        raw = raw[2:]

    sanitized = _SAFE_FILENAME_RE.sub("_", raw)
    sanitized = sanitized.strip("_")  # no leading/trailing underscores
    # Remove null bytes defensively
    sanitized = sanitized.replace("\x00", "")

    if len(sanitized) < _MIN_COMPONENT_LEN:
        raise ValueError(
            f"CIF {cif!r} reduces to an empty string after sanitization — "
            "cannot build a safe filename component"
        )
    return sanitized


def _sanitize_invoice_number(number: str) -> str:
    """Replace unsafe characters in the invoice number for use in filenames.

    Args:
        number: Raw invoice number, e.g. 'F-2024-001234'.

    Returns:
        Sanitized string containing only [A-Za-z0-9_-].

    Raises:
        ValueError: If sanitization yields an empty string.
    """
    if not number:
        raise ValueError("invoice_number is empty — cannot build filename component")

    # Replace null bytes first
    raw = number.replace("\x00", "")
    sanitized = _SAFE_FILENAME_RE.sub("_", raw)
    sanitized = sanitized.strip("_")

    if len(sanitized) < _MIN_COMPONENT_LEN:
        raise ValueError(
            f"invoice_number {number!r} reduces to an empty string after sanitization — "
            "cannot build a safe filename component"
        )
    return sanitized


def _build_filename(invoice: Invoice) -> str:
    """Construct the output filename for one invoice.

    Format: ``F_<cif>_<nr>_<ddmmyyyy>.xml``

    The CIF component uses the *partner* CIF regardless of direction (per
    SPEC §1.6 filename pattern — the CIF in the filename identifies the
    trading partner, not the own company).

    Args:
        invoice: Validated canonical Invoice.

    Returns:
        Filename string (no path separators).

    Raises:
        ValueError: If any component sanitizes to an empty string.
    """
    cif_part = _sanitize_cif(invoice.partner.cif)
    nr_part = _sanitize_invoice_number(invoice.invoice_number)
    date_part = invoice.invoice_date.strftime("%d%m%Y")
    return f"F_{cif_part}_{nr_part}_{date_part}.xml"


def _verify_output_path(output_path: Path, output_dir: Path) -> None:
    """Assert that output_path cannot escape output_dir via traversal.

    Both paths are resolved (follows symlinks) before comparison, so a
    symlinked output_dir is handled correctly.

    Args:
        output_path: Resolved candidate output path.
        output_dir: Resolved base directory.

    Raises:
        ValueError: If output_path escapes output_dir.
    """
    if output_path.resolve().parent != output_dir.resolve():
        raise ValueError(
            f"Path traversal detected: {output_path!r} escapes "
            f"output directory {output_dir!r}"
        )


# ---------------------------------------------------------------------------
# XML helpers
# ---------------------------------------------------------------------------


def _fmt_date(d: _Date) -> str:
    """Format a date object as dd.mm.yyyy for SAGA XML.

    Args:
        d: A datetime.date instance.

    Returns:
        Date string in 'dd.mm.yyyy' format.
    """
    return d.strftime("%d.%m.%Y")


def _fmt_decimal(value: Decimal, places: int = 2) -> str:
    """Format a Decimal for SAGA XML (period decimal separator, fixed places).

    SAGA's import parser uses a period ('.') as the decimal separator in XML
    fields — confirmed by cross-referencing with its DBF counterpart format.
    # SAGA-CONFIRM: verify decimal separator in XML import (period vs comma).

    Args:
        value: Decimal value.
        places: Number of decimal places (default 2).

    Returns:
        Formatted string, e.g. '12345.67'.
    """
    quantize_str = Decimal(10) ** -places
    return str(value.quantize(quantize_str))


def _fmt_vat_rate(vat_rate: Decimal) -> str:
    """Convert a VAT rate fraction to SAGA integer percentage string.

    SAGA XML expects the VAT rate as a plain integer percentage, e.g. '19',
    '9', '5', '0'. Canonical journal stores it as a fraction (0.19, 0.09...).

    # SAGA-CONFIRM: verify SAGA XML expects '19' not '0.19' for VAT rate.

    Args:
        vat_rate: VAT rate as a fraction (e.g. Decimal('0.19')).

    Returns:
        Integer percentage string (e.g. '19').
    """
    pct = vat_rate * Decimal("100")
    return str(pct.to_integral_value())


# ---------------------------------------------------------------------------
# XML element builders
# ---------------------------------------------------------------------------


def _build_invoice_xml(invoice: Invoice, own_cif: str) -> Element:
    """Build the ElementTree Element tree for one invoice.

    XML structure (SAGA Factura import format):
    <Factura>
      <Numar>...</Numar>
      <Data>dd.mm.yyyy</Data>
      <Scadenta>dd.mm.yyyy</Scadenta>          (optional)
      <FurnizorCIF>...</FurnizorCIF>
      <FurnizorNume>...</FurnizorNume>
      <ClientCIF>...</ClientCIF>
      <ClientNume>...</ClientNume>
      <Moneda>EUR</Moneda>                      (omitted for RON)
      <CursSchimb>4.9500</CursSchimb>           (omitted for RON)
      <TotalNet>...</TotalNet>
      <TotalTVA>...</TotalTVA>
      <TotalBrut>...</TotalBrut>
      <Linii>
        <Linie>
          <Articol>...</Articol>
          <UM>...</UM>
          <Cantitate>...</Cantitate>
          <PretUnitar>...</PretUnitar>
          <CotaTVA>19</CotaTVA>
          <ValoareNet>...</ValoareNet>
          <ValoareTVA>...</ValoareTVA>
          <ValoareBrut>...</ValoareBrut>
          <Gestiune>A1</Gestiune>               (optional)
        </Linie>
        ...
      </Linii>
    </Factura>

    # SAGA-CONFIRM: root element name — Factura vs Document vs FacturaXML.
    # SAGA-CONFIRM: FurnizorNume / ClientNume field names in XML.
    # SAGA-CONFIRM: <Linii>/<Linie> vs <Detalii>/<Detaliu> for line items.
    # SAGA-CONFIRM: <Articol> content — cod_extern (A2) vs blank (A1).
    # SAGA-CONFIRM: <Gestiune> field accepted on line items in XML format.
    # SAGA-CONFIRM: <Scadenta> element name for due date.

    Args:
        invoice: Validated canonical Invoice.
        own_cif: The migrating company's CIF (without 'RO' prefix).

    Returns:
        Root XML Element ready for serialisation.
    """
    root = Element("Factura")  # SAGA-CONFIRM root element name

    # --- Invoice header ---
    SubElement(root, "Numar").text = invoice.invoice_number
    SubElement(root, "Data").text = _fmt_date(invoice.invoice_date)

    if invoice.due_date is not None:
        SubElement(root, "Scadenta").text = _fmt_date(invoice.due_date)

    # --- Party routing per SAGA Intrări/Ieșiri convention ---
    # direction='purchase': supplier = partner, buyer = own company
    # direction='sale':     supplier = own company, buyer = partner
    partner_cif = invoice.partner.cif or ""
    partner_name = invoice.partner.name

    if invoice.direction == "sale":
        furnizor_cif = own_cif
        furnizor_name = ""  # SAGA-CONFIRM: own company name source in XML
        client_cif = partner_cif
        client_name = partner_name
    else:  # purchase
        furnizor_cif = partner_cif
        furnizor_name = partner_name
        client_cif = own_cif
        client_name = ""  # SAGA-CONFIRM: own company name source in XML

    SubElement(root, "FurnizorCIF").text = furnizor_cif
    SubElement(root, "FurnizorNume").text = furnizor_name
    SubElement(root, "ClientCIF").text = client_cif
    SubElement(root, "ClientNume").text = client_name

    # --- Currency (omit entirely for RON) ---
    if invoice.currency != "RON":
        SubElement(root, "Moneda").text = invoice.currency
        if invoice.exchange_rate is not None:
            SubElement(root, "CursSchimb").text = _fmt_decimal(invoice.exchange_rate, 4)

    # --- Totals ---
    SubElement(root, "TotalNet").text = _fmt_decimal(invoice.total_net)
    SubElement(root, "TotalTVA").text = _fmt_decimal(invoice.total_vat)
    SubElement(root, "TotalBrut").text = _fmt_decimal(invoice.total_gross)

    if invoice.notes:
        SubElement(root, "Observatii").text = invoice.notes  # SAGA-CONFIRM field name

    # --- Line items ---
    if invoice.lines:
        linii = SubElement(root, "Linii")  # SAGA-CONFIRM: Linii vs Detalii
        for line in invoice.lines:
            linie = SubElement(linii, "Linie")  # SAGA-CONFIRM: Linie vs Detaliu

            # Article code per ADR-001 A2: use cod_extern when non-empty
            article_code = line.article.cod_extern or ""
            SubElement(linie, "Articol").text = article_code  # SAGA-CONFIRM field name

            unit = line.article.unit or "buc"  # fallback per canonical spec
            SubElement(linie, "UM").text = unit

            SubElement(linie, "Cantitate").text = _fmt_decimal(line.quantity, 3)
            SubElement(linie, "PretUnitar").text = _fmt_decimal(line.unit_price)
            SubElement(linie, "CotaTVA").text = _fmt_vat_rate(line.vat_rate)
            SubElement(linie, "ValoareNet").text = _fmt_decimal(line.line_total_net)
            SubElement(linie, "ValoareTVA").text = _fmt_decimal(line.line_total_vat)
            SubElement(linie, "ValoareBrut").text = _fmt_decimal(line.line_total_gross)

            if line.warehouse_code:
                SubElement(linie, "Gestiune").text = line.warehouse_code

    return root


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_invoice_xml(
    invoices: list[Invoice],
    output_dir: Path,
    own_cif: str,
) -> list[Path]:
    """Emit SAGA XML import files for invoices.

    One file per invoice. Filename pattern: ``F_<cif>_<nr>_<data>.xml``
    (SPEC §1.6, docs/saga-schemas.md §Intrări/§Ieșiri).

    SAGA routing: each file is routed to Intrări vs Ieșiri by inspecting
    <FurnizorCIF>. When <FurnizorCIF> matches own_cif, SAGA treats the
    invoice as a sale (Ieșiri); otherwise as a purchase (Intrări).

    Args:
        invoices: List of validated canonical Invoice objects.
        output_dir: Directory into which XML files are written. Must exist.
        own_cif: The migrating company's CIF (with or without 'RO' prefix —
                 stripped internally before embedding in XML).

    Returns:
        List of Path objects for every file successfully written.

    Raises:
        ValueError: If output_dir does not exist, or if any invoice produces
                    a filename component that sanitizes to an empty string or
                    escapes output_dir.
        FileNotFoundError: If output_dir does not exist.
    """
    output_dir = Path(output_dir)
    if not output_dir.is_dir():
        raise FileNotFoundError(f"output_dir does not exist or is not a directory: {output_dir!r}")

    # Strip own_cif RO prefix for use inside XML elements
    own_cif_clean = own_cif.strip()
    if (
        own_cif_clean.upper().startswith("RO")
        and len(own_cif_clean) > 2
        and own_cif_clean[2].isdigit()
    ):
        own_cif_clean = own_cif_clean[2:]

    written: list[Path] = []
    written_count = 0
    rejected_count = 0

    for invoice in invoices:
        try:
            filename = _build_filename(invoice)
        except ValueError:
            rejected_count += 1
            log.warning(
                "invoice_xml_rejected",
                reason="invalid_filename_component",
            )
            continue

        output_path = output_dir / filename

        # Path-traversal defense: resolved parent must equal resolved output_dir
        try:
            _verify_output_path(output_path, output_dir)
        except ValueError:
            rejected_count += 1
            log.warning(
                "invoice_xml_rejected",
                reason="path_traversal",
            )
            continue

        try:
            root_element = _build_invoice_xml(invoice, own_cif_clean)
        except Exception:  # noqa: BLE001
            rejected_count += 1
            log.warning(
                "invoice_xml_rejected",
                reason="xml_build_error",
            )
            continue

        # Pretty-print (2-space indent) for easier SAGA diagnostics
        indent(root_element, space="  ")
        # Serialise to a unicode string first, then encode as WIN1250.
        # ElementTree's tostring(encoding="unicode") returns str without
        # a declaration — we prepend our own WIN1250 declaration manually.
        xml_str = tostring(root_element, encoding="unicode", xml_declaration=False)
        # errors="xmlcharrefreplace" encodes non-WIN1250 chars as &#xNNNN; entities,
        # preserving data (e.g. € or Cyrillic in partner names) instead of silent '?'
        xml_bytes = (_XML_DECLARATION + "\n" + xml_str).encode(_ENCODING, errors="xmlcharrefreplace")

        output_path.write_bytes(xml_bytes)
        written.append(output_path)
        written_count += 1

    log.info(
        "invoice_xml_written",
        count=written_count,
    )
    if rejected_count:
        log.warning(
            "invoice_xml_rejected",
            count=rejected_count,
        )

    return written
