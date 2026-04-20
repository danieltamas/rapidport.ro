// GET /api/admin/sessions — list active admin sessions, marking the current one.
import { and, gt, isNull, sql } from 'drizzle-orm';
import { createError, defineEventHandler } from 'h3';
import { db } from '../../../db/client';
import { adminSessions } from '../../../db/schema';
import { getAdminSession } from '../../../utils/auth-admin';
import { auditRead } from '../../../utils/admin-audit';

export default defineEventHandler(async (event) => {
  const admin = await getAdminSession(event);
  if (!admin) throw createError({ statusCode: 401 });

  auditRead(event, admin, 'admin_sessions_viewed');

  const rows = await db
    .select({
      id: adminSessions.id,
      adminEmail: adminSessions.email,
      ipHash: adminSessions.ipHash,
      userAgent: adminSessions.userAgent,
      createdAt: adminSessions.createdAt,
      expiresAt: adminSessions.expiresAt,
    })
    .from(adminSessions)
    .where(and(isNull(adminSessions.revokedAt), gt(adminSessions.expiresAt, sql`now()`)))
    .orderBy(sql`${adminSessions.createdAt} desc`);

  return {
    rows: rows.map((r) => ({ ...r, isCurrent: r.id === admin.sessionId })),
  };
});
