# Rapidport — WinMentor → SAGA Migration Tool

A web-based SaaS that converts a WinMentor company database export into SAGA-compatible import files, with AI-assisted field mapping and optional delta sync during the transition period. Single Nuxt 3 app + Python worker. Target user: Romanian accountants. Single-developer project (Dani) with Claude Code as executor.

**Always read `SPEC.md` first for product truth.** This file describes *how we work*; SPEC describes *what we build*.

---

## MANDATORY WORKFLOW — Read This Before Doing Anything

You are NOT allowed to skip this section. Every instruction below applies to every task, every agent, every session.

### Step 1: Determine Your Mode

| Mode | Trigger | You DO | You NEVER DO |
|------|---------|--------|-------------|
| **Orchestrator** | "plan", "start job", "create tasks", coordinating work | Create job specs, spawn workers in worktrees, handle merges + docs | Write implementation code. Not even "quick fixes." Spawn a worker instead. |
| **Worker** | "implement", "build", "fix", specific task file | Create task branch, implement, write DONE report | Merge into group branch. Skip the DONE report. |
| **Reviewer** | "review", "check", DONE report | Read code + DONE report, write REVIEW report | Approve without reading every changed file. |
| **Single-agent** | Direct instruction without role context | Branch → implement → self-review → DONE report → docs → merge | Skip the branch, skip the DONE report, skip self-review. |

**State your mode in your first response.** If ambiguous, ask.

### Step 2: Branch (if writing code)

```bash
git checkout main && git pull 2>/dev/null
git checkout -b job/<job>/<group> 2>/dev/null || git checkout job/<job>/<group>
git checkout -b job/<job>/<group>-<task>
git branch --show-current  # VERIFY before writing code
```

### Step 3: Implement + DONE Report

After implementation, write `jobs/<job>/DONE-<task>.md`:
```
# Completed: <title>
**Task:** <task>.md | **Status:** done | **Date:** YYYY-MM-DD
## Changes Made
- file:line — what and why
## Acceptance Criteria Check
- [x] criterion — note
## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template)
- [x] Every mutation endpoint is CSRF-protected
- [x] Every job endpoint calls `assertJobAccess`
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log`
- [x] All inputs Zod-validated (body + query + params)
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged)
- [x] Session cookies are HttpOnly + Secure + correct SameSite
- [x] Rate limits applied where the task spec requires
```

**A task without a DONE report is not done.** The `task-complete-gate.sh` hook will block you.

### Step 4: Update Docs + Merge

1. Update `docs/ARCHITECTURE.md` if you added/changed routes, schema, middleware, worker stages, services, external integrations
2. Append entry to `docs/LOG.md` — no entry = work not done
3. Squash merge task → group: `git checkout job/<job>/<group> && git merge --squash job/<job>/<group>-<task>`
4. Delete task branch: `git branch -d job/<job>/<group>-<task>`
5. If all group tasks done: merge group → main

### Worktree Policy — Non-Negotiable

- **All sub-agents MUST use `isolation: "worktree"`.** Code Workers and Reviewers spawned via the Agent tool always set `isolation: "worktree"` to prevent branch-switching conflicts that destroy uncommitted work.
- **Process documents (CLAUDE.md, ONSTART.md, CODING.md, SPEC.md, SECURITY_REVIEWER.md, TESTING.md, docs/) are committed directly to `main`** — never on task branches. This prevents them from being lost when branches are deleted.
- **The orchestrator stays on `main`.** It is the ONLY agent that touches `main`.
- **Workers NEVER touch `main`, `group branches`, or any branch they didn't create.** They only work on their task branch.
- **Reviewer runs in a separate worktree** — reads the worker's branch, never modifies it.

#### Branching & Merge Protocol (Orchestrator Only)

```
main
 └── job/phase1-worker/core          (group branch — orchestrator creates)
      ├── job/phase1-worker/core-paradox-parser  (task branch — worker creates)
      ├── job/phase1-worker/core-table-registry  (task branch — worker creates)
      └── job/phase1-worker/core-canonical-schema (task branch — worker creates)
