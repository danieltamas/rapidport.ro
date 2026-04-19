# Completed: Mapping profiles sub-file
**Task:** schema-profiles.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/db/schema/mapping_profiles.ts:1-26` — new Drizzle sub-file defining `mappingProfiles` table (`mapping_profiles`) per spec: `id`, nullable `userId` FK to `users.id`, `name`, optional `sourceSoftwareVersion` / `targetSoftwareVersion`, `mappings` jsonb, `isPublic` boolean (default false), `adoptionCount` integer (default 0), `createdAt` timestamptz; indexes on `userId` and `isPublic`. File is 26 lines (under 40). Style mirrors `users.ts` and `sessions.ts`.

## Acceptance Criteria Check
- [x] Table `mappingProfiles` with name `mapping_profiles` — defined
- [x] All required columns with correct types/defaults/nullability — present
- [x] `userId` nullable FK to `users.id` (no cascade since nullable system profiles) — present
- [x] Indexes on `userId` and `isPublic` — present
- [x] Did not touch `schema.ts` barrel, `app/drizzle/**`, `jobs.ts`, `mapping_cache.ts`, or any other forbidden file
- [x] No new npm dependencies
- [x] English-only identifiers and comments
- [x] `cd app && npx nuxi typecheck` → exit 0
- [x] `cd app && npm run build` → exit 0 (build complete)

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — schema-only change, no queries added
- [x] Every mutation endpoint is CSRF-protected — N/A (no endpoints touched)
- [x] Every job endpoint calls `assertJobAccess` — N/A (no endpoints touched)
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A (no endpoints touched)
- [x] All inputs Zod-validated (body + query + params) — N/A (no endpoints touched)
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — N/A (no logging added)
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A (no auth touched)
- [x] Rate limits applied where the task spec requires — N/A
