---
title: Classify WinMentor .DB files by role
priority: high
status: todo
group: discovery
phase: 0
spec-ref: SPEC §0.3
depends-on: winmentor-sample
---

## Description

WinMentor exports roughly 498 `.DB` files per company (plus monthly sub-folders). Not all are relevant to migration. Classify every file encountered in the Phase 0 sample(s) into one of six categories per SPEC §0.3:

| Classification | Rule | Action |
| --- | --- | --- |
| CORE NOMENCLATURE | Master data (NPART, NART, NGEST, NPLAN, etc.) | Must convert |
| TRANSACTIONAL | Monthly folders (INTRARI, IESIRI, NOTE) | Must convert |
| LOOKUP | Static (NLOCATII, NMONEDE) | Skip if SAGA has equivalent |
| CONFIG | WinMentor settings | Skip |
| CACHE | Temporary | Skip |
| DECLARATION | D394*, D406*, D39416* | Skip — SAGA generates its own |

For each `.DB` file:
- Classification (one of the six above)
- One-line purpose description (in English)
- Approximate record count in the sample
- Paradox standard vs non-standard (flag for fallback parser)
- Encoding detected (CP852/CP1250)

This inventory feeds directly into Phase 1's `TABLE_REGISTRY` (SPEC §1.3).

## Why It Matters

Without classification, Phase 1 doesn't know which 60-ish tables matter and which 440 can be ignored. Time wasted on irrelevant parsers is time not spent on correctness of the ones that matter.

## Acceptance Criteria

- [ ] `docs/winmentor-tables.md` (committed to main) lists every `.DB` file discovered in the sample(s)
- [ ] Each row: filename, classification, purpose (English, one line), approximate record count, standard/non-standard flag, encoding
- [ ] Table sorted by classification then alphabetical
- [ ] Non-standard Paradox files explicitly flagged — Phase 1 will need the fallback parser for each
- [ ] If two samples are available, discrepancies between versions are noted in a "Version differences" section at the bottom
- [ ] A concrete list of which tables Phase 1 must parse (CORE NOMENCLATURE + TRANSACTIONAL only) is the final section of the doc — this is the Phase 1 parser scope

## Files to Touch

- `docs/winmentor-tables.md` (new, committed to main)
- `jobs/phase0-discovery/DONE-table-inventory.md`

## Notes

- A Python spike using `pypxlib` can help inspect each `.DB` quickly. Keep the spike script under `samples/` (gitignored) — do not commit inspection scripts to `worker/`; the worker stays clean until Phase 1.
- Monthly folders may share the same `.DB` schema across months — classify the schema once; note in the inventory which files are folder-partitioned.
- If you find a `.DB` file the fallback parser can't read (not standard Paradox + not BUGET1-like), flag it in the inventory with `parser: UNKNOWN` — Phase 1 will investigate.
