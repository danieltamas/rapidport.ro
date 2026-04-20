// POST /api/admin/users/[id]/unblock — clear an admin-imposed block.
// Symmetric to block.post.ts. Reason is captured for audit symmetry.
//
// Spec: jobs/phase2-nuxt/PLAN-api-admin-wave-b.md Task 2.
// Mutation — audit is SYNCHRONOUS + TRANSACTIONAL (Wave B policy).
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
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
import { users } from '~/server/db/schema/users';
import { getAdminSession } from '~/server/utils/auth-admin';

const USER_AGENT_MAX = 500;

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  reason: z.string().min(5).max(500),
});

export default defineEventHandler(async (event) => {
  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const { id } = await getValidatedRouterParams(event, paramsSchema.parse);
  const body = await readValidatedBody(event, bodySchema.parse);

  const existing = await db
    .select({ id: users.id, blockedAt: users.blockedAt })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  const row = existing[0];
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' });
  }
  if (!row.blockedAt) {
    throw createError({ statusCode: 409, statusMessage: 'not_blocked' });
  }

  const ipHash = createHash('sha256')
    .update(getRequestIP(event, { xForwardedFor: true }) ?? '')
    .digest('hex');
  const userAgent = (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX) || null;

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ blockedAt: null, blockedReason: null })
      .where(eq(users.id, id));

    await tx.insert(adminAuditLog).values({
      adminEmail: session.email,
      action: 'user_unblocked',
      targetType: 'user',
      targetId: id,
      details: { reason: body.reason },
      ipHash,
      userAgent,
    });
  });

  return { ok: true };
});
