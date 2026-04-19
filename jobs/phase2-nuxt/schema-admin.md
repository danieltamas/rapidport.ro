---
title: Admin schema (admin_sessions, admin_oauth_state)
priority: critical
status: todo
group: schema
phase: 2
branch: job/phase2-nuxt/schema-schema-admin
spec-ref: SPEC.md §2.1 — `admin_sessions`, `admin_oauth_state` tables
---

## Description

Add two Drizzle tables as new sub-files under `app/server/db/schema/`, matching the style of `users.ts` / `sessions.ts` (merged in Wave 1 — read those first as the style guide). **You do NOT touch the barrel `app/server/db/schema.ts`, and you do NOT run `db:generate` — the orchestrator handles both at group-merge time after all 5 Wave 2 schema workers finish.**

## Why It Matters

Admin auth (`auth-admin` group) is blocked on these tables. Separate from user `sessions` per SPEC — no code path shares between user auth and admin auth.

## Acceptance Criteria

### File: `app/server/db/schema/admin_sessions.ts`

- [ ] Table `adminSessions`, table name `admin_sessions`:
  - `id: uuid('id').primaryKey().defaultRandom()`
  - `email: text('email').notNull()` — the Google-verified admin email from OAuth callback. No FK to `users` (admins are outside the user table).
  - `tokenHash: text('token_hash').notNull().unique()` — SHA-256 hex of the cookie value; plaintext only in the cookie.
  - `ipHash: text('ip_hash').notNull()` — SHA-256 hex of remote IP at session creation, used for IP binding.
  - `userAgent: text('user_agent')` — truncated in handler.
  - `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`
  - `expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()` — 8h TTL enforced by handler.
  - `revokedAt: timestamp('revoked_at', { withTimezone: true })`
- [ ] Index: `index().on(t.email)`, `index().on(t.expiresAt)`.

### File: `app/server/db/schema/admin_oauth_state.ts`

- [ ] Table `adminOauthState`, table name `admin_oauth_state`:
  - `state: text('state').primaryKey()` — random, short-lived.
  - `codeVerifier: text('code_verifier').notNull()` — PKCE verifier.
  - `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`
- [ ] No indexes — PK is enough for lookup.
- [ ] Comment at top: "Rows expire after 10 min via `cleanup-cron-support` — not enforced in schema."

### Files you MAY NOT edit

- `app/server/db/schema.ts` (barrel)
- `app/drizzle/**` (no migration generation)
- Any other schema sub-file
- Any middleware, handler, page, util, package.json

### Verification (worker runs)

- [ ] `cd app && npx nuxi typecheck` → exit 0
- [ ] `cd app && npm run build` → exit 0
- [ ] Do NOT run `npm run db:generate` / `db:migrate` / `db:push` / `db:studio`.

## Files to Create

- `app/server/db/schema/admin_sessions.ts`
- `app/server/db/schema/admin_oauth_state.ts`

## Notes

- **Style guide: read `app/server/db/schema/users.ts`, `sessions.ts`, `magic_link_tokens.ts`.** Match imports, formatting, comments exactly.
- **English-only identifiers and comments.**
- Orchestrator will append `export * from './schema/admin_sessions'; export * from './schema/admin_oauth_state';` to the barrel — your worker must NOT do this.
- Keep each sub-file under 40 lines.

## Worker Rules

- **Branch:** `job/phase2-nuxt/schema-schema-admin` (pre-created). Verify with `git branch --show-current`.
- **Commits:** 1-2 commits, Conventional Commits with scope `db`. **NEVER add a Co-Authored-By trailer.**
- **DONE report:** `jobs/phase2-nuxt/DONE-schema-admin.md` — use the CLAUDE.md template.
- **Permission denials:** stop and report.
- **No dev/preview server.**
