# Completed: api-admin-users — list + detail + grant-syncs + block + unblock + delete

**Task:** api-admin-users (PLAN-api-admin-wave-b.md Task 2) | **Status:** done | **Date:** 2026-04-20

## Changes Made
- `app/server/api/admin/users/index.get.ts` — paginated user list with `q`/`state`/`page`/`pageSize`/`sort`/`order` filters; whitelisted sort column map; best-effort `users_list_viewed` audit.
- `app/server/api/admin/users/[id].get.ts` — user detail + `Promise.all` over user row, jobs count, recent 10 jobs (anonymousAccessToken intentionally omitted), payments total (count + sum), payments succeeded (count + sum→revenueBani); 404 on missing user; best-effort `user_viewed` audit.
- `app/server/api/admin/users/[id]/grant-syncs.post.ts` — atomic `deltaSyncsAllowed += additional` across all of the user's jobs; transactional `user_syncs_granted` audit; returns `{ok, jobsAffected}`.
- `app/server/api/admin/users/[id]/block.post.ts` — 404 on missing, 409 `already_blocked`; sets `blocked_at=now()`, `blocked_reason`; transactional `user_blocked` audit.
- `app/server/api/admin/users/[id]/unblock.post.ts` — 404 on missing, 409 `not_blocked`; clears `blocked_at`/`blocked_reason`; transactional `user_unblocked` audit (reason captured for symmetry).
- `app/server/api/admin/users/[id].delete.ts` — captures id + email before purge, delegates to `purgeUserData({userId, email})` helper (not re-implemented), then writes post-purge `user_deleted` audit with `{reason, originalEmailHashPrefix}` (sha256(email).slice(0,8)).

## Acceptance Criteria Check
- [x] `GET /api/admin/users` — Zod query schema, state filter uses blockedAt/deletedAt correctly, whitelisted sort, best-effort audit, returns `{rows, page, pageSize, total}` with ISO timestamps, no anonymousAccessToken.
- [x] `GET /api/admin/users/[id]` — UUID param, Promise.all over 5 queries, 404 if missing, recentJobs excludes `anonymousAccessToken` via explicit column list, revenueBani from succeeded payments only.
- [x] `POST /api/admin/users/[id]/grant-syncs` — Body `{additional:int(1..20), reason:min5..max500}`, atomic increment via `sql` template, transactional audit, returns rowCount as `jobsAffected`.
- [x] `POST /api/admin/users/[id]/block` — 404/409 correct, transactional audit.
- [x] `POST /api/admin/users/[id]/unblock` — 404/409 correct, transactional audit.
- [x] `DELETE /api/admin/users/[id]` — captures email BEFORE purge, calls `purgeUserData`, audits AFTER with hash prefix (no plaintext PII).

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — `sql\`${jobs.userId} = ${id} AND ${payments.status} = 'succeeded'\`` in detail endpoint, `sql\`${jobs.deltaSyncsAllowed} + ${body.additional}\`` in grant-syncs.
- [x] Every mutation endpoint is CSRF-protected — handled globally by Nitro CSRF middleware; no bypass.
- [x] Every job endpoint calls `assertJobAccess` — N/A (these are admin-scoped user endpoints, not job endpoints).
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — upstream `middleware/admin-auth.ts` enforces; each handler also defensively calls `getAdminSession` and 401s if missing; every mutation writes transactionally, every read writes best-effort.
- [x] All inputs Zod-validated (body + query + params) — `getValidatedQuery`, `readValidatedBody`, `getValidatedRouterParams` used in every handler.
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — delete endpoint stores `originalEmailHashPrefix` (first 8 chars of SHA-256), not plaintext; IP hashed; UA capped at 500 chars.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A (handlers don't set session cookies; admin session lifecycle is in `auth-admin.ts`).
- [x] Rate limits applied where the task spec requires — task spec does not mandate specific limits on these admin endpoints; admin surface is allowlist-gated, further rate-limiting is a Wave B cross-cutting concern handled by the global admin middleware when added.
- [x] No `anonymousAccessToken` in any response — list endpoint selects only whitelisted columns; detail endpoint uses explicit column list for recentJobs.
- [x] Whitelisted sort column map (`SORT_COLUMNS`) — never interpolate user input into ORDER BY.
- [x] Audit is SYNCHRONOUS + TRANSACTIONAL for every mutation (Wave B policy) — grant-syncs, block, unblock wrap update + audit insert in one `db.transaction`. Delete audits AFTER `purgeUserData` (the purge is itself atomic; auditing post-commit records the fact it happened, which is the same shape used by the user-initiated `DELETE /api/me`).

## Typecheck
`cd app && npx nuxi typecheck` — no errors printed (output stopped at `[nuxt] ℹ Running with compatibility version 4` banner, typical of a clean pass). Redirect-based exit-code capture was blocked by the Bash sandbox in this worktree, so exit code not captured programmatically. Code reviewed for Drizzle typing (`result.rowCount ?? 0` matches `pg.QueryResult.rowCount: number | null`), Zod schema correctness, and h3/drizzle import alignment with the existing Wave A admin endpoints.

## Files Touched (6 new, 0 modified)
- NEW `app/server/api/admin/users/index.get.ts`
- NEW `app/server/api/admin/users/[id].get.ts`
- NEW `app/server/api/admin/users/[id]/grant-syncs.post.ts`
- NEW `app/server/api/admin/users/[id]/block.post.ts`
- NEW `app/server/api/admin/users/[id]/unblock.post.ts`
- NEW `app/server/api/admin/users/[id].delete.ts`

## Notes for orchestrator
- Branch: `job/phase2-nuxt/api-admin-wave-b-users`
- Commit: see git log (`feat(admin): users — list + detail + grant-syncs + block + unblock + delete`).
- No modifications to `purge-user.ts`, `auth-user.ts`, schema, drizzle migrations, or any other file outside the 6 listed.
- No deps installed beyond `npm install --ignore-scripts` needed for typecheck environment.
- The worker running this task observed that the Bash sandbox in this worktree blocks `;`, `$?`, and most output-redirect patterns — typecheck exit code could not be captured to a file. The typecheck tool produced no error output.
