// POST /api/admin/jobs/[id]/extend-syncs — bump deltaSyncsAllowed for a job.
// Spec: PLAN-api-admin-wave-b.md Task 1.
//
// Transactional: UPDATE + admin_audit_log INSERT in the same Drizzle tx.
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { createError, defineEventHandler, getRequestHeader, getRequestIP, getValidatedRouterParams, readValidatedBody } from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { adminAuditLog } from '~/server/db/schema/admin_audit_log';
import { jobs } from '~/server/db/schema/jobs';
import { getAdminSession } from '~/server/utils/auth-admin';

const USER_AGENT_MAX = 500;

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({
  additional: z.number().int().min(1).max(20),
  reason: z.string().min(5).max(500),
});

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);
  const { additional, reason } = await readValidatedBody(event, BodySchema.parse);

  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const ipHash = sha256Hex(getRequestIP(event, { xForwardedFor: true }) ?? '');
  const userAgent = (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX) || null;

  const newAllowed = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(jobs)
      .set({
        deltaSyncsAllowed: sql`${jobs.deltaSyncsAllowed} + ${additional}`,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, id))
      .returning({ deltaSyncsAllowed: jobs.deltaSyncsAllowed });

    if (!updated) {
      throw createError({ statusCode: 404, statusMessage: 'Job not found' });
    }

    await tx.insert(adminAuditLog).values({
      adminEmail: session.email,
      action: 'job_syncs_extended',
      targetType: 'job',
      targetId: id,
      details: { additional, reason },
      ipHash,
      userAgent,
    });

    return updated.deltaSyncsAllowed;
  });

  return {
    ok: true,
    deltaSyncsAllowed: newAllowed ?? 0,
  };
});
