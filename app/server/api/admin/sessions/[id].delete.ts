// DELETE /api/admin/sessions/[id] — revoke an active admin session.
// Self-lockout guard: refuses to revoke the current session.
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import {
  createError,
  defineEventHandler,
  getHeader,
  getRequestIP,
  getValidatedRouterParams,
} from 'h3';
import { z } from 'zod';
import { db } from '../../../db/client';
import { adminAuditLog, adminSessions } from '../../../db/schema';
import { getAdminSession } from '../../../utils/auth-admin';

const ParamsSchema = z.object({ id: z.string().uuid() });

export default defineEventHandler(async (event) => {
  const admin = await getAdminSession(event);
  if (!admin) throw createError({ statusCode: 401 });

  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);

  if (id === admin.sessionId) {
    throw createError({
      statusCode: 409,
      data: { error: 'cannot_revoke_current_session' },
    });
  }

  const [target] = await db
    .select({ id: adminSessions.id, revokedAt: adminSessions.revokedAt })
    .from(adminSessions)
    .where(and(eq(adminSessions.id, id), isNull(adminSessions.revokedAt)))
    .limit(1);
  if (!target) throw createError({ statusCode: 404 });

  const ipHash = createHash('sha256')
    .update(getRequestIP(event, { xForwardedFor: true }) ?? '')
    .digest('hex');
  const ua = getHeader(event, 'user-agent')?.slice(0, 500);

  await db.transaction(async (tx) => {
    await tx
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(eq(adminSessions.id, id));
    await tx.insert(adminAuditLog).values({
      adminEmail: admin.email,
      action: 'admin_session_revoked',
      targetType: 'admin_session',
      targetId: id,
      ipHash,
      userAgent: ua,
    });
  });

  return { ok: true };
});
