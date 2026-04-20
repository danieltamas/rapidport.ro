# Completed: ConvertPayload `is_resync` flag + worker stamps last_run_was_resync

**Task:** HANDOFF Priority 2.5 ("sync-complete email" prerequisite) | **Status:** done | **Date:** 2026-04-20

Plumbing only — the sync-complete email itself is still deferred per `docs/emails-copy.md` "Deferred wiring". This task lands the `is_resync` flag on the pg-boss convert payload + a DB column the future email sweep can branch on.

## Changes Made

- **Migration 0007** (`drizzle/0007_chunky_santa_claus.sql`) — adds `jobs.last_run_was_resync boolean default false not null`. Default `false` matches the historical assumption that existing rows represent initial-convert completions.
- `app/server/db/schema/jobs.ts` — new `lastRunWasResync` column; added `boolean` import from drizzle pg-core.
- `app/server/types/queue.ts` — `ConvertPayload.is_resync?: boolean` with a docstring pointing at the `resync.post.ts` caller and the Stripe webhook default.
- `worker/src/migrator/consumer.py`:
  - `ConvertPayload` Pydantic model gains `is_resync: bool = False`
  - `_mark_rp_succeeded(pool, job_id, is_resync)` now takes the flag and stamps `jobs.last_run_was_resync` in the same UPDATE that flips status=succeeded. Stamp-with-status is atomic so a sweep that reads the row after status change sees a consistent flag.
  - Caller updated to pass `is_resync=payload.is_resync`.
- `app/server/api/jobs/[id]/resync.post.ts` — publishes with `is_resync: true`.
- `app/server/api/webhooks/stripe.post.ts` — publishes with explicit `is_resync: false` (Pydantic defaults to False; being explicit documents intent and matches the resync handler shape).
- `app/server/utils/schedule-tasks/email-notification-sweep.ts` — comment refreshed to note the plumbing is done; the sweep itself is the follow-up (needs a `email_sync_complete_sent_at` column + a reset-on-each-resync mechanism to fire on multiple syncs).

## Acceptance Criteria Check

- [x] `ConvertPayload` TS type includes `is_resync?: boolean`
- [x] Pydantic `ConvertPayload` includes `is_resync: bool = False` (defaults preserved for safe deploy)
- [x] `resync.post.ts` sets `is_resync: true` when publishing
- [x] Stripe webhook sets `is_resync: false` explicitly
- [x] Worker branches on `payload.is_resync` and writes `jobs.last_run_was_resync` on success
- [x] Migration 0007 applied cleanly; `jobs.last_run_was_resync boolean default false not null`

## Security Check

- [x] All DB access through Drizzle (TS side) / parameterized asyncpg (worker side) — yes
- [x] Every mutation endpoint is CSRF-protected — existing endpoints unchanged
- [x] Every job endpoint calls `assertJobAccess` — `resync.post.ts` already does this
- [x] Every admin endpoint calls `assertAdminSession` — **N/A, no admin endpoints touched**
- [x] All inputs Zod-validated — payloads go through Pydantic on the worker side + TS type on the Nuxt side; no user input flows into this flag directly
- [x] No PII in logs — flag is boolean, no log lines added
- [x] Session cookies unchanged
- [x] Rate limits — no change

## What this does NOT do

- Does not create the sync-complete email template (deferred — copy is already drafted in `docs/emails-copy.md` §4).
- Does not add an `email_sync_complete_sent_at` column — the sweep design needs to reset this on each resync (multiple delta-syncs should fire multiple emails). Tracked as a future task.
- Does not add a sweep function to `email-notification-sweep.ts` — that's the follow-up that consumes `jobs.last_run_was_resync`.

## Notes

- `_mark_rp_succeeded` in `consumer.py` is the natural stamping point because it's the only place the worker confirms a successful run. Stamping there keeps status + flag atomic so the sweep can't race.
- The worker's existing `payload.is_resync` fallback is `False` (Pydantic default), so older TS publishers that forget to include the key still Just Work — no silent job drop.
- `jobs.last_run_was_resync NOT NULL DEFAULT false` — existing rows (pre-migration) become `false`, which matches the semantic "no resync happened yet" and is the safe starting point for the future sweep.
