# Completed: Anonymous job access token util
**Task:** auth-anonymous-token.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/utils/anonymous-token.ts:1-45` — new util exporting `generateAnonymousToken` (32-byte hex via `randomBytes`), `setAnonymousTokenCookie` (path-scoped `job_access_${jobId}` cookie, HttpOnly + Secure + SameSite=Strict, 30-day TTL), and `verifyAnonymousToken` (reads cookie or `x-job-token` header, length-gated `timingSafeEqual` over UTF-8 buffers, never throws).

## Acceptance Criteria Check
- [x] `generateAnonymousToken` — `randomBytes(32).toString('hex')` (64 chars).
- [x] `setAnonymousTokenCookie` — cookie `job_access_${jobId}`, `httpOnly: true`, `secure: true`, `sameSite: 'strict'`, `path: /job/${jobId}`, `maxAge: 30 * 24 * 3600`.
- [x] `verifyAnonymousToken` — cookie preferred, header `x-job-token` fallback, constant-time compare, `false` on missing/mismatch, never throws.
- [x] `timingSafeEqual` guarded by length-equality short-circuit on UTF-8 buffers.
- [x] Only `node:crypto` + `h3` imports (no new npm deps).
- [x] H3 imports: `H3Event` (type), `setCookie`, `getCookie`, `getHeader`.
- [x] Top-of-file purpose + spec references comment.
- [x] File under 70 lines (45 lines).
- [x] No DB access; pure cookie + crypto.
- [x] No jobId or token in any log path (file has no log calls).
- [x] `cd app && npx nuxi typecheck` → exit 0.
- [x] `cd app && npm run build` → exit 0.

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — n/a, no DB access in this file.
- [x] Every mutation endpoint is CSRF-protected — n/a, util file, no endpoints.
- [x] Every job endpoint calls `assertJobAccess` — n/a, consumer is a sibling task.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — n/a.
- [x] All inputs Zod-validated (body + query + params) — n/a, util file.
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — no logging performed; jobId/token never reach a logger.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — cookie set with `httpOnly: true`, `secure: true`, `sameSite: 'strict'`, path-scoped to `/job/${jobId}`.
- [x] Rate limits applied where the task spec requires — n/a, util file; rate limiting lives on consumer endpoints.
