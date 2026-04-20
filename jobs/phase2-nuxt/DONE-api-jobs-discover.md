# Completed: api-jobs-discover

**Task:** api-jobs-discover (Wave 4) | **Status:** done (orchestrator-direct salvage) | **Date:** 2026-04-20

## Background

Original worker hit the harness Bash-denied bug and could not branch/commit. Orchestrator reconstructed the handler from spec following the same salvage pattern used in 2026-04-19 for `auth-admin-logout`.

## Changes Made

- `app/server/api/jobs/[id]/discover.post.ts:1-79` — new file. POST `/api/jobs/[id]/discover`.
  - Zod-validates `id` UUID via `getValidatedRouterParams`.
  - `assertJobAccess(id, event)` first; reuses returned job row to avoid re-SELECT.
  - 409 `not_uploaded` when `uploadFilename` is null.
  - Resolves on-disk file by `readdir(/data/jobs/{id}/upload)` and filtering `^uuid.(zip|tgz|7z)$`. 409 `upload_missing_on_disk` / `upload_ambiguous` on 0 / >1 matches.
  - Publishes `DiscoverPayload { job_id, input_path }` (snake_case mirror of Pydantic in `worker/src/migrator/consumer.py`) via `publishDiscover()` from `app/server/utils/queue.ts`.
  - Updates `progressStage='queued'`, `progressPct=0`, `updatedAt=now` via Drizzle.
  - Returns `{ ok: true, jobId }`.

## Acceptance Criteria Check

- [x] Validates UUID path param via Zod
- [x] `assertJobAccess` is the first business call after param validation
- [x] State guard: requires `uploadFilename` to be set (proxy for "upload landed"); 409 otherwise
- [x] Uses `publishDiscover` + typed `DiscoverPayload`
- [x] Snake_case payload matches Pydantic byte-for-byte (`job_id`, `input_path`)
- [x] Updates `jobs.progress_stage='queued'`
- [x] Returns `{ ok: true, jobId }`

## Security Check

- [x] All DB access via Drizzle (no raw SQL)
- [x] CSRF protected (POST is in middleware ENFORCED_METHODS; route is not under /api/webhooks/)
- [x] Calls `assertJobAccess`
- [x] N/A — not an admin endpoint
- [x] All inputs Zod-validated (path param)
- [x] No PII logged; payload contains only ids + a server-built path
- [x] N/A — no cookies set
- [x] Rate limit: not in SPEC §S.10's enumerated list — none required

## Cross-phase verification

`app/server/types/queue.ts` `DiscoverPayload`:
```ts
{ job_id: string; input_path: string }
```
matches `worker/src/migrator/consumer.py`:
```python
class DiscoverPayload(BaseModel):
    job_id: UUID
    input_path: str
```
✅ Field names + types align. Worker's `discover` handler is currently a TODO stub (line 509-523 of consumer.py) — discover jobs will be marked failed with reason `discover_not_implemented` until the worker side ships. Publishing succeeds either way.

## Wave-level finding (flagged for Wave 4 follow-up)

The upload handler (`upload.put.ts`) stores files at `/data/jobs/{id}/upload/{randomUuid}.{ext}` but only persists `uploadFilename` (the user's *original* filename) to the DB, not the on-disk filename. Any consumer needing the on-disk path (this discover handler, the future delta-sync flow, the GDPR file-export flow) has to readdir or otherwise infer it.

Recommended follow-up (out of scope for this task — needs schema migration):
- Either rename `uploadFilename` semantics to be the *on-disk* filename, OR add a separate `uploadDiskFilename` column. Persist it during upload. Drop the readdir branch here.

## Validation

`cd app && npx nuxi typecheck` → EXIT=0 in main checkout (deps already installed).

## Branch + commit

Branch: `job/phase2-nuxt/api-jobs-discover` (off `job/phase2-nuxt/api-jobs`)
Commit message: `feat(api): POST /api/jobs/[id]/discover — publish pg-boss discover job`
