// DELETE /api/auth/session — user logout. Revokes the current session row and
// clears the cookie. Always returns { ok: true }; never leaks whether a session
// was active (same shape regardless). CSRF enforced by middleware.
import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { defineEventHandler, getCookie, setCookie } from 'h3';
import { db } from '../../db/client';
import { sessions } from '../../db/schema';

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export default defineEventHandler(async (event) => {
  const cookieToken = getCookie(event, 'session');
  if (cookieToken) {
    const tokenHash = sha256Hex(cookieToken);
    try {
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)));
    } catch {
      // Drop the cookie regardless.
    }
    setCookie(event, 'session', '', { maxAge: 0, path: '/' });
  }
  return { ok: true };
});
