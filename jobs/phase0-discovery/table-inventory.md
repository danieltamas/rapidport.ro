---
title: Classify WinMentor .DB files by role
priority: high
status: todo
group: discovery
phase: 0
spec-ref: SPEC §0.3
depends-on: winmentor-sample
---

## Sample Scope (verified)

The acquired sample `samples/winmentor/20260409.TGZ` contains:

- **447 root-level `.DB` files** (master nomenclatures — NPART, NART, NGEST, etc.)
- **321 `.MB` memo files** (supplementary Paradox data paired with `.DB`)
- **51 monthly folders** covering 2021-12 through 2026-02 (5+ years of transactional data)
- Each monthly folder contains ~375 `.DB` files — **same schema per month**, different data
- Plus 4 misc files: 2 `.Ini` configs, 1 `.XML`, 1 `.dat`
- **Total: 19,600 files**

SPEC §0.3's "~498 files" referred only to the root set (actual: 447). The monthly folders multiply the file count but don't multiply the schema surface — classifying the root set plus one representative month's schema covers ~99% of what Phase 1 needs to know.

## Description

Not all files are relevant to migration. Classify every **distinct table schema** encountered in the sample into one of six categories per SPEC §0.3:

| Classification | Rule | Action |
| --- | --- | --- |
| CORE NOMENCLATURE | Master data (NPART, NART, NGEST, NPLAN, etc.) | Must convert |
| TRANSACTIONAL | Monthly folders (INTRARI, IESIRI, NOTE) | Must convert |
| LOOKUP | Static (NLOCATII, NMONEDE) | Skip if SAGA has equivalent |
| CONFIG | WinMentor settings (CONFIG.DB, etc.) | Skip |
| CACHE | Temporary | Skip |
| DECLARATION | D394*, D406*, D39416* | Skip — SAGA generates its own |

For each distinct schema:
- Classification (one of the six above)
- One-line purpose description (in English)
- Approximate record count (sum across all monthly folders for transactional; straight count for root)
- Paradox standard vs non-standard (flag for fallback parser)
- Encoding detected (CP852/CP1250)
- Scope note: "root only" vs "per monthly folder" vs "both"

This inventory feeds directly into Phase 1's `TABLE_REGISTRY` + `MONTHLY_TABLES` (SPEC §1.3).

## Why It Matters

Without classification, Phase 1 doesn't know which 60-ish tables matter and which 440 can be ignored. Time wasted on irrelevant parsers is time not spent on correctness of the ones that matter.

## Acceptance Criteria

- [ ] `docs/winmentor-tables.md` (committed to main) lists every **distinct schema** discovered in the sample
- [ ] Each row: filename, classification, purpose (English, one line), approximate record count, standard/non-standard flag, encoding, scope ("root only" / "per monthly folder" / "both")
- [ ] Table sorted by classification then alphabetical
- [ ] Non-standard Paradox files explicitly flagged — Phase 1 will need the fallback parser for each
- [ ] Monthly folder schema confirmed consistent across months: spot-check 3 months (e.g., 2022-01, 2024-06, 2026-02) and note any drift
- [ ] A concrete list of which tables Phase 1 must parse (CORE NOMENCLATURE + TRANSACTIONAL only) is the final section of the doc — this is the Phase 1 parser scope
- [ ] A summary of record volumes at the top of the doc: total partners, total articles, total invoices (sum across all months), total journal entries — helps Phase 1 size tests and benchmarks realistically

## Files to Touch

- `docs/winmentor-tables.md` (new, committed to main)
- `jobs/phase0-discovery/DONE-table-inventory.md`

## Notes

- A Python spike using `pypxlib` can help inspect each `.DB` quickly. Keep the spike script under `samples/` (gitignored) — do not commit inspection scripts to `worker/`; the worker stays clean until Phase 1.
- **Sample size reality-check:** 51 monthly folders × ~375 files each = ~19,000 transactional files. A naive "inspect each" script would take hours. Group by filename first (all `INTRARI.DB` across all months share schema) — inspect one per distinct name, record-count by summing file sizes or parsing headers only.
- **Encoding may vary per table.** Don't assume all tables use CP852; one nomenclature might use CP1250 while monthly files use CP852. Detect per table.
- If you find a `.DB` file the fallback parser can't read (not standard Paradox + not BUGET1-like), flag it in the inventory with `parser: UNKNOWN` — Phase 1 will investigate.
- **Extraction caution:** `tar xzf samples/winmentor/20260409.TGZ` splats files into CWD (no top-level prefix inside the tgz). Always extract into an explicit subfolder: `mkdir -p samples/winmentor/extracted && tar xzf samples/winmentor/20260409.TGZ -C samples/winmentor/extracted`.
