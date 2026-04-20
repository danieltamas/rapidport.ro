// POST /api/jobs/[id]/discover — enqueue worker discovery on a previously-uploaded job.
// Spec: SPEC.md §2.2.
//
// Ordering (load-bearing):
//   1. Validate UUID path param (Zod).
//   2. assertJobAccess(jobId, event) — FIRST per CLAUDE.md.
//   3. Verify the job has been uploaded (uploadDiskFilename set).
//   4. publishDiscover({ job_id, input_path }) — snake_case mirror of
//      worker/src/migrator/consumer.py Pydantic DiscoverPayload.
//   5. Update progress (queued, 0%).
//
// CSRF is enforced globally by middleware. No rate-limit is wired for this route
// in middleware/rate-limit.ts; if SPEC tightens this later it'll go there, not here.
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { createError, defineEventHandler, getValidatedRouterParams } from 'h3';
import { z } from 'zod';
import { db } from '../../../db/client';
import { jobs } from '../../../db/schema';
import type { DiscoverPayload } from '../../../types/queue';
import { assertJobAccess } from '../../../utils/assert-job-access';
import { publishDiscover } from '../../../utils/queue';

const ParamsSchema = z.object({ id: z.string().uuid() });

const DATA_ROOT = '/data/jobs';

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);

  const job = await assertJobAccess(id, event);

  if (!job.uploadDiskFilename) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'not_uploaded' },
    });
  }

  const inputPath = join(DATA_ROOT, id, 'upload', job.uploadDiskFilename);

  const payload: DiscoverPayload = {
    job_id: id,
    input_path: inputPath,
  };
  await publishDiscover(payload);

  await db
    .update(jobs)
    .set({ progressStage: 'queued', progressPct: 0, updatedAt: new Date() })
    .where(eq(jobs.id, id));

  return { ok: true, jobId: id };
});
