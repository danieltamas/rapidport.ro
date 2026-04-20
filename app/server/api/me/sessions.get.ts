// GET /api/me/sessions — list the current user's active sessions. Guarded by
// server/middleware/user-auth.ts; if it runs, we know there's a valid session.
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { createError, defineEventHandler, getCookie } from 'h3';
import { createHash } from 'node:crypto';
import { db } from '../../db/client';
import { sessions } from '../../db/schema';
import { getUserSession } from '../../utils/auth-user';

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export default defineEventHandler(async (event) => {
  const current = await getUserSession(event);
  if (!current) throw createError({ statusCode: 401 });

  const currentCookie = getCookie(event, 'session');
  const currentHash = currentCookie ? sha256Hex(currentCookie) : null;

  const rows = await db
    .select({
      id: sessions.id,
      tokenHash: sessions.tokenHash,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.userId, current.userId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(sessions.createdAt));

  return rows.map((r) => ({
    id: r.id,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    current: currentHash !== null && r.tokenHash === currentHash,
  }));
});
