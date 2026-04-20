# Completed: PUT /api/jobs/[id]/upload
**Task:** api-jobs-upload.md | **Status:** done | **Date:** 2026-04-20

## Changes Made
- `app/server/api/jobs/[id]/upload.put.ts` (NEW, single file) — multipart upload handler for a job's archive. Validates UUID path param via Zod, calls `assertJobAccess` FIRST, enforces 500 MB cap via Content-Length pre-flight, reads one `file` part via H3's `readMultipartFormData`, magic-byte sniffs the first 8 bytes to accept only ZIP / 7z / gzip-wrapped tar, writes to `/data/jobs/{id}/upload/{randomUUID()}.{ext}` (server-controlled filename — user's original name is never used on disk), then updates the `jobs` row via Drizzle (`uploadFilename`, `uploadSize`, `progressStage='uploaded'`, `updatedAt`). Responds `{ ok: true, uploadFilename, uploadSize }`.

## Acceptance Criteria Check
- [x] Path param `id` Zod-validated as UUID via `getValidatedRouterParams`.
- [x] `assertJobAccess(id, event)` called FIRST — before any body work.
- [x] Content-Length > 500 MB rejected 413 BEFORE buffering; missing/invalid Content-Length rejected 411.
- [x] Reads multipart via `readMultipartFormData`; rejects 400 with `missing_file` / `multiple_files` / `empty_file`.
- [x] Magic-byte sniff on first 8 bytes detects ZIP (`50 4B 03 04 | 05 06 | 07 08`), 7z (`37 7A BC AF 27 1C`), gzip (`1F 8B` → `tgz`). None-match → 415 `unsupported_archive_type`.
- [x] Persisted to `/data/jobs/{id}/upload/{randomUUID()}.{ext}` via `node:fs/promises` (`mkdir({recursive:true})`, `writeFile`).
- [x] Updated `jobs` row via Drizzle (`uploadFilename`, `uploadSize`, `progressStage='uploaded'`).
- [x] Response: `{ ok: true, uploadFilename, uploadSize }`.
- [x] Only one new file; no shared utils modified.
- [x] `npx nuxi typecheck` passes.

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — `db.update(jobs)...eq(jobs.id, id)`, no raw SQL.
- [x] Every mutation endpoint is CSRF-protected — `app/server/middleware/csrf.ts` auto-enforces CSRF on PUT for all non-`/api/webhooks/` paths; this route qualifies. No bypass.
- [x] Every job endpoint calls `assertJobAccess` — called as step 2, before any body reading.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A (user/job route). `assertJobAccess` itself writes to `admin_audit_log` when an admin is the caller.
- [x] All inputs Zod-validated (body + query + params) — path param validated; body is a binary multipart upload guarded by Content-Length + multipart-part-count + magic-byte checks (not JSON, so Zod does not apply to the body shape, but every structural assertion has an explicit reject-400/413/415).
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — handler logs nothing. Original filename (user-controlled) is stored in DB, never logged. File bytes never logged.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A (no new cookies set).
- [x] Rate limits applied where the task spec requires — `app/server/middleware/rate-limit.ts` line 27 already enforces 3/hour/IP on `PUT /api/jobs/*/upload`. VERIFIED — no wiring needed here.

## Additional notes
- On-disk filename is a fresh `randomUUID()` plus a literal extension drawn from a closed set (`zip`, `tgz`, `7z`). The user's original filename is never concatenated into the path — no traversal surface.
- `jobId` is a validated UUID, so safe to use as a directory name.
- Original filename is truncated to 255 chars before being stored, to avoid accidental oversized values.
- Defence-in-depth: even if Content-Length under-reports, a second check on `data.length` after buffering rejects > 500 MB. In practice `readMultipartFormData` buffers into memory, so Caddy must remain the first size gate in prod (this is per-task requirement).
- CSRF is implicit (middleware) — SPA callers must mirror the `rp_csrf` cookie into the `x-csrf-token` header per existing convention.
