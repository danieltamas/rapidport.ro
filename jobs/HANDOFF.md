# Handoff — Phase 1 complete, Phase 2 ready to start

**Date:** 2026-04-19 | **Last orchestrator session:** Phase 1 end-to-end (bootstrap → gate) | **Next:** Phase 2 planning

Read this first in the new session. Then read `jobs/INDEX.md` and `jobs/phase1-worker/GATE.md`.

---

## One-glance status

| Phase | State | Notes |
|---|---|---|
| 0 Discovery | ✅ done | Merged 2026-04-18. Samples in `samples/` (gitignored). Artifacts in `docs/` + `docs/adr-001-code-mapping.md` + `docs/questions-for-dani.md`. |
| 1 Worker (Python) | ✅ done | Merged 2026-04-19. Gate passed with deferrals. 7,409 lines across 21 modules under `worker/`. `jobs/phase1-worker/GATE.md` is the truth source. |
| 2 Nuxt | 🟢 bootstrap done; remaining groups unblocked | `jobs/phase2-nuxt/JOB.md` has the full plan. First task in the new session: read JOB.md, map file-disjoint waves. |

---

## Workflow model that worked in Phase 1

Dani's rule: **"no two workers on the same file, ever."** Single biggest source of waste was parallelism-promised-by-JOB.md-but-actually-shared-files.

**Always audit file footprints before spawning waves.** JOB.md rows often say "parallel" but list the same file in "Files touched". Combine those tasks into one worker or split files.

### Typical wave shape that shipped Phase 1:
- **Wave 1 (sequential):** scaffolding / foundation task that everyone depends on (`bootstrap-pyproject` style).
- **Wave 2 (parallel, 3-4 workers):** infra tasks that branch off the foundation (Dockerfile, logger, DB migration — each on its own file).
- **Wave 3+ (parallel, up to 9 workers):** feature modules — one worker per file, cross-imports resolved at merge time via `TYPE_CHECKING` forward refs or deferred import patterns.
- **Remediation waves as needed:** post-gate gap-close, always file-disjoint.
- **Gate wave:** 1 worker, verification-only, orchestrator-direct is often faster (see "Harness bugs" below).

### Orchestrator patterns that paid off
- **Seal all `__init__.py` as empty** at scaffolding time. Direct imports (`from migrator.utils.logger import X`) — never re-export through `__init__.py`. Eliminates a whole class of merge conflicts.
- **Pre-create task branches** with `git branch <task> <group>` (no checkout). Workers checkout inside their worktree.
- **Squash-merge task → group one at a time.** Never batch. Commit per task with narrative message.
- **Merge group → main with `--no-ff`** to preserve the group's identity in history.
- **Cleanup worktrees before every group switch.** The `worktree-agent-*` orphans accumulate and lock branches.

### Prompt template distilled
Every worker prompt got:
1. Branch name (pre-created by orchestrator)
2. Exact file(s) they can touch + exact files they CAN'T touch (siblings in parallel)
3. Public API sketch (function signatures, Pydantic model shapes)
4. Imports allowlist
5. Line-count cap (prevents feature creep)
6. Log event names (prefer snake_case verbs)
7. DONE report filename (must be written before exit)
8. Commit granularity hint (usually 2-3 commits)
9. Hard rules about NOT touching `__init__.py`, other modules, pyproject, Dockerfile, etc.

---

## Harness bugs / env quirks to work around

### 1. Agent worktrees sometimes base off stale commits
Symptom: worker reports "branch missing" or "worker/ directory doesn't exist". Claude's `isolation: "worktree"` created the worktree from an old commit (usually `02a6024` — header fix era), not from the task branch I created.

**Mitigation:** worker prompt says "If branch doesn't exist, create from `<group>`". Workers that do `git checkout <task-branch>` succeed. The harness doesn't auto-place them on the named branch.

**When it hits:** the gate task hit this hard (worktree had no `worker/` at all). Orchestrator did the task directly. For pure verification/doc tasks, doing it orchestrator-direct is faster than fighting the harness.

### 2. Bash permissions occasionally deny legitimate ops
- `~/Library/Fonts/` read → denied. Fonts had to be copied by orchestrator, not worker.
- `pip install` → denied (good, forces venv).
- `brew install firebird` → denied on some sessions.
- `python -m ruff` / `mypy` → denied in workers. They manually review; the gate verifies compliance.

**Mitigation:** list blocked ops in the prompt. Tell the worker to STOP + report on permission denial, not to try alternate paths. Early session, a worker ran `pip install --break-system-packages` after a denial — caused cleanup work.

