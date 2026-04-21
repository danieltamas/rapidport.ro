// DELETE /api/admin/jobs/[id] — purge a job's PII while keeping the row for
// audit linkage. Spec: PLAN-api-admin-wave-b.md Task 1, Decision A2 (no auto-refund).
//
// Guard: if any succeeded payment exists for this job, reject with
// 409 paid_job_must_refund_first — admin must call refund first.
//
// Ordering:
//   1. Paid-guard (read).
//   2. fs.rm /data/jobs/{id}/  (non-fatal; orphan dir handled by future cron).
//   3. db.transaction { UPDATE jobs + INSERT admin_audit_log }.
import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRequestHeader, getRequestIP, getValidatedRouterParams, readValidatedBody } from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { adminAuditLog } from '~/server/db/schema/admin_audit_log';
import { jobs } from '~/server/db/schema/jobs';
import { payments } from '~/server/db/schema/payments';
import { getAdminSession } from '~/server/utils/auth-admin';
import { env } from '~/server/utils/env';

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

  // Paid-guard: any succeeded payment → refuse. Admin must refund first.
  const [paid] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(and(eq(payments.jobId, id), eq(payments.status, 'succeeded')))
    .limit(1);
  if (paid) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'paid_job_must_refund_first' },
    });
  }

  // Ensure the job exists before destructive action.
  const [existing] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, id)).limit(1);
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' });
  }

  // Wipe /data/jobs/{id}. Non-fatal — orphan dir will be cleaned by cron.
  // `id` is a validated UUID; no traversal.
  try {
    await rm(join(DATA_ROOT, id), { recursive: true, force: true });
  } catch (err) {
    console.warn('admin_job_delete_fs_rm_failed', { name: (err as Error).name });
  }

  const ipHash = sha256Hex(getRequestIP(event, { xForwardedFor: true }) ?? '');
  const userAgent = (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX) || null;

  await db.transaction(async (tx) => {
    await tx
      .update(jobs)
      .set({
        status: 'expired',
        uploadFilename: null,
        uploadDiskFilename: null,
        billingEmail: null,
        mappingResult: null,
        discoveryResult: null,
        anonymousAccessToken: '[deleted]',
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, id));

    await tx.insert(adminAuditLog).values({
      adminEmail: session.email,
      action: 'job_deleted',
      targetType: 'job',
      targetId: id,
      details: { reason },
      ipHash,
      userAgent,
    });
  });

  return { ok: true };
});
