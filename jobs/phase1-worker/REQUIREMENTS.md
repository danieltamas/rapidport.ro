# Phase 1 — Requirements

Dependencies, infrastructure, and environment needed for Phase 1.

---

## Python Dependencies (worker/pyproject.toml)

```toml
[project]
requires-python = ">=3.12"
dependencies = [
  "pypxlib>=0.5",          # Paradox .DB/.MB parsing
  "pydantic>=2.7",         # canonical schema + queue payloads
  "anthropic>=0.30",       # Haiku mapping
  "tenacity>=9.0",         # retry with backoff
  "structlog>=24.0",       # JSON logging
  "asyncpg>=0.29",         # Postgres from worker
  "pg-boss-py>=0.1",       # pg-boss consumer (verify actual package name in Phase 0 spike)
  "reportlab>=4.0",        # report.pdf Romanian font embedding
  "dbfread>=2.0",          # read DBF for test fixtures
  "pydbf>=0.1",            # write DBF for SAGA output
  "py7zr>=0.21",           # 7z archive extraction
  "rarfile>=4.2",          # rar archive extraction (requires system `unrar` binary)
]

[project.optional-dependencies]
dev = [
  "pytest>=8.0",
  "pytest-asyncio>=0.23",
  "ruff>=0.6",
  "mypy>=1.10",
  "testcontainers[postgres]>=4.0",
]
```

Notes:
- `pg-boss-py` package name TBD — if no mature Python client exists, Phase 1 may consume via direct `asyncpg` polling of pg-boss tables. Validate in `bootstrap-db-minimal` task.
- `rarfile` requires the system `unrar` binary in the Docker image (add to Dockerfile).
- `pydbf` vs alternatives — pick in `generators-dbf-partners-articles` task after testing against SAGA's import screen.

---

## Infrastructure

| Item | Config | Source |
| --- | --- | --- |
| PostgreSQL 16 | local dev via host Postgres or ephemeral docker | connect via `DATABASE_URL` |
| Shared volume | `/data/jobs/` (host) → `/data/jobs/` (worker container) | docker-compose volume |
| Docker network | worker has access only to: Postgres service, Anthropic API (egress via reverse proxy allow-rule) | docker-compose network isolation |
| Container resources | `mem_limit: 1g`, `cpus: 1.0`, `user: 1000:1000`, `read_only: true` where possible | docker-compose.yml |

---

## Environment Variables

| Var | Required | Example | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | `postgresql://user:pass@postgres:5432/rapidport?sslmode=require` | asyncpg + pg-boss |
| `ANTHROPIC_API_KEY` | yes | `sk-ant-...` | Haiku mapping |
| `WORKER_VERSION` | yes | `0.1.0` | embedded in `report.json` |
| `CANONICAL_SCHEMA_VERSION` | yes | `1.0.0` | embedded in `report.json` |
| `LOG_LEVEL` | no | `info` | structlog level (default `info`) |
| `MAX_HAIKU_CALLS_PER_JOB` | no | `500` | per-job Haiku cap (default 500) |

Validation: worker's `consumer.py` startup loads env via Pydantic `BaseSettings` — missing required vars → process fails to boot.

---

## Database Tables (Phase 1 bootstrap)

Created by `migrations/001_worker_bootstrap.sql` (task `bootstrap-db-minimal`). Phase 2's Drizzle baseline replaces this file.

| Table | Phase 1 columns |
| --- | --- |
| `jobs` | id, status, progress_stage, progress_pct, worker_version, canonical_schema_version, delta_syncs_used, delta_syncs_allowed, created_at, updated_at |
| `mapping_cache` | id, source_software, table_name, field_name, target_field, confidence, reasoning, hit_count, created_at; UNIQUE(source_software, table_name, field_name) |
| `ai_usage` | id, job_id, model, tokens_in, tokens_out, cost_usd, created_at |

pg-boss tables auto-create on first connect — no manual migration needed.

---

## External Services

| Service | Access model | Failure mode |
| --- | --- | --- |
| Anthropic API | API key via env | retry 2× with backoff; on exhaustion → mark field `unknown`, record in `ai_usage` with error reason |
| Postgres | Docker network only | worker retries asyncpg connection with backoff at startup; fails loudly if still down after 30s |

No Stripe, no SmartBill, no Resend in Phase 1 — those are Phase 2.

---

## Deliverables

| File | Task | Notes |
| --- | --- | --- |
| `worker/pyproject.toml` | bootstrap-pyproject | — |
| `worker/Dockerfile` | bootstrap-dockerfile | non-root, size-optimized |
| `worker/src/migrator/**/*.py` | most groups | one file per concern, 500-line cap |
| `worker/tests/**/*.py` | bundled with each task | Layer 1 + Layer 2 per TESTING.md |
| `worker/tests/fixtures/` | bundled with bootstrap tasks | test Paradox files, test archives, test SAGA sample |
| `migrations/001_worker_bootstrap.sql` | bootstrap-db-minimal | replaced by Drizzle baseline in Phase 2 |
| `infra/docker-compose.worker.yml` | bootstrap-dockerfile | worker-only compose fragment; Phase 2 composes the full stack |
| `docs/adr-002-paradox-fallback.md` | parsers-paradox-fallback | ADR for the fallback parser approach |
| `jobs/phase1-worker/DONE-*.md` | each task | — |
| `jobs/phase1-worker/REVIEW-*.md` | each task | — |
| `jobs/phase1-worker/GATE.md` | phase1-gate | — |

---

## Risks / Open Decisions

- **pg-boss Python client choice.** Validate `pg-boss-py` matches the version of pg-boss used by Nuxt (`@pg-boss/core` or similar). If protocol drift, build a thin asyncpg-based consumer as a fallback.
- **Anthropic model pinning.** SPEC specifies `claude-haiku-4-5-20251001`. Pin in code, not env — model switch is a code change + migration + test run, not a runtime toggle.
- **SAGA generator format choices.** DBF vs CSV vs XLS per entity is listed in SPEC §1.6 but per-field test required against real SAGA — `generators-*` tasks must validate each generated file by re-importing into SAGA.
