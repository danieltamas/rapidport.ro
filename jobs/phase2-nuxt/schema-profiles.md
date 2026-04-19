---
title: Mapping profiles sub-file
priority: high
status: todo
group: schema
phase: 2
branch: job/phase2-nuxt/schema-schema-profiles
spec-ref: SPEC.md §2.1 — `mapping_profiles`; docs/adr-001-code-mapping.md
---

## Description

Add `app/server/db/schema/mapping_profiles.ts`. **Do NOT extend `mapping_cache.ts`** — Phase 1's shape is sufficient for now, and the table is owned by other workers/tasks; if growth is needed, a later task will handle it. **Do NOT touch the barrel `app/server/db/schema.ts`, and do NOT run `db:generate` — the orchestrator handles both at group-merge.**

## Why It Matters

`pages-mapping` (Phase 2 mapping-review UI) consumes `mapping_profiles` for save/load of named mapping rule sets — the carry-forward from Phase 1 GATE.md item #2. `schema-jobs-payments` adds a FK from `jobs.mappingProfileId` → `mappingProfiles.id` (that worker handles the forward reference on their side; you don't need to coordinate).

## Acceptance Criteria

### File: `app/server/db/schema/mapping_profiles.ts` (NEW)

- [ ] Table `mappingProfiles`, table name `mapping_profiles`:
  - `id: uuid('id').primaryKey().defaultRandom()`
  - `userId: uuid('user_id').references(() => users.id)` — nullable (system/public profiles have no owner). Import `users` from `./users`.
  - `name: text('name').notNull()` — user-provided name.
  - `sourceSoftwareVersion: text('source_software_version')` — e.g. `'winmentor-3.0'`.
  - `targetSoftwareVersion: text('target_software_version')` — e.g. `'saga-c-3.0'`.
  - `mappings: jsonb('mappings').notNull()` — serialized mapping rules (shape defined by Phase 2 `pages-mapping` task).
  - `isPublic: boolean('is_public').default(false).notNull()` — admin promotes popular profiles to community.
  - `adoptionCount: integer('adoption_count').default(0).notNull()` — for admin analytics.
  - `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`
- [ ] Index: `index().on(t.userId)`, `index().on(t.isPublic)`.

### Files you MAY NOT edit

- `app/server/db/schema.ts` (barrel)
- `app/drizzle/**`
- `app/server/db/schema/jobs.ts`, `mapping_cache.ts` — other workers' / existing files
- Any other schema sub-file, middleware, handler, page, util, package.json

### Verification (worker runs)

- [ ] `cd app && npx nuxi typecheck` → exit 0
- [ ] `cd app && npm run build` → exit 0

## Files to Create

- `app/server/db/schema/mapping_profiles.ts`

## Notes

- Style guide: `app/server/db/schema/users.ts` + `sessions.ts` (merged in Wave 1).
- **English-only identifiers and comments.**
- No new npm dependencies.
- Keep the file under 40 lines.

## Worker Rules

- **Branch:** `job/phase2-nuxt/schema-schema-profiles`. Verify.
- **Commits:** 1-2 commits, scope `db`. **NEVER Co-Authored-By.**
- **DONE report:** `jobs/phase2-nuxt/DONE-schema-profiles.md`.
- **Permission denials:** stop and report.
- **No `db:generate`, `db:migrate`, or dev/preview server.**
