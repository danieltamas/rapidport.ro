# Completed: Audit log schema (audit_log, admin_audit_log)
**Task:** schema-audit.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/db/schema/audit_log.ts` (new) — append-only `audit_log` table for user-facing events. Columns: `id`, `userId` (nullable, no FK so GDPR purge can null without cascade-deleting history), `jobId` (nullable FK → `jobs.id`), `event`, `details` (jsonb, no raw PII per project rules), `ipHash`, `createdAt`. Indexes on `userId`, `jobId`, `event`, `createdAt`. Header comment states the append-only + 2-year retention + anonymize-on-GDPR invariant.
- `app/server/db/schema/admin_audit_log.ts` (new) — append-only `admin_audit_log` table for every admin action. Columns: `id`, `adminEmail` (Google-verified allowlist), `action`, `targetType`, `targetId` (free-form text to allow non-UUID targets like Stripe IDs), `details`, `ipHash`, `userAgent`, `createdAt`. Indexes on `adminEmail`, `action`, `createdAt`. Header comment states NEVER-purged invariant for security forensics + regulator trail.

## Acceptance Criteria Check
- [x] `auditLog` table with all required columns and types — matches spec exactly
- [x] `userId` nullable, no FK (GDPR anonymize) — confirmed
- [x] `jobId` nullable FK → `jobs.id` — imports `jobs` from `./jobs`
- [x] `details: jsonb`, `ipHash: text`, `createdAt: timestamptz NOT NULL DEFAULT now()` — done
- [x] Indexes on `userId`, `jobId`, `event`, `createdAt` — done
- [x] Header comment present with append-only + 2-year retention + anonymize-on-GDPR invariant
- [x] `adminAuditLog` table with all required columns and types — matches spec exactly
- [x] `adminEmail`, `action` NOT NULL — done
- [x] `targetType`, `targetId` free-form text — done
- [x] Indexes on `adminEmail`, `action`, `createdAt` — done
- [x] Header comment present with NEVER-purged invariant
- [x] No edits to `schema.ts` barrel, `app/drizzle/**`, other sub-files, or any handler/middleware/util
- [x] No `db:generate`, `db:migrate`, `db:push`, `db:studio`, dev/preview server invoked
- [x] English-only identifiers and comments
- [x] Each file under 40 lines (audit_log.ts = 27 lines, admin_audit_log.ts = 28 lines)
- [x] `cd app && npx nuxi typecheck` → exit 0
- [x] `cd app && npm run build` → exit 0

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — schema-only task; tables defined via Drizzle pgTable
- [x] Every mutation endpoint is CSRF-protected — N/A (no endpoints in this task)
- [x] Every job endpoint calls `assertJobAccess` — N/A
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A (this task creates the target table; handlers come later)
- [x] All inputs Zod-validated (body + query + params) — N/A
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — header comment for `audit_log.details` enforces this invariant for future writers
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A
- [x] Rate limits applied where the task spec requires — N/A
- [x] `userId` in `audit_log` is intentionally FK-less so GDPR purge can null the column without cascading-delete the audit trail (matches SPEC §S.12)
- [x] `admin_audit_log` has NO link to `users` and NO purge path — kept forever for forensics per SPEC §S.12
