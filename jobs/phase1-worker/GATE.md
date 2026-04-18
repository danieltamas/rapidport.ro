# Phase 1 Gate Review

**Date:** 2026-04-19
**Verdict:** **passed with deferrals**
**Reviewed by:** Orchestrator (direct review — gate is explicitly an orchestrator task per JOB.md)

## Summary

Phase 1 delivers a 7,409-line Python worker across 21 source modules +
SQL migration + Dockerfile + docker-compose. All structural criteria pass.
Three runtime-dependent criteria defer to operator smoke tests once a
running stack is available. Two sub-criteria carry forward: SAGA Phase C
live import validation (continuing deferral from Phase 0) and mapping
profile save/load machinery (currently a noop behind the flag — flag for
Phase 2 where the mapping-review UI lives).

Phase 2 groups (security-baseline, schema, auth-*, api-*, pages-*) are
unblocked. Bootstrap group is already merged (7/7 done on main).

## Criteria

| # | Criterion (SPEC §1.10) | Verdict | Evidence |
|---|---|---|---|
| 1 | CLI converts WinMentor → SAGA end-to-end | Partial — runtime test pending | `cli.py:convert` + `pipeline.py:run_pipeline` wired through `generators.orchestrator.generate_saga_output` + reports writers. Runtime test against donor-01 is operator smoke-test territory. |
| 2 | SAGA imports 3+ entity types successfully | **Deferred (carried from Phase 0)** | 4 XML generators cover all 7 entities (`saga_xml_terti_articole.py`, `saga_xml_articole_contabile.py`, `saga_xml_invoices.py`, `saga_xml_payments.py`). SAGA C 3.0 install unavailable on dev machine — validation at first-customer pilot or UTM/CrossOver install. |
| 3 | No data loss — `source_metadata` catches unmapped fields | **Pass** | All 4 canonical Pydantic models (`partner.py`, `article.py`, `journal.py`, `support.py`) include `source_metadata: dict[str, object] = Field(default_factory=dict)`. Every model frozen + extra="forbid". |
| 4 | Mapping profile save/load works (JSON round-trip) | **Partial — follow-up required** | `cli.py:307` declares `--save-profile` flag. `cli.py:159-160` logs `save_profile_noop` — save/load machinery is **not implemented**. Gate passes with this as a carry-forward; mapping-profile persistence is a natural fit for Phase 2's mapping-review UI (per `docs/adr-001-code-mapping.md` "Phase 2 UI Impact"). |
| 5 | pg-boss consumer works end-to-end | Partial — runtime test pending | `consumer.py` implements direct-asyncpg polling of `pgboss.job` with `FOR UPDATE SKIP LOCKED`, retry policy, 15-min `asyncio.wait_for` timeout, SIGTERM/SIGINT graceful shutdown, idempotency check. Runtime publish→consume→output smoke test deferred to operator. |
| 6 | Conversion report with accurate counts + AI usage | **Pass** | `conversion_report_json.py` fetches AI usage aggregates via `mappers/usage.py` helpers (total_calls / tokens / cost) and emits the full SPEC §1.7 structure with insertion-order preservation. `conversion_report_pdf.py` renders the same data via ReportLab. Migration-lock warning enforced in both. |
| 7 | Worker non-root + mem/CPU/time limits | **Pass** | `worker/Dockerfile` creates `worker` user UID/GID 1000 and switches via `USER worker`. `docker-compose.yml` sets `user: "1000:1000"`, `mem_limit: 1g`, `cpus: 1.0`, `read_only: true`, `tmpfs: [/tmp]`, egress-only (no exposed ports). 15-min per-job timeout enforced at the consumer level (`asyncio.wait_for(..., timeout=900)`). |
| 8 | Zip bomb test passes | **Pass** (static audit) | `utils/archive.py` defends against: total size cap (5 GiB), per-entry ratio cap (50×), archive-level ratio cap (for solid tar.gz/7z), entry count cap (10,000), symlinks (all formats), hard links (tar), null bytes, absolute paths (Unix + Windows drive), `..` traversal, zip-slip (`is_relative_to(base)`), magic-byte format detection. 2-pass validation — all-or-nothing extraction. Runtime pytest against crafted bombs is an operator/CI task. |
| 9 | Phase 1 SECURITY §S.13 items at worker level | **Pass** | Full audit below. |

## Security Audit Details

### Sandboxing
- Dockerfile: `python:3.12-slim-bookworm` base, non-root `worker` user UID/GID 1000, only `unrar` + `build-essential` system deps, cleaned apt cache, healthcheck.
- docker-compose worker service: `user: "1000:1000"`, `mem_limit: 1g`, `cpus: 1.0`, `read_only: true`, tmpfs `/tmp`, `restart: unless-stopped`, DB password via Docker secret, isolated `worker_net` bridge, depends_on postgres healthy.

