---
title: Collect real WinMentor company folder(s)
priority: critical
status: todo
group: discovery
phase: 0
spec-ref: SPEC §0.1
---

## Description

Phase 0 cannot produce a correct parser without a real WinMentor export. Obtain at least one complete zipped company folder from a real WinMentor installation. Two samples from different WinMentor versions (e.g., 8.x and an older/newer branch) is strongly preferred — it lets Phase 1 design the parser around real version variance rather than guessing.

**Acquisition strategy:** offer free migration to inbound accountants in exchange for their WinMentor backup. Community forums, Facebook groups for Romanian accountants, LinkedIn outreach, direct asks from existing contacts.

## Why It Matters

Without a real sample, every design decision in Phase 1 is speculation — Paradox parser edge cases, encoding detection, table classification, code mapping strategy. Hours of rework if we build on hypotheticals.

## Acceptance Criteria

- [ ] At least one full WinMentor company folder stored at `samples/winmentor/<company-pseudonym>/`
- [ ] Zip/backup archive is intact and extractable
- [ ] The folder contains the expected set of `.DB` and `.MB` files plus monthly sub-folders
- [ ] A `samples/winmentor/<company-pseudonym>/SOURCE.md` file records: WinMentor version (if known), approximate size, date of export, donor pseudonym, consent confirmation
- [ ] `samples/` is verified gitignored — no customer data enters the repo

## Files to Touch

- `samples/winmentor/<company-pseudonym>/` (create — gitignored)
- `samples/winmentor/<company-pseudonym>/SOURCE.md` (metadata only, still gitignored)
- `jobs/phase0-discovery/DONE-winmentor-sample.md` (completion report, committed to main)

## Notes

- **Privacy:** samples contain real accountant data. Do not share. Do not commit. Verify `.gitignore` covers `samples/` before copying files in.
- **Donor consent:** get written consent from the donor (email is fine). Paste into `SOURCE.md` anonymized (name hashed).
- If only one sample is available for Phase 0, proceed — the second can arrive during Phase 1 as a regression test case.
