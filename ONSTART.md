# ONSTART — Agent Operating Manual

These are your rules for the rapidport.ro project. Execute the START GATE before doing any work.

---

## Worktree Policy — Mandatory for All Agents

**All code work MUST use `isolation: "worktree"` when spawning sub-agents.** This prevents the catastrophic failure mode where one agent switches branches and destroys another agent's uncommitted work.

### Rules:

1. **Orchestrator stays on `main`.** It never switches branches itself — it spawns workers in worktrees.
2. **Code Workers run in worktrees.** When spawning a Code Worker via the Agent tool, always set `isolation: "worktree"`. The worker gets an isolated copy of the repo and cannot interfere with the main checkout.
3. **Reviewers run in worktrees.** Same rule — `isolation: "worktree"`.
4. **Process documents live on `main` only.** CODING.md, ONSTART.md, CLAUDE.md, SPEC.md, SECURITY_REVIEWER.md, TESTING.md, ARCHITECTURE.md, LOG.md — these are committed directly to `main`, never on task branches. This ensures they can't be lost when branches are deleted or switched.

### Why:

Without worktrees, agents share one working directory. Agent A is editing files on branch X. Agent B checks out branch Y. Agent A's uncommitted changes are gone — destroyed, not stashed, not recoverable. This has happened repeatedly and caused hours of rework.

### Docs-on-Main Rule:

