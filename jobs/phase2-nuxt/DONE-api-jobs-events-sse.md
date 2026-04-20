# Completed: api-jobs-events-sse
**Task:** api-jobs-events-sse.md | **Status:** done | **Date:** 2026-04-20

## Changes Made
- `app/server/api/jobs/[id]/events.get.ts:1-148` — new SSE handler. Flow:
  1. `getValidatedRouterParams` with a Zod UUID schema.
  2. `assertJobAccess(id, event)` FIRST (throws 403/404 — no data leaked).
  3. `createEventStream(event)` (h3 1.15.x native SSE helper).
  4. Primes the stream with the current `{ stage, pct, status }` snapshot so clients see state on connect.
  5. Poll loop every 2s — Drizzle `select({stage,pct,status}).from(jobs).where(eq(jobs.id, id)).limit(1)`. Pushes a `message` event only when any field changed since last push.
  6. Heartbeat every 15s via a named `heartbeat` event (clients ignore it unless they listen; Caddy/nginx don't close the idle connection).
  7. Terminal statuses (`succeeded` | `failed` | `expired`) — final snapshot then `stream.close()`.
  8. `stream.onClosed(...)` tears down all three timers on client disconnect — no zombie pollers.
  9. 10-minute hard cap — emits `{ timeout: true }` then closes; client reconnects via EventSource auto-retry.

## Acceptance Criteria Check
- [x] UUID param validation — Zod `z.string().uuid()` in `ParamsSchema`.
- [x] `assertJobAccess(id, event)` called FIRST, before stream creation.
- [x] Uses `createEventStream(event)` (confirmed supported: `h3@1.15.11` per `package-lock.json`; signature matches `app/node_modules/h3/dist/index.d.mts` lines 1247-1281).
- [x] 2s Drizzle poll reading `progressStage`, `progressPct`, `status` — change-detected before push.
- [x] 15s heartbeat keeps proxies open.
- [x] Terminal state pushes final event then closes.
- [x] Client disconnect (`stream.onClosed`) breaks the loop and clears all timers.
- [x] 10-minute runtime cap with graceful `{ timeout: true }` final event.
- [x] `npx nuxi typecheck` → exit 0 (verified with positive + negative control in worktree).

## Security Check
- [x] All DB access goes through Drizzle (`eq(jobs.id, id)` — no raw SQL, no interpolation).
- [x] Every mutation endpoint is CSRF-protected — N/A (GET endpoint).
- [x] Every job endpoint calls `assertJobAccess` — yes, before any other logic.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A (user-facing).
- [x] All inputs Zod-validated — route params validated; no body/query on this GET.
- [x] No PII in logs — handler logs nothing; events emit only `{ stage, pct, status }` (never email, CIF, filename, tokens).
- [x] Session cookies HttpOnly + Secure + correct SameSite — N/A (delegated to auth middleware; SSE doesn't touch cookies).
- [x] Rate limits — N/A per task spec (not in SPEC S.10 rate-limit list; assertJobAccess already gates access).
- [x] Server-side abort on client disconnect — `stream.onClosed` clears all timers + ends DB polling.
- [x] Max runtime cap enforced (10 min) — prevents runaway streams even if `onClosed` is missed.

## Notes for reviewer / orchestrator
- Heartbeat uses a named `heartbeat` event rather than a raw `:hb\n\n` comment line because h3's `stream.push(string)` auto-wraps as `data: <string>`, which would produce malformed SSE. The named-event approach is both valid SSE and equivalently keeps proxies open; EventSource clients that only listen on `.onmessage` silently ignore it, matching the task's intent.
- H3 v1.15 `onClosed(cb)` is preferred over manual `event.node.req.on('close', ...)`; matches the h3 example in `index.d.mts:1302`.
- No worker files touched. No shared utils modified. Single-file change as required.
