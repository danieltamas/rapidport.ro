---
title: User session util (app/server/utils/auth-user.ts)
priority: critical
status: todo
group: auth-user
phase: 2
branch: job/phase2-nuxt/auth-user-auth-session-util
spec-ref: SPEC.md §S.3 "User Authentication"; CODING.md §13.5 (token hashing)
---

## Description

Create `app/server/utils/auth-user.ts` — the user-session utility consumed by `auth-magic-link-verify` (issues session) and `assert-job-access` (reads session). Session tokens are stored **hashed** in `sessions.token_hash`; the plaintext lives only in the `session` cookie.

## Why It Matters

This is the single point of truth for user session lifecycle. Every route that needs "who is this user" reads from here. Separate from admin sessions (SPEC rule: "user auth and admin auth never share code paths").

## Acceptance Criteria

### File: `app/server/utils/auth-user.ts`

Exports three functions + one TypeScript type:

- [ ] `export type UserSession = { sessionId: string; userId: string; email: string; expiresAt: Date };`

- [ ] `export async function createUserSession(userId: string, event: H3Event, opts?: { ttlMs?: number }): Promise<{ token: string }>` — generates 32-byte random token (`crypto.randomBytes(32).toString('hex')`), computes SHA-256 hex hash, inserts into `sessions` (`userId`, `tokenHash`, `createdAt`, `expiresAt = now + ttlMs`, `ipAddress` via `getRequestIP`, `userAgent` truncated to 500 chars), sets cookie `session` with the **plaintext token** (HttpOnly, Secure, SameSite=Lax, path=`/`, maxAge from ttl). Returns the plaintext token (for tests). **Default TTL: 30 days.**

- [ ] `export async function getUserSession(event: H3Event): Promise<UserSession | null>` — reads `session` cookie, SHA-256-hashes it, looks up `sessions` by `tokenHash`. Returns null if: cookie missing, row missing, `revokedAt` set, `expiresAt` past. Otherwise joins `users` on `userId`, returns `{ sessionId, userId, email, expiresAt }`. Never throws.

- [ ] `export async function revokeSession(sessionId: string): Promise<void>` — sets `revokedAt = now` via Drizzle `update`. Also clears the `session` cookie if an `event` is provided — accept optional second arg `event?: H3Event` and delete the cookie when present.

- [ ] Uses `createHash('sha256').update(token).digest('hex')` for the hash — import from `node:crypto`.
- [ ] Uses `randomBytes(32).toString('hex')` for token gen.
- [ ] Uses Drizzle (`db` from `../db/client`) for all DB access; `sessions` and `users` from the schema barrel.
- [ ] Cookie name: `session`. Flags: `httpOnly: true`, `secure: true`, `sameSite: 'lax'` (Lax, not Strict — lets magic-link verify redirect set the cookie on first request), `path: '/'`.
- [ ] Top-of-file comment: one line stating file purpose + SPEC §S.3 reference. No JSDoc.

### Verification (worker runs)

- [ ] `cd app && npx nuxi typecheck` → exit 0
- [ ] `cd app && npm run build` → exit 0
- [ ] `grep -En "\\.email.*console|console.*\\.email" app/server/utils/auth-user.ts` → **no matches** (no PII in logs)

### Out of scope

- The magic-link-request and magic-link-verify handlers — separate tasks (`auth-magic-link-request`, `auth-magic-link-verify`).
- Claim-on-login (linking anonymous jobs to the user after first login) — happens inside `auth-magic-link-verify`.
- Tests — `ci-security-tests` group.

## Files to Create

- `app/server/utils/auth-user.ts`

## Files you MAY NOT edit

- `app/server/utils/env.ts`, `app/server/utils/anonymous-token.ts` (sibling worker's territory), `app/server/utils/auth-admin.ts` (sibling), `app/server/utils/assert-admin-session.ts` (sibling), `app/server/middleware/admin-auth.ts` (sibling), `app/server/db/**`, `app/server/api/**`, any page, any `package.json`.

## Notes

- **English-only identifiers and comments.**
- Keep the file under 120 lines.
- Do NOT log emails, tokens, or hashes — if you need a debug line, log only `userId` or `sessionId`.
- H3 imports: `getCookie`, `setCookie`, `deleteCookie`, `getRequestIP`, `getHeader` — import from `h3`. `H3Event` too.

## Worker Rules

- **Branch:** `job/phase2-nuxt/auth-user-auth-session-util` (pre-created from `job/phase2-nuxt/auth-user` from `main`). Verify.
- **Commits:** 1-2 commits, scope `auth`. **NEVER add a Co-Authored-By trailer.**
- **DONE report:** `jobs/phase2-nuxt/DONE-auth-session-util.md`.
- **Permission denials:** stop and report.
- **No dev/preview server.**
