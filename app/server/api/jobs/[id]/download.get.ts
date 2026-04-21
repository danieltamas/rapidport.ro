// GET /api/jobs/[id]/download — stream the converted output bundle as a ZIP.
// Spec: SPEC.md §2.2 "Download" / delta-sync flows.
//
// Ordering (load-bearing):
//   1. Validate UUID path param (Zod).
//   2. assertJobAccess(jobId, event) — FIRST per CLAUDE.md.
//   3. State guard: job.status must be 'succeeded' (set by the worker's
//      _mark_rp_succeeded — see worker/src/migrator/consumer.py). Otherwise 409.
//   4. Locate the output bundle. The worker writes individual files
//      (XML/DBF + report.json) to /data/jobs/{id}/output/. We do NOT yet have a
//      zip-streaming dependency wired (no `archiver` in package.json — adding a
//      dep is out of scope for this task). Strategy:
//        a) If /data/jobs/{id}/output.zip exists (pre-built by the worker or a
//           future stage), stream that file as application/zip.
//        b) Otherwise, return 501 Not Implemented with error
//           'zip_bundler_unavailable'. Ship the route, access check, and state
//           guard now; plug in `archiver` (or equivalent) in a follow-up task.
//   5. Content-Disposition uses the id-short (first 8 chars of the UUID) as the
//      filename suffix — no user-controlled segments in headers or paths.
//
// Path traversal: the only path segment derived from the request is the validated
// UUID `id`. Everything else is a fixed constant. No readdir, no globbing.
// Access: anonymous token / user session / admin session — all via assertJobAccess.
// Logs: never log file contents. Job id is safe to log (opaque UUID).
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createError,
  defineEventHandler,
  getValidatedRouterParams,
  sendStream,
  setResponseHeaders,
} from 'h3';
import { z } from 'zod';
import { assertJobAccess } from '../../../utils/assert-job-access';
import { env } from '../../../utils/env';

const ParamsSchema = z.object({ id: z.string().uuid() });

const DATA_ROOT = env.DATA_ROOT;

export default defineEventHandler(async (event) => {
  // 1. Path param validation.
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);

  // 2. Authorization — MUST be first.
  const job = await assertJobAccess(id, event);

  // 3. State guard — only succeeded jobs have an output bundle to download.
  if (job.status !== 'succeeded') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'not_ready' },
    });
  }

  // 4. Locate bundle. Only /data/jobs/{id}/output.zip is supported right now.
  const zipPath = join(DATA_ROOT, id, 'output.zip');

  let size: number;
  try {
    const s = await stat(zipPath);
    if (!s.isFile()) {
      throw createError({
        statusCode: 501,
        statusMessage: 'Not Implemented',
        data: { error: 'zip_bundler_unavailable' },
      });
    }
    size = s.size;
  } catch (err) {
    // stat failed (ENOENT most likely) — no pre-built bundle, no streaming
    // bundler wired. Report 501 so the caller knows this is a server-side
    // capability gap, not a "file missing" for a succeeded job.
    if (err && typeof err === 'object' && 'statusCode' in err) throw err;
    throw createError({
      statusCode: 501,
      statusMessage: 'Not Implemented',
      data: { error: 'zip_bundler_unavailable' },
    });
  }

  // 5. Stream. Filename is derived from server-controlled id; id-short is the
  // first 8 chars of the validated UUID (alphanumeric/hyphen only — safe for
  // Content-Disposition without further escaping).
  const idShort = id.slice(0, 8);
  setResponseHeaders(event, {
    'Content-Type': 'application/zip',
    'Content-Length': String(size),
    'Content-Disposition': `attachment; filename="rapidport-${idShort}.zip"`,
    'Cache-Control': 'private, no-store',
  });

  return sendStream(event, createReadStream(zipPath));
});
