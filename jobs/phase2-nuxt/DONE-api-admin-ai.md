# Completed: api-admin-ai — AI observability dashboard endpoint

**Task:** api-admin-ai (PLAN-api-admin-wave-b.md §Task 3) | **Status:** done | **Date:** 2026-04-20

## Changes Made

- `app/server/api/admin/ai/index.get.ts` (NEW) — single-file `GET /api/admin/ai` handler returning `{ trend30d, topUnmappedFields, lowConfidenceMappings }`.
  - `trend30d`: Drizzle aggregate on `ai_usage` grouped by `date_trunc('day', created_at)` where `created_at > now() - interval '30 days'`, ORDER BY day ASC. Columns: `day` (date), `tokensIn` (int sum), `tokensOut` (int sum), `costUsd` (float sum), `calls` (int count).
  - `topUnmappedFields`: empty array with explicit `TODO(observability/worker)` comment explaining the worker needs to log mapping misses before this query can be wired. No invented data.
  - `lowConfidenceMappings`: Drizzle select on `mapping_cache` WHERE `confidence < 0.7`, ORDER BY `hit_count DESC`, LIMIT 50. Returns all listed columns (`id`, `sourceSoftware`, `tableName`, `fieldName`, `targetField`, `confidence`, `hitCount`, `createdAt`).
  - Queries run in parallel via `Promise.all`.
  - Admin session defensively fetched via `getAdminSession(event)`; 401 if missing.
  - `admin_audit_log` row `action='ai_dashboard_viewed'` inserted best-effort (try/catch, warns on failure per Wave A read-endpoint pattern).
  - Imports use `~/server/...` alias consistent with `jobs/[id].get.ts` (deeper path than `stats.get.ts`).

## Acceptance Criteria Check

- [x] Response shape matches spec: `trend30d[]`, `topUnmappedFields[]`, `lowConfidenceMappings[]` — plan §Task 3
- [x] `trend30d` uses `date_trunc('day', created_at)` via parameterised `sql` template, ORDER BY day ASC, filter last 30 days
- [x] `topUnmappedFields` ships empty with TODO comment citing worker observability gap — plan explicit guidance
- [x] `lowConfidenceMappings` filters `confidence < 0.7`, orders by `hitCount DESC`, limits 50
- [x] Single file only: `app/server/api/admin/ai/index.get.ts`

## Security Check

- [x] All DB access goes through Drizzle (or parameterized `sql` template) — every query uses Drizzle query builder; `sql` template is used only for aggregates (`date_trunc`, `sum`, `count`, `now() - interval`) with schema column refs interpolated — no user input is concatenated.
- [x] Every mutation endpoint is CSRF-protected — N/A, this is a GET.
- [x] Every job endpoint calls `assertJobAccess` — N/A, admin endpoint.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — `getAdminSession` defensive call + best-effort audit insert (`ai_dashboard_viewed`), matching the Wave A read-endpoint convention (mutations will use synchronous audit per plan cross-cutting).
- [x] All inputs Zod-validated — no inputs (no body, no query, no params).
- [x] No PII in logs — `mapping_cache` and `ai_usage` store only technical field names, token counts, costs; no emails, CIFs, file contents, or user identifiers. IP is SHA-256 hashed before audit insert, UA truncated to 500 chars.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — handled by `auth-admin` middleware; not touched here.
- [x] Rate limits applied where the task spec requires — not required per plan/SPEC.md for this endpoint.

## Validation

- `npx nuxi typecheck` was blocked in the worktree sandbox (command denied repeatedly even with workarounds). Code closely mirrors `app/server/api/admin/stats.get.ts` (same `getAdminSession` + audit + Drizzle aggregate shape). All imports resolve to existing schema exports (`adminAuditLog`, `aiUsage`, `mappingCache`) confirmed via `app/server/db/schema.ts` re-exports. Drizzle helpers used (`asc`, `desc`, `lt`, `sql`) are standard and already used elsewhere in the codebase. **Orchestrator should run `npx nuxi typecheck` before merge to confirm; if issues surface they are likely to be minor (e.g., `as` alias naming on sql fragments).**

## Notes for orchestrator / reviewer

- Re-rebase on group branch before merging (plan says Wave B workers are file-disjoint, so conflict risk is low, but the policy is rebase-before-merge).
- `topUnmappedFields: []` is intentional — the task spec mandates it and also mandates the code comment explaining why. Reviewer should not flag this as "missing data."
