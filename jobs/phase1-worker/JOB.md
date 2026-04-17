---
job: phase1-worker
phase: 1
title: Core Pipeline (Python worker)
status: blocked
blocked-by: phase0-discovery
duration-estimate: 5-7 days
gate: SPEC §1.10
---

# Phase 1 — Core Pipeline (Python worker)

Goal: convert a real WinMentor export to SAGA-compatible files end-to-end, both as a standalone CLI and as a pg-boss consumer. No Nuxt app, no admin, no auth — just the conversion pipeline.

**Reference:** SPEC.md §"PHASE 1 — Core Pipeline (Python worker)"

**Entry condition:** `phase0-discovery` gate = passed. Task files and `TABLE_REGISTRY` content depend on Phase 0 outputs (`docs/winmentor-tables.md`, `docs/saga-schemas.md`, `docs/adr-001-code-mapping.md`).

---

## Phase 1 Groups

| Group | Purpose | Task count | Depends on |
| --- | --- | --- | --- |
| [`bootstrap`](#group-bootstrap) | Python project + DB tables + structlog | 4 | — |
| [`parsers`](#group-parsers) | Paradox + WinMentor-specific + registry | 5 | bootstrap |
| [`canonical`](#group-canonical) | Pydantic canonical schema | 4 | bootstrap |
| [`mappers`](#group-mappers) | Rule-based + Haiku + cache | 4 | canonical, parsers |
| [`generators`](#group-generators) | SAGA DBF + CSV/XLS + XML | 5 | canonical |
| [`reports`](#group-reports) | report.json + report.pdf | 2 | canonical, mappers, generators |
| [`cli-queue`](#group-cli-queue) | CLI + pg-boss consumer + sandboxing | 5 | all above |
| [`gate`](#group-gate) | Phase 1 gate review | 1 | all above |

**Total:** 30 tasks.

---

## Parallelism Map

```
bootstrap
    │
    ├──► parsers ─────┐
    │                 │
    └──► canonical ───┤
                      ├──► mappers ────┐
                      │                │
                      ├──► generators ─┤
                      │                ├──► reports ──► cli-queue ──► gate
                      └────────────────┘
```

**Parallel opportunities** (workers on disjoint files — spawn simultaneously):
- All 5 `parsers` tasks (disjoint modules: paradox-standard, paradox-fallback, winmentor-encoding, winmentor-version, registry)
- All 4 `canonical` tasks (one Pydantic model per file)
- `parsers` + `canonical` run fully in parallel
- `generators` tasks 1–4 in parallel (one generator file per entity type)
- `reports` json + pdf in parallel

**Serialization required:**
- `bootstrap` before anything else (pyproject, Dockerfile, structlog, DB tables are prerequisites)
- `mappers` after `canonical` (mappers import canonical types)
- `generators` after `canonical` (generators take canonical inputs)
- `reports` after all canonical + mappers + generators (reports summarize)
- `cli-queue` last except for `gate` (wires everything together)

---

## Group: `bootstrap`

Foundation. No parallelism — do these in order, one worker each.

| # | Task | Branch | Priority | Depends on | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| 1 | `bootstrap-pyproject` | `job/phase1-worker/bootstrap-pyproject` | critical | — | `worker/pyproject.toml` with Python 3.12 + all Phase 1 deps, ruff + mypy strict configs, project layout under `worker/src/migrator/` |
| 2 | `bootstrap-dockerfile` | `job/phase1-worker/bootstrap-dockerfile` | critical | pyproject | `worker/Dockerfile` non-root (USER worker), docker-compose.yml fragment with `mem_limit: 1g`, `cpus: 1.0`, network isolation, volume mount for `/data/jobs/` |
| 3 | `bootstrap-structlog` | `job/phase1-worker/bootstrap-structlog` | high | pyproject | structlog JSON output, module-level logger, PII-safe helpers (`hash_email`, `redact_cif`) |
| 4 | `bootstrap-db-minimal` | `job/phase1-worker/bootstrap-db-minimal` | critical | pyproject | `migrations/001_worker_bootstrap.sql` creates `jobs` (minimal cols needed by worker), `mapping_cache`, `ai_usage`; asyncpg pool util; startup runs migration if not applied. Phase 2's Drizzle baseline replaces this file. |

---

## Group: `parsers`

Fully parallel — all 5 tasks spawn at once after bootstrap.

| # | Task | Branch | Priority | Files touched | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| 1 | `parsers-paradox-standard` | `...-parsers-paradox-standard` | critical | `worker/src/migrator/parsers/paradox.py` | pypxlib-based reader for standard `.DB` + `.MB`; iterable records; CP852 + CP1250 decoded correctly; tests with Romanian diacritics |
| 2 | `parsers-paradox-fallback` | `...-parsers-paradox-fallback` | high | `worker/src/migrator/parsers/paradox.py` (separate function) | custom binary reader for non-standard tables (BUGET1.DB-like); header byte parsing per SPEC §1.2; malformed input raises `ParadoxParseError`, no infinite loops, no unbounded allocation |
| 3 | `parsers-winmentor-encoding` | `...-parsers-winmentor-encoding` | high | `worker/src/migrator/parsers/winmentor.py` | detect CP852 vs CP1250 per table via known-field trial decode; fall back to CP1250 if CP852 fails |
| 4 | `parsers-winmentor-version` | `...-parsers-winmentor-version` | medium | `worker/src/migrator/parsers/winmentor.py` | detect WinMentor version from extracted structure (presence/absence of certain tables, column counts); return `SourceVersion` model |
| 5 | `parsers-registry` | `...-parsers-registry` | critical | `worker/src/migrator/parsers/registry.py` | `TABLE_REGISTRY` + `MONTHLY_TABLES` populated from `docs/winmentor-tables.md`; entry per classified table; type-safe lookup helpers |

---

## Group: `canonical`

Fully parallel — each task is one Pydantic file.

| # | Task | Branch | Priority | Files touched | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| 1 | `canonical-partner` | `...-canonical-partner` | critical | `worker/src/migrator/canonical/partner.py` | `Partner`, `Address` Pydantic models per SPEC §1.4; source_id + source_metadata preserve unmapped fields |
| 2 | `canonical-article` | `...-canonical-article` | critical | `worker/src/migrator/canonical/article.py` | `Article` model per SPEC §1.4; `article_type`, `is_stock`, `vat_rate: Decimal` |
| 3 | `canonical-journal` | `...-canonical-journal` | critical | `worker/src/migrator/canonical/journal.py` | `JournalEntry`, `Invoice`, `Payment` models; decimal amounts; dates typed as `date`/`datetime` |
| 4 | `canonical-support` | `...-canonical-support` | medium | `worker/src/migrator/canonical/support.py` | `Gestiune`, `CashRegister`, `BankAccount`, `ChartOfAccounts`, currency/VAT enums |

---

## Group: `mappers`

Serialize `rule-based` first (it's the hot path), then parallelize the remaining 3.

| # | Task | Branch | Priority | Files touched | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| 1 | `mappers-rule-based` | `...-mappers-rule-based` | critical | `worker/src/migrator/mappers/rule_based.py` | deterministic mappings for ~80% of known fields (CodFis→cif, Denumire→name, etc.); returns `(target, confidence=1.0)` on hit, `None` on miss |
| 2 | `mappers-cache` | `...-mappers-cache` | critical | `worker/src/migrator/mappers/cache.py` | read/write `mapping_cache` via asyncpg; keyed by `(source_software, table_name, field_name)`; increments `hit_count` |
| 3 | `mappers-haiku` | `...-mappers-haiku` | critical | `worker/src/migrator/mappers/ai_assisted.py` | Haiku call per SPEC §1.5 prompt; cache check BEFORE call; Pydantic response validation (reject confidence outside [0,1]); retry via tenacity; per-job call cap |
| 4 | `mappers-ai-usage` | `...-mappers-ai-usage` | high | `worker/src/migrator/mappers/usage.py` | write `ai_usage` row per call (success AND failure); accurate token counts from Anthropic response |

---

## Group: `generators`

Tasks 1–4 are parallel (one generator file per entity family). Task 5 wires them.

| # | Task | Branch | Priority | Files touched | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| 1 | `generators-dbf-partners-articles` | `...-generators-dbf-partners-articles` | critical | `worker/src/migrator/generators/saga_dbf.py` | DBF output for Terți + Articole per `docs/saga-schemas.md`; shared DBF writer utility |
| 2 | `generators-articole-contabile` | `...-generators-articole-contabile` | high | `worker/src/migrator/generators/saga_dbf.py` (separate function) | CSV/XLS output for Articole Contabile |
| 3 | `generators-xml-invoices` | `...-generators-xml-invoices` | critical | `worker/src/migrator/generators/saga_xml.py` | XML output for Intrări/Ieșiri per SPEC §1.6 filename pattern `F_<cif>_<nr>_<data>.xml`; XML-escape every interpolated value |
| 4 | `generators-xml-payments` | `...-generators-xml-payments` | high | `worker/src/migrator/generators/saga_xml.py` (separate function) | XML for Încasări/Plăți, filenames `I_<data>.xml` / `P_<data>.xml` |
| 5 | `generators-orchestrator` | `...-generators-orchestrator` | critical | `worker/src/migrator/generators/__init__.py` | top-level `generate_saga_output(canonical_data, output_dir)` — dispatches to each generator, ensures filename collisions don't happen, collects per-entity stats for report |

---

## Group: `reports`

Parallel.

| # | Task | Branch | Priority | Files touched | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| 1 | `reports-json` | `...-reports-json` | critical | `worker/src/migrator/reports/conversion_report.py` | `report.json` per SPEC §1.7 (worker_version, canonical_schema_version, AI usage totals, summary counts, issues list); saved to job output dir |
| 2 | `reports-pdf` | `...-reports-pdf` | high | `worker/src/migrator/reports/conversion_report.py` (separate function) | `report.pdf` Romanian via ReportLab; embedded font supports diacritics (ă â î ș ț); human-readable summary |

---

## Group: `cli-queue`

Sequential — each depends on previous.

| # | Task | Branch | Priority | Files touched | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| 1 | `cli-convert` | `...-cli-convert` | critical | `worker/src/migrator/cli.py` | `python -m migrator.cli convert --input ... --output ... --target saga --mapping-profile auto --save-profile ...`; complete pipeline; exit non-zero on failure; progress to stderr |
| 2 | `cli-inspect` | `...-cli-inspect` | medium | `worker/src/migrator/cli.py` (subcommand) | `python -m migrator.cli inspect <archive>` — prints discovered tables + classifications + record counts; dry-run, no mapping calls |
| 3 | `archive-extractor` | `...-archive-extractor` | critical | `worker/src/migrator/utils/archive.py` | zip bomb protection (ratio 50×, total 5 GB, 10k entries, no symlinks, no absolute paths, no `..`); path validation via `is_relative_to`; supports zip + 7z + rar |
| 4 | `consumer-pgboss` | `...-consumer-pgboss` | critical | `worker/src/migrator/consumer.py` | pg-boss subscriber for `convert` + `discover` job types; shared payload types match `app/server/types/queue.ts`; progress writes to `jobs.progressStage`/`progressPct`; idempotent |
| 5 | `consumer-timeout-signals` | `...-consumer-timeout-signals` | high | `worker/src/migrator/consumer.py` | SIGTERM/SIGINT graceful shutdown (stop polling, finish current job); per-job 15-minute hard kill; pg-boss retry policy configured; failed jobs mark `status='failed'` with reason |

---

## Group: `gate`

| # | Task | Branch | Priority | Depends on | Acceptance summary |
| --- | --- | --- | --- | --- | --- |
| 1 | `phase1-gate` | `...-phase1-gate` | blocking | all above | Verifies every SPEC §1.10 gate criterion with evidence; writes `jobs/phase1-worker/GATE.md`; updates `jobs/INDEX.md` status |

---

## Gate Criteria (SPEC §1.10)

Phase 1 is complete when ALL of these are true:

- [ ] CLI converts real WinMentor export to SAGA files (end-to-end on the Phase 0 sample)
- [ ] SAGA imports the generated files successfully for Terți, Articole, Articole Contabile (minimum)
- [ ] No data loss — canonical `source_metadata` catches every unmapped field
- [ ] Mapping profile save/load works (JSON round-trip)
- [ ] pg-boss consumer works end-to-end (publish from a test script → worker picks up → progress updates → output files appear)
- [ ] Conversion report generated with accurate counts + AI usage
- [ ] Worker runs non-root with memory (1 GB), CPU (1), time (15 min) limits applied in docker-compose
- [ ] Zip bomb test passes (crafted 100× ratio archive → rejected with `ArchiveError`)
- [ ] All Phase 1 SECURITY items from SPEC §S.13 satisfied that apply at worker level (sandboxing, zip bomb, path validation, no PII logs, secrets from env)

---

## Risks

- **Paradox fallback parser scope creep.** BUGET1.DB proved the pattern, but other non-standard tables may follow different layouts. If parsers-paradox-fallback uncovers >2 layout variants, escalate to the orchestrator for additional tasks rather than cramming multiple parsers into one.
- **Haiku cost.** Untuned, mapping could produce thousands of Haiku calls per job. `mappers-cache` must land before `mappers-haiku` is put in a critical path, and a per-job cap must be enforced.
- **SAGA rejection.** If SAGA rejects any generated file during Phase 1 testing, capture the full error + input in `docs/saga-rejections.md` and create a fix task — do NOT silently massage output until SAGA is happy; the root cause matters.
- **pg-boss payload drift.** TS and Python payload types must stay in sync. Phase 2's first task touching queue shapes must reverify both sides still match.
