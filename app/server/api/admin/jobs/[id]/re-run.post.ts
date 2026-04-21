// POST /api/admin/jobs/[id]/re-run — admin re-publish of a convert job.
// Spec: PLAN-api-admin-wave-b.md Task 1.
//
// Same payload shape as api/jobs/[id]/resync.post.ts but admin override:
//   - does NOT increment deltaSyncsUsed (not user-counted)
//   - resets progress fields so the status UI reflects the new run
//   - publishConvert runs AFTER the DB tx commits. Failure mode "row reset
//     but nothing queued" is trivially recoverable (re-click). The alternative
//     ("queued but tx rolled back") is worse (orphan queued job + no audit).
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRequestHeader, getRequestIP, getValidatedRouterParams, readValidatedBody } from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { adminAuditLog } from '~/server/db/schema/admin_audit_log';
import { jobs } from '~/server/db/schema/jobs';
import type { ConvertPayload } from '~/server/types/queue';
import { getAdminSession } from '~/server/utils/auth-admin';
import { env } from '~/server/utils/env';
import { publishConvert } from '~/server/utils/queue';

const USER_AGENT_MAX = 500;
const DATA_ROOT = env.DATA_ROOT;

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({
  reason: z.string().min(5).max(500),
});

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);
  const { reason } = await readValidatedBody(event, BodySchema.parse);

  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' });
  }
  if (!job.uploadDiskFilename) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'upload_missing' },
    });
  }

  const ipHash = sha256Hex(getRequestIP(event, { xForwardedFor: true }) ?? '');
  const userAgent = (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX) || null;

  // Reset progress + audit in one tx. Publish after commit.
  await db.transaction(async (tx) => {
    await tx
      .update(jobs)
      .set({
        progressStage: 'queued',
        progressPct: 0,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, id));

    await tx.insert(adminAuditLog).values({
      adminEmail: session.email,
      action: 'job_rerun',
      targetType: 'job',
      targetId: id,
      details: { reason },
      ipHash,
      userAgent,
    });
  });

  // Publish after commit — see header comment for rationale.
  const payload: ConvertPayload = {
    job_id: id,
    input_path: join(DATA_ROOT, id, 'upload', job.uploadDiskFilename),
    output_dir: join(DATA_ROOT, id, 'output'),
    mapping_profile: null,
  };
  await publishConvert(payload);

  return { ok: true, jobId: id };
});
