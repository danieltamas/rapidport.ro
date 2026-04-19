# Completed: Job access check (assertJobAccess)
**Task:** auth-job-access.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/utils/assert-job-access.ts:1-62` — new composer utility implementing the three-way ownership check per CODING.md §13.8: fetch job (404 if missing) → admin session (with best-effort `admin_audit_log` insert) → user session (must own) → anonymous per-job token → default-deny 403. Returns `typeof jobs.$inferSelect` for downstream handler use.

## Acceptance Criteria Check
- [x] Step 0 fetches the job first; missing job ID throws 404 regardless of caller identity.
- [x] Step 1 calls `getAdminSession` (never-throws); on admin, inserts `admin_audit_log` row with `action='job_access'`, `targetType='job'`, `targetId=jobId`, `ipHash` (sha256 of IP), truncated UA. Insert wrapped in try/catch with non-PII `console.warn`; audit failure never blocks access.
- [x] Step 2 calls `getUserSession`; returns the job only when `job.userId === user.userId`.
- [x] Step 3 calls `verifyAnonymousToken(event, jobId, job.anonymousAccessToken)`; returns job on match.
- [x] Default path throws `createError({ statusCode: 403 })`.
- [x] Return type is `typeof jobs.$inferSelect`; comment documents that callers must strip `anonymousAccessToken` before serializing public responses.
- [x] Inline `sha256Hex` helper via `node:crypto` (no cross-file dep on `auth-admin.ts`'s private helper).
- [x] File is 62 lines (<90).
- [x] `cd app && npx nuxi typecheck` → exit 0 (no errors reported).
- [x] `cd app && npm run build` → exit 0 ("Build complete!").
- [x] `grep -En "console.*\.email|log.*token|log.*payload" app/server/utils/assert-job-access.ts` → no matches.
- [x] Three paths appear in order: `getAdminSession` → `getUserSession` → `verifyAnonymousToken`.

## Security Check
- [x] All DB access goes through Drizzle (`db.select().from(jobs)`, `db.insert(adminAuditLog)`) — no raw SQL.
- [x] Every mutation endpoint is CSRF-protected — N/A (this is a utility, not an endpoint; downstream handlers enforce CSRF).
- [x] Every job endpoint calls `assertJobAccess` — this utility IS that gate.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A; this util is triggered from user-facing `/api/jobs/*` and writes `admin_audit_log` only when the caller happens to be an admin.
- [x] All inputs Zod-validated — N/A (caller validates `jobId` via `getValidatedRouterParams`).
- [x] No PII in logs — admin email never logged; IP is sha256-hashed before DB write; warning message is event-name only ("admin_audit_log insert failed for job_access"); anonymous token never logged.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — handled by `auth-user`, `auth-admin`, `anonymous-token` (read-only here).
- [x] Rate limits applied where the task spec requires — N/A (per-route concern).
- [x] Default-deny 403 at the end; fetch-first ordering prevents admin-path probing from leaking job existence.
- [x] Audit-write failure cannot suppress admin access, but also cannot allow non-admin access (try/catch scoped to the insert only).
