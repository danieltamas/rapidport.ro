# Completed: GET /api/admin/jobs/[id] — full join + audit
**Task:** api-admin-jobs-detail.md | **Status:** done | **Date:** 2026-04-20

## Changes Made
- `app/server/api/admin/jobs/[id].get.ts:1-78` — new handler. Zod-validates path UUID, fetches admin session (defensive — middleware already guards), writes `admin_audit_log` row with `action='job_viewed'` BEFORE data fetch (audit-precedes-data, wrapped in try/catch so an audit write failure still logs and proceeds). Parallel `Promise.all` over `jobs.id = $1`, `payments.jobId = $1` (ordered `createdAt desc`), and last 50 `audit_log.jobId = $1` rows (ordered `createdAt desc`). Returns `{ job, payments, audit }`. 404 when no `jobs` row. Admin sees the full jobs row including `anonymousAccessToken` (intentional — admin troubleshooting).

## Acceptance Criteria Check
- [x] Validates path `id` via Zod UUID (`paramsSchema` + `getValidatedRouterParams`)
- [x] Verifies admin session via `getAdminSession(event)`; 401 if null (also guarded upstream by `middleware/admin-auth.ts`)
- [x] Inserts `admin_audit_log` row with `action='job_viewed'`, `targetType='job'`, `targetId=id`, `ipHash`, `userAgent` BEFORE returning data; best-effort try/catch
- [x] Parallel `Promise.all` over jobs, payments, last 50 audit rows (audit joined via `auditLog.jobId` FK — cleanest match, no jsonb fallback needed)
- [x] 404 when no `jobs` row; admin sees `anonymousAccessToken` (not stripped)
- [x] Returns `{ job, payments, audit }`; date columns are Drizzle `timestamp` which serialize to ISO via JSON

## Security Check
- [x] All DB access goes through Drizzle (`db.select().from(...).where(eq(...))`)
- [x] Every mutation endpoint is CSRF-protected — N/A (GET)
- [x] Every job endpoint calls `assertJobAccess` — N/A (admin path, guarded by `assertAdminSession` via `middleware/admin-auth.ts`)
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — middleware enforces, handler also does `getAdminSession` defensively; `admin_audit_log` insert is the first DB write
- [x] All inputs Zod-validated — path params validated with `paramsSchema.uuid()`; no body/query
- [x] No PII in logs — failure log contains only `action`, `targetId`, error message (no email, no row contents)
- [x] Session cookies are HttpOnly + Secure + correct SameSite — handled by `auth-admin` util (not touched here)
- [x] Rate limits applied where the task spec requires — not in SPEC.md §S.10 rate-limit list

## Salvage Notes
- The `job/phase2-nuxt/api-admin` group branch was stale (same commit as pre-phase-2 main) — every dependency (`admin_audit_log`, `payments`, `audit_log`, `jobs.anonymousAccessToken`, `assertAdminSession`, `getAdminSession`) lives on `main` via merged sibling tasks. Per the task's salvage clause, the task branch was created from `main` instead: `git checkout -b job/phase2-nuxt/api-admin-jobs-detail main`.
- The task spec mentions `getAdminSession(event)`; the codebase has both `getAdminSession` (returns `AdminSession | null`) and `assertAdminSession` (throws). Used `getAdminSession` + explicit 401 as the spec requested, matching the pattern in `app/server/api/admin/logout.post.ts`.
- Audit-log FK resolution: `audit_log` has a clean `jobId` FK column (verified in `app/server/db/schema/audit_log.ts`) — used `eq(auditLog.jobId, id)`, no jsonb fallback required.

## Validation
`cd app && npx nuxi typecheck` → exit code 0 (no type errors).
