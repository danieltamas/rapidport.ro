// POST /api/jobs/[id]/resync — trigger a delta-sync re-run for a succeeded job.
// Spec: SPEC.md §2.2 "Delta sync".
//
// Ordering (load-bearing):
//   1. Validate UUID path param (Zod).
//   2. assertJobAccess(jobId, event) — FIRST per CLAUDE.md.
//   3. State guard: require job.status === 'succeeded'.
//   4. Quota guard: require deltaSyncsUsed < deltaSyncsAllowed. The columns are
//      integer with defaults (used=0, allowed=3) in schema/jobs.ts, but Drizzle
//      exposes them as number | null — we coerce with ?? 0 / ?? 3 to mirror the
//      SQL defaults and keep the guard tight.
//   5. Require job.uploadDiskFilename to be set (post-migration 0003 — see
//      docs/LOG.md). Without it we can't build a safe on-disk path.
//   6. Publish a fresh `convert` pg-boss job. Delta-sync semantics reuse the
//      same worker pipeline; prior mapping is reused server-side (mapping_profile
//      is left null here — the worker falls back to the job's stored mapping).
//      If SPEC later introduces a dedicated `delta-sync` queue, that's a
//      follow-up — no schema change is needed for this route.
//   7. Atomically increment deltaSyncsUsed using a parameterised `sql` template
//      (avoid lost-update races if a user fires concurrent resyncs). Also reset
//      progressStage/progressPct so the status endpoint reflects the new run.
//   8. Return {ok, deltaSyncsUsed, deltaSyncsAllowed}.
//
// CSRF: auto-enforced by middleware (POST is in ENFORCED_METHODS, route is not
// under /api/webhooks/). No rate limit wired in middleware/rate-limit.ts for
// this path today — can be added alongside S.10 tightening.
// Path traversal: no user-controlled segments. `id` is a validated UUID;
// `uploadDiskFilename` is server-controlled (`{randomUUID}.{ext}`) — see
// upload.put.ts §6.
// Logs: never log file contents.
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { createError, defineEventHandler, getValidatedRouterParams } from 'h3';
import { z } from 'zod';
import { db } from '../../../db/client';
import { jobs } from '../../../db/schema';
import type { ConvertPayload } from '../../../types/queue';
import { assertJobAccess } from '../../../utils/assert-job-access';
import { env } from '../../../utils/env';
import { publishConvert } from '../../../utils/queue';

const ParamsSchema = z.object({ id: z.string().uuid() });

const DATA_ROOT = env.DATA_ROOT;
const DEFAULT_DELTA_SYNCS_ALLOWED = 3;

export default defineEventHandler(async (event) => {
  // 1. Path param validation.
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);

  // 2. Authorization — MUST be first.
  const job = await assertJobAccess(id, event);

  // 3. State guard.
  if (job.status !== 'succeeded') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'not_ready' },
    });
  }

  // 4. Quota guard. Schema defaults are 0/3 but Drizzle typing exposes them as
  // number | null; ?? mirrors the SQL defaults.
  const used = job.deltaSyncsUsed ?? 0;
  const allowed = job.deltaSyncsAllowed ?? DEFAULT_DELTA_SYNCS_ALLOWED;
  if (used >= allowed) {
    throw createError({
      statusCode: 402,
      statusMessage: 'Payment Required',
      data: { error: 'delta_sync_quota_exhausted', used, allowed },
    });
  }

  // 5. Upload artefact must still be on disk (migration 0003 surfaced the
  // server-controlled filename separately from the user's display name).
  if (!job.uploadDiskFilename) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'upload_missing' },
    });
  }

  // 6. Publish convert job. snake_case keys mirror consumer.py Pydantic.
  // is_resync=true stamps jobs.last_run_was_resync on completion so the future
  // sync-complete email sweep can distinguish this run from the initial convert.
  const payload: ConvertPayload = {
    job_id: id,
    input_path: join(DATA_ROOT, id, 'upload', job.uploadDiskFilename),
    output_dir: join(DATA_ROOT, id, 'output'),
    mapping_profile: null,
    is_resync: true,
  };
  await publishConvert(payload);

  // 7. Atomic increment + progress reset. `sql` template is parameterised —
  // identifiers are Drizzle column refs, not strings.
  const [updated] = await db
    .update(jobs)
    .set({
      deltaSyncsUsed: sql`${jobs.deltaSyncsUsed} + 1`,
      progressStage: 'queued',
      progressPct: 0,
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, id))
    .returning({ deltaSyncsUsed: jobs.deltaSyncsUsed });

  const newUsed = updated?.deltaSyncsUsed ?? used + 1;

  return {
    ok: true,
    deltaSyncsUsed: newUsed,
    deltaSyncsAllowed: allowed,
  };
});