```

1. **Orchestrator creates group branches** from `main` before spawning workers.
2. **Workers create task branches** from the group branch they're assigned to.
3. **Workers NEVER merge.** They commit to their task branch and report done.
4. **Orchestrator merges task → group** only after reviewer PASS, one task at a time, sequentially.
5. **Orchestrator merges group → main** only after ALL tasks in the group are merged and tested.

#### Concurrent Worker Rules

When running **multiple workers in parallel** (even on different groups):

| Rule | Why |
|------|-----|
| **Never run two workers that modify the same files.** | Merge conflicts are silent killers. If two tasks touch the same file, run them sequentially. |
| **Merge tasks into group one at a time.** | Never batch-merge. Merge task A, verify, then merge task B. |
| **Rebase before merge.** | Before merging task → group, rebase the task branch on the latest group branch: `git checkout task && git rebase group`. |
| **Run tests after every merge.** | After merging task → group: `npm test` (Nuxt) + `pytest` (worker). If tests fail, revert the merge and fix. |
| **Lock main during group→main merge.** | When merging a group branch into main, NO other merges may happen. Orchestrator must serialize group→main merges. |
| **Never force-push shared branches.** | `--force` on group branches or main will destroy other workers' base. Absolutely forbidden. |

#### What To Do When a Merge Conflicts

1. **Stop.** Do not auto-resolve.
2. **Identify** which worker's changes conflict.
3. **Rebase** the later task on top of the earlier (already-merged) task.
4. **Re-run tests** after rebase.
5. **Re-review** if the rebase changed logic (not just whitespace).

#### Cleanup

After all tasks in a group are merged:
- Delete all task branches: `git branch -d job/<job>/<group>-*`
- After group is merged to main: delete group branch
- Clean up worktree directories: `git worktree prune`

### Plan Approval — Required for Risky Tasks

Migrations, auth/session changes, Stripe/SmartBill integration, webhook handlers, admin mutations, worker sandboxing changes, and data-deletion tasks require a written plan BEFORE implementation. Write to `jobs/<job>/PLAN-<task>.md`, stop, and get approval before writing code.

### Quality Gate Hooks (automated, enforced by `~/.claude/settings.json`)

| Hook | Trigger | Blocks |
|------|---------|--------|
| `block-dangerous.sh` | Every Bash command | Force-push main, `--no-verify`, destructive `rm -rf`, `git reset --hard`, `git clean -f` |
| `enforce-worktree.sh` | Every Agent spawn | Warns if implementation agents lack `isolation: "worktree"` |
| `task-complete-gate.sh` | Agent finishes (Stop) | Blocks if on task branch without: clean git state, DONE report, passing `npx nuxi typecheck` (Nuxt) and `ruff check && mypy` (worker — when worker files changed) |

If a hook blocks you, **fix the issue** — do not try to bypass it.

---

## Reference Documents (read on demand, not upfront)

| Document | Read when... |
|----------|-------------|
| `SPEC.md` | Unsure about intended product behavior, pricing, flows, or scope |
| `CODING.md` | Writing a pattern you haven't seen in the codebase (Nitro handler, Drizzle query, pg-boss job, Zod schema, Python worker module) |
| `ONSTART.md` | Need full pipeline details (worker/reviewer prompt templates, gate checks, orchestrator instructions) |
| `TESTING.md` | About to write tests (Two-Layer Rule: functional + security) |
| `SECURITY_REVIEWER.md` | Assigned as reviewer or doing security audit |
| `docs/ARCHITECTURE.md` | Unsure how systems connect or what exists |
| `docs/adr-*.md` | Investigating a decision (code mapping, Paradox fallback, anonymous auth, admin OAuth) |

---

## Stack

- **Web app**: Nuxt 3 (SSR + Nitro) on Node 22 LTS — `app/`
- **UI kit**: `shadcn-nuxt` (Vue port of shadcn/ui) + Tailwind v4 via `@tailwindcss/vite` — components generated into `app/components/ui/` with our theme wired via CSS `@theme`
- **Database**: PostgreSQL 16 (single DB, multi-schema optional) — `app/server/db/schema.ts`, `app/drizzle/`
- **ORM**: Drizzle — SQL transparency, no query builders, raw `sql` template when needed
- **Queue**: pg-boss (reuses Postgres, no Redis) — `app/server/utils/queue.ts`
- **Worker**: Python 3.12 (Paradox parsing, no JS equivalent) — `worker/src/migrator/`
- **File storage**: Local disk, volume-mounted into both containers, 30-day TTL — `/data/jobs/{id}/`
- **AI**: Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) for semantic field mapping, results cached in `mapping_cache`
- **Payments**: Stripe (cards + PSD2 3DS) — `app/server/utils/stripe.ts`
- **Invoicing**: SmartBill REST API (eFactura/SPV compliance) — `app/server/utils/smartbill.ts`
- **Email**: Resend (transactional) — `app/server/utils/email.ts`
- **User auth**: Magic link (custom, hashed tokens in `magic_link_tokens`) + anonymous job access tokens
- **Admin auth**: Google OAuth 2.0 via `nuxt-auth-utils`, email allowlist, IP-bound 8h sessions
- **Error tracking**: Sentry (hosted) or self-hosted Glitchtip — Nuxt + worker
- **Deployment**: Docker Compose on Hetzner (Nuxt container + worker container + Postgres)
- **Reverse proxy**: Caddy (automatic HTTPS)
- **Package manager**: npm

## Quick Start

```bash
# Nuxt app
cd app && npm install
npm run db:migrate   # Drizzle migrations
npm run dev

