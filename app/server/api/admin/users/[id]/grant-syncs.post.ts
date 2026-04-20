// POST /api/admin/users/[id]/grant-syncs — bump deltaSyncsAllowed across all
// of a user's jobs.
// Spec: jobs/phase2-nuxt/PLAN-api-admin-wave-b.md Task 2.
//
// Mutation — audit is SYNCHRONOUS + TRANSACTIONAL (Wave B policy): the update
// and the admin_audit_log insert happen in one transaction so an audit failure
// rolls back the mutation.
import { createHash } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRequestIP,
  readValidatedBody,
  getValidatedRouterParams,
} from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { adminAuditLog } from '~/server/db/schema/admin_audit_log';
import { jobs } from '~/server/db/schema/jobs';
import { getAdminSession } from '~/server/utils/auth-admin';

const USER_AGENT_MAX = 500;

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  additional: z.number().int().min(1).max(20),
  reason: z.string().min(5).max(500),
});

export default defineEventHandler(async (event) => {
  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const { id } = await getValidatedRouterParams(event, paramsSchema.parse);
  const body = await readValidatedBody(event, bodySchema.parse);

  const ipHash = createHash('sha256')
    .update(getRequestIP(event, { xForwardedFor: true }) ?? '')
    .digest('hex');
  const userAgent = (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX) || null;

  const jobsAffected = await db.transaction(async (tx) => {
    const result = await tx
      .update(jobs)
      .set({ deltaSyncsAllowed: sql`${jobs.deltaSyncsAllowed} + ${body.additional}` })
      .where(eq(jobs.userId, id));

    const count = result.rowCount ?? 0;

    await tx.insert(adminAuditLog).values({
      adminEmail: session.email,
      action: 'user_syncs_granted',
      targetType: 'user',
      targetId: id,
      details: { additional: body.additional, reason: body.reason, jobsAffected: count },
      ipHash,
      userAgent,
    });

    return count;
  });

  return { ok: true, jobsAffected };
});