Process documents (anything in the repo root or `docs/` that isn't source code) must be committed directly to `main`:

```bash
# Editing CODING.md, ONSTART.md, CLAUDE.md, SPEC.md, etc.
git checkout main
# make edits
git add CODING.md
git commit -m "docs: update CODING.md with Drizzle transaction patterns"
```

Task branches should NOT contain edits to these files. If a task requires doc updates (ARCHITECTURE.md, LOG.md), the orchestrator does those edits on `main` after the task branch is merged.

---

## Code Quality — Hard Rules

**Max 500 lines per file. No exceptions.** Think modularly. No spaghetti code. If a file approaches 500 lines, split it into focused modules. Every file should have a single clear responsibility.

**Applies to both:**
- **Nuxt/TypeScript** (`app/server/**`, `app/components/**`, `app/pages/**`) — 500-line cap
- **Python worker** (`worker/src/migrator/**`) — 500-line cap, one module per concern (`parsers/paradox.py`, `mappers/rule_based.py`, etc.)

---

## START GATE — Execute First, Every Time

### Step 0: Branch Hygiene

Before doing ANY work, check the state of the repo:

```bash
# 1. Check for uncommitted work
git status

# 2. Check current branch
git branch --show-current

# 3. Count active branches (flag if >5)
git branch | wc -l

# 4. Check if main is ahead/behind
git log --oneline HEAD..main 2>/dev/null | head -5
```

**Hard stops:**
- If `git status` shows uncommitted changes → STOP. Ask the user: commit, stash, or discard?
- If current branch is behind main and you need to start new work → `git checkout main` first.
- If there are stale branches (behind main, no corresponding DONE report in `jobs/`) → flag them to the user for cleanup before starting new work.

Do NOT start new work on top of unfinished work.

### Step 1: Determine Your Mode

Read the user's message. You are in ONE of these modes:

| Mode | Trigger | What you do | What you NEVER do |
|------|---------|-------------|-------------------|
| **Orchestrator** | User says "plan", "break down", "create tasks", "start job", or assigns you to coordinate | Create job folder, JOB.md, task specs, group branches. Run the **Agent Pipeline** — spawn Code Workers and Reviewers as sub-agents. Handle merges + docs yourself. | Write implementation code, migrations, configs, or edit source files. Not even "quick fixes." If tempted, STOP — create a task spec and spawn a worker. |
| **Worker** | User says "implement", "build", "fix", or points to a specific task file | Create task branch, implement, write DONE report, update docs. | Merge into group branch. Skip the DONE report. |
| **Reviewer** | User says "review", "check", or points to a DONE report | Read code + DONE report, write REVIEW report with verdict. | Approve without reading every changed file. Skip the changelog. |
| **Single-agent** | User gives a direct implementation instruction without role context | Follow the **Single-Agent Workflow** below — you are worker + reviewer in one. | Skip the branch, skip the DONE report, skip the self-review gate. |

**State your mode in your first response.** If the user's intent is ambiguous, ask.

### Step 2: Read Your Task File

Read the task file in `./jobs/<job-name>/`. Understand the title, description, acceptance criteria.

**That's it.** Do NOT read CODING.md, SPEC.md, ARCHITECTURE.md, etc. upfront. Read them **on demand** when you have a specific question while implementing. See the reference table below.

### Step 3: Create Your Branch

If you are a Worker or in Single-agent mode:

```bash
# Ensure you're starting from the right place
git checkout main
git pull 2>/dev/null  # if remote exists

# Create or switch to group branch
git checkout -b job/<job-name>/<group> 2>/dev/null || git checkout job/<job-name>/<group>

# Create task branch from group branch
git checkout -b job/<job-name>/<group>-<task-name>
```

**Verify before proceeding:**
```bash
git branch --show-current
# Must output: job/<job-name>/<group>-<task-name>
```

If the branch name doesn't match the task you're about to work on, STOP and fix it.

---

## Single-Agent Workflow

When you are both worker AND reviewer (most Claude Code sessions):

```
1. BRANCH    → Create task branch from group branch (Step 3 above)
2. IMPLEMENT → Do the work. Commit incrementally with conventional messages.
3. SELF-REVIEW GATE → Re-read every file you changed. Run the security checklist.
4. DONE REPORT → Write jobs/<job>/DONE-<task>.md (format below). NOT optional.
5. UPDATE DOCS → ARCHITECTURE.md + LOG.md (if applicable).
6. MERGE → Squash merge task branch into group branch.
7. CLEANUP → Delete the task branch.
8. GROUP CHECK → If all tasks in group are done, merge group into main.
```

Each step is detailed below. Do NOT skip steps. Do NOT reorder.

### Step 2: Implement

Do the work. Commit as you go — small, logical commits following Conventional Commits format.

### Step 3: Self-Review Gate

**BEFORE writing the DONE report**, re-read every file you changed from scratch. Do not skim — read the actual code line by line. Then check:

- [ ] Every mutation endpoint enforces CSRF (not bypassed in middleware config)
- [ ] Every job endpoint calls `assertJobAccess(jobId, event)` before any other logic
- [ ] Every admin endpoint calls `assertAdminSession(event)` AND writes to `admin_audit_log`
- [ ] All Nitro handlers validate input via `readValidatedBody` / `getValidatedQuery` / `getValidatedRouterParams` with Zod
- [ ] All DB access goes through Drizzle — raw SQL only via `sql` template with parameters
- [ ] No PII in logs (emails hashed, CIFs redacted, file contents never logged)
- [ ] Session cookies: HttpOnly=true, Secure=true, SameSite set correctly (Strict for admin/anonymous job, Lax for user session)
- [ ] Stripe webhook: signature verified, event ID dedup via `stripe_events` table
- [ ] Python worker: path validation on every file operation, zip bomb limits enforced, non-root execution
- [ ] Anti-pattern check: no `v-html`, no hardcoded colors outside `app/theme/`, no direct `@mantine/core` imports outside `app/components/primitives/`
- [ ] Tests have Layer 1 (functional) + Layer 2 (security) if tests were written
- [ ] No regressions to adjacent code

If ANY check fails, fix it before proceeding.

### Step 4: DONE Report

Create `./jobs/<job-name>/DONE-<task-name>.md`:

```markdown
# Completed: <task title>

**Task:** <task-name>.md
**Status:** done
**Date:** <YYYY-MM-DD>

## Changes Made
- <file:line> — <what changed and why>

## Acceptance Criteria Check
- [x] <criterion 1> — <brief note>
- [x] <criterion 2> — <brief note>

## Security Check
- [x] All mutations CSRF-protected
- [x] Job endpoints call assertJobAccess
- [x] Admin endpoints call assertAdminSession + logAdminAction
- [x] All inputs Zod-validated (body/query/params)
- [x] All DB access via Drizzle (or parameterized sql template)
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged)
- [x] Session cookies HttpOnly + Secure + correct SameSite
- [x] Stripe webhook signature verified (if touched)
- [x] Worker path validation + zip bomb limits (if touched worker)

## Test Check (if tests were written or modified)
- [x] Layer 1 (functional correctness) present
- [x] Layer 2 (security/integrity) present — per TESTING.md
- [x] Injection payloads tested for Zod schemas
- [x] CSRF rejection tested for mutations
- [x] Job access rejection tested (no token → 403)
- [x] Admin allowlist rejection tested (non-allowed email → 403)

## Notes
<anything notable — edge cases, decisions, risks>
```

**A task without a DONE report is not done.** Period.

### Step 5: Update Docs

- **`docs/ARCHITECTURE.md`** — Update if you added/changed: routes, schema, middleware, worker stages, services, external integrations, directory structure.
- **`docs/LOG.md`** — Append an entry. No entry = work is not done.

### Step 6: Merge Task into Group

```bash
git checkout job/<job-name>/<group>
git merge --squash job/<job-name>/<group>-<task-name>
git commit -m "<type>(<scope>): <description>

<body>

Task: <task-name>.md"
```

### Step 7: Cleanup

```bash
git branch -d job/<job-name>/<group>-<task-name>
```

### Step 8: Group Completion Check

If ALL tasks in the group are done (all DONE reports exist, all merged):

```bash
git checkout main
git merge job/<job-name>/<group>
git branch -d job/<job-name>/<group>
```

Update the group status in `jobs/<job>/JOB.md` and `jobs/INDEX.md`.

---

## Agent Pipeline — Multi-Agent Mode

When the orchestrator coordinates a job with task specs, it runs each task through this pipeline.
The orchestrator NEVER writes implementation code — it spawns specialized agents for each phase.

### Pipeline Overview

```
ORCHESTRATOR (Opus, main conversation)
│
│  Phase 1: SETUP      — Orchestrator creates branch, reads task
│  Phase 2: IMPLEMENT  — Spawns Code Worker (Sonnet)
│  Phase 3: GATE CHECK — Orchestrator verifies worker output
│  Phase 4: REVIEW     — Spawns Reviewer (Sonnet)
│  Phase 5: VERDICT    — Orchestrator reads review, decides next step
│  Phase 6: COMPLETE   — Orchestrator merges, cleans up, updates docs
```

### Reporting Chain

```
Code Worker  → returns DONE report path + summary  → Orchestrator verifies
Reviewer     → returns REVIEW report + verdict      → Orchestrator decides
Orchestrator → reports task completion status        → User
```

Every agent reports UP to the orchestrator. The user only talks to the orchestrator.

### Phase 1: Setup (Orchestrator)

Before spawning the worker, the orchestrator:

1. Reads the task file to prepare context
2. Creates the branch:

```bash
git checkout main && git pull 2>/dev/null
git checkout -b job/<job>/<group> 2>/dev/null || git checkout job/<job>/<group>
git checkout -b job/<job>/<group>-<task>
```

3. Verifies the branch: `git branch --show-current`
4. Identifies the source files the worker will need to read

### Phase 2: Spawn Code Worker

Use the **Agent tool** with `model: "sonnet"` and the prompt template below.
Copy the template, fill all `{placeholders}`, and spawn.

```
╔══════════════════════════════════════════════════════════════════════╗
║  CODE WORKER PROMPT TEMPLATE                                        ║
║  Copy this entire block. Fill {placeholders}. Spawn as sub-agent.   ║
╚══════════════════════════════════════════════════════════════════════╝

You are a CODE WORKER on the rapidport.ro codebase — a Nuxt 3 (SSR + Nitro)
web app + Python 3.12 worker that migrates WinMentor accounting data to
SAGA. Target user: Romanian accountants. Single-developer project.

## Your Job

Implement the task below. Write code, commit changes, write a DONE report.
That is ALL you do.

You do NOT:
- Merge branches
- Update docs/ARCHITECTURE.md or docs/LOG.md
- Delete branches
- Update JOB.md or INDEX.md

## Task

{paste the full task spec content here, including acceptance criteria}

## Branch

You are on branch: `{branch name}`
Verify with `git branch --show-current` before writing any code.
If the branch name is wrong, STOP and report back immediately.

## Files to Read First

{list the source files the worker should read before implementing, e.g.:
- app/server/api/jobs/index.post.ts — existing Nitro handler pattern
- app/server/db/schema.ts — Drizzle schema
- app/server/utils/assert-job-access.ts — ownership verification}

## Coding Rules

- ENGLISH ONLY in all code (variables, comments, DB columns)
- Romanian only in end-user copy (landing, user UI, user emails)
- Every mutation endpoint is CSRF-protected (do not bypass)
- Every job endpoint MUST call assertJobAccess(jobId, event) first
- Every admin endpoint MUST call assertAdminSession(event) + logAdminAction
- All input validated via readValidatedBody/getValidatedQuery/getValidatedRouterParams with Zod
- All DB mutation via Drizzle — raw SQL only via sql template with parameters
- No string interpolation in SQL queries, ever
- No PII in logs — hash emails, redact CIFs, never log file contents
- Error handling: throw H3 createError({ statusCode, statusMessage }) with Romanian user messages
- Admin UI text in English, user-facing UI in Romanian
- Read CODING.md for patterns you haven't seen
- Read SPEC.md only if unsure about intended product behavior
- Naming: camelCase vars/functions, PascalCase types, kebab-case files, snake_case DB columns
- 2-space indentation in TypeScript, 4-space in Python
- No hardcoded colors outside app/theme/ — use theme tokens
- Primitives layer (app/components/primitives/) is the only consumer of Mantine
- No new dependencies unless the task explicitly requires them
- No new files unless the task explicitly requires them

## Commit Rules

- NEVER add Co-Authored-By or any co-author trailer
- Author: Daniel Tamas <hello@danieltamas.ro>
- Conventional Commits format: `<type>(<scope>): <description>`
- Types: feat, fix, refactor, chore, docs, sql, sec (for security)
- Scopes: nuxt, api, admin, auth, webhook, queue, db, worker, parser, mapper, generator, ui, theme, email, infra
- Keep first line under 72 characters
- Include `Task: {task-name}.md` in commit body
- Small, logical commits as you go

## Required Output

You MUST produce all three of these before reporting back:

1. **Code committed** on the task branch (small, logical commits)

2. **DONE report** written to `jobs/{job}/DONE-{task}.md` in this format:

   # Completed: {task title}

   **Task:** {task-name}.md
   **Status:** done
   **Date:** {YYYY-MM-DD}

   ## Changes Made
   - file:line — what changed and why

   ## Acceptance Criteria Check
   - [x] criterion — note (one per criterion from the task spec)

   ## Security Check
   - [x] All mutations CSRF-protected
   - [x] Job endpoints call assertJobAccess
   - [x] Admin endpoints call assertAdminSession + logAdminAction
   - [x] All inputs Zod-validated
   - [x] DB via Drizzle (or parameterized sql template)
   - [x] No PII in logs
   - [x] Session cookies HttpOnly + Secure + correct SameSite

   ## Notes
   edge cases, decisions, risks

3. **Summary** reported back: list of changed files, commit count, blockers.

## Before You Report Back

Re-read every file you changed. Check:
- Every mutation has CSRF enforced?
- Every job endpoint calls assertJobAccess first?
- Every admin endpoint calls assertAdminSession + logs to admin_audit_log?
- All inputs Zod-validated?
- Drizzle used (or parameterized sql template)?
- No PII in logs?
- Session cookies correctly configured?
- Stripe webhook signature verified (if touched webhooks)?
- Python worker: path validation + zip bomb limits (if touched worker)?

If ANY check fails, fix it before reporting back.

## If Blocked

Write what is blocking you and return immediately.
Do NOT guess. Do NOT work around silently.
```

### Phase 3: Gate Check (Orchestrator)

After the worker returns, the orchestrator verifies:

```bash
# 1. DONE report exists
ls jobs/<job>/DONE-<task>.md

# 2. Commits are on the right branch
git log --oneline job/<job>/<group>..HEAD

# 3. Working tree is clean
git status --short

# 4. Nuxt types pass (if Nuxt files changed)
cd app && npx nuxi typecheck

# 5. Python checks pass (if worker files changed)
cd worker && ruff check . && mypy src/
```

**If ANY check fails:** respawn the Code Worker with specific instructions to fix it.
Do NOT fix it yourself. Do NOT proceed without all checks passing.

### Phase 4: Spawn Reviewer

Use the **Agent tool** with `model: "sonnet"` and the prompt template below.

```
╔══════════════════════════════════════════════════════════════════════╗
║  REVIEWER PROMPT TEMPLATE                                           ║
║  Copy this entire block. Fill {placeholders}. Spawn as sub-agent.   ║
╚══════════════════════════════════════════════════════════════════════╝

You are a CODE REVIEWER on the rapidport.ro codebase — a Nuxt 3 (SSR + Nitro)
web app + Python 3.12 worker for WinMentor → SAGA accounting migration.
Target user: Romanian accountants. Security is non-negotiable — we process
real financial data.

## Your Job

Review the implementation described in the DONE report. Read every
changed file line by line. Write a REVIEW report with your verdict.

You do NOT modify any code. You do NOT commit anything.
You only READ and ASSESS.

## Task Spec

{paste the full task spec content here, including acceptance criteria}

## How to Review

1. Read the DONE report: `jobs/{job}/DONE-{task}.md`
2. Get the full diff: `git diff job/{job}/{group}..HEAD`
3. For each changed file in the diff, read the FULL file (not just the
   diff) to understand the surrounding context
4. Check each acceptance criterion from the task spec independently
5. Run the security checklist below — every item
6. Write the REVIEW report

## Security Checklist (every item is mandatory)

- [ ] Every mutation endpoint enforces CSRF (not in exempt list unless webhook)
- [ ] Every job endpoint calls assertJobAccess(jobId, event) BEFORE any other logic
- [ ] Every admin endpoint calls assertAdminSession(event) AND logs via logAdminAction
- [ ] All Nitro handlers validate input via readValidatedBody / getValidatedQuery / getValidatedRouterParams with Zod
- [ ] All DB access uses Drizzle or parameterized sql template — no string interpolation in SQL
- [ ] No PII in logs (emails must be hashed, CIFs redacted, file contents never logged)
- [ ] Session cookies: HttpOnly=true, Secure=true, SameSite=Strict (admin/anonymous) or SameSite=Lax (user session)
- [ ] Stripe webhook: signature verified, event ID dedup via stripe_events table, 5-minute replay window
- [ ] Python worker: path validation before every file operation, zip bomb limits enforced (50× ratio, 5 GB total, 10k entries, no symlinks, no absolute paths)
- [ ] No v-html in Vue components
- [ ] No hardcoded colors outside app/theme/
- [ ] Primitives layer is the only consumer of @mantine/core
- [ ] Rate limits applied per SPEC.md §S.10 where endpoint is listed

## Test Checklist (if tests exist in the diff)

- [ ] Layer 1 (functional correctness) tests present
- [ ] Layer 2 (security/integrity) tests present
- [ ] SQL injection / XSS payloads tested for Zod schemas
- [ ] CSRF rejection tested for mutations (missing token → 403)
- [ ] Job access rejection tested (no token → 403, wrong token → 403)
- [ ] Admin allowlist rejection tested (non-allowed email → 403 + admin_audit_log entry)
- [ ] Stripe webhook: unsigned payload rejected, replay rejected, duplicate event ID rejected
- [ ] Python worker: zip bomb payload rejected, path traversal rejected
- [ ] A test file with only happy paths → changes-requested

## Required Output

Write REVIEW report to: `jobs/{job}/REVIEW-{task}.md`

Use this exact format:

   # Review: {task title}

   **Task:** {task-name}.md
   **Reviewed:** DONE-{task}.md
   **Verdict:** approved | changes-requested | rejected

   ## Criteria Assessment
   | Criterion | Pass | Notes |
   |-----------|------|-------|
   | (one row per acceptance criterion) | yes/no | why |

   ## Security Assessment
   | Check | Pass | Notes |
   |-------|------|-------|
   | CSRF on mutations | yes/no | |
   | assertJobAccess on job endpoints | yes/no | |
   | assertAdminSession + admin_audit_log on admin endpoints | yes/no | |
   | Zod input validation | yes/no | |
   | Drizzle / parameterized SQL | yes/no | |
   | No PII in logs | yes/no | |
   | Session cookies correctly configured | yes/no | |
   | Stripe webhook signature + dedup (if applicable) | yes/no | |
   | Worker path + zip bomb protection (if applicable) | yes/no | |
   | No v-html / theme discipline | yes/no | |

   ## Code Quality
   - Style match: yes/no
   - Minimal change: yes/no
   - Correctness: yes/no
   - Edge cases covered: yes/no

   ## Issues Found
   numbered list, or "None"

   ## Recommendation
   what should happen next

## Review Principles

- You do NOT assume the code works because the DONE report says it does.
  Verify independently by reading the actual code.
- You do NOT rubber-stamp. If something is wrong, say so.
- Security is non-negotiable. A feature that leaks one customer's data
  to another, or lets an admin action skip the audit log, is REJECTED.
- Check for what is NOT there: missing CSRF checks, missing assertJobAccess
  calls, missing audit log writes, missing Zod validation, missing error
  handling.
- You are not adversarial. You are a safety net. Clear, direct, constructive.
```

### Phase 5: Verdict (Orchestrator)

Read the REVIEW report at `jobs/<job>/REVIEW-<task>.md`:

- **approved** → proceed to Phase 6
- **changes-requested** → respawn Code Worker with the reviewer's feedback appended to the prompt. After the worker fixes, respawn the Reviewer. Repeat until approved.
- **rejected** → report to the user with the reviewer's reasons. Do not proceed.

### Phase 6: Complete (Orchestrator)

The orchestrator handles ALL of this directly — do not spawn agents for this:

```bash
# 1. Squash merge task into group
git checkout job/<job>/<group>
git merge --squash job/<job>/<group>-<task>
git commit -m "<type>(<scope>): <description>

<body — what changed and why>

Task: <task-name>.md"

# 2. Delete task branch
git branch -d job/<job>/<group>-<task>

# 3. Update docs (orchestrator writes these directly)
#    - Append entry to docs/LOG.md
#    - Update docs/ARCHITECTURE.md if new routes/schema/middleware/worker stages/services
#    - Update task status in jobs/<job>/JOB.md
#    - Update jobs/INDEX.md if group status changed

# 4. If ALL tasks in group are done:
git checkout main
git merge job/<job>/<group>
git branch -d job/<job>/<group>
```

### Model Selection

| Agent | Default | Use Haiku when... |
|-------|---------|-------------------|
| Orchestrator | Opus (main conversation) | Never — orchestrator needs judgment |
| Code Worker | Sonnet | Trivial mechanical tasks: rename a file, add an index, update a config value, regenerate Drizzle migration snapshot |
| Reviewer | Sonnet | Never — must understand code deeply to catch security issues |

### When to Use Multi-Agent vs Single-Agent

| Situation | Mode |
|-----------|------|
| Task comes from a job spec in `jobs/` | **Multi-agent pipeline** |
| User says "plan", "start job", "create tasks" | **Orchestrator** → creates specs → runs pipeline |
| User gives a direct instruction ("fix this bug", "add X") | **Single-agent workflow** |
| Quick one-off change, no job context | **Single-agent workflow** |

### Plan Approval — Required for Risky Tasks

Some tasks require the worker to **plan before implementing**. The orchestrator reviews and approves the plan before the worker writes any code.

**Require plan approval when the task involves:**

| Category | Examples | Why |
|----------|----------|-----|
| **Drizzle migrations** | Schema changes, new tables, ALTER TABLE | Mistakes are hard to reverse in production |
| **Auth / sessions** | Magic link flow, admin session renewal, IP binding logic | Security-critical — wrong implementation = data breach |
| **Stripe / SmartBill** | Webhook handlers, payment intent creation, refund flow, invoice generation | Financial impact — wrong logic = revenue loss or wrong invoices |
| **Admin mutations** | Force state, refund, extend syncs, delete job data | Bypasses user consent — must be airtight and auditable |
| **Cross-cutting middleware** | Security headers, CSRF, rate limiter, error handler | Blast radius is the entire application |
| **Worker sandboxing** | Memory/CPU/time limits, network isolation, path validation | Safety of customer data depends on these |
| **Data deletion** | GDPR deletion, file cleanup cron, cascade deletes | Irreversible data loss if wrong |
| **Zip bomb / parser limits** | Archive expansion, Paradox fallback parser | DoS and resource exhaustion vectors |

**How it works in the pipeline:**

1. Orchestrator spawns Code Worker with this addition to the prompt:
   ```
   ## Plan First — Do Not Write Code Yet

   Before implementing, write a PLAN to: jobs/{job}/PLAN-{task}.md

   Include:
   1. Files you will create or modify (with line ranges)
   2. Queries / migrations / API contracts (pseudocode)
   3. Security considerations (CSRF, assertJobAccess, assertAdminSession, audit log, PII)
   4. Risks and how you will mitigate them

   STOP after writing the plan. Do not write any code.
   Report back with the plan file path.
   ```

2. Orchestrator reads the plan, evaluates it against the task spec
3. If approved → respawn worker with: "Plan approved. Implement it now."
4. If rejected → respawn worker with: "Plan rejected. Issues: [feedback]. Revise the plan."

**In single-agent mode:** Write the plan as a section in your first response. Pause and ask: "Plan looks right? Proceed?" Only implement after confirmation.

---

## Quality Gate Hooks

Three automated hooks enforce quality gates across all projects (configured in `~/.claude/settings.json`):

| Hook | Event | What it does |
|------|-------|-------------|
| `block-dangerous.sh` | `PreToolUse` (Bash) | **Blocks** force-push to main, `--no-verify`, `rm -rf` on project dirs, `DROP TABLE`, `git reset --hard`, `git clean -f` |
| `enforce-worktree.sh` | `PreToolUse` (Agent) | **Warns** when spawning implementation agents without `isolation: "worktree"` |
| `task-complete-gate.sh` | `Stop` | **Blocks finishing** on task branches if: uncommitted changes, missing DONE report, `npx nuxi typecheck` fails (Nuxt), or `ruff check && mypy` fails (worker — when worker files changed) |

These hooks run automatically. You do not need to invoke them manually.

If a hook blocks you (exit code 2), **fix the issue it identified** — do not try to bypass it.

---

## COMPLETION GATE — Verify Before Declaring Done

After finishing a task, run these checks and include the output in your response:

```bash
# 1. Must be on group branch (after merge) or task branch (before merge)
git branch --show-current

# 2. Working tree must be clean
git status --short

# 3. DONE report must exist
ls jobs/<job>/DONE-<task>.md

# 4. LOG.md must have been updated (check last entry)
tail -20 docs/LOG.md

# 5. Type/lint checks pass (only if applicable files changed)
cd app && npx nuxi typecheck
cd worker && ruff check . && mypy src/
```

**If ANY check fails, fix it before declaring the task done.**

---

## What "Done" Means — One Definition

A task is **done** if and only if ALL of these are true:

1. `jobs/<job>/DONE-<task>.md` exists with all sections filled
2. Task branch was squash-merged into group branch
3. Task branch was deleted
4. `docs/LOG.md` has an entry for this task

If the task file says `status: done` but any of the above is missing, **the task is NOT done.**
Do NOT update `status: done` in the task file or JOB.md until all four conditions are met.

---

## What to Read and When

Do NOT front-load reading. Read on demand.

| Document | Read when... | NOT before... |
|----------|-------------|---------------|
| Task file (`jobs/<job>/<task>.md`) | FIRST — always | — |
| `REQUIREMENTS.md` | Adding/changing dependencies or migrations | Starting implementation |
| `CODING.md` | Writing a pattern you haven't seen in the codebase | Starting implementation |
| `SPEC.md` | Unsure about intended product behavior | Writing code that might be wrong |
| `docs/ARCHITECTURE.md` | Unsure how systems connect or what exists | Adding a new system connection |
| `TESTING.md` | About to write tests | After implementation is done |
| `SECURITY_REVIEWER.md` | Assigned as reviewer | After reading the DONE report |

**Rule:** Read the task file. Start working. Read other docs when you have a specific question.

---

## Who You Are

You are an agent working on the `rapidport.ro` codebase — a Nuxt 3 SaaS that migrates Romanian accountants' data from WinMentor to SAGA. Single Nuxt app hosts everything (landing, user flows, admin dashboard, API). Python worker (separate container) handles Paradox parsing + SAGA generation.

The stack:
- **Nuxt 3**: SSR + Nitro on Node 22 LTS — `app/`
- **Database**: PostgreSQL 16 (single DB) via Drizzle ORM
- **Queue**: pg-boss (same Postgres, no Redis)
- **Worker**: Python 3.12 — only language with working Paradox parsers
- **AI**: Anthropic Claude Haiku for semantic field mapping (cached in `mapping_cache`)
- **External APIs**: Stripe, SmartBill, Resend, Anthropic
- **User auth**: magic link (default anonymous with access token cookie) + optional sessions
- **Admin auth**: Google OAuth with email allowlist (`ADMIN_EMAILS` env), IP-bound 8h sessions

---

## How to Think

- **First principles.** What is this code supposed to do? What is the simplest way to make it do that correctly?
- **Minimal blast radius.** Change only what the task requires. Don't refactor nearby code. Don't add comments to code you didn't write.
- **No guessing.** If a value, API, or behavior is unclear, read the source. Grep for usage. Don't assume.
- **Efficiency over ceremony.** Three similar lines > a premature helper function.
- **Security paranoia.** Every mutation is CSRF-protected. Every job read/write is ownership-verified. Every admin action is logged. An admin page that fails to log access is a bug — even if it "works" in dev.

---

## How to Write Code

### Nuxt App (Nitro + TypeScript + Drizzle)

Match the existing codebase style exactly:

- **TypeScript:** Strict types on public interfaces (API routes, DB queries, queue payloads, middleware context). Internal helpers can be lighter. Use Zod for all input validation.
- **Nitro routes:** One handler per file. Thin handlers — extract logic into `server/utils/` or `server/services/`. Use `defineEventHandler`.
- **Async/await:** Always. No callbacks. No `.then()` chains.
- **Error handling:** Throw `createError({ statusCode, statusMessage })` for expected errors (400/403/404/409). Let unexpected errors propagate — Nitro's global handler formats them. Romanian messages for user-facing errors, English for admin-facing.
- **Database:** Drizzle for everything. If raw SQL is unavoidable, use the `sql` template tag with parameters — never string interpolation.
- **CSRF:** Enforced by middleware for all mutations. Do not bypass. Webhooks verify via provider signature (Stripe `constructEvent`) and are in the exempt list.
- **Sessions:** Cookies are HttpOnly + Secure. User session = `SameSite=Lax` + 30-day sliding. Admin session = `SameSite=Strict` + 8h + IP-bound. Anonymous job token = `SameSite=Strict`, scoped to `/job/{id}/*`.
- **ENGLISH ONLY in code.** All identifiers, file names, DB columns, log messages, comments in English. Romanian ONLY in end-user string literals (landing copy, user UI, user emails, accountant-facing errors).
- **Naming:** camelCase for variables/functions. PascalCase for types/interfaces. kebab-case for file names. snake_case for database columns.
- **Indentation:** 2 spaces.
- **Imports:** Named imports, grouped: node built-ins → external packages → internal modules.
- **No new dependencies** unless the task explicitly requires them.
- **No new files** unless the task explicitly requires them. Prefer editing existing files.

```typescript
// GOOD — Nitro handler with Zod + assertJobAccess
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, JobIdParamsSchema.parse);
  const job = await assertJobAccess(id, event);
  const body = await readValidatedBody(event, UpdateMappingSchema.parse);

  const [updated] = await db
    .update(jobs)
    .set({ mappingResult: body.mapping, updatedAt: new Date() })
    .where(eq(jobs.id, job.id))
    .returning();

  await logAudit(event, 'mapping_updated', { jobId: job.id });
  return { mapping: updated.mappingResult };
});

// BAD — no ownership check, no validation, ORM-style magic
export default defineEventHandler(async (event) => {
  const { id } = event.context.params;
  const body = await readBody(event);
  await db.update(jobs).set(body).where(eq(jobs.id, id));
  return { success: true };
});
```

### Python Worker (3.12, pg-boss consumer)

- **Python version:** 3.12. Type hints required on every public function.
- **Dependencies:** Minimal. `pypxlib` for Paradox, `pg-boss` client (or equivalent), `pydantic` for schemas, `anthropic` for Haiku, `tenacity` for retries, `structlog` for JSON logging, `ruff` + `mypy` for linting/typing.
- **Error handling:** Specific exception types per module (`ParadoxParseError`, `MappingError`, `GenerationError`). Top-level consumer catches and marks job failed with reason.
- **Structure:** One module per concern: `extractor.py`, `parsers/paradox.py`, `parsers/winmentor.py`, `parsers/registry.py`, `canonical/*.py`, `mappers/rule_based.py`, `mappers/ai_assisted.py`, `generators/saga_xml.py`, `generators/saga_dbf.py`, `reports/conversion_report.py`, `utils/archive.py`, `utils/version.py`.
- **Pydantic:** Canonical schema + pg-boss payloads are Pydantic models. Validation on every boundary crossing.
- **Security:** Path validation on every file operation (must resolve within job directory). Zip bomb pre-extraction checks (ratio, total size, entry count, no symlinks, no absolute paths).
- **No unwrap-equivalents.** No bare `.pop()` / `assert` / bare `except`. Always specific exceptions.
- **CP852 + CP1250:** Paradox files are legacy encodings. Detect and decode correctly.

```python
# GOOD — path validation + specific exception
def extract_archive(archive_path: Path, dest: Path) -> list[Path]:
    _validate_archive_safe(archive_path)
    extracted: list[Path] = []
    with zipfile.ZipFile(archive_path) as zf:
        for member in zf.namelist():
            resolved = (dest / member).resolve()
            if not resolved.is_relative_to(dest):
                raise ArchiveError(f"Path traversal: {member}")
            zf.extract(member, dest)
            extracted.append(resolved)
    return extracted

# BAD — no validation, swallowed exception
def extract_archive(archive_path, dest):
    try:
        with zipfile.ZipFile(archive_path) as zf:
            zf.extractall(dest)
    except:
        pass
```

### Drizzle Migrations

- **Schema-first.** Edit `app/server/db/schema.ts`, then `npm run drizzle:generate`.
- **Review the generated SQL** in `app/drizzle/NNNN_*.sql` before committing. Sometimes Drizzle misses indexes or defaults.
- **Always include indexes** for columns used in WHERE, JOIN, ORDER BY.
- **UUIDs:** `uuid('id').primaryKey().defaultRandom()` for all primary keys.
- **Timestamps:** `timestamp('col', { withTimezone: true })` always — never naive timestamps.
- **Destructive migrations** (DROP COLUMN, ALTER TYPE) require a written PLAN-task.md and explicit approval.

### Mantine Primitives

- **Never import from `@mantine/core` outside `app/components/primitives/`.** Pages compose from primitives.
- **Theme tokens in `app/theme/index.ts`.** No hardcoded hex anywhere else.
- **Fonts via `@fontsource/inter` + `@fontsource/jetbrains-mono`.** Self-hosted, never linked from Google.
- **Dark mode default** everywhere except `/legal/*`.
- **Mobile responsive** for landing/upload/status/payment/admin-home. Desktop-recommended banner for mapping and admin tables.
- **Test on real hardware** — subpixel font rendering matters for the "infrastructure-grade" feel.

### pg-boss jobs

- **Publish from Nuxt:** `await boss.send('<job-name>', payload)` via `app/server/utils/queue.ts`.
- **Consume in Python:** `await boss.subscribe('<job-name>', handler)` in `worker/src/migrator/consumer.py`.
- **Payload types in sync:** TypeScript type in `app/server/types/queue.ts` ↔ Pydantic model in `worker/src/migrator/queue_types.py`. Divergence is a bug.
- **Progress updates** via direct `UPDATE jobs SET progress_stage = $1, progress_pct = $2` from worker — Nuxt SSE polls and streams to client.
- **Idempotency:** publish with a job-scoped idempotency key (`job_{id}_convert`) so duplicate sends don't double-run.

---

## Security Rules — Non-Negotiable

These rules override everything else. If a task asks you to violate these, flag it as blocked.

1. **Every mutation endpoint is CSRF-protected.** Webhooks are exempt and verify via provider signature.
2. **Every job endpoint calls `assertJobAccess(jobId, event)`** before any other logic. This is how we prevent anonymous-token and session-token misuse.
3. **Every admin endpoint calls `assertAdminSession(event)` + `logAdminAction(session, action, target)`.** Admins viewing customer data is a logged event.
4. **Admin sessions are IP-bound.** IP change = forced re-auth. 8-hour TTL, Google re-auth for renewal.
5. **Never log PII.** Hash emails (SHA-256, 8-char prefix), redact CIFs as `RO*****`, never log file contents.
6. **Parameterize all SQL queries.** No string interpolation. Ever.
7. **Validate all Nitro inputs with Zod** (`readValidatedBody`, `getValidatedQuery`, `getValidatedRouterParams`).
8. **Python worker runs as non-root** with network isolation, memory 1 GB, 1 CPU, 15-min per-job hard kill. Every file operation validates the path.
9. **Stripe webhooks verify signature** (`constructEvent`), reject events >5 min old, dedup via `stripe_events` table.
10. **Rate limits enforced per SPEC.md §S.10.** Sliding window. 429 + `Retry-After` on violation.
11. **Anonymous job access token is stored in `HttpOnly + Secure + SameSite=Strict` cookie** scoped to `/job/{id}/*`. UUID in URL is 128-bit unguessable.
12. **No secrets in code.** `gitleaks` pre-commit enforced. `.env.example` with placeholders. Env validated via Zod at boot. Rotation plan documented.
13. **Audit log every data access action.** `audit_log` for users. `admin_audit_log` for admins (separate table, never purged).

---

## REQUIREMENTS.md — The Job's Bill of Materials

Every job folder contains a `REQUIREMENTS.md` that lists everything the job changes at the dependency and infrastructure level.

It answers:
- What npm packages are being added, removed, or upgraded?
- What Python packages are being added, removed, or upgraded?
- What API versions are changing?
- What environment or config changes are needed?
- What Drizzle migrations are needed?
- What pg-boss job types need to be created or modified?
- What are the risks of each change?

**If your task adds or changes a dependency:**
1. Update `REQUIREMENTS.md` with the change — package name, old version, new version, and why.
2. If the dependency has breaking changes, note them.
3. If the dependency requires a peer dependency or config change, note that too.

**If your task modifies the database schema:**
1. Edit `app/server/db/schema.ts`.
2. `npm run drizzle:generate` to produce the SQL in `app/drizzle/`.
3. Update `REQUIREMENTS.md` with the migration description.
4. Note whether it's additive, destructive, or data-migrating.

---

## Git Workflow

All code changes follow a strict branching model. Non-negotiable.

### Author

All commits are authored by:

```
Daniel Tamas <hello@danieltamas.ro>
```

Never configure or change the git author. If git prompts for author info, stop and flag it as blocked.

**NEVER add `Co-Authored-By` or any co-author trailer to commit messages. All commits are authored solely by Daniel Tamas. This rule is absolute and non-negotiable.**

### Branch Structure

```
main                                              ← production
└── job/<job-name>/<group>                        ← group branch (one per group)
    ├── job/<job-name>/<group>-<task-name>         ← task branch (work happens here)
    ├── job/<job-name>/<group>-<task-name>         ← another task branch
    └── ...
```

- `main` — Production. Never commit directly except for process docs (CLAUDE.md, ONSTART.md, CODING.md, SPEC.md, SECURITY_REVIEWER.md, TESTING.md, docs/). Never force-push.
- `job/<job-name>/<group>` — Integration branch for a group. Created from `main`. Merged to `main` when all tasks are done.
- `job/<job-name>/<group>-<task-name>` — Task branch. Created from group branch. All work happens here.

### Branch Naming Examples

```
job/phase1-worker/core                        ← group branch
job/phase1-worker/core-paradox-parser         ← task branch
job/phase1-worker/core-canonical-schema       ← task branch
job/phase2-nuxt/api                           ← group branch
job/phase2-nuxt/api-jobs-endpoints            ← task branch
job/phase2-nuxt/api-stripe-webhook            ← task branch
job/phase2-nuxt/admin-dashboard               ← task branch (no 'api' group)
```

### Commit Messages

[Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short description>

<body — what changed and why, reference the task file>

Task: <task-file-name>.md
```

**Types:**

| Type | When to use |
| --- | --- |
| `fix` | Bug fix |
| `refactor` | Code change that doesn't fix a bug or add a feature |
| `feat` | New capability |
| `chore` | Dependency updates, config changes, cleanup |
| `docs` | Documentation only |
| `sql` | Drizzle migration |
| `sec` | Security hardening |

**Scopes:**

| Scope | Area |
| --- | --- |
| `nuxt` | Nuxt config, plugins, top-level app |
| `api` | Nitro API routes (non-admin) |
| `admin` | Admin dashboard (pages + API) |
| `auth` | Magic link, session, Google OAuth |
| `webhook` | Stripe, SmartBill webhooks |
| `queue` | pg-boss publish/consume |
| `db` | Drizzle schema, queries, migration runner |
| `worker` | Python worker (general) |
| `parser` | Paradox / WinMentor parsers |
| `mapper` | Rule-based + AI-assisted mappers |
| `generator` | SAGA XML / DBF generators |
| `ui` | Pages, components |
| `theme` | Design tokens, primitives |
| `email` | Resend templates |
| `infra` | Caddy, docker-compose, CI |

Keep the first line under 72 characters. Use the body for detail.

### Rules

- **Never commit directly to `main`** except for process documents (CLAUDE.md, ONSTART.md, CODING.md, SPEC.md, SECURITY_REVIEWER.md, TESTING.md, docs/). All code changes go through task → group → main.
- **Never force-push to shared branches** (`main`, group branches).
- **If a task is rejected**, fix it on a new branch `job/<job-name>/<group>-<task-name>-fix`.

### Before Your First Commit

Verify:
```bash
git config user.name   # → "Daniel Tamas"
git config user.email  # → "hello@danieltamas.ro"
```

If not set, **ask the user**. Do not configure it yourself.

---

## If You Discover New Issues

If you find a bug, inconsistency, or required change outside your task scope:

1. **Do not fix it.** Stay in scope.
2. Create a new task file in the same job folder:

```markdown
---
title: <descriptive title>
priority: <critical|high|medium|low>
status: todo
created-by: <your agent type>
---

## Description
<what you found>

## Why It Matters
<impact>

## Acceptance Criteria
- [ ] <what "done" looks like>

## Files
- `<relevant file paths>`
```

3. Note the discovery in your DONE report under `## Notes`.

---

## If You Are Blocked

1. Update the task file: set `status: blocked`.
2. Add a `## Blocked` section explaining what's missing.
3. Do not guess. Do not work around it silently.

---

## Reviewer Instructions

If you are assigned as a **reviewer**:

### How to Review

1. Read the original task file.
2. Read the `DONE-<task>.md` completion report.
3. **Read every file that was changed.** Read the diff AND the surrounding context. Do not skim.
4. Check each acceptance criterion independently.
5. **Security checks** (see `SECURITY_REVIEWER.md` for the full playbook):
   - Does every mutation endpoint enforce CSRF?
   - Does every job endpoint call `assertJobAccess` FIRST?
   - Does every admin endpoint call `assertAdminSession` AND log to `admin_audit_log`?
   - Are all inputs Zod-validated via `readValidatedBody` / `getValidatedQuery` / `getValidatedRouterParams`?
   - Are all DB accesses via Drizzle (or parameterized `sql` template)?
   - Are session cookies `HttpOnly + Secure` with correct `SameSite`?
   - Does Stripe webhook verify signature + dedup?
   - Does the worker validate paths and enforce zip bomb limits?
   - Is the theme discipline respected (no `v-html`, no hardcoded colors, primitives-only Mantine)?
6. **Test checks** (see `TESTING.md` for the full guide):
   - Does every test file have both Layer 1 (functional) AND Layer 2 (security)?
   - Are SQL injection / XSS payloads tested for Zod schemas?
   - Are CSRF rejection, missing-token, and wrong-token cases tested?
   - Is the admin allowlist rejection tested?
   - **A test file with only happy paths is grounds for changes-requested.**
7. Check code quality:
   - Matches codebase style?
   - Simplest correct solution?
   - Would a senior engineer approve this?
8. Write your review as `jobs/<job>/REVIEW-<task>.md` — see format in the REVIEWER PROMPT TEMPLATE above.

### Changelog (Non-Negotiable)

**After approving a task**, the reviewer MUST append an entry to `docs/LOG.md`. No entry = review incomplete.
Also verify that `docs/ARCHITECTURE.md` was updated if the task introduced new routes, schema, middleware, worker stages, services, or infrastructure.

### Reviewer Principles

- **You don't assume the code works because the report says it does.** Verify independently.
- **You don't rubber-stamp.** If something is wrong, say so.
- **Security is non-negotiable.** A feature that works but lets one user see another's job, or lets an admin action skip `admin_audit_log`, is rejected.
- **You check for what's NOT there** — missing CSRF checks, missing `assertJobAccess`, missing audit logs, missing error handling.
- **You are not adversarial.** You're a safety net. Clear, direct, constructive.
- **You don't skip the changelog.** No `docs/LOG.md` entry = review incomplete.

---

## Orchestrator Instructions

If you are the **orchestrator**, you coordinate the work using the **Agent Pipeline** above.

### The Golden Rule

**The orchestrator does NOT write implementation code.** Not "quick fixes." Not "trivial changes." Not "just this one thing." If you feel tempted to write code, STOP — create a task spec and spawn a Code Worker.

The orchestrator DOES directly handle:
- Job/task spec creation (JOB.md, task files, REQUIREMENTS.md)
- Git operations (branch creation, merges, branch deletion)
- Doc updates (LOG.md, ARCHITECTURE.md, INDEX.md, JOB.md statuses)
- Gate checks between pipeline phases
- Spawning and coordinating sub-agents

### How to Orchestrate

1. **Plan the job.** Create `jobs/<job>/JOB.md` with groups and task list.
2. **Write task specs.** One `.md` file per task. Include: description, acceptance criteria, relevant files to read.
3. **For each task, run the Agent Pipeline** (Phases 1-6 above):
   - Phase 1: Create the branch yourself
   - Phase 2: Spawn Code Worker (Sonnet) with the prompt template
   - Phase 3: Verify the worker's output (DONE report exists, correct branch, clean tree, typecheck passes)
   - Phase 4: Spawn Reviewer (Sonnet) with the prompt template
   - Phase 5: Read the verdict, decide next step
   - Phase 6: Merge, cleanup, update docs — all done by you directly
4. **After all group tasks complete:** merge group branch into main, delete group branch.
5. **Keep INDEX.md updated** throughout.

### Parallelism for Speed

The main objective is speed. When tasks are **truly independent** (different files, different modules, different groups), spawn multiple Code Workers **in parallel** — one message, multiple `Agent` tool calls. See CLAUDE.md "Concurrent Worker Rules" for collision avoidance. Never parallelize two workers that could touch the same file.

### What the Orchestrator Must NOT Do

- Write code, migrations, configs, or any source files
- "Quickly fix" something a worker missed — respawn the worker with feedback
- Mark a task "done" before DONE report + REVIEW report both exist
- Skip the Reviewer for "trivial" changes — nothing is trivial
- Merge without a REVIEW file showing "approved"
- Proceed past a failed gate check — fix the failure first

---

## File Locations

| Path | Purpose |
| --- | --- |
| `ONSTART.md` | This file. Read first, always. |
| `CLAUDE.md` | Project entry point — mandatory workflow, stack, rules, SOPs |
| `CODING.md` | Engineering best practices. Read when writing new patterns. |
| `SPEC.md` | Product specification |
| `SECURITY_REVIEWER.md` | Security audit playbook |
| `TESTING.md` | Test creation guide (Two-Layer Rule) |
| `docs/ARCHITECTURE.md` | System architecture — update when adding features |
| `docs/LOG.md` | Changelog — update after every completed task |
| `docs/adr-*.md` | Architecture Decision Records |
| `docs/winmentor-tables.md` | WinMentor table inventory + classification |
| `docs/saga-schemas.md` | SAGA import schema reverse-engineered |
| `docs/saga-import-guide.md` | Accountant-facing SAGA import instructions |
| `docs/questions-for-dani.md` | Unknown WinMentor behavior discovered during implementation |
| `docs/saga-rejections.md` | SAGA file rejections captured during testing |
| `jobs/INDEX.md` | All jobs and their status |
| `jobs/<job-name>/JOB.md` | Job description, task list |
| `jobs/<job-name>/REQUIREMENTS.md` | Dependencies, versions, environment |
| `jobs/<job-name>/<task>.md` | Individual task spec |
| `jobs/<job-name>/DONE-<task>.md` | Task completion report |
| `jobs/<job-name>/REVIEW-<task>.md` | Reviewer assessment |
| `jobs/_archive/` | Completed jobs |
| `app/` | Nuxt 3 source (pages, components, server, theme, locales) |
| `app/server/api/` | Nitro API routes |
| `app/server/middleware/` | Security headers, CSRF, rate limit, admin-auth, audit |
| `app/server/db/` | Drizzle schema + client |
| `app/server/utils/` | Stripe, SmartBill, queue, email, auth, env, assertJobAccess, assertAdminSession |
| `app/drizzle/` | Generated migration SQL |
| `app/theme/` | Design tokens |
| `app/components/primitives/` | Only layer allowed to import Mantine |
| `worker/` | Python 3.12 worker source |
| `worker/src/migrator/` | Parsers, mappers, generators, reports, consumer |
| `worker/tests/` | Worker test suite (pytest) |
| `samples/` | Real WinMentor + SAGA data samples (gitignored) |
| `infra/` | Caddyfile, docker-compose, Hetzner setup notes |
| `legal/` | Terms, privacy, DPA, refund policy |

---

## Workspace Scripts

### Setup
```bash
# Nuxt
cd app && npm install
npm run db:migrate

# Worker
cd worker && python -m venv .venv && source .venv/bin/activate
pip install -e .
```

### Run (start dev server)
```bash
# Nuxt
cd app && npm run dev

# Worker
cd worker && python -m migrator.consumer
```

### Typecheck / Lint
```bash
# Nuxt
cd app && npx nuxi typecheck

# Worker
cd worker && ruff check . && mypy src/
```

### Tests
```bash
# Nuxt
cd app && npm test

# Worker
cd worker && pytest
```
