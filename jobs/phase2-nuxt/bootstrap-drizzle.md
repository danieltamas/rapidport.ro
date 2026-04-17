---
title: Drizzle ORM setup with minimal worker-facing schema
priority: critical
status: todo
group: bootstrap
phase: 2
branch: job/phase2-nuxt/bootstrap-drizzle
spec-ref: SPEC §2.1 "Drizzle schema"; CODING.md §6 "Database (Drizzle)"; phase1-worker/REQUIREMENTS.md
---

## Description

Set up Drizzle ORM end-to-end: dependencies, schema definition, migration tooling, Postgres client, and the initial baseline schema with the three tables the Phase 1 Python worker needs.

**Scope is intentionally narrow:** only `jobs` (minimal shape), `mapping_cache`, and `ai_usage`. The full Phase 2 schema (users, sessions, magic_link_tokens, admin_sessions, admin_oauth_state, payments, stripe_events, mapping_profiles, audit_log, admin_audit_log, rate_limits, metrics) arrives later in the `schema` group — each table in its own focused task. This bootstrap task establishes Drizzle infrastructure + baseline; the `schema` group extends it.

Also flip `DATABASE_URL` in `EnvSchema` from optional to **required** (since Drizzle can't run without it).

## Why It Matters

- Phase 1 worker blocks until these three tables exist — mapping_cache and ai_usage are critical for cost tracking and performance; jobs.progress_stage/progress_pct is how the worker reports progress to the UI.
- Getting the Drizzle pattern right NOW (migrations committed, schema split into sub-files, parameterized queries enforced) means 20 future tables follow effortlessly. Getting it wrong causes weeks of ORM refactoring later.
- CODING.md §6 is the law. No other ORM, no query builders other than Drizzle, raw SQL only via `sql` template tag with parameters.

## Acceptance Criteria

### Dependencies added to `app/package.json`

- [ ] Runtime: `drizzle-orm@^0.33`, `pg@^8.12`, `pg-boss@^10.0`
- [ ] Dev: `drizzle-kit@^0.24`, `@types/pg@^8`
- [ ] `package-lock.json` updated and committed

### File: `drizzle.config.ts` (at `app/drizzle.config.ts`)

- [ ] Exports `defineConfig({ ... })` from `drizzle-kit`
- [ ] `schema: './server/db/schema/*.ts'` (multi-file schema pattern — see below)
- [ ] `out: './drizzle'` (where generated migration SQL lands)
- [ ] `dialect: 'postgresql'`
- [ ] `dbCredentials: { url: process.env.DATABASE_URL! }` — drizzle-kit runs as a CLI tool before the Nuxt env module loads, so reading raw `process.env` here is acceptable (noted as the one exception to the env-module rule). Include a comment explaining this.
- [ ] `strict: true`, `verbose: true`

### Files: `app/server/db/schema/*.ts` (schema split by concern)

Use the multi-file pattern from the `phase2-nuxt/JOB.md` note on parallel schema edits: `schema/` folder with one file per domain. `app/server/db/schema.ts` re-exports from each (re-export pattern lets future tasks add sibling files without touching existing ones).

- [ ] `app/server/db/schema/jobs.ts`:
  - `jobs` table with columns: `id uuid primary defaultRandom`, `status text notNull`, `progressStage text`, `progressPct integer default 0`, `workerVersion text`, `canonicalSchemaVersion text`, `deltaSyncsUsed integer default 0`, `deltaSyncsAllowed integer default 3`, `createdAt timestamp withTimezone defaultNow`, `updatedAt timestamp withTimezone defaultNow`
  - Note: Phase 2's `schema-jobs-payments` task will later extend this with userId, anonymousAccessToken, uploadFilename, billingEmail, etc. — design the column order and types so future `ALTER TABLE ADD COLUMN` is mechanical
- [ ] `app/server/db/schema/mapping_cache.ts`:
  - `mappingCache` table: `id uuid primary defaultRandom`, `sourceSoftware text notNull`, `tableName text notNull`, `fieldName text notNull`, `targetField text notNull`, `confidence real notNull`, `reasoning text`, `hitCount integer default 1`, `createdAt timestamp withTimezone defaultNow`
  - UNIQUE constraint on `(sourceSoftware, tableName, fieldName)` via Drizzle's `unique()`
- [ ] `app/server/db/schema/ai_usage.ts`:
  - `aiUsage` table: `id uuid primary defaultRandom`, `jobId uuid references(() => jobs.id)`, `model text notNull`, `tokensIn integer notNull`, `tokensOut integer notNull`, `costUsd real notNull`, `createdAt timestamp withTimezone defaultNow`
- [ ] `app/server/db/schema.ts` (at `app/server/db/schema.ts`, one level up):
  - Re-exports everything from `./schema/*.ts`: `export * from './schema/jobs'; export * from './schema/mapping_cache'; export * from './schema/ai_usage';`

### File: `app/server/db/client.ts`

- [ ] Imports `pg` (Pool) + `drizzle` from `drizzle-orm/node-postgres` + `env` from `../utils/env`
- [ ] Creates a single `pool = new Pool({ connectionString: env.DATABASE_URL, max: 20 })` — CODING.md §6 "Connection pooling" says 20 max
- [ ] Exports `export const db = drizzle(pool, { schema });` where `schema` is the combined re-export
- [ ] Exports `pool` for shutdown cleanup later
- [ ] Throws at module-load if `env.DATABASE_URL` is undefined (shouldn't happen because env.ts now requires it, but defense in depth)

### Update: `app/server/utils/env.ts`

- [ ] Change `DATABASE_URL: z.string().url().optional()` to `DATABASE_URL: z.string().url()` — now required. Drizzle can't run without it; tools that need DATABASE_URL should fail at boot.
- [ ] Update `.env.example` to uncomment `DATABASE_URL` placeholder and add a clarifying comment: `# DATABASE_URL is required — Drizzle and pg-boss won't start without it. Format: postgresql://user:pass@host:port/db?sslmode=require`

### Scripts added to `app/package.json`

- [ ] `"db:generate": "drizzle-kit generate"`
- [ ] `"db:migrate": "drizzle-kit migrate"`
- [ ] `"db:push": "drizzle-kit push"` (dev use only — push schema without migration)
- [ ] `"db:studio": "drizzle-kit studio"` (visual browser)

### Generated baseline migration

- [ ] Run `cd app && npx drizzle-kit generate` — produces `app/drizzle/0000_*.sql` with the CREATE TABLE statements. Commit this file.
- [ ] `app/drizzle/meta/*` directory (drizzle-kit metadata) also committed — required for reproducible migrations

### Verification

- [ ] `cd app && npm install` completes; new deps in lockfile
- [ ] `cd app && npx nuxi typecheck` passes — schema types compile
- [ ] `cd app && npm run build` passes
- [ ] `cd app && cat drizzle/0000_*.sql` shows CREATE TABLE for `jobs`, `mapping_cache`, `ai_usage` with expected columns + constraints
- [ ] `grep -rn "process\.env" app/ --include='*.ts' --exclude-dir=node_modules --exclude-dir=.nuxt` returns matches ONLY in `app/server/utils/env.ts` AND `app/drizzle.config.ts` (the CLI config — documented exception)

### Out of scope

- Running the actual migration against a live Postgres — Dani will run `npm run db:migrate` against his local Postgres when he's ready; this task only generates the migration file
- Users/sessions/payments/audit/etc. tables — the `schema` group in Phase 2 adds them
- pg-boss runtime initialization (calling `boss.start()`) — handled in a future `queue-init` task
- The worker's Python asyncpg connector — Phase 1 work

## Files to Create

- `app/drizzle.config.ts`
- `app/server/db/schema.ts`
- `app/server/db/schema/jobs.ts`
- `app/server/db/schema/mapping_cache.ts`
- `app/server/db/schema/ai_usage.ts`
- `app/server/db/client.ts`
- `app/drizzle/0000_<drizzle_generated_name>.sql` (generated by `drizzle-kit generate`; commit it)
- `app/drizzle/meta/_journal.json` (generated; commit it)
- `app/drizzle/meta/0000_snapshot.json` (generated; commit it)

## Files to Touch

- `app/package.json` — deps + scripts
- `app/package-lock.json` — regenerated by `npm install`
- `app/server/utils/env.ts` — flip DATABASE_URL to required
- `.env.example` — document DATABASE_URL as required

## Notes

- **DO NOT run `npm run dev` or any persistent server.** Verification uses `nuxi typecheck`, `npm run build`, and reading generated SQL only.
- The multi-file `server/db/schema/*.ts` pattern isn't strictly required by Drizzle but it's required by `phase2-nuxt/JOB.md` to avoid conflicts when the `schema` group's six parallel workers each add their own file.
- Timestamps MUST be `timestamp('col', { withTimezone: true })` per CODING.md §6 — never naive timestamps.
- Use Drizzle's `uuid('id').primaryKey().defaultRandom()` for all primary keys.
- If `drizzle-kit generate` produces warnings about missing types or version compatibility, note them in the DONE report — do NOT silence by downgrading/upgrading without a plan.
- After the migration file is generated, inspect it: column types should be `uuid`, `text`, `integer`, `timestamp with time zone`, `real`. Flag anything unexpected.
- English-only identifiers (`camelCase` TS → `snake_case` DB).
- No plaintext DB credentials in any committed file. The only place `DATABASE_URL` appears is the env module and `.env.example` (placeholder).