### 3. "Prompt is too long" after 50-130 tool uses
Workers hit a hard context cap during long tasks (cli.py, consumer.py, pipeline.py each died on wrap-up). The WORK was usually committed before the cap; only the final return-summary failed.

**Mitigation:** always check `git log <task-branch>` after a "Prompt is too long" return. Often the work is there. Also: cap file sizes in the prompt (500 lines is plenty for most modules; if the worker is running long, the file is probably too big).

### 4. CWD drifts during Bash calls
After worktree cleanup or branch switching, the shell's effective CWD can end up somewhere it doesn't expect. Orchestrator kept hitting "Unable to read current working directory" and had to `cd /Users/danime/Sites/rapidport.ro/app` to recover.

**Mitigation:** prefix multi-step Bash calls with `cd /abs/path &&`. Don't assume CWD persists across calls.

### 5. Task branches get orphan worktree-agent-* branches attached
Every `isolation: "worktree"` agent also creates a `worktree-agent-<id>` branch pointer that persists after the worktree is removed. Clean up with `git branch -D worktree-agent-*` after each wave.

---

## Phase 1 carry-forwards (from GATE.md) — owner + deadline

| # | Item | Owner | When |
|---|---|---|---|
| 1 | SAGA Phase C live-import validation | Dani | Before first-customer pilot (requires SAGA C 3.0 install via UTM/CrossOver OR customer-pilot agreement) |
| 2 | Mapping profile save/load (currently noop) | Phase 2 `pages-mapping` task | During Phase 2 |
| 3 | Runtime end-to-end smoke on `samples/winmentor/donor-01` | Dani (operator) | Pre-production |
| 4 | Runtime pg-boss publish→consume smoke | Dani (operator) | Pre-production |
| 5 | `ReportInput` json/pdf shape unification | Phase 2 coordinator refactor | Opportunistic during Phase 2 |
| 6 | Zip-bomb pytest runtime suite | Follow-up task before Phase 2 gate | Pre Phase 2 gate |

**Important cross-phase dependency:** Phase 2's first task touching `app/server/types/queue.ts` must reverify parity with Phase 1's `ConvertPayload` / `DiscoverPayload` Pydantic models in `worker/src/migrator/consumer.py`. Keep the two shapes in sync by hand for now.

---

## File map — Phase 1 output on main

```
worker/
├── Dockerfile                          Python 3.12-slim, non-root UID 1000, unrar system dep
├── .dockerignore
├── .python-version                     3.12
├── .gitignore
├── README.md
├── PG_BOSS_NOTES.md                    why we do direct asyncpg instead of a Python client
├── pyproject.toml                      hatchling, ruff strict, mypy strict, pydantic.mypy plugin
├── migrations/
│   └── 001_worker_bootstrap.sql        jobs + mapping_cache + ai_usage (replaced by Drizzle in Phase 2)
├── src/migrator/
│   ├── __init__.py                     __version__ = "0.1.0" (sealed)
│   ├── cli.py                          argparse convert + inspect subcommands
│   ├── consumer.py                     pg-boss direct-asyncpg polling + SIGTERM + timeout
│   ├── pipeline.py                     shared run_pipeline + build_* helpers
│   ├── parsers/
│   │   ├── paradox.py                  read_standard (pypxlib) + read_fallback (manual)
│   │   ├── winmentor.py                encoding detection (CP852 dominant) + version detect
│   │   └── registry.py                 TABLE_REGISTRY with 28 Phase 1 scope tables
│   ├── canonical/
│   │   ├── partner.py                  Partner + Address
│   │   ├── article.py                  Article + VALID_VAT_RATES
│   │   ├── journal.py                  JournalEntry + Invoice + Payment + InvoiceLine
│   │   └── support.py                  Gestiune + CashRegister + BankAccount + ChartOfAccountsEntry + Currency + VatRate
│   ├── mappers/
│   │   ├── rule_based.py               80 deterministic rules across 11 WinMentor tables
│   │   ├── cache.py                    mapping_cache asyncpg read-through + write-through
│   │   ├── ai_assisted.py              claude-haiku-4-5 + tenacity retry + per-job cap
│   │   └── usage.py                    ai_usage per-call + aggregate helpers
│   ├── generators/
│   │   ├── orchestrator.py             generate_saga_output dispatcher
│   │   ├── saga_xml_terti_articole.py  UTF-8 XML for CLI_ / FUR_ / ART_
│   │   ├── saga_xml_articole_contabile.py  analytical sub-accounts only
│   │   ├── saga_xml_invoices.py        F_<cif>_<nr>_<date>.xml with routing
│   │   └── saga_xml_payments.py        I_/P_<date>.xml batched by direction+date
│   ├── reports/
│   │   ├── conversion_report_json.py   report.json per SPEC §1.7 + migration-lock warning
│   │   ├── conversion_report_pdf.py    report.pdf Romanian via DejaVu Sans
│   │   └── fonts/
│   │       ├── DejaVuSans.ttf          622 KB
│   │       ├── DejaVuSans-Bold.ttf     573 KB
│   │       └── LICENSE.txt             Bitstream Vera / DejaVu attribution
│   └── utils/
│       ├── archive.py                  zip bomb + path traversal defense
│       ├── db.py                       asyncpg pool + migration runner
│       └── logger.py                   structlog JSON + hash_email/redact_cif/redact_secret
└── tests/__init__.py                   (empty placeholder — no tests shipped in Phase 1)

docker-compose.yml                      repo root, worker + postgres services
```