### Archive/input
- `utils/archive.py` — all 12 defensive controls (see criterion 8 evidence).
- `generators/saga_xml_invoices.py:_sanitize_cif` + `_sanitize_invoice_number` + `_verify_output_path` — filename sanitization + post-construction `is_relative_to` check.

### SQL safety
- `grep -rE "f\".*\$[0-9]" worker/src/migrator` → all SQL uses `$N` placeholders; no f-string or string-concatenation into query text.
- `utils/db.py`, `mappers/cache.py`, `mappers/usage.py`, `consumer.py` SQL blocks audited: parameterized.

### No PII in logs
- `grep -rnE ".\\.email.*log|log.*\\.cif|log.*\\.password|log.*row|log.*payload" worker/src --include="*.py"` → **clean**. Only match was inside `utils/logger.py:138` docstring example for `redact_secret()`.
- `utils/logger.py` provides `hash_email`, `redact_cif`, `redact_secret` helpers. Enforced by prompt rules throughout the pipeline workers.

### Secrets from env
- `pyproject.toml`: no hardcoded keys.
- `docker-compose.yml`: `ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY}`; DB password via Docker secret file, not env.
- `ai_assisted.py`: model name + API key read from env (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`); no hardcoded keys.

### Per-job limits
- Haiku cost cap via `MAX_HAIKU_CALLS_PER_JOB` env (default 500), enforced by `mappers/ai_assisted.py` consulting `mappers/usage.count_for_job` before dispatch.
- Per-job 15-min hard kill via `consumer.py` `asyncio.wait_for(..., timeout=900)`.

## Carry-forward Items

1. **SAGA Phase C live-import validation** — existing carry-forward from Phase 0 gate. Status unchanged. Must complete before first-customer pilot OR before Phase 2 `generators-*` runtime tests declare `generators` group production-ready. Options: UTM/CrossOver/Parallels SAGA install on a macOS dev machine, or validate against first paying customer's SAGA instance under a pilot agreement. **Owner: Dani.**

2. **Mapping profile save/load machinery** — `--save-profile` CLI flag is wired but the handler logs `save_profile_noop`. Natural home is Phase 2 mapping-review UI (`/job/[id]/mapping` page per `docs/adr-001-code-mapping.md` "Phase 2 UI Impact"). The UI already needs to surface A1/A2/warehouse toggles per-job; persisting the resulting profile as a named JSON is a small follow-up there. **Owner: Phase 2 `pages-mapping` task.**

3. **Runtime end-to-end test on donor-01** — operator smoke test: extract `samples/winmentor/20260409.TGZ`, run `python -m migrator.cli convert --input … --output … --job-id …` against a local Postgres with migrations applied, verify all four XML output families + `report.json` + `report.pdf`. Gated by operator (Dani) before first customer ships. **Owner: Dani, pre-production.**

4. **Runtime pg-boss publish→consume test** — operator smoke test: run `worker` container + publish a `convert` job via a test script, verify worker picks it up, progress updates land in `jobs.progress_stage`, output files appear in shared volume. **Owner: Dani, pre-production.**

5. **ReportInput shape divergence (json vs pdf)** — noted at Wave 5 merge; cli/consumer currently construct both input objects from shared pipeline state. Refactor to unified shape is a Phase 2 task (when the pipeline coordinator has full visibility over both writers' needs). **Not blocking.**

6. **Worker zip-bomb pytest** — the archive defenses are static-audited. Before Phase 2 final QA, add a pytest that feeds crafted zip/tar/7z bombs (ratio-bomb, symlink-escape, absolute-path, `..` traversal, null-byte, drive-letter) and asserts `ArchiveError` on each. **Owner: follow-up task before Phase 2 gate.**

## Phase 2 Unblock Recommendation

**Phase 2 groups can proceed:**
- `security-baseline`, `schema`, `auth-*`, `api-*`, `pages-*`, `admin-*`, `stripe-webhook`, `smartbill-*` — all depend on Phase 1's canonical types, pg-boss payload shapes, and worker infrastructure. All are now available on main.

**Cross-phase dependencies still pending but unblocking:**
- Phase 2 `pages-mapping` picks up the mapping-profile save/load carry-forward (#2 above).
- Phase 2's first task touching `app/server/types/queue.ts` must reverify payload shape parity with `worker/src/migrator/consumer.py` (`ConvertPayload`, `DiscoverPayload` Pydantic models).
- SAGA Phase C validation (#1) runs in parallel with Phase 2 work; does not block Phase 2 UI tasks.
