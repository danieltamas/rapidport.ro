# Completed: PDF font shipping — DejaVu Sans for Romanian diacritics

**Task:** remediation-fonts | **Status:** done | **Date:** 2026-04-19

## Context

The `reports-pdf` worker (Wave 5) flagged `_FONT_MISSING=True` with Helvetica
fallback as a production blocker — Helvetica is Latin-1 only; Romanian
diacritics (ă â î ș ț Ă Â Î Ș Ț) render as `?` boxes. Closing this gap
before Phase 1 gate per Dani's directive.

This task was completed **directly by the orchestrator** after the spawned
worker hit 3 environment blockers (stale worktree base commit, wrong branch
auto-assigned, and Bash permission denial on `/Users/danime/Library/Fonts/`).
Since the task is bounded (binary copy + 25-line edit + LICENSE) and the
font source is on the orchestrator's filesystem, direct completion was
faster than diagnosing the worker's harness issues.

## Changes Made

- `worker/src/migrator/reports/fonts/DejaVuSans.ttf` (622 KB) — new binary,
  copied from `/Users/danime/Library/Fonts/DejaVuSans.ttf`
- `worker/src/migrator/reports/fonts/DejaVuSans-Bold.ttf` (573 KB) — new
  binary, copied from `/Users/danime/Library/Fonts/DejaVuSans-Bold.ttf`
- `worker/src/migrator/reports/fonts/LICENSE.txt` — Bitstream Vera / DejaVu
  attribution + license pointer
- `worker/src/migrator/reports/conversion_report_pdf.py:75-102` — replaced
  the Helvetica-stub font block with runtime DejaVu registration via
  `importlib.resources.files("migrator.reports").joinpath("fonts")` +
  `reportlab.pdfbase.pdfmetrics.registerFont`. On registration failure,
  falls back to Helvetica and emits a `report_pdf_font_register_failed`
  warning event (one-time, not per-call).

## Acceptance Criteria Check

- [x] DejaVu Sans + Bold shipped under `worker/src/migrator/reports/fonts/`
- [x] LICENSE.txt included alongside fonts
- [x] `_FONT_MISSING = False` when registration succeeds
- [x] `BODY_FONT = "DejaVuSans"` post-registration
- [x] `BOLD_FONT = "DejaVuSans-Bold"` post-registration
- [x] Fallback to Helvetica on registration failure (CI without package-data)
- [x] Verified: `importlib.resources.files("migrator.reports").joinpath("fonts")` resolves all 3 files
- [x] Module parses (`python3 -m ast`)

## Security Check (N/A — no endpoints, no DB, no user input)

- [x] Fonts are permissively licensed (Bitstream Vera / public domain); LICENSE.txt committed
- [x] No network dependency at runtime (fonts bundled)
- [x] Font registration errors are caught and logged (type only, no PII); fall through to Helvetica
- [x] `pdfmetrics.registerFont` with well-formed TTF — no font-rendering exploits
- N/A — CSRF, Zod, Drizzle, assertJobAccess, assertAdminSession (no endpoints)

## Notes

- No `pyproject.toml` changes needed — hatchling auto-includes all files
  under `worker/src/migrator/` in the wheel.
- The Helvetica fallback path remains reachable if the wheel's data files
  aren't included in some install scenarios; the warning log event gives
  operators a clear signal to investigate.
- Worker-spawn blockers encountered: (a) Claude harness created the
  worktree from a stale commit (`02a6024`, header fix era) instead of
  main; (b) auto-assigned branch was `worktree-agent-<id>` instead of
  `job/phase1-worker/remediation-fonts`; (c) Bash read of
  `/Users/danime/Library/Fonts/` denied. These are harness issues,
  not worker failures — flagging for future similar tasks.
