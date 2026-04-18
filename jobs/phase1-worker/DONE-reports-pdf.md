# Completed: report.pdf Romanian via ReportLab

**Task:** reports-pdf | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/reports/conversion_report_pdf.py` (new, 514 lines)
  — `write_report_pdf(output_dir, data) -> Path`: sync function, A4, 2 cm margins
  — ReportLab Platypus layout: cover, metadata table, summary table, AI usage table,
    issues table, warnings table, migration-lock notice box, footer HR
  — Romanian copy throughout all user-visible text
  — Cost formatted as `X,XXXX USD` (comma as decimal separator)
  — `report_pdf_written` log event (path + byte_size only; no issue content)
  — `report_pdf_font_missing` warning log (font fallback triggered on every call until fonts are shipped)

## Acceptance Criteria Check

- [x] `write_report_pdf` function present, sync — done
- [x] Imports `ReportInput` from json sibling — **COORDINATION POINT** (see below); local definitions used instead
- [x] Romanian copy throughout user-visible text — done; all section headings, labels, notice text in Romanian
- [x] Migration-lock notice prominent — separate `Table` with `BOX` border style + dark-red text, rendered as a visually distinct boxed block
- [x] Font fallback documented + logged — `_FONT_MISSING = True` triggers `report_pdf_font_missing` warning on every call; module docstring carries full DejaVu registration code + blocker note
- [x] Page size A4 — `pagesize=A4` in `SimpleDocTemplate`

## Security Check

- [x] No PII in logs — only `path` (filesystem path) and `byte_size` (integer) are logged; issue content (`message`, `details`, `source_id`) never logged
- [x] No DB calls — purely CPU-bound file generation; no asyncpg, no queue
- [x] No new deps — `reportlab>=4.0` was already in `pyproject.toml`
- [x] No external network calls — no downloads, no HTTP

## Parallel-Worker Coordination Point

`conversion_report_json.py` is being written by a sibling worker in the same `reports` group.
Because both run in parallel, that file does not exist at type-check time for this task.

**Resolution chosen:** `ReportInput`, `ReportIssue`, `EntitySummary`, `AiUsage` are defined locally
in this file (Pydantic BaseModels matching SPEC §1.7 exactly). This satisfies strict mypy without
depending on the sibling file.

**Required action at merge (whichever task lands second):**
1. Delete the local model definitions in this file (lines 87–134).
2. Replace with: `from migrator.reports.conversion_report_json import ReportInput, ReportIssue, EntitySummary, AiUsage`
3. Run `ruff check` + `mypy` again to verify the import resolves cleanly.

## Font Strategy — BLOCKER for Production Rollout

**Current state:** Helvetica (Latin-1) fallback only.

Romanian diacritics (`ă â î ș ț / Ă Â Î Ș Ț`) will **not render correctly** in the generated PDF.
ReportLab's built-in Helvetica does not cover these Unicode code points.

`_FONT_MISSING = True` is hardcoded; the `report_pdf_font_missing` warning fires on every
`write_report_pdf` call as a persistent production blocker reminder.

**To fix (follow-up task):**
1. Download `DejaVuSans.ttf` + `DejaVuSans-Bold.ttf` (free, Bitstream Vera licence, ~750 KB each).
2. Place under `worker/src/migrator/reports/fonts/` and add a `__init__.py` to make it a package resource.
3. Add `importlib.resources` registration code (template is in the module docstring).
4. Set `BODY_FONT = "DejaVuSans"`, `BOLD_FONT = "DejaVuSans-Bold"`, `_FONT_MISSING = False`.
5. Add `worker/src/migrator/reports/fonts/` to `pyproject.toml` package data if hatchling needs explicit listing.

**STSong-Light was rejected** as a fallback: it is a CJK font and does not cover Romanian diacritics either — it would just silently render different wrong glyphs.

## ReportLab Patterns Used

- `SimpleDocTemplate` with explicit A4 + 2 cm margins
- `Platypus` story: `Paragraph`, `Table`, `TableStyle`, `Spacer`, `HRFlowable`
- Shared `_TABLE_STYLE` reused for summary, issues, warnings (consistent look)
- Migration-lock notice: single-row `Table` with `BOX` + `BACKGROUND` style commands
- `_style()` factory function avoids repetitive `ParagraphStyle(...)` calls
- Romanian number format: `Decimal.quantize("0.0001")` + string replace `.` → `,`
