"""PDF conversion report writer for WinMentor → SAGA migrations.

Generates ``report.pdf`` (Romanian) inside the job's output directory.
Uses ReportLab Platypus for layout.

PARALLEL-WORKER COORDINATION POINT
------------------------------------
This module defines ``ReportInput`` and ``ReportIssue`` locally rather than
importing them from ``conversion_report_json`` because both worker tasks run
in parallel and the sibling file may not exist at type-check time.

At merge, whichever task lands second must:
  1. Delete the local ``ReportInput`` / ``ReportIssue`` definitions here.
  2. Replace them with: ``from migrator.reports.conversion_report_json import ReportInput, ReportIssue``
  3. Run ``ruff check`` + ``mypy`` again to verify the import resolves cleanly.

FONT STRATEGY — DIACRITIC SUPPORT
-----------------------------------
Romanian diacritics (ă â î ș ț / Ă Â Î Ș Ț) require a Unicode-capable font.
ReportLab's built-in Latin-1 fonts (Helvetica, Times-Roman, Courier) do NOT
cover these code points; they will render as '?' or be silently dropped.

This module falls back to Helvetica when no suitable TTF is present.
The ``report_pdf_font_missing`` event is emitted at PDF-write time as a
persistent reminder.

BLOCKER FOR PRODUCTION ROLLOUT:
  Ship ``DejaVuSans.ttf`` + ``DejaVuSans-Bold.ttf`` under
  ``worker/src/migrator/reports/fonts/`` and update ``_register_fonts()``
  to register them via::

      from reportlab.pdfbase.ttfonts import TTFont
      from reportlab.pdfbase import pdfmetrics
      import importlib.resources as pkg_resources

      ref = pkg_resources.files("migrator.reports.fonts")
      with pkg_resources.as_file(ref.joinpath("DejaVuSans.ttf")) as p:
          pdfmetrics.registerFont(TTFont("DejaVuSans", str(p)))
      with pkg_resources.as_file(ref.joinpath("DejaVuSans-Bold.ttf")) as p:
          pdfmetrics.registerFont(TTFont("DejaVuSans-Bold", str(p)))

  Then set ``BODY_FONT = "DejaVuSans"`` and ``BOLD_FONT = "DejaVuSans-Bold"``
  below.

  DejaVu fonts are free (Bitstream Vera licence), size ~750 KB each.
  Until shipped, output is Latin-1 only — diacritics render incorrectly.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from migrator.utils.logger import get_logger

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Font configuration
# ---------------------------------------------------------------------------
# Switch to "DejaVuSans" / "DejaVuSans-Bold" once fonts are shipped.
# See module docstring for registration code.
BODY_FONT: str = "Helvetica"
BOLD_FONT: str = "Helvetica-Bold"
MONO_FONT: str = "Courier"

_FONT_MISSING: bool = True  # Set to False after successful TTF registration


# ---------------------------------------------------------------------------
# PARALLEL-WORKER COORDINATION POINT: local model definitions
# ---------------------------------------------------------------------------
# Remove these and re-point the import once conversion_report_json.py lands.


class EntitySummary(BaseModel):
    """Counts for a single entity type."""

    total: int
    converted: int
    skipped: int
    errors: int


class AiUsage(BaseModel):
    """Aggregated AI usage for the conversion run."""

    haiku_calls: int
    tokens_in: int
    tokens_out: int
    cost_usd: float


class ReportIssue(BaseModel):
    """A single issue or warning recorded during conversion."""

    entity: str
    source_id: str
    severity: str  # "error" | "warning" | "info"
    message: str
    details: str = ""


class ReportInput(BaseModel):
    """Full input required to render either the JSON or the PDF report."""

    worker_version: str
    canonical_schema_version: str
    source_software: str
    source_version_detected: str
    target_software: str
    target_version: str
    started_at: datetime
    completed_at: datetime
    ai_usage: AiUsage
    summary: dict[str, EntitySummary]
    issues: list[ReportIssue]


# ---------------------------------------------------------------------------
# Style helpers
# ---------------------------------------------------------------------------


def _style(
    name: str,
    *,
    font: str = BODY_FONT,
    size: int = 10,
    leading: int = 14,
    alignment: int = TA_LEFT,
    space_before: float = 0,
    space_after: float = 6,
    text_color: Any = colors.black,
    bold: bool = False,
) -> ParagraphStyle:
    """Return a ParagraphStyle instance with the given settings."""
    return ParagraphStyle(
        name=name,
        fontName=BOLD_FONT if bold else font,
        fontSize=size,
        leading=leading,
        alignment=alignment,
        spaceBefore=space_before,
        spaceAfter=space_after,
        textColor=text_color,
    )


STYLE_HEADING = _style(
    "Heading", font=BOLD_FONT, size=14, leading=18, space_before=12, space_after=8
)
STYLE_SUBHEADING = _style(
    "Subheading", font=BOLD_FONT, size=11, leading=15, space_before=8, space_after=4
)
STYLE_BODY = _style("Body", size=10, leading=14)
STYLE_BODY_BOLD = _style("BodyBold", size=10, leading=14, bold=True)
STYLE_FOOTER = _style("Footer", size=9, leading=12, alignment=TA_CENTER, text_color=colors.grey)
STYLE_NOTICE = _style(
    "Notice",
    font=BOLD_FONT,
    size=10,
    leading=14,
    space_before=8,
    space_after=8,
    text_color=colors.HexColor("#8B0000"),
)
STYLE_CENTER = _style("Center", size=10, leading=14, alignment=TA_CENTER)
STYLE_COVER_TITLE = _style(
    "CoverTitle",
    font=BOLD_FONT,
    size=18,
    leading=24,
    alignment=TA_CENTER,
    space_before=48,
    space_after=12,
)
STYLE_COVER_SUB = _style(
    "CoverSub",
    size=12,
    leading=16,
    alignment=TA_CENTER,
    space_before=4,
    space_after=4,
    text_color=colors.grey,
)

_TABLE_STYLE = TableStyle(
    [
        ("FONTNAME", (0, 0), (-1, 0), BOLD_FONT),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, 1), (-1, -1), BODY_FONT),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F2F2F2")),
        ("ROWBACKGROUND", (0, 1), (-1, -1), [colors.white, colors.white]),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
)

_NOTICE_TABLE_STYLE = TableStyle(
    [
        ("BOX", (0, 0), (-1, -1), 1.5, colors.HexColor("#8B0000")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFF5F5")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]
)


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------


def _fmt_date(dt: datetime) -> str:
    """Format datetime as Romanian locale string."""
    return dt.strftime("%d.%m.%Y %H:%M:%S UTC")


def _fmt_cost(cost_usd: float) -> str:
    """Format USD cost with Romanian decimal separator."""
    value = Decimal(str(cost_usd)).quantize(Decimal("0.0001"))
    parts = str(value).split(".")
    integer_part = parts[0]
    decimal_part = parts[1] if len(parts) > 1 else "00"
    return f"{integer_part},{decimal_part} USD"


def _entity_label(key: str) -> str:
    """Return a Romanian display label for a canonical entity type."""
    labels: dict[str, str] = {
        "partners": "Parteneri",
        "articles": "Articole",
        "journal_entries": "Inregistrari contabile",
        "gestiuni": "Gestiuni",
        "bank_accounts": "Conturi bancare",
        "cash_registers": "Case de marcat",
    }
    return labels.get(key, key.replace("_", " ").title())


def _severity_label(severity: str) -> str:
    """Return a Romanian label for a severity level."""
    labels: dict[str, str] = {
        "error": "Eroare",
        "warning": "Avertisment",
        "info": "Informatie",
    }
    return labels.get(severity.lower(), severity)


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------


def _build_cover(data: ReportInput) -> list[Any]:
    """Build the cover page elements."""
    source = data.source_software.upper()
    target = data.target_software.upper()
    return [
        Paragraph(f"Raport conversie {source} \u2192 {target}", STYLE_COVER_TITLE),
        Paragraph("Generat automat de Rapidport", STYLE_COVER_SUB),
        Spacer(1, 0.5 * cm),
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CCCCCC")),
        Spacer(1, 0.5 * cm),
    ]


def _build_metadata(data: ReportInput) -> list[Any]:
    """Build the metadata information block."""
    rows = [
        ["Identificator job", data.worker_version],
        ["Versiune worker", data.worker_version],
        ["Versiune schema canonica", data.canonical_schema_version],
        ["Software sursa", f"{data.source_software} {data.source_version_detected}"],
        ["Software destinatie", f"{data.target_software} {data.target_version}"],
        ["Inceput la", _fmt_date(data.started_at)],
        ["Finalizat la", _fmt_date(data.completed_at)],
    ]
    elements: list[Any] = [
        Paragraph("Informatii generale", STYLE_SUBHEADING),
    ]
    meta_style = TableStyle(
        [
            ("FONTNAME", (0, 0), (0, -1), BOLD_FONT),
            ("FONTNAME", (1, 0), (1, -1), MONO_FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]
    )
    table = Table(rows, colWidths=[5 * cm, 11 * cm], style=meta_style)
    elements.append(table)
    elements.append(Spacer(1, 0.4 * cm))
    return elements


def _build_summary(data: ReportInput) -> list[Any]:
    """Build the entity summary table."""
    elements: list[Any] = [
        Paragraph("Rezumat conversie", STYLE_SUBHEADING),
    ]
    if not data.summary:
        elements.append(Paragraph("Nu exista entitati de raportat.", STYLE_BODY))
        elements.append(Spacer(1, 0.4 * cm))
        return elements

    header = ["Entitate", "Total", "Convertite", "Sarite", "Erori"]
    rows: list[list[Any]] = [header]
    for key, counts in data.summary.items():
        rows.append(
            [
                _entity_label(key),
                str(counts.total),
                str(counts.converted),
                str(counts.skipped),
                str(counts.errors),
            ]
        )

    col_w = [6 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm, 2.5 * cm]
    table = Table(rows, colWidths=col_w, style=_TABLE_STYLE)
    elements.append(table)
    elements.append(Spacer(1, 0.4 * cm))
    return elements


def _build_ai_usage(data: ReportInput) -> list[Any]:
    """Build the AI usage section."""
    ai = data.ai_usage
    elements: list[Any] = [
        Paragraph("Utilizare inteligenta artificiala (Haiku)", STYLE_SUBHEADING),
    ]
    rows = [
        ["Apeluri Haiku", str(ai.haiku_calls)],
        ["Tokeni intrare", str(ai.tokens_in)],
        ["Tokeni iesire", str(ai.tokens_out)],
        ["Cost estimat", _fmt_cost(ai.cost_usd)],
    ]
    ai_style = TableStyle(
        [
            ("FONTNAME", (0, 0), (0, -1), BOLD_FONT),
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CCCCCC")),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ]
    )
    table = Table(rows, colWidths=[5 * cm, 11 * cm], style=ai_style)
    elements.append(table)
    elements.append(Spacer(1, 0.4 * cm))
    return elements


def _build_issues(data: ReportInput) -> list[Any]:
    """Build the issues and warnings tables (content never logged)."""
    errors = [i for i in data.issues if i.severity.lower() == "error"]
    warnings = [i for i in data.issues if i.severity.lower() != "error"]
    elements: list[Any] = []

    sections: list[tuple[str, list[ReportIssue]]] = [
        ("Erori", errors),
        ("Avertismente si informatii", warnings),
    ]
    for title, items in sections:
        elements.append(Paragraph(title, STYLE_SUBHEADING))
        if not items:
            elements.append(Paragraph("Nu exista inregistrari.", STYLE_BODY))
        else:
            header = ["Severitate", "Entitate", "ID sursa", "Mesaj"]
            rows: list[list[Any]] = [header]
            for issue in items:
                rows.append(
                    [
                        _severity_label(issue.severity),
                        issue.entity,
                        issue.source_id,
                        issue.message,
                    ]
                )
            col_widths = [2.5 * cm, 2.5 * cm, 2.5 * cm, 8.5 * cm]
            table = Table(rows, colWidths=col_widths, style=_TABLE_STYLE)
            elements.append(table)
        elements.append(Spacer(1, 0.4 * cm))

    return elements


def _build_migration_lock_notice() -> list[Any]:
    """Build the prominent migration-lock notice box."""
    notice_text = (
        "<b>IMPORTANT: Blocare migrare</b><br/>"
        "Acest raport certifica finalizarea conversiei datelor din WinMentor in formatul SAGA. "
        "Dupa importul fisierelor generate in SAGA, baza de date WinMentor originala trebuie "
        "arhivata si accesul operational trebuie transferat integral catre SAGA. "
        "Nu efectuati inregistrari noi in WinMentor dupa data finalizarii afisate mai sus."
    )
    notice_paragraph = Paragraph(notice_text, STYLE_NOTICE)
    table = Table([[notice_paragraph]], colWidths=[16 * cm], style=_NOTICE_TABLE_STYLE)
    return [
        Spacer(1, 0.5 * cm),
        table,
        Spacer(1, 0.4 * cm),
    ]


def _build_footer() -> list[Any]:
    """Build the footer."""
    return [
        Spacer(1, 0.5 * cm),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#CCCCCC")),
        Spacer(1, 0.2 * cm),
        Paragraph("Rapidport \u00b7 migrare contabila rapida", STYLE_FOOTER),
    ]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def write_report_pdf(
    output_dir: Path,
    data: ReportInput,
) -> Path:
    """Write report.pdf to output_dir. Returns file path.

    Content (Romanian):
      - Cover: "Raport conversie WinMentor -> SAGA"
      - Metadata block: job_id, generated_at, worker_version
      - Summary table: entities converted + counts
      - AI usage: total calls + total cost (format as X,XX USD)
      - Issues + warnings tables (severity | category | message)
      - Migration-lock notice (prominent, bolded, boxed)
      - Footer: "Rapidport · migrare contabila rapida"

    Font note: defaults to Helvetica (Latin-1). Romanian diacritics will
    render incorrectly until DejaVu TTF fonts are shipped and registered.
    A ``report_pdf_font_missing`` event is logged each time this is called
    in fallback mode.

    Args:
        output_dir: Directory to write ``report.pdf`` into.
        data: Populated ``ReportInput`` instance.

    Returns:
        Absolute path to the written PDF file.
    """
    if _FONT_MISSING:
        log.warning(
            "report_pdf_font_missing",
            reason="DejaVuSans TTF not registered; diacritics will not render correctly",
            fallback_font=BODY_FONT,
            action_required=(
                "Ship DejaVuSans.ttf + DejaVuSans-Bold.ttf"
                " to worker/src/migrator/reports/fonts/"
            ),
        )

    output_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = output_dir / "report.pdf"

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="Raport conversie WinMentor - SAGA",
        author="Rapidport",
    )

    story: list[Any] = []
    story.extend(_build_cover(data))
    story.extend(_build_metadata(data))
    story.extend(_build_summary(data))
    story.extend(_build_ai_usage(data))
    story.extend(_build_issues(data))
    story.extend(_build_migration_lock_notice())
    story.extend(_build_footer())

    doc.build(story)

    byte_size = pdf_path.stat().st_size
    log.info("report_pdf_written", path=str(pdf_path), byte_size=byte_size)

    return pdf_path
