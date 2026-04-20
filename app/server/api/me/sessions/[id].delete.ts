// DELETE /api/me/sessions/[id] — revoke a specific session belonging to the
// current user. 404 if id doesn't exist / isn't theirs. Guarded by user-auth.
import { and, eq, isNull } from 'drizzle-orm';
import { createError, defineEventHandler, getValidatedRouterParams } from 'h3';
import { z } from 'zod';
import { db } from '../../../db/client';
import { sessions } from '../../../db/schema';
import { getUserSession } from '../../../utils/auth-user';

const ParamsSchema = z.object({ id: z.string().uuid() });

export default defineEventHandler(async (event) => {
  const current = await getUserSession(event);
  if (!current) throw createError({ statusCode: 401 });

  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);

  const revoked = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.id, id),
        eq(sessions.userId, current.userId),
        isNull(sessions.revokedAt),
      ),
    )
    .returning({ id: sessions.id });

  if (revoked.length === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' });
  }

  return { ok: true };
});
