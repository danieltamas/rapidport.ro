// DELETE /api/admin/users/[id] — admin-initiated GDPR purge.
// Spec: jobs/phase2-nuxt/PLAN-api-admin-wave-b.md Task 2.
//
// Delegates the actual purge to purgeUserData (shared helper — same code path
// as DELETE /api/me). The purge itself is atomic (single Drizzle transaction
// inside the helper). We audit AFTER the purge commits because the purge
// transaction rewrites the users row (email anonymized) and we want the audit
// row to reference the anonymized ID only — the original email is recorded
// via an 8-char SHA-256 prefix so the audit is GDPR-compliant (hashed, not
// plaintext) while still allowing correlation with prior admin actions that
// used the same hash.
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
import { purgeUserData } from '~/server/utils/purge-user';

const USER_AGENT_MAX = 500;

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  reason: z.string().min(5).max(500),
});

function sha256Prefix(v: string): string {
  return createHash('sha256').update(v).digest('hex').slice(0, 8);
}

export default defineEventHandler(async (event) => {
  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const { id } = await getValidatedRouterParams(event, paramsSchema.parse);
  const body = await readValidatedBody(event, bodySchema.parse);

  // Capture id + email BEFORE the purge — the purge rewrites the email column.
  const existing = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  const row = existing[0];
  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' });
  }

  await purgeUserData({ userId: row.id, email: row.email });

  const ipHash = createHash('sha256')
    .update(getRequestIP(event, { xForwardedFor: true }) ?? '')
    .digest('hex');
  const userAgent = (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX) || null;

  await db.insert(adminAuditLog).values({
    adminEmail: session.email,
    action: 'user_deleted',
    targetType: 'user',
    targetId: id,
    details: {
      reason: body.reason,
      originalEmailHashPrefix: sha256Prefix(row.email),
    },
    ipHash,
    userAgent,
  });

  return { ok: true };
});
