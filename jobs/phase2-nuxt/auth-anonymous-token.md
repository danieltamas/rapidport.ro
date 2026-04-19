---
title: Anonymous job access token util (app/server/utils/anonymous-token.ts)
priority: critical
status: todo
group: auth-user
phase: 2
branch: job/phase2-nuxt/auth-user-auth-anonymous-token
spec-ref: SPEC.md §S.3 "Anonymous mode"; CODING.md §13.5, §13.8
---

## Description

Create `app/server/utils/anonymous-token.ts` — issues + verifies the per-job anonymous access token that lets unauthenticated visitors revisit their job. Token is stored plaintext on `jobs.anonymousAccessToken` (the row itself is the capability), scoped to the job path via cookie, constant-time compared on read.

## Why It Matters

Anonymous mode is the default flow — accountants upload a file before signing up. The job UUID in the URL is unguessable (128-bit), but adding the anonymous access token gives defense in depth: even if a URL leaks, the attacker needs the cookie to act on the job.

## Acceptance Criteria

### File: `app/server/utils/anonymous-token.ts`

Exports two functions:

- [ ] `export function generateAnonymousToken(): string` — 32-byte random hex (`randomBytes(32).toString('hex')` → 64 chars). The caller (api-jobs-create) persists this on `jobs.anonymousAccessToken`.

- [ ] `export function setAnonymousTokenCookie(event: H3Event, jobId: string, token: string): void` — sets cookie `job_access_${jobId}` with the token. Flags: `httpOnly: true`, `secure: true`, `sameSite: 'strict'`, `path: \`/job/${jobId}\``, `maxAge: 30 * 24 * 3600` (30 days).

- [ ] `export function verifyAnonymousToken(event: H3Event, jobId: string, jobToken: string): boolean` — reads cookie `job_access_${jobId}` OR header `x-job-token` (cookie preferred), constant-time compares against `jobToken` via `crypto.timingSafeEqual` on equal-length buffers. Returns `false` on missing/mismatch. Never throws.

- [ ] `timingSafeEqual` MUST be called only on equal-length buffers (short-circuit on length mismatch).

- [ ] Uses `node:crypto` (`randomBytes`, `timingSafeEqual`) — no new npm dep.

- [ ] H3 imports: `H3Event`, `setCookie`, `getCookie`, `getHeader` from `h3`.

- [ ] Top-of-file comment: one line purpose + spec references.

### Verification (worker runs)

- [ ] `cd app && npx nuxi typecheck` → exit 0
- [ ] `cd app && npm run build` → exit 0

### Out of scope

- Storing the token on the job row — that happens in the `api-jobs-create` handler (calls `generateAnonymousToken` + persists).
- The three-way check in `assert-job-access.ts` — separate sibling task (`auth-job-access`) that consumes `verifyAnonymousToken`.

## Files to Create

- `app/server/utils/anonymous-token.ts`

## Files you MAY NOT edit

- `app/server/utils/env.ts`, `app/server/utils/auth-user.ts` (sibling), `app/server/utils/auth-admin.ts` (sibling), `app/server/utils/assert-admin-session.ts` (sibling), `app/server/middleware/admin-auth.ts` (sibling), `app/server/db/**`, any API handler, any page, any `package.json`.

## Notes

- **English-only identifiers and comments.**
- Keep the file under 70 lines.
- No DB access in this file — pure cookie + crypto. The job row holds the token; this file only issues/verifies.
- **No PII in logs** — don't log jobId or token; log only error context without identifiers.

## Worker Rules

- **Branch:** `job/phase2-nuxt/auth-user-auth-anonymous-token` (pre-created from `job/phase2-nuxt/auth-user` from `main`). Verify.
- **Commits:** 1 commit + DONE report = 2 commits. Scope `auth`. **NEVER Co-Authored-By.**
- **DONE report:** `jobs/phase2-nuxt/DONE-auth-anonymous-token.md`.
- **Permission denials:** stop and report.
- **No dev/preview server.**
