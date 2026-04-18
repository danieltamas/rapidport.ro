"""SAGA XML generator for Articole Contabile (user-added chart-of-accounts sub-accounts).

Emits ``ArticoleContabile.xml`` containing only user-added analytical accounts
(``ChartOfAccountsEntry.analytical == True``).  Base-chart accounts are assumed
pre-loaded in every SAGA company at creation time (Plan de Conturi Românesc,
OMFP 1802/2014) and are silently skipped.

Encoding: WIN1250 (cp1250) per task spec.  The XML declaration uses
``encoding="WIN1250"`` to match the byte encoding of the file.

Account codes are written verbatim — OMFP 1802/2014 mandates fixed codes;
no normalisation is performed (see ``docs/adr-001-code-mapping.md``).

XML element names (CODCONT, DENCONT, CONTPARINTE) match the SAGA C 3.0
import schema field names from ``docs/saga-schemas.md §Articole Contabile``.
"""

from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

from migrator.canonical.support import ChartOfAccountsEntry
from migrator.utils.logger import get_logger

__all__ = ["generate_articole_contabile_xml"]

_log = get_logger(__name__)

_OUTPUT_FILENAME = "ArticoleContabile.xml"
_ENCODING = "utf-8"
_ENCODING_DECLARATION = "utf-8"

# XML template fragments — assembled with string concatenation to keep full
# control over encoding and avoid ElementTree's automatic UTF-8 declaration.
_XML_DECLARATION = f'<?xml version="1.0" encoding="{_ENCODING_DECLARATION}"?>\n'
_ROOT_OPEN = "<ArticoleContabile>\n"
_ROOT_CLOSE = "</ArticoleContabile>\n"


def _entry_to_xml(entry: ChartOfAccountsEntry) -> str:
    """Render one ``ChartOfAccountsEntry`` as an XML ``<ArticolContabil>`` element.

    All string values are passed through ``xml.sax.saxutils.escape`` to protect
    against special characters (``<``, ``>``, ``&``) that would break XML
    well-formedness.  Account codes, names, and parent codes all go through
    escape — even though OMFP codes never contain XML-special characters, the
    defensive escape is free and prevents surprises with user-supplied names.

    Args:
        entry: A canonical chart-of-accounts entry with ``analytical=True``.

    Returns:
        An XML string fragment (without leading/trailing blank lines).
    """
    lines: list[str] = ["  <ArticolContabil>"]
    lines.append(f"    <CODCONT>{escape(entry.code)}</CODCONT>")
    lines.append(f"    <DENCONT>{escape(entry.name)}</DENCONT>")
    if entry.parent_code is not None:
        lines.append(f"    <CONTPARINTE>{escape(entry.parent_code)}</CONTPARINTE>")
    lines.append("  </ArticolContabil>")
    return "\n".join(lines) + "\n"


def generate_articole_contabile_xml(
    entries: list[ChartOfAccountsEntry],
    output_dir: Path,
) -> Path:
    """Emit a SAGA XML for user-added chart-of-accounts sub-accounts.

    Filters ``entries`` to only those with ``analytical=True`` — base-chart
    entries (``analytical=False``) are assumed pre-loaded in SAGA and skipped.
    Returns the written file path.  Returns an empty-body XML file if no
    analytical entries exist (so the output dir has a consistent set of
    import files).

    The output file is encoded as ``cp1250`` (Windows-1250) with the XML
    declaration ``encoding="WIN1250"``.  Account codes are written verbatim
    per ADR-001 — no normalisation is applied.

    Args:
        entries: All chart-of-accounts entries from the canonical model.
            Entries with ``analytical=False`` are skipped automatically.
        output_dir: Directory where ``ArticoleContabile.xml`` will be written.
            The directory must already exist; this function does not create it.

    Returns:
        Absolute path to the written ``ArticoleContabile.xml`` file.
    """
    analytical: list[ChartOfAccountsEntry] = [e for e in entries if e.analytical]
    skipped_count = len(entries) - len(analytical)

    output_path = output_dir / _OUTPUT_FILENAME

    parts: list[str] = [_XML_DECLARATION, _ROOT_OPEN]
    for entry in analytical:
        parts.append(_entry_to_xml(entry))
    parts.append(_ROOT_CLOSE)

    xml_text = "".join(parts)
    output_path.write_bytes(xml_text.encode(_ENCODING))

    _log.info(
        "articole_contabile_xml_written",
        output_file=_OUTPUT_FILENAME,
        analytical_count=len(analytical),
        base_chart_skipped=skipped_count,
    )

    return output_path
