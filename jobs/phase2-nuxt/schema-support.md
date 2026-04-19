---
title: Support tables (rate_limits, metrics)
priority: medium
status: todo
group: schema
phase: 2
branch: job/phase2-nuxt/schema-schema-support
spec-ref: SPEC.md §2.1 — `rate_limits`, `metrics`
---

## Description

Add two new schema sub-files: `rate_limits.ts` and `metrics.ts`. The `rate_limits` table is already referenced (via raw SQL) by `app/server/middleware/rate-limit.ts` that merged in Wave 1 — this task finally gives it a typed Drizzle model AND creates the underlying table in the next migration. **Do NOT touch the barrel `app/server/db/schema.ts`, and do NOT run `db:generate` — orchestrator handles both at group-merge.**

## Why It Matters

- `rate_limits` — the middleware's table; without it, every rate-limited request would raise a Postgres "relation does not exist" error when the migration runs.
- `metrics` — admin dashboard reads jobs/hour, success rate, conversion time, payment success, etc.

## Acceptance Criteria

### File: `app/server/db/schema/rate_limits.ts` (NEW)

- [ ] Table `rateLimits`, table name `rate_limits`:
  - `id: uuid('id').primaryKey().defaultRandom()`
  - `key: text('key').notNull()` — composite key (e.g. `'POST:/api/jobs:1.2.3.4'`) produced by the middleware.
  - `windowStart: timestamp('window_start', { withTimezone: true }).notNull()`
  - `count: integer('count').default(1).notNull()`
- [ ] Index: `index().on(t.key, t.windowStart)` — the middleware filters by key and time range.
- [ ] Header comment: "Sliding-window rate limit state. Pruned by `cleanup-cron-support`. Used by `app/server/middleware/rate-limit.ts`."

### File: `app/server/db/schema/metrics.ts` (NEW)

- [ ] Table `metrics`:
  - `id: uuid('id').primaryKey().defaultRandom()`
  - `metric: text('metric').notNull()` — e.g. `'jobs_per_hour'`, `'payment_success_rate'`, `'haiku_per_job'`.
  - `value: real('value').notNull()`
  - `meta: jsonb('meta')` — dimensions, labels, context.
  - `recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull()`
- [ ] Index: `index().on(t.metric, t.recordedAt)`.

### Files you MAY NOT edit

- `app/server/db/schema.ts` (barrel)
- `app/drizzle/**`
- `app/server/middleware/rate-limit.ts` — already merged on main; do not retroactively wire it to the new Drizzle model in this task.
- Any other schema sub-file, middleware, handler, page, util, package.json

### Verification (worker runs)

- [ ] `cd app && npx nuxi typecheck` → exit 0
- [ ] `cd app && npm run build` → exit 0

## Files to Create

- `app/server/db/schema/rate_limits.ts`
- `app/server/db/schema/metrics.ts`

## Notes

- Style guide: `app/server/db/schema/users.ts` + `sessions.ts`.
- **English-only identifiers and comments.**
- The rate-limit middleware will keep using raw SQL for now (it was written before the typed table existed). A follow-up task may migrate it to the typed model — out of scope here.
- Keep each file under 30 lines.

## Worker Rules

- **Branch:** `job/phase2-nuxt/schema-schema-support`. Verify.
- **Commits:** 1-2 commits, scope `db`. **NEVER Co-Authored-By.**
- **DONE report:** `jobs/phase2-nuxt/DONE-schema-support.md`.
- **Permission denials:** stop and report.
- **No `db:generate`, `db:migrate`, or dev/preview server.**
