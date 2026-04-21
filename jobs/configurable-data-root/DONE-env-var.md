# Completed: configurable DATA_ROOT with project-relative dev default
**Task:** ad-hoc bugfix (no spec) | **Status:** done | **Date:** 2026-04-21

## Problem
Upload failed with `ENOENT: no such file or directory, mkdir '/data'`. Nine server files hardcoded `const DATA_ROOT = '/data/jobs'`, which only exists in the Docker prod container. Dev on the host laptop has no write access to `/data/jobs` — the mkdir at `upload.put.ts:172` blew up.

## Changes Made
- `app/server/utils/env.ts:1-15, 52-56` — added `DATA_ROOT` to the Zod env schema. Default resolves at boot:
  - `NODE_ENV === 'production'` → `/data/jobs` (Docker volume mount, unchanged)
  - otherwise → `resolve(process.cwd(), '.data/jobs')` → `app/app/.data/jobs` in dev (already git-ignored by the `.data/` rule in root `.gitignore`)
  - An explicit `DATA_ROOT=...` env var overrides both.
- Nine call sites swapped `const DATA_ROOT = '/data/jobs'` → `const DATA_ROOT = env.DATA_ROOT`, adding the `env` import:
  - `app/server/api/jobs/[id]/upload.put.ts`
  - `app/server/api/jobs/[id]/discover.post.ts`
  - `app/server/api/jobs/[id]/resync.post.ts`
  - `app/server/api/jobs/[id]/download.get.ts`
  - `app/server/api/admin/jobs/[id]/index.delete.ts`
  - `app/server/api/admin/jobs/[id]/re-run.post.ts`
  - `app/server/api/webhooks/stripe.post.ts` (file already imported `env`; just swapped the constant)
  - `app/server/utils/schedule-tasks/cleanup-jobs-files.ts`
  - `app/server/utils/schedule-tasks/cleanup-orphan-files.ts`

## Verified
- `grep -rn "const DATA_ROOT = '/data/jobs'" app/server/` → no results
- `npx nuxi typecheck` passes
- Default-resolution sanity check (Node one-liner): dev → `/Users/danime/Sites/rapidport.ro/app/app/.data/jobs`; prod → `/data/jobs`

## Worker side — not touched (by design)
The Python worker (`worker/src/migrator/consumer.py`, `pipeline.py`, `cli.py`) receives absolute paths via pg-boss payloads (`input_path`, `output_dir`), built by Nuxt from `DATA_ROOT`. So the worker already "follows" whatever root Nuxt writes. In Docker both containers share the same volume mount at `/data/jobs`, so no divergence. In dev, if the worker runs on the same host machine, it'll correctly read `/Users/.../app/app/.data/jobs`. If the worker needs a different root in dev, it can set its own `DATA_ROOT` env var — but for end-to-end dev tests a single-host setup Just Works.

## Security Check
- [x] All DB access goes through Drizzle — N/A
- [x] Every mutation endpoint is CSRF-protected — unchanged
- [x] Every job endpoint calls `assertJobAccess` — unchanged
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — unchanged
- [x] All inputs Zod-validated — `DATA_ROOT` itself is Zod-validated as non-empty string
- [x] No PII in logs — unchanged
- [x] Session cookies are HttpOnly + Secure + correct SameSite — unchanged
- [x] Rate limits applied where the task spec requires — unchanged
- [x] Path-traversal check: the upload handler composes `join(DATA_ROOT, id, 'upload', diskName)` where `id` is Zod-validated UUID and `diskName` is server-generated `${randomUUID}.${ext}` with `ext` from a literal union. No user-controllable segment touches disk path. `DATA_ROOT` itself can only be set by the operator (env var), not by any request. Safe.
