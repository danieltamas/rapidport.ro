# Phase 0 — Requirements

Dependencies, infrastructure, and data needed to execute Phase 0. No code is written in this phase; requirements are about access and tooling.

---

## Data

| Resource | Source | Blocking |
| --- | --- | --- |
| Real WinMentor company folder (zipped) | Inbound accountants (free migration in exchange) | YES — nothing starts without this |
| Second WinMentor company folder (different version ideally) | Same | Nice to have |
| Test SAGA company (blank) | SAGA C 3.0 installation | YES for saga-import-schema task |

## Tools

| Tool | Purpose | How to install |
| --- | --- | --- |
| SAGA C 3.0 | Target system — reverse-engineer import schemas | UTM/CrossOver on Mac, or Windows VM |
| `pypxlib` (Python) | Spike: inspect .DB files to classify them | `pip install pypxlib` |
| A hex editor (Hex Fiend or similar) | Inspect non-standard Paradox tables | Brew: `brew install hex-fiend` |

## Code

No code in Phase 0. Zero dependencies added to `app/package.json` or `worker/pyproject.toml` — both files are created in Phase 1.

A throwaway Python spike for inspecting `.DB` files is acceptable under `samples/` (gitignored) but NEVER under `worker/` — keep the production worker clean.

## Environment

No env vars needed for Phase 0. No databases. No network access requirements beyond downloading SAGA/tools.

## Deliverables

| File | Task | Committed to |
| --- | --- | --- |
| `samples/winmentor/[company]/` | winmentor-sample | gitignored |
| `samples/saga/import-templates/*` | saga-import-schema | gitignored |
| `docs/saga-schemas.md` | saga-import-schema | main |
| `docs/winmentor-tables.md` | table-inventory | main |
| `docs/adr-001-code-mapping.md` | code-mapping-adr | main |
| `jobs/phase0-discovery/DONE-*.md` | each task | main (after merge) |
| `jobs/phase0-discovery/REVIEW-*.md` | each task | main (after merge) |

Samples are gitignored per SPEC §1.1 and the root `.gitignore` — they contain real accountants' data.
