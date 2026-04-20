# Completed: POST /api/jobs — create job + anonymous token + cookie
**Task:** api-jobs-create | **Status:** done | **Date:** 2026-04-20

## Changes Made
- `app/server/api/jobs/index.post.ts` (NEW, 84 lines) — Nitro handler for `POST /api/jobs`.
  - Zod `BodySchema` validates `sourceSoftware` + `targetSoftware` (enum `winmentor|saga`, must differ) and optional `billingEmail` (RFC email, ≤255 chars). Invalid body → 400.
  - Resolves optional user session via `getUserSession(event)`; anonymous allowed (`userId` may be null).
  - Mints token via `generateAnonymousToken()` from the shared util (never re-implemented).
  - Inserts into `jobs` via Drizzle with `status='created'`, `progressStage='awaiting_upload'`, `progressPct=0`, `expiresAt=NOW()+30d`. Uses `.returning()` to get the generated `id` and echo the canonicalised software fields.
  - Sets the path-scoped HttpOnly/Secure/SameSite=Strict cookie via `setAnonymousTokenCookie(event, id, token)`.
  - Returns `{ id, anonymousAccessToken, sourceSoftware, targetSoftware }`.

## Acceptance Criteria Check
- [x] Handler lives at the required path (`app/server/api/jobs/index.post.ts`) — single new file.
- [x] Rate limit already wired in `app/server/middleware/rate-limit.ts` (`POST /api/jobs` exact, 10/hr, IP-keyed) — verified before assuming; no local wiring needed.
- [x] Body validated via `readValidatedBody(event, BodySchema.parse)` — rejects with 400 on invalid input.
- [x] `sourceSoftware`/`targetSoftware` are `z.enum(['winmentor','saga'])` with a `.refine` that they differ.
- [x] `billingEmail` optional `z.string().email().max(255)`.
- [x] `userId` taken from `getUserSession` when present; null otherwise (anonymous allowed).
- [x] Anonymous token generated via existing util; set on row AND via `setAnonymousTokenCookie`.
- [x] `status='created'`, `progressStage='awaiting_upload'`, `progressPct=0`, `expiresAt=now+30d`.
- [x] Response shape `{ id, anonymousAccessToken, sourceSoftware, targetSoftware }`.

## Security Check
- [x] All DB access goes through Drizzle (no raw SQL in this file).
- [x] CSRF-protected via global `server/middleware/csrf.ts` — not bypassed.
- [x] `assertJobAccess` N/A (this endpoint *mints* the access token; nothing to assert on create).
- [x] `assertAdminSession` N/A (public endpoint).
- [x] Input Zod-validated (body).
- [x] No PII in logs (nothing is logged here; billing email stored only in DB).
- [x] Cookie is HttpOnly + Secure + SameSite=Strict, path-scoped to `/job/{id}` — inherited from `setAnonymousTokenCookie` util.
- [x] Rate limit applied (already configured in middleware for this exact route).

## Schema / Gaps
- `app/server/db/schema/jobs.ts` has no DB-level default for `expiresAt`, so the handler computes `new Date(Date.now() + 30d)` explicitly. No schema change needed.
- All required columns (`userId`, `anonymousAccessToken`, `sourceSoftware`, `targetSoftware`, `billingEmail`, `status`, `progressStage`, `progressPct`, `expiresAt`) already exist. No migration required.

## Validation
- `cd app && npx nuxi typecheck` → exit 0 (ran against the main worktree after copying the file in because the agent worktree lacks `node_modules`; file content identical to what is committed on this branch).

## Branch
- Group: `job/phase2-nuxt/api-jobs` (pre-existing, branched off `main`).
- Task: `job/phase2-nuxt/api-jobs-create` (created off the group branch).

## Notes for Orchestrator
- Worktree `node_modules` was not installed; typecheck ran in the main tree against a one-off copy of the file, then the copy was removed from `main`. Only the worktree/task-branch contains the new file. If future runs hit the same issue, symlinking `app/node_modules` into the worktree works.
