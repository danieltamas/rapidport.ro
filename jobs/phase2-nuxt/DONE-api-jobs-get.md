# Completed: GET /api/jobs/[id]
**Task:** api-jobs-get.md | **Status:** done | **Date:** 2026-04-20

## Changes Made
- `app/server/api/jobs/[id].get.ts` (NEW) — single handler. Zod-validates `id` param as UUID (400 on fail), calls `assertJobAccess(id, event)` as the first business-logic step, reuses the job row returned by the gate (avoids a duplicate SELECT), strips `anonymousAccessToken`, and serializes `createdAt` / `updatedAt` / `expiresAt` to ISO strings.

## Sensitive columns in `app/server/db/schema/jobs.ts`
Reviewed every column. The only secret-shaped field is:
- `anonymousAccessToken` (text, notNull) — the capability that grants anonymous per-job access via `verifyAnonymousToken`. Leaking it in a response would defeat the gate. **Stripped.**

Not stripped (intentional):
- `billingEmail` — user-owned display data, not a secret.
- `discoveryResult` / `mappingResult` — jsonb analysis blobs, product data shown in UI.
- `userId`, `mappingProfileId` — FK IDs, not secrets.
- `uploadFilename`, `uploadSize` — user-visible metadata.

## Acceptance Criteria Check
- [x] `id` route param validated via `getValidatedRouterParams` with Zod UUID schema; 400 on failure (explicit `createError({ statusCode: 400 })`).
- [x] `assertJobAccess(id, event)` is the first business-logic call — nothing fetched before it beyond param validation; the gate internally fetches the job and we reuse its return value (no duplicate SELECT).
- [x] `anonymousAccessToken` stripped from response via object-rest destructure.
- [x] Date columns (`createdAt`, `updatedAt`, `expiresAt`) serialized to ISO strings.
- [x] JSON returned with remaining fields.

## Security Check
- [x] All DB access goes through Drizzle (via `assertJobAccess`); handler issues zero additional queries.
- [x] Every mutation endpoint is CSRF-protected — N/A (GET, no mutation).
- [x] Every job endpoint calls `assertJobAccess` — yes, as the first business-logic step.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A here; admin access path is handled inside `assertJobAccess` which already writes `admin_audit_log` with `action: 'job_access'`.
- [x] All inputs Zod-validated — `id` router param via `z.object({ id: z.string().uuid() })`.
- [x] No PII in logs — handler logs nothing.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A (no cookies written).
- [x] Rate limits applied where the task spec requires — not required by task spec.

## Validation
`cd app && npm run typecheck` → exit 0 (no vue-tsc diagnostics; final stdout line was `TYPECHECK_OK`).

## Notes / blockers
- Worktree lacked `node_modules`; ran `npm install --no-save` once inside the worktree so `nuxi typecheck` could resolve `@nuxt/kit`. No `package.json` / `package-lock.json` changes committed.
- Did NOT merge, did NOT modify shared utils, did NOT touch other files, did NOT add Co-Authored-By, did NOT start dev server.
