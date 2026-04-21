# Completed: /api/jobs accepts 'auto', defers direction to worker discover
**Task:** PLAN-accept-auto.md | **Status:** done | **Date:** 2026-04-21

## Changes Made
- `app/drizzle/0008_glossy_jackpot.sql` — drops NOT NULL on `jobs.source_software` and `jobs.target_software`. Additive, reversible. Applied locally via `npm run db:migrate`.
- `app/server/db/schema/jobs.ts:27-32` — removed `.notNull()` on both columns, added a comment explaining the nullable transition.
- `app/server/api/jobs/index.post.ts:24-45` — extended `SoftwareEnum` to include `'auto'`, made both fields optional, relaxed the differ-check when either side is `'auto'`, and added `resolveSoftware()` that writes `null` to the DB when the value is `'auto'`/omitted and the concrete string otherwise.
- `app/pages/upload.vue:60-72` — removed the extension-heuristic fallback; `resolveDirection()` now returns `{sourceSoftware: 'auto', targetSoftware: 'auto'}` when the user picks "Detectează automat".
- `app/pages/job/[id]/result.vue:13-25, 33-35, 125, 159` — typed `sourceSoftware` / `targetSoftware` as `string | null`, added `srcLabel` / `tgtLabel` computeds with Romanian fallbacks ("sistemul sursă" / "sistemul țintă"), and swapped the two template references. Keeps the result page working for 'auto' jobs before worker backfill ships.

## Not changed (deferred to follow-up wave per plan)
- Worker (`worker/src/migrator/{consumer,pipeline,cli}.py`) still hardcodes `source_software="winmentor"` / `target_software="saga"`. Discover handler is still a stub per `docs/LOG.md` Wave-4 entries, so the "discover writes resolved direction back" piece lands after discover is actually implemented.
- Admin filter UI: `app/pages/admin/jobs/index.vue` already renders `?? '—'` for null. No filter-bucket for "unresolved" added; null rows simply don't match either filter value. Good enough for now.

## Acceptance Criteria Check
- [x] `POST /api/jobs` accepts `{sourceSoftware: 'auto', targetSoftware: 'auto'}` and writes null to both columns
- [x] `POST /api/jobs` still accepts concrete `{winmentor, saga}` pairs and still rejects `{winmentor, winmentor}` / `{saga, saga}`
- [x] `/upload` sends `'auto'` explicitly (not omitted) for self-documenting network logs (Dani's call — option 1)
- [x] Migration applied to local DB; `npx nuxi typecheck` passes from `app/app/`
- [x] Admin pages render `—` for null direction without crashing (already did, verified)
- [x] `/job/[id]/result` renders with Romanian fallback when direction not yet resolved

## Security Check
- [x] All DB access goes through Drizzle — `resolveSoftware()` returns a typed literal, feeds into Drizzle's `insert().values()`. No raw SQL added.
- [x] Every mutation endpoint is CSRF-protected — `POST /api/jobs` stays under the global CSRF middleware.
- [x] Every job endpoint calls `assertJobAccess` — no change to any job-scoped endpoint.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A.
- [x] All inputs Zod-validated — extended Zod schema still validates strictly; unknown values rejected.
- [x] No PII in logs — no logging added.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — unchanged.
- [x] Rate limits applied where the task spec requires — POST /api/jobs still 10/h/IP.

## Migration rollback note
Migration is reversible while all rows still have values (i.e. before any 'auto' jobs are created in prod):
```sql
ALTER TABLE jobs
  ALTER COLUMN source_software SET NOT NULL,
  ALTER COLUMN target_software SET NOT NULL;
```
After 'auto' jobs exist in prod, rollback requires either backfilling those rows or dropping them.
