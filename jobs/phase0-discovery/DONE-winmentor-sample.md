# Completed: Collect + document WinMentor company sample

**Task:** winmentor-sample.md
**Status:** done
**Date:** 2026-04-18

## Changes Made

- `samples/winmentor/donor-01/` — extracted from `20260409.TGZ` (gitignored, not committed)
- `samples/winmentor/donor-01/SOURCE.md` — metadata file with version, size, date, consent placeholder (gitignored, not committed)
- `.gitignore` verified to contain `samples/` at line 78

## Acceptance Criteria Check

- [x] Extracted to `samples/winmentor/donor-01/` — 19,600 total files including 19,275 .DB, 321 .MB files, 51 monthly folders
- [x] Expected file types present — top level: 422 .DB, 21 .MB, 2 .Ini, 1 .XML, 1 .dat; monthly dirs each ~385 files
- [x] `SOURCE.md` written with version=`3226022,01` (from `DECL.Ini [VERSION]`), date=`2026-04-09`, pseudonym=`donor-01`, consent=PENDING
- [x] `samples/` gitignored — confirmed via `git check-ignore -v samples/winmentor/donor-01` → `.gitignore:78:samples/`
- [x] Archive preserved at `samples/winmentor/20260409.TGZ` (8.1 MB, untouched)

## Security Check (N/A for this task — no endpoints, no DB access, no user input)

- N/A — discovery task, no production code changes
- `Firma.dat` was intentionally not read (potential PII: company name, CIF, address)
- No DB file contents were parsed

## Notes

- **Version detected:** `3226022,01` from `DECL.Ini` → `[VERSION]` section. No separate `version.txt`, `winmentor.ini`, or `wm.ini` found.
- **Top-level structure:** 422 shared `.DB` tables + 21 `.MB` memo blobs + 2 config `.Ini` files + `Denom.XML` + `Firma.dat`, plus 51 monthly `YYYY_MM` subdirectories.
- **Monthly folders span:** `2021_12` (December 2021) through `2026_02` (February 2026) — 51 months of transactional history.
- **Anomalies:** `2021_12/` has only 32 entries (vs ~385 for all other months) — likely the company's first/partial month in WinMentor, or an initialization export.
- **Consent line** in `SOURCE.md` is placeholder "PENDING"; Dani will paste anonymized consent quote before group branch merges to main.
- `Denom.XML` not read — likely currency denomination config, safe for Task 3 inspection.
