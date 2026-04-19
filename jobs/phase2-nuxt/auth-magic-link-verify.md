---
title: Magic-link verify handler (GET /api/auth/verify)
priority: critical
status: todo
group: auth-user
phase: 2
branch: job/phase2-nuxt/auth-user-auth-magic-link-verify
spec-ref: SPEC.md §S.3; CODING.md §13.5
---

## Description

Create `app/server/api/auth/verify.get.ts` — consumes a magic link: single-use check, expiry check, creates/finds user, issues session cookie, redirects to `/` (or to `?next=<path>` if present and same-origin).

## Acceptance Criteria

### File: `app/server/api/auth/verify.get.ts` (NEW)

- [ ] Zod query schema: `{ token: z.string().min(32), next: z.string().optional() }` — via `getValidatedQuery`. Invalid → 400.
- [ ] SHA-256 hash the token. Look up `magic_link_tokens` by `tokenHash`. If:
  - no row → 400 `Invalid or expired link` (Romanian user copy).
  - `consumedAt` not null → 400 `Link already used`.
  - `expiresAt < now()` → 400 `Invalid or expired link`.
  - otherwise → proceed.
- [ ] **Atomically mark consumed + find-or-create user in ONE transaction:**
  1. `UPDATE magic_link_tokens SET consumedAt = now() WHERE id = $1 AND consumedAt IS NULL RETURNING *` — if rowCount is 0 the token was consumed between lookup and update (race); fail as `Link already used`.
  2. `SELECT id FROM users WHERE email = $1` — if missing, insert with `email` (lowercased), `emailHash = sha256(email)`, `createdAt = now()`.
  3. Update `users.lastLoginAt = now()`.
  4. Call `createUserSession(userId, event)` from `~/server/utils/auth-user`.
- [ ] **Anonymous job claim-on-login:** after session created, attempt `UPDATE jobs SET user_id = $1 WHERE user_id IS NULL AND anonymous_access_token IS NOT NULL AND <cookie-evidence>` — actually this is complex; SCOPE DOWN: query cookies of the form `job_access_*` from `event.headers.cookie`, parse out the `jobId` from each name, and for each jobId, `UPDATE jobs SET user_id = $1 WHERE id = $2 AND user_id IS NULL`. Best-effort — wrap in try/catch, log `job_claimed_count` count only.
- [ ] Redirect: if `next` query param is present, is same-origin, and starts with `/`, redirect there; else redirect to `/`. Use `sendRedirect(event, target, 303)`.
- [ ] **No PII in logs.** Log only `event: 'magic_link_verified'` + `userId` (hash-prefix would be even better but userId alone is fine — it's a UUID, not PII per se).

### Files you MAY NOT edit

- All util files, middleware, schema, `package.json`, `nuxt.config.ts`, sibling handlers.

## Notes

- **English-only identifiers/comments.** User-facing error messages in Romanian (short, no jargon).
- Use Drizzle `db.transaction(async (tx) => { ... })` for the atomic section.
- Import `createHash` from `node:crypto` for the token hash. Same pattern as `auth-user.ts`.
- Keep under 150 lines.
- **NEVER Co-Authored-By.**

## Worker Rules

- **Branch:** `job/phase2-nuxt/auth-user-auth-magic-link-verify`. Verify.
- **Commits:** 1-2, scope `auth`.
- **DONE report:** `jobs/phase2-nuxt/DONE-auth-magic-link-verify.md`.
- **Verification:** typecheck + build green.
- **No dev/preview, no db: scripts.**
