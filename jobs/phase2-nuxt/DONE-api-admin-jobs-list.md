# Completed: GET /api/admin/jobs — paginated list with filters + audit

**Task:** api-admin-jobs-list.md
**Status:** done
**Date:** 2026-04-20

## Changes Made

- `app/server/api/admin/jobs/index.get.ts:1-132` (new) — admin jobs listing endpoint.
  - Defensive `getAdminSession(event)` → 401 when null (middleware already guards the path; this is belt-and-braces).
  - Zod `QuerySchema` validates all query params: `status`, `q`, `page` (1..1000), `pageSize` (1..100), `sort`, `order`. Uses `z.coerce.number()` for numeric params since query strings are always strings.
  - Best-effort `admin_audit_log` insert: `action='jobs_list_viewed'`, `details={ filters }` (jsonb with normalized filter snapshot — no row contents), `ipHash` (SHA-256 of IP), truncated `userAgent`. Wrapped in try/catch so audit write failures don't break admin UX.
  - Filters: `status` → `eq(jobs.status, ...)`; `q` → `or(id::text ILIKE 'q%', billingEmail ILIKE '%q%')`. The `id::text` prefix match avoids leaking that a UUID substring matches mid-string; email uses substring match for UX.
  - `SORT_COLUMNS` map pins the three legal sort columns to Drizzle column refs — `query.sort` only indexes this map, so no user input ever flows into an ORDER BY string.
  - `rows` query SELECTs ONLY: id, status, progressStage, progressPct, sourceSoftware, targetSoftware, uploadFilename, uploadSize, billingEmail, createdAt, updatedAt. `anonymousAccessToken` is never projected.
  - `total` computed by a second `count(*)::int` query reusing the same `whereClause`.
  - Response serializes `createdAt`/`updatedAt` to ISO strings (or `null` if DB returned null).

## Acceptance Criteria Check

- [x] Admin session verified; 401 on null.
- [x] Audit row: `action='jobs_list_viewed'`, `details={ filters }` jsonb, ip hash + UA, best-effort try/catch.
- [x] Query validated with Zod: status / q / page (default 1, max 1000) / pageSize (default 50, max 100) / sort (default createdAt) / order (default desc).
- [x] Drizzle query with optional where, whitelisted ORDER BY column, LIMIT + OFFSET.
- [x] Response shape `{ rows, page, pageSize, total }` exactly as specified.
- [x] `anonymousAccessToken` never included.
- [x] `createdAt` / `updatedAt` serialized to ISO strings.

## Security Check

- [x] All DB access goes through Drizzle (or parameterized `sql` template — `count(*)::int` and `${jobs.id}::text ILIKE ${prefix}` both use parameterized sql template)
- [x] Every mutation endpoint is CSRF-protected — N/A (GET)
- [x] Every job endpoint calls `assertJobAccess` — N/A (admin route, not a user job route)
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — middleware enforces assert; handler writes `jobs_list_viewed` audit row
- [x] All inputs Zod-validated (body + query + params) — `getValidatedQuery` with `QuerySchema.parse`
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — audit row stores filter snapshot only (status / q / page / pageSize / sort / order); `q` may be an email substring but it lives in `admin_audit_log.details` (retention is deliberate for forensics), never in app logs.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — inherited from `auth-admin.ts`
- [x] Rate limits applied where the task spec requires — not required for this endpoint per SPEC.md §S.10
- [x] Sort column comes from a whitelist map (`SORT_COLUMNS`); never raw-interpolated into SQL.
- [x] `page`/`pageSize` bounded by Zod (1000 / 100 ceilings).
- [x] `anonymousAccessToken` explicitly omitted from the SELECT projection.

## Verification

- `npx nuxi typecheck` — not run in this worker session (Bash was sandbox-blocked). Handler uses only patterns already present in the codebase: `defineEventHandler`, `getValidatedQuery + z.coerce`, `db.insert(adminAuditLog)` (same call signature as `logout.post.ts`), `db.select(...).from(jobs).where(and(...)).orderBy(...).limit(...).offset(...)`, `sql<number>\`count(*)::int\`` (same pattern used in `magic-link.post.ts:62`). Orchestrator / next reviewer to run `cd app && npx nuxi typecheck` before merge.

## Notes

- The `q` prefix match for `id::text` is intentional: full UUIDs are long and a substring match would be noisy; prefix match is the typical accountant workflow ("paste first 8 chars").
- Audit row is best-effort; if DB is degraded, the admin still sees the list (per existing `logout.post.ts` convention).
- No other files modified. No schema changes. No new deps.
- Branch setup + commit must be performed outside this worker session (Bash blocked in sandbox). Suggested commit: `feat(admin): GET /api/admin/jobs — list w/ filters + pagination + audit`.
