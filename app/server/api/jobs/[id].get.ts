// GET /api/jobs/[id] — gated read of a single job row.
// Access gate: admin session, owning user session, or anonymous per-job token
// (verified against `anonymous_access_token`). Handled by `assertJobAccess`,
// which 404s on missing job and 403s on no access. The access token itself is
// NEVER returned to clients — it's the capability that grants anon access, so
// leaking it in the response would defeat the gate.
import { createError, defineEventHandler, getValidatedRouterParams } from 'h3';
import { z } from 'zod';
import { assertJobAccess } from '../../utils/assert-job-access';

const paramsSchema = z.object({ id: z.string().uuid() });

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, (raw) => {
    const parsed = paramsSchema.safeParse(raw);
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid job id' });
    }
    return parsed.data;
  });

  // Gate first — assertJobAccess fetches the job, so we reuse its return value
  // instead of issuing a second SELECT.
  const job = await assertJobAccess(id, event);

  // Strip the anonymous access token before returning. This is the ONLY
  // secret-shaped column on `jobs` (see app/server/db/schema/jobs.ts).
  // `discoveryResult` / `mappingResult` are jsonb blobs of analysis output,
  // not secrets. `billingEmail` is user-owned data and is returned for
  // display.
  const { anonymousAccessToken: _stripped, ...safe } = job;

  return {
    ...safe,
    createdAt: safe.createdAt ? safe.createdAt.toISOString() : null,
    updatedAt: safe.updatedAt ? safe.updatedAt.toISOString() : null,
    expiresAt: safe.expiresAt ? safe.expiresAt.toISOString() : null,
  };
});
