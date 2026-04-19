// Admin logout — revokes current admin session, clears cookie, writes audit row.
// Spec: SPEC.md §S.4 "Admin Authentication"; CLAUDE.md "Critical Rules".
// The route is guarded upstream by middleware/admin-auth.ts (assertAdminSession);
// we still call getAdminSession defensively and 401 if missing.
// CSRF is enforced upstream by middleware/csrf.ts for POST on non-webhook paths.
import { createHash } from 'node:crypto';
import { createError, defineEventHandler, getRequestHeader, getRequestIP } from 'h3';
import { db } from '~/server/db/client';
import { adminAuditLog } from '~/server/db/schema/admin_audit_log';
import { getAdminSession, revokeAdminSession } from '~/server/utils/auth-admin';

const USER_AGENT_MAX = 500;

export default defineEventHandler(async (event) => {
  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  await revokeAdminSession(session.sessionId, event);

  const ipHash = createHash('sha256')
    .update(getRequestIP(event, { xForwardedFor: true }) ?? '')
    .digest('hex');
  const userAgent = (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX) || null;

  await db.insert(adminAuditLog).values({
    adminEmail: session.email,
    action: 'admin_logout',
    ipHash,
    userAgent,
  });

  return { ok: true };
});