# Python worker
cd worker && python -m venv .venv && source .venv/bin/activate
pip install -e .
python -m migrator.cli --help
```

PostgreSQL connection via `DATABASE_URL` in `.env` (SSL required, `sslmode=require` even on localhost). No separate docker-compose for local dev — use host Postgres + local node + local python.

## Critical Rules

- **NEVER start dev or preview servers from CLI.** Dani runs `rundev` to manage all local project servers. Agents must not run `npm run dev`, `npm start`, `nuxi dev`, `nuxi preview`, or any command that starts a persistent process. One-shot commands (`nuxi typecheck`, `nuxi build`, `npm test`, `npm install`) are fine. For verifying a Nuxt app "works", rely on typecheck + build + file-structure inspection; Dani exercises running behavior via rundev.
- **ENGLISH ONLY in all code.** Variable names, function names, type names, file names, DB column names, API responses, admin UI text, comments — everything MUST be in English. The ONLY exceptions are: (1) end-user Romanian copy (landing page, user-facing UI, user emails, error messages shown to accountants), (2) legal domain content (Romanian accounting terminology in mappers and canonical schema — e.g., `cif`, `gestiune`). If in doubt, use English.
- **Every mutation endpoint (POST/PUT/PATCH/DELETE) MUST be CSRF-protected** (`nuxt-csurf` or double-submit cookie). Webhooks are exempt via provider signature.
- **Every job endpoint MUST call `assertJobAccess(jobId, event)`** before any other logic. No exceptions.
- **Every admin endpoint MUST call `assertAdminSession(event)`** AND write to `admin_audit_log`. No exceptions — even passive reads of customer data are logged.
- **All Nitro input validated with Zod** (`readValidatedBody`, `getValidatedQuery`, `getValidatedRouterParams`). Reject with 400 on failure, never 500.
- **Drizzle for all data mutation.** Raw SQL only via `sql` template tag with parameters. Never string interpolation in SQL.
- **No PII in logs.** Hash emails (SHA-256, prefix 8 chars), redact CIFs as `RO*****`, never log file contents or decrypted token values.
- **User auth and admin auth never share code paths.** Separate tables (`sessions` vs `admin_sessions`), separate middleware (`auth-user.ts` vs `auth-admin.ts`), separate cookies (`session` vs `admin_session`).
- **Zero permanent client data on our servers.** Job folders auto-delete after 30 days. Mapping profiles retained without company payloads. Logs never contain file contents.
- **Haiku for field mapping, cached aggressively in `mapping_cache`.** No Sonnet call in v1 unless SPEC.md is updated.
- **pg-boss is the ONLY queue.** No Redis. No external message brokers.
- **Worker runs as non-root** with Docker network isolation (access only to Anthropic API + Postgres), memory 1 GB, 1 CPU, 15-min per-job hard kill.
- **Admin dashboard is part of v1.** `/admin/*` in the same Nuxt app, Google OAuth allowlist from `ADMIN_EMAILS` env var, IP-bound sessions. Access to any customer data is logged to `admin_audit_log`.
- **Every output file includes version metadata** — worker version + canonical schema version in `report.json` per job.

## pg-boss Queue

- pg-boss runs inside the same Postgres instance — no Redis
- Nuxt publishes jobs via `app/server/utils/queue.ts` (`boss.send('convert', payload)`)
- Python worker consumes via `boss.subscribe('convert', handler)` in `worker/src/migrator/consumer.py`
- Shared volume `/data/jobs/{id}/` holds `upload/` and `output/` subfolders — the only cross-container data path
- Stripe webhooks are handled directly by Nuxt (`POST /api/webhooks/stripe`), NOT via pg-boss or the worker
- Progress updates from worker → Postgres (`jobs.progress_stage`, `jobs.progress_pct`); Nuxt SSE endpoint polls DB every 2s and pushes to client

## Admin UI Design System (enforced by SPEC.md §"UI Design System")

Rapidport's UI is "Infrastructure-grade technical" — reference min.io. Dark-first for admin, dark-leading for public. Not consumer SaaS, not cutesy. Read SPEC.md's *UI Design System* section for the full spec; rules below are enforced at every agent touch:

- **Theme tokens centralized in `app/theme/index.ts` + `app/assets/css/tailwind.css`.** TS file is the authoritative source; CSS file mirrors the values as custom properties + registers them via Tailwind's `@theme` directive. No hardcoded colors in components, ever. If you change a token, update BOTH files — drift is a review-block.
- **shadcn primitives live at `app/components/ui/`.** Generated via `npx shadcn-vue@latest add <name>`. You own the source; customize freely to match theme. Pages and admin routes import from `~/components/ui/` directly.
- **No Mantine, no @mantine/* packages, no React.** If any appear in `package.json`, that's a review-block.
- **Fonts**: Inter (body) + JetBrains Mono (technical data — CIFs, field names, IDs, timestamps, amounts in reports) via `@fontsource/inter` and `@fontsource/jetbrains-mono`. Self-host — no Google Fonts linking.
- **Signature accent**: `#C72E49` only. No gradients. No pastels.
- **Buttons**: rectangular, 6px radius. Primary = red fill + white text. Secondary = transparent + outline. Destructive = red outline + red text on transparent (NEVER red fill). Heights 32/40/48. Always labeled — no icon-only buttons without `aria-label`.
- **Tables**: dense by default (40px rows), borders between rows only (not columns), zebra striping OFF, monospace for ID/timestamp/amount columns, small chevron sort indicators.
- **Status badges** for job states: rectangular 4px radius, outlined (not pills), uppercase monospace — e.g., `MAPPED`, `REVIEWING`, `CONVERTING`, `READY`, `FAILED`.
- **Progress bars**: 4px linear, `--accent-primary` fill, percentage inline-right in mono. No spinners except <2s ops; use skeleton loaders for known-duration waits.
- **Dark mode default everywhere except `/legal/*`** (light for readability). `--bg-primary` is `#0A0A0A` — never pure `#000`.
- **Mobile responsiveness**: landing, upload, status, payment, admin home = fully responsive. Mapping page (`/job/[id]/mapping`) and admin list tables (`/admin/jobs`, `/admin/users`, `/admin/payments`) are desktop-recommended with Romanian banner on mobile: "Pentru o experiență optimă, folosiți un laptop sau desktop."
- **Admin red reminder banner**: every admin page shows small constant red banner top-right: "ADMIN — all actions logged".
- **Anti-patterns forbidden** (enforced at review): purple/indigo gradients, glassmorphism, rounded corners >12px, emoji in UI chrome, illustration libraries (unDraw, Humaans, Storyset), pastel palettes, Bootstrap-blue primary, Material floating labels, bouncy springs, pure `#000` background, shadow-heavy cards, lottie/animated emoji.
- **Localization**: user-facing UI = Romanian. Admin dashboard = English (it's for Dani). `?lang=en` fallback for technical users. Strings in `app/locales/ro.json`, `app/locales/en.json`.

## SOPs — Standard Operating Procedures

### After EVERY completed task (no exceptions):
1. **`docs/ARCHITECTURE.md`** — Update if you added/changed: routes, schema, middleware, worker stages, services, external integrations, directory structure.
2. **`docs/LOG.md`** — Append an entry. No entry = work is not done.
3. **`CLAUDE.md`** — Update if the new work changes rules, adds endpoints, or affects how agents should operate.

### When adding a new Nitro API endpoint:
1. Create handler in `app/server/api/...` (user routes) or `app/server/api/admin/...` (admin routes)
2. Define Zod schema in the same file (inline) or in `app/server/schemas/`
3. Call `readValidatedBody(event, schema.parse)` / `getValidatedQuery` / `getValidatedRouterParams` — never access raw input
4. For mutations: CSRF is enforced by middleware; do NOT bypass
5. For job endpoints: call `assertJobAccess(jobId, event)` FIRST
6. For admin endpoints: `assertAdminSession(event)` middleware runs automatically; add explicit `logAdminAction(session, action, target)` in handler body
7. Apply rate limit per S.10 of SPEC.md if the endpoint is in the list
8. Update `docs/ARCHITECTURE.md` route table
9. Append entry to `docs/LOG.md`

### When adding a Drizzle migration:
1. Edit `app/server/db/schema.ts`
2. `npm run drizzle:generate` → commits `app/drizzle/NNNN_*.sql`
3. Run `npm run db:migrate` to apply locally
4. Update `docs/ARCHITECTURE.md` schema section
5. Append entry to `docs/LOG.md`
6. Migrations are irreversible in prod — include a written plan if the migration drops/alters columns

### When adding a pg-boss job type:
1. Register job name in `app/server/utils/queue.ts`
2. Publish via `queue.send('<job>', payload)` from Nuxt
3. Consume in `worker/src/migrator/consumer.py` via `await boss.subscribe('<job>', handler)`
4. Payload shape: TypeScript type in `app/server/types/queue.ts` + Python Pydantic model in `worker/src/migrator/queue_types.py` — keep in sync
5. Update `docs/ARCHITECTURE.md` queue section

### When adding a Python worker module:
1. Place in `worker/src/migrator/` under the correct subfolder (`parsers/`, `canonical/`, `mappers/`, `generators/`, `reports/`, `utils/`)
2. Type hints required on every public function
3. Pydantic models for every data exchange (canonical schema + pg-boss payloads)
4. Tests in `worker/tests/` — both functional and security (zip bomb, encoding edge cases, ReDoS)
5. Update `docs/ARCHITECTURE.md` worker section

### When touching landing page or user-facing copy:
1. Romanian only. Never marketing-speak, never emoji, never superlatives. See SPEC.md voice examples.
2. Test mobile responsiveness (375px, 768px, 1024px breakpoints)
3. Verify HTML tag balance before finishing
4. Never use real accountant names, CUIs, company names, or J-codes — always dummy data (`SC EXEMPLU SRL`, `RO12345678`, `J40/1234/2020`)

These docs are the project's memory. Skipping them is a blocker for the next task.

## Git

- Author: `Daniel Tamas <hello@danieltamas.ro>`
- Branching: `main` → `job/<name>/<group>` → `job/<name>/<group>-<task>`
- Commits: Conventional Commits format (`feat`, `fix`, `refactor`, `chore`, `docs`, `sql`, `sec` for security)
- Scopes: `nuxt`, `api`, `admin`, `auth`, `webhook`, `queue`, `db`, `worker`, `parser`, `mapper`, `generator`, `ui`, `theme`, `email`, `infra`
- Merge: squash per task into group, regular merge group into main
- **NEVER add Co-Authored-By or any co-author trailer to commits. All commits are authored solely by Daniel Tamas. This is non-negotiable.**

## graphify

When the project has `graphify-out/`, use it proactively:

- **Before exploring unfamiliar code:** read `graphify-out/GRAPH_REPORT.md` first — god nodes (high-connectivity files), community clusters, architecture overview.
- **Before answering architecture questions:** the graph report is faster and more complete than reading individual files. Start there.
- **If `graphify-out/wiki/index.md` exists:** navigate the wiki instead of raw files.
- **After modifying code files:** run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current.
- **Don't read the graph when you don't need it.** Trivial edits, known files, small scoped tasks — just do the work. The graph helps with orientation and discovery, not with every grep.
