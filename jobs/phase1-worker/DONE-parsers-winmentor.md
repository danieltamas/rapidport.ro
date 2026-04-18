# Completed: WinMentor encoding + version detection

**Task:** parsers-winmentor (tasks 3 + 4 combined) | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/parsers/winmentor.py:1–241` — new module implementing:
  - `SourceVersion` Pydantic model (`version: str | None`, `efactura_enabled: bool`, `notes: str`)
  - `detect_encoding(db_path, probe_field)` — reads up to 256 KB, scores CP1250 and CP852 on Romanian diacritics (×3) and common bigrams (×1); CP1250 wins ties; UTF-8 returned only when it decodes strictly clean AND contains Romanian diacritics
  - `detect_version(extracted_root)` — checks `DECL.Ini` first (CP1250-decoded, regex `VersionID=…`), then falls back to `.DB` table-presence heuristics (`_VERSION_SIGNATURES`); detects eFactura support via `EFACT` stem; never raises

## Acceptance Criteria Check

- [x] `detect_encoding` returns one of `"cp1250"`, `"cp852"`, `"utf-8"` — enforced by code path
- [x] `detect_version` never raises — all I/O wrapped in narrow `OSError` excepts; returns `SourceVersion(version=None, …)` when indeterminate
- [x] No bare excepts — only `OSError` and `UnicodeDecodeError` caught, each at the narrowest scope
- [x] Log events emitted: `encoding_detected`, `encoding_fallback_used`, `version_detected`, `version_indeterminate`
- [x] No file contents logged — only `filename`, scores, `version`, `source`, `table_count`
- [x] Max 250 lines — 241 lines
- [x] `from __future__ import annotations` present
- [x] No imports from `migrator.parsers.paradox`, `migrator.parsers.registry`, `migrator.canonical.*`
- [x] `__init__.py` not touched
- [x] No new dependencies added

## Security Check

N/A — this is a pure parser utility with no network access, no DB writes, no user input. File reads are bounded (256 KB cap). No PII logged.

## Notes on Heuristic Risks

**Encoding false-positive risk:** CP1250 and CP852 both decode every byte without error; the score is heuristic only. Files that contain no Romanian text (e.g., a purely numeric `.DB` like a price table) will score near-zero for both codepages and default to CP1250 — this is acceptable and matches Phase 0's "CP1250 dominant" finding.

**Version false-positive risk:** The table-stem heuristic uses minimal signatures (`_VERSION_SIGNATURES`). A WinMentor 7.x installation that happens to have an `EFACT` table from a plugin would be wrongly classified as 8.x. `DECL.Ini` takes priority exactly to avoid this; heuristic is a fallback only. The `notes` field on `SourceVersion` records the detection source so callers can log or surface it.

**`probe_field` unused:** The parameter is present in the public API for future field-level reads once `paradox.py` lands. Currently advisory; documented in the module docstring.
