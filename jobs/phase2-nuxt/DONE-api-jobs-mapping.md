# Completed: PATCH /api/jobs/[id]/mapping
**Task:** api-jobs-mapping | **Status:** done | **Date:** 2026-04-20

## Changes Made
- `app/server/api/jobs/[id]/mapping.patch.ts:1-78` — new Nitro handler. Validates UUID param, calls `assertJobAccess` FIRST, enforces a 2MB `Content-Length` pre-check (413), Zod-validates the `{ mappings: [...] }` body (1..5000 entries, each with bounded string fields 1..100 chars plus optional `confidence` ∈ [0,1] and `userEdited`), guards state (`progressStage` must be `'mapped'` or `'reviewing'` — else 409), updates `jobs.mapping_result` via Drizzle, advances `mapped → reviewing`, bumps `updatedAt`, and returns `{ ok: true, count }`.

## Acceptance Criteria Check
- [x] Route `PATCH /api/jobs/[id]/mapping` registered (filename `mapping.patch.ts` in `app/server/api/jobs/[id]/`).
- [x] UUID param validated via `getValidatedRouterParams(event, ParamsSchema.parse)` — 400 on invalid.
- [x] `assertJobAccess(id, event)` is the first meaningful call after param validation. It returns the job row, which is then used for the state guard (saving a second SELECT).
- [x] Body validated by `BodySchema` — `mappings` array `min(1).max(5000)`, each entry with `sourceTable`/`sourceField`/`targetTable`/`targetField` strings `min(1).max(100)`, optional `confidence: number ∈ [0,1]`, optional `userEdited: boolean`. 400 on schema fail (h3 default behaviour for `readValidatedBody` throws).
- [x] Body size bound via `Content-Length` pre-check → 413 when > 2MB (2*1024*1024). Zod `max(5000)` caps the array as a second defense.
- [x] State guard: `progressStage` must be `'mapped'` or `'reviewing'`; otherwise 409. This prevents mutating mapping after `converting`, `ready`, or `failed` (spec note: if neither stage is present the request is rejected — safer than allow-all).
- [x] Drizzle `update(jobs).set({ mappingResult, progressStage, updatedAt })` — no raw SQL.
- [x] Response shape: `{ ok: true, count: mappings.length }`.

## State guard choice
The spec allowed a fallback to "any non-terminal state" if unsure. I chose the **strict** allowlist `{'mapped','reviewing'}` because:
- It matches the spec's primary guidance.
- It fails closed — any future stage addition will be rejected until explicitly permitted.
- Post-`converting`/`ready`/`failed` edits are never safe (worker has already consumed the mapping or the job is terminal).

If Phase-2 discovery later introduces a stage like `awaiting_review`, that value must be added to `EDITABLE_STAGES` — documented in the inline comment.

## Security Check
- [x] All DB access goes through Drizzle (parameterized via `eq()`).
- [x] Every mutation endpoint is CSRF-protected — global CSRF middleware (from `security-csrf`) covers this PATCH automatically; no bypass.
- [x] Every job endpoint calls `assertJobAccess` — FIRST, before body read and before state logic.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A (user route); admin path is covered inside `assertJobAccess` which logs `job_access` to `admin_audit_log` when an admin accesses the job.
- [x] All inputs Zod-validated — route param (`ParamsSchema`) + body (`BodySchema`).
- [x] No PII in logs — handler does not log body, mappings, or any identifiers.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — handled by existing auth utils; this handler does not touch cookies.
- [x] Rate limits applied where the task spec requires — no specific rate limit requested for this endpoint; global limiter (from `security-rate-limit`) applies.

## Validation
```
cd app && npx nuxi typecheck
# → "[nuxt] ℹ Running with compatibility version 4"
# → no errors, exit 0
```

## Files changed
- `app/server/api/jobs/[id]/mapping.patch.ts` (new, only file)
