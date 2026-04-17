---
title: Decide code mapping strategy (ADR)
priority: high
status: todo
group: discovery
phase: 0
spec-ref: SPEC §0.4
depends-on: winmentor-sample, table-inventory
---

## Description

WinMentor uses internal integer codes (e.g., partner `CodInt = 12345`). SAGA has its own code space (account codes, partner codes, article codes). Three options per SPEC §0.4:

| Strategy | Description | v1 recommendation |
| --- | --- | --- |
| **Fresh target** | Drop all WinMentor codes, let SAGA auto-assign new codes | Recommended for v1 |
| **Offset codes** | Prefix every code with `WM_` (e.g., `WM_12345`) to avoid collision | Option B |
| **Merge mode** | Match by CIF / partner name / article name — existing SAGA records get updated, new ones get added | Future v2 differentiator |

Decide which strategy v1 ships. Write an ADR documenting:
- The three options explored
- The strategy chosen for v1
- Rationale (what pain point does it solve? what pain does it avoid?)
- What "merge mode" would require to ship in v2
- Any edge cases (e.g., what if a WinMentor partner has no CIF — how does it map to SAGA?)

## Why It Matters

Code mapping is the most semantically loaded decision in the migration pipeline. Wrong strategy = accountants can't reconcile pre-migration entries with post-migration ones. Right strategy = painless cutover.

## Acceptance Criteria

- [ ] `docs/adr-001-code-mapping.md` (committed to main) follows ADR format:
  - Title, Status (Accepted), Context, Decision, Consequences
- [ ] Three options enumerated with pros/cons each
- [ ] Chosen strategy for v1 explicit and reasoned
- [ ] Edge cases documented: partners without CIF, articles without code, duplicate CIFs, foreign partners
- [ ] Phase 1 canonical schema impact noted (does `source_id` carry the WinMentor code? does the SAGA generator re-emit it?)
- [ ] "How merge mode would work (v2)" section — at least a paragraph, so future-us remembers the plan

## Files to Touch

- `docs/adr-001-code-mapping.md` (new, committed to main)
- `jobs/phase0-discovery/DONE-code-mapping-adr.md`

## Notes

- If "fresh target" is chosen (likely), document how accountants reconcile post-migration — probably via the conversion report linking WinMentor source IDs to SAGA-assigned codes.
- "Offset codes" tends to pollute accountant's chart of accounts visually — they see `WM_` prefixes everywhere forever. Note this as a con.
- If the donor accountant has strong opinions from experience, capture them verbatim in the "Context" section.
