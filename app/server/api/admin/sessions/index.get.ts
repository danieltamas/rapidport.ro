// GET /api/admin/sessions — list active admin sessions, marking the current one.
import { createHash } from 'node:crypto';
import { and, gt, isNull } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  createError,
  defineEventHandler,
  getHeader,
  getRequestIP,
} from 'h3';
import { db } from '../../../db/client';
import { adminAuditLog, adminSessions } from '../../../db/schema';
import { getAdminSession } from '../../../utils/auth-admin';

export default defineEventHandler(async (event) => {
  const admin = await getAdminSession(event);
  if (!admin) throw createError({ statusCode: 401 });

  // Audit — best-effort (read).
  try {
    const ipHash = createHash('sha256')
      .update(getRequestIP(event, { xForwardedFor: true }) ?? '')
      .digest('hex');
    const ua = getHeader(event, 'user-agent')?.slice(0, 500);
    await db.insert(adminAuditLog).values({
      adminEmail: admin.email,
      action: 'admin_sessions_viewed',
      ipHash,
      userAgent: ua,
    });
  } catch {
    console.warn('admin_audit_log_failed', { action: 'admin_sessions_viewed' });
  }

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
