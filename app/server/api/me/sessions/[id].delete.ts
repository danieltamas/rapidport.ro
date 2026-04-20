// DELETE /api/me/sessions/[id] — revoke a specific session belonging to the
// current user. 404 if id doesn't exist / isn't theirs. Guarded by user-auth.
import { and, eq } from 'drizzle-orm';
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

  // Ownership check first — 404 if the session doesn't exist or isn't theirs.
  // Then revoke idempotently: a DELETE on an already-revoked session should
  // succeed (the desired end state is "revoked"). Prevents spurious 404s when
  // the client list is stale (e.g. after "revoke-all-others" ran in another tab).
  const [row] = await db
    .select({ id: sessions.id, revokedAt: sessions.revokedAt })
    .from(sessions)
    .where(and(eq(sessions.id, id), eq(sessions.userId, current.userId)))
    .limit(1);

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' });
  }

  if (row.revokedAt === null) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, id));
  }

  return { ok: true };
});
