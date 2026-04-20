# Completed: api-admin-misc (Wave B)

**Status:** done (orchestrator-direct salvage — worker bailed on Bash-denied without using the salvage authorization).

## Files added (6)

- `app/server/api/admin/profiles/index.get.ts` — list with `isPublic` filter, pagination, whitelisted sort. `mappings` jsonb intentionally not in response. Best-effort audit.
- `app/server/api/admin/profiles/[id]/promote.post.ts` — `{reason}` body; 404/409 (`already_public`); transactional UPDATE + audit (`profile_promoted`).
- `app/server/api/admin/profiles/[id]/hide.post.ts` — symmetric to promote; 409 `already_hidden`; audit (`profile_hidden`).
- `app/server/api/admin/audit/index.get.ts` — paginated `admin_audit_log` read with filters (adminEmail, action, targetType, since, until). Self-audited (`audit_log_viewed`, best-effort). Order whitelisted to `createdAt` only (append-only table).
- `app/server/api/admin/sessions/index.get.ts` — list active admin sessions (`revokedAt IS NULL AND expiresAt > now()`), marks current via `getAdminSession.sessionId === row.id`. No pagination (admin session count bounded). Audit `admin_sessions_viewed`.
- `app/server/api/admin/sessions/[id].delete.ts` — self-lockout guard rejects `id === current.sessionId` with 409 `cannot_revoke_current_session`. 404 if missing or already revoked. Transactional UPDATE + audit (`admin_session_revoked`).

## Acceptance Criteria Check

- [x] All 6 endpoints implemented
- [x] Settings + errors deferred per plan D1
- [x] Self-lockout guard on session revoke
- [x] Audit synchronous + transactional for mutations; best-effort for reads
- [x] All inputs Zod-validated; whitelisted sort columns
- [x] Drizzle for all DB; `sql` template parameterised

## Security Check

- [x] All DB via Drizzle / parameterised `sql`
- [x] CSRF protected (POST/DELETE under /api/admin/*; not webhook)
- [x] N/A assertJobAccess
- [x] `assertAdminSession` enforced via middleware + defensive `getAdminSession` 401 in handler
- [x] All inputs Zod-validated
- [x] No PII logged (audit details capture filters / reason; never row contents)
- [x] N/A session cookies (no auth flow)
- [x] N/A rate limit (admin)

## Validation

`cd app && npx nuxi typecheck` — orchestrator runs after squash-merge into group.

## Branch + commit

Branch: `job/phase2-nuxt/api-admin-wave-b-misc`
Commit: `feat(admin): profiles + audit + sessions endpoints`