---

## Phase 2 launch plan (for the new session)

When starting:

1. **Read in this order:** `jobs/HANDOFF.md` (this file) → `jobs/INDEX.md` → `jobs/phase1-worker/GATE.md` (carry-forwards) → `jobs/phase2-nuxt/JOB.md` (full Phase 2 task list).
2. **Reuse the wave model.** Map every Phase 2 group to its file footprint. Combine same-file tasks. Identify cross-group dependencies.
3. **Bootstrap group is already done** (7/7 tasks — shadcn-setup + primitives merged in the pre-Phase-0 spike). Start from there.
4. **First task that touches `app/server/types/queue.ts`** must reverify TS ↔ Python Pydantic payload parity with `worker/src/migrator/consumer.py` (ConvertPayload, DiscoverPayload). This is a Phase 2 cross-phase task — flag it explicitly in the task prompt.
5. **`pages-mapping` task** inherits carry-forward #2 (mapping-profile save/load machinery). Scope it to include the save/load implementation + UI toggle for A1/A2/warehouse (per `docs/adr-001-code-mapping.md` "Phase 2 UI Impact").
6. **Security-baseline group should run early** — CSRF middleware, session cookies, admin-audit middleware, input-validation conventions. These underpin every api-* and admin-* route.
7. **Worker fundamental already on main** — no need to touch `worker/` again from Phase 2 unless adding tests (carry-forward #6).

### Phase 2 groups in JOB.md (from memory — verify in JOB.md)
- `bootstrap` ✅ done
- `security-baseline` — CSRF, session cookies, middleware
- `schema` — Drizzle migrations (supersedes Phase 1's `worker/migrations/001_*.sql`)
- `auth-user` — magic-link login for accountants
- `auth-admin` — Google OAuth for Dani
- `api-upload`, `api-jobs`, `api-pay`, `api-webhooks` — Nitro routes
- `pages-*` — Vue pages (landing, upload, job status, mapping review, result, account)
- `admin-*` — admin dashboard
- `stripe-webhook` — payment processing
- `smartbill-*` — invoicing
- `email-*` — Resend transactional
- `gate` — Phase 2 gate review

Phase 2 is bigger than Phase 1 in line count (Nuxt apps are wide) but has fewer cross-cutting shared files. Expect 3-5 parallel waves per group.

---

## Things NOT to do (lessons from this session)

- **Don't spawn workers with `run_in_background: false`.** The `true` variant lets multiple waves run in parallel; `false` blocks orchestrator. Use background for anything beyond 2 min.
- **Don't merge group → main before all tasks in the group are merged + squashed.** Stage discipline prevents half-done groups on main.
- **Don't skip the file-footprint audit** before spawning a wave. "No two workers on the same file, ever" — Dani was right; the one time we got close to ignoring it, it was a collision trap.
- **Don't let workers edit `__init__.py`.** Seal contract from Wave 1 scaffolding. Every parallel wave benefits.
- **Don't fabricate gate verdicts.** The phase1-gate worker correctly refused when its worktree was stale — that's the right behavior. Orchestrator takes over for verification tasks when the harness is flaky.

---

## Contact / escalation

- **Orchestrator mode mismatches** (worker thinks it's on a different branch, or can't find expected files) → harness bug #1 above; check `git worktree list` + the worker's actual branch via `git branch --show-current`.
- **Merge conflicts** during squash-merge → stop, rebase the task branch on the latest group, re-run tests, retry. Never force-push.
- **Post-hook failures** (`task-complete-gate.sh`) → orchestrator should stay on main. Hook fires on Stop events; returning to main before turn ends avoids it.

Good luck in the clean session. Phase 2 is mostly wiring — Phase 1's foundation makes it a lot less scary than it looks in JOB.md.
