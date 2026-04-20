// POST /api/jobs/[id]/discover — enqueue worker discovery on a previously-uploaded job.
// Spec: SPEC.md §2.2.
//
// Ordering (load-bearing):
//   1. Validate UUID path param (Zod).
//   2. assertJobAccess(jobId, event) — FIRST per CLAUDE.md.
//   3. Verify the job has been uploaded (uploadFilename set).
//   4. Resolve the on-disk input path. The upload handler stores files at
//      `/data/jobs/{id}/upload/{randomUuid}.{ext}` but only persists the original
//      filename to the DB, so we readdir the upload directory and pick the one
//      file. (Cross-task wiring gap to revisit: persisting the disk filename in
//      a future schema migration would let us avoid the readdir.)
//   5. publishDiscover({ job_id, input_path }) — payload is snake_case to match
//      worker/src/migrator/consumer.py Pydantic DiscoverPayload byte-for-byte.
//   6. Update progress (queued, 0%).
//
// CSRF is enforced globally by middleware. No rate-limit is wired for this route
// in middleware/rate-limit.ts; if SPEC tightens this later it'll go there, not here.
import { readdir } from 'node:fs/promises';
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

  if (!job.uploadFilename) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'not_uploaded' },
    });
  }

  const uploadDir = join(DATA_ROOT, id, 'upload');
  let entries: string[];
  try {
    entries = await readdir(uploadDir);
  } catch {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'upload_missing_on_disk' },
    });
  }
  const files = entries.filter((e) => /^[0-9a-f-]+\.(zip|tgz|7z)$/i.test(e));
  if (files.length !== 1) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: files.length === 0 ? 'upload_missing_on_disk' : 'upload_ambiguous' },
    });
  }
  const diskName = files[0]!;
  const inputPath = join(uploadDir, diskName);

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
