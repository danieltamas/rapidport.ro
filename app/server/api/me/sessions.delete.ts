// DELETE /api/me/sessions — revoke ALL the current user's sessions except the
// currently-active one (which issued this request). Returns { revoked: N }.
// Guarded by server/middleware/user-auth.ts.
import { and, eq, isNull, ne } from 'drizzle-orm';
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
  const currentHash = currentCookie ? sha256Hex(currentCookie) : '';

  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, current.userId),
        isNull(sessions.revokedAt),
        ne(sessions.tokenHash, currentHash),
      ),
    )
    .returning({ id: sessions.id });

  return { revoked: revoked.length };
});
