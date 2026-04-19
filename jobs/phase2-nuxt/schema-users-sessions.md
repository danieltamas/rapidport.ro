---
title: Users/sessions/magic-link-tokens schema sub-files
priority: critical
status: todo
group: schema
phase: 2
branch: job/phase2-nuxt/schema-schema-users-sessions
spec-ref: SPEC.md §"Database Schema" — `users`, `sessions`, `magic_link_tokens` tables
---

## Description

Add three Drizzle tables as sub-files under `app/server/db/schema/` following the existing split pattern (`jobs.ts`, `mapping_cache.ts`, `ai_usage.ts` already there). Re-export from the barrel `app/server/db/schema.ts`. Generate the migration via `drizzle-kit generate`. **This task establishes the "one sub-file per table group" convention that all other `schema-*` tasks will follow** — it merges before any of them start.

## Why It Matters

User auth (`auth-user` group) cannot start without these tables. The split into per-group sub-files is what makes the remaining 5 `schema-*` tasks parallelizable without merge conflicts on a single `schema.ts`.

## Acceptance Criteria

### File: `app/server/db/schema/users.ts`

- [ ] `users` table with columns per SPEC (use existing `jobs.ts` as a style guide — `pgTable`, `.notNull()`, `defaultRandom()`, timestamps with `withTimezone: true`):
  - `id: uuid('id').primaryKey().defaultRandom()`
  - `email: text('email').notNull().unique()` — case-insensitive uniqueness via `unique()` is acceptable at the app layer (no citext extension required); lowercase in handlers before insert.
  - `emailHash: text('email_hash').notNull()` — SHA-256 hex, used for log redaction lookup.
  - `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`
  - `lastLoginAt: timestamp('last_login_at', { withTimezone: true })`
  - `deletedAt: timestamp('deleted_at', { withTimezone: true })` — soft-delete marker for GDPR purge (null = active).
- [ ] Index: `index().on(t.emailHash)` for hash lookups.

### File: `app/server/db/schema/sessions.ts`

- [ ] `sessions` table (user sessions — NOT admin sessions, which live in `schema-admin`):
  - `id: uuid('id').primaryKey().defaultRandom()`
  - `userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })`
  - `tokenHash: text('token_hash').notNull().unique()` — SHA-256 hex of the session cookie value; the cookie holds the plaintext, DB stores only hash.
  - `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`
  - `expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()`
  - `revokedAt: timestamp('revoked_at', { withTimezone: true })` — null = active.
  - `ipAddress: text('ip_address')` — for audit; no IP binding on user sessions (unlike admin).
  - `userAgent: text('user_agent')` — truncated to 500 chars in handler.
- [ ] Index: `index().on(t.userId)`, `index().on(t.expiresAt)` (for sweep queries).
- [ ] Import `users` from `./users` for the FK reference.

### File: `app/server/db/schema/magic_link_tokens.ts`

- [ ] `magicLinkTokens` table (hashed magic-link tokens — plaintext never in DB):
  - `id: uuid('id').primaryKey().defaultRandom()`
  - `email: text('email').notNull()` — lowercased before insert. Token is pre-user-creation on first login, so no FK.
  - `tokenHash: text('token_hash').notNull().unique()` — SHA-256 hex.
  - `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`
  - `expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()` — 15 min TTL per SPEC.
  - `consumedAt: timestamp('consumed_at', { withTimezone: true })` — null until single-use claim.
  - `ipAddress: text('ip_address')` — where the magic-link was requested from.
- [ ] Index: `index().on(t.email, t.expiresAt)` for rate-limit lookup by email; `index().on(t.tokenHash)` redundant with the `unique()` constraint — do NOT add.

### File: `app/server/db/schema.ts` (barrel)

- [ ] Add three exports in the pattern the file already uses:
  ```ts
  export * from './schema/users';
  export * from './schema/sessions';
  export * from './schema/magic_link_tokens';
  ```
- [ ] Do NOT rewrite the file's comment or existing exports.

### Migration

- [ ] Run `cd app && npm run db:generate` (drizzle-kit generate) → commits the new SQL file under `app/drizzle/`.
- [ ] Commit the generated `.sql` file alongside the schema changes.
- [ ] Do NOT run `npm run db:migrate` (no local DB available to apply it — orchestrator or Dani applies migrations, not workers).

### Verification

- [ ] `cd app && npx nuxi typecheck` passes.
- [ ] `cd app && npm run build` passes.
- [ ] The generated migration SQL file is committed.
- [ ] `grep -rn "from '.\\./users'" app/server/db/schema/sessions.ts` returns the FK import.

### Out of scope

- `admin_sessions`, `admin_oauth_state` — `schema-admin` task.
- `payments`, `stripe_events`, extending `jobs` — `schema-jobs-payments`.
- `audit_log`, `admin_audit_log` — `schema-audit`.
- `mapping_profiles` — `schema-profiles`.
- Running migrations (applies to live DB) — operator task.

## Files to Create

- `app/server/db/schema/users.ts`
- `app/server/db/schema/sessions.ts`
- `app/server/db/schema/magic_link_tokens.ts`
- `app/drizzle/<generated-timestamp>_<name>.sql` (generated by drizzle-kit)
- `app/drizzle/meta/*.json` (generated journal update)

## Files to Touch

- `app/server/db/schema.ts` — add 3 re-export lines at the bottom, nothing else.

## Notes

- **Match the existing sub-file style exactly.** Read `app/server/db/schema/jobs.ts` first. Same imports, same formatting, same kind of comments.
- **English-only identifiers and comments.**
- SHA-256 hashing happens in handlers (`auth-*` tasks), not in the schema — schema just stores the hex string.
- Keep each sub-file under 50 lines.
- Do NOT touch any other file under `app/server/db/` beyond the three new sub-files + the barrel.

## Worker Rules

- **Branch:** `job/phase2-nuxt/schema-schema-users-sessions` (pre-created). Verify with `git branch --show-current`.
- **Files you may edit:** the four files listed under "Files to Create" + `app/server/db/schema.ts` + this task's `DONE-schema-users-sessions.md`.
- **Files you MUST NOT edit:** `app/server/db/schema/jobs.ts`, `app/server/db/schema/mapping_cache.ts`, `app/server/db/schema/ai_usage.ts`, `app/server/db/client.ts`, `drizzle.config.ts`, `package.json`, any middleware, any page, any handler.
- **Permission denials:** stop and report.
- **Commit granularity:** 2-3 commits (schema files → barrel → generated migration), all with scope `db` or `sql`.
- **DONE report:** `jobs/phase2-nuxt/DONE-schema-users-sessions.md`.
- **Run `npm run db:generate` — do NOT run `npm run db:migrate` or any command that would connect to the live DB.**
- **No dev/preview server.**
