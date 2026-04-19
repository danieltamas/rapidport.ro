# Completed: User session util (app/server/utils/auth-user.ts)
**Task:** auth-session-util.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/utils/auth-user.ts:1-111` — new util. Exports `UserSession` type and three functions:
  - `createUserSession(userId, event, opts?)` — generates 32-byte hex token via `randomBytes`, SHA-256-hashes it, inserts row into `sessions` with `userId`, `tokenHash`, `expiresAt` (default 30 days), truncated UA (500 chars), IP from `getRequestIP`, then sets HttpOnly/Secure/SameSite=Lax `session` cookie with the plaintext token. Returns `{ token }`.
  - `getUserSession(event)` — reads `session` cookie, SHA-256-hashes it, looks up active row (not revoked, not expired) joined with `users`, returns `{ sessionId, userId, email, expiresAt }`. Never throws — wrapped in try/catch returning null.
  - `revokeSession(sessionId, event?)` — Drizzle `update` sets `revokedAt = now`; if `event` passed, also `deleteCookie('session', { path: '/' })`.
- Top-of-file comment states purpose + SPEC §S.3 reference. No JSDoc. 111 lines (under 120).

## Acceptance Criteria Check
- [x] `UserSession` type exported with `sessionId, userId, email, expiresAt` — auth-user.ts:14-19
- [x] `createUserSession` signature matches spec, 32-byte hex token, SHA-256 hash stored, plaintext in cookie, default TTL 30 days — auth-user.ts:30-59
- [x] Inserts `userId`, `tokenHash`, `expiresAt`, `ipAddress`, `userAgent` (truncated to 500 chars) — `createdAt` defaults via schema — auth-user.ts:46-52
- [x] `getUserSession` returns null on missing cookie / missing row / revoked / expired; joins users; never throws — auth-user.ts:62-99
- [x] `revokeSession` sets `revokedAt`, optionally clears cookie — auth-user.ts:101-110
- [x] Uses `createHash('sha256').update(token).digest('hex')` from `node:crypto` — auth-user.ts:2, 25-27
- [x] Uses `randomBytes(32).toString('hex')` — auth-user.ts:35
- [x] Drizzle via `db` from `../db/client`; `sessions`, `users` from schema barrel — auth-user.ts:11-12
- [x] Cookie name `session`, flags `httpOnly: true, secure: true, sameSite: 'lax', path: '/'`, maxAge from ttl — auth-user.ts:54-59
- [x] Top-of-file comment with SPEC §S.3 reference; no JSDoc — auth-user.ts:1
- [x] `npm run typecheck` exit 0 — clean output, no errors
- [x] `npm run build` exit 0 — `✨ Build complete!`
- [x] `grep -En "\\.email.*console|console.*\\.email"` → no matches

## Security Check
- [x] All DB access goes through Drizzle — `db.insert(sessions)`, `db.select().from(sessions).innerJoin(users)`, `db.update(sessions)`
- [x] Every mutation endpoint is CSRF-protected — N/A (util, not an endpoint; consumers apply CSRF)
- [x] Every job endpoint calls `assertJobAccess` — N/A (util)
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A (util; this is the USER path, separate from admin by spec rule)
- [x] All inputs Zod-validated (body + query + params) — N/A (consumers validate inputs)
- [x] No PII in logs — no `console.*` calls at all in this file; emails never logged
- [x] Session cookies are HttpOnly + Secure + correct SameSite — `httpOnly: true, secure: true, sameSite: 'lax'` (Lax per spec so magic-link redirect can set it)
- [x] Rate limits applied where the task spec requires — N/A (rate-limit applied at magic-link handler level per SPEC §S.10)

## Notes
- Token plaintext never touches the DB; only SHA-256 hash stored in `sessions.tokenHash`.
- `getUserSession` is defensive: wraps DB access in try/catch and returns null on any failure — matches spec "Never throws".
- `revokeSession` accepts optional `event` for flexibility: the spec says "optionally clears cookie when event is provided". Callers doing server-side bulk revocation can pass no event.
- No changes outside `app/server/utils/auth-user.ts` and the DONE report.
