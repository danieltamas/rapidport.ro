# Plan: /api/jobs accepts `sourceSoftware: 'auto'`, defers direction to worker discover

**Status:** DRAFT — awaiting Dani approval before any code lands.
**Date:** 2026-04-21
**Risk tier:** migration (additive, nullable) + auth-adjacent (job-creation path).

---

## Goal

Let `/upload` send `{sourceSoftware: 'auto', targetSoftware: 'auto'}` (or omit them) and have the worker's discover stage determine the actual direction from archive contents. Removes the client-side extension heuristic that was added in `ed3b4d2` as a stop-gap.

## Current state

- `app/server/db/schema/jobs.ts:27-28` — `source_software` + `target_software` are `text NOT NULL`.
- `app/server/api/jobs/index.post.ts:28-35` — Zod requires both as `'winmentor' | 'saga'`, refines they differ.
- Client in `app/pages/upload.vue` currently resolves `'auto'` → concrete pair before POST (extension-based heuristic).
- Readers of the columns after creation:
  - `app/server/api/admin/users/[id].get.ts:64-65` — display in admin.
  - `app/server/api/admin/jobs/index.get.ts:80-81` — display + (potential) filter in admin.
- Worker (`worker/src/migrator/consumer.py`, `cli.py`, `pipeline.py`) currently **hardcodes** `source_software="winmentor"` / `target_software="saga"` in every discover/convert call. It does **not** read `jobs.source_software` today.

## Proposed change

### 1. Migration (0008 or next free number) — nullable columns

```sql
ALTER TABLE jobs
  ALTER COLUMN source_software DROP NOT NULL,
  ALTER COLUMN target_software DROP NOT NULL;
```

Additive, zero-downtime, reversible. All existing rows already have values — no backfill needed.

### 2. Schema file update

`app/server/db/schema/jobs.ts` — drop `.notNull()` on both columns.

### 3. `POST /api/jobs` — accept 'auto'

```ts
const SoftwareEnum = z.enum(['winmentor', 'saga', 'auto']);
const BodySchema = z.object({
  sourceSoftware: SoftwareEnum.optional(),
  targetSoftware: SoftwareEnum.optional(),
  billingEmail: z.string().email().max(255).optional(),
}).refine(v => {
  const s = v.sourceSoftware ?? 'auto';
  const t = v.targetSoftware ?? 'auto';
  // If either is 'auto', direction is deferred — no differ check.
  if (s === 'auto' || t === 'auto') return true;
  return s !== t;
}, { message: 'sourceSoftware and targetSoftware must differ', path: ['targetSoftware'] });
```

Write `null` to both columns when value is `'auto'` or omitted; write concrete string otherwise.

### 4. Worker — honour jobs.source_software OR fall back

Worker is currently hardcoded; this plan does **not** make the worker read the columns. Rationale: worker discover detects the archive type from bytes anyway (parsers self-identify WinMentor vs SAGA). After discover decides, it writes the resolved direction back to `jobs.source_software` / `target_software` alongside `discovery_result`.

Concretely: `worker/src/migrator/consumer.py` discover handler, when it finishes, updates `jobs SET source_software = $resolved, target_software = $other WHERE id = $job_id AND source_software IS NULL`. Update `pipeline.py` + `cli.py` TBD — they still hardcode winmentor for now; they'll need to read the column after discover populates it, but that can land as a follow-up wave because the full end-to-end discover → convert path is still in flux.

### 5. Admin UI readers

`app/server/api/admin/jobs/index.get.ts`, `app/server/api/admin/users/[id].get.ts` — return the column as-is. Admin list must render `—` (em dash) when null; `SPEC.md` admin filter "source software" gets a new `'unresolved'` bucket (or treats null as ignored). Minor UI touch.

### 6. Client change

`app/pages/upload.vue` — remove `resolveDirection()` heuristic, send `{sourceSoftware: 'auto', targetSoftware: 'auto'}`. Actually simpler: just omit both keys when source === 'auto'.

## Files to touch

| File | Change |
|------|--------|
| `app/server/db/schema/jobs.ts` | drop `.notNull()` ×2 |
| `app/drizzle/0008_*.sql` | generated migration |
| `app/server/api/jobs/index.post.ts` | accept 'auto'/omitted, write null |
| `app/pages/upload.vue` | drop `resolveDirection()`, omit keys for 'auto' |
| `app/server/api/admin/jobs/index.get.ts` | null-safe response |
| `app/server/api/admin/users/[id].get.ts` | null-safe response |
| `worker/src/migrator/consumer.py` | discover writes resolved direction back to jobs (follow-up wave — not this task) |
| `docs/ARCHITECTURE.md` | schema section + jobs API description |
| `docs/LOG.md` | entry |

## Scope boundaries — what this plan does NOT do

- Worker pipeline/consumer hardcoding (`source_software="winmentor"`) — **not touched** in this task. The worker still runs WinMentor→SAGA by default. Discovery populates `jobs.source_software` so a later wave can switch the worker to read from the DB.
- Admin `source_software` filter UI — a follow-up if null-filtering is desired; for now null rows just don't match either filter value.
- No change to `mapping_profiles` or `mapping_cache` — those keep their non-null constraint because they're always created after direction is resolved.

## Rollback

Migration is reversible:
```sql
-- requires all rows to have non-null values (which they will while old API still enforces)
ALTER TABLE jobs
  ALTER COLUMN source_software SET NOT NULL,
  ALTER COLUMN target_software SET NOT NULL;
```

Revert the API change, re-deploy the UI change, and existing jobs keep working.

## Security check

- [x] No change to CSRF / auth — `POST /api/jobs` stays behind the same rate-limit (10/h) and CSRF enforcement.
- [x] No new user-controllable path to DB — Zod still validates + parameterized insert.
- [x] Null values don't create auth holes — `assertJobAccess` is keyed on job id + anonymous token, independent of source/target.
- [x] Admin endpoints null-safe in response — no server-side crash path.

## Open questions for Dani

1. **Confirm:** client should SEND `'auto'` explicitly, or just OMIT the fields? (I prefer explicit `'auto'` for clarity; more self-documenting in network logs.)
2. **Worker contract:** OK to land the API/schema side now and let worker continue hardcoding WinMentor→SAGA for discover/convert, with a TODO to wire it up after discovery is actually implemented (the consumer.py discover handler is still a stub per LOG.md 2026-02 entries)?
3. **Admin UI:** fine to show `—` for null source/target rows in the admin job list until worker populates them post-discover?

Waiting for green light before I branch.
