// GET /api/me/account — current user's account info (email, createdAt). Used by
// /account/security for the Cont panel. Guarded by user-auth.
import { eq } from 'drizzle-orm';
import { createError, defineEventHandler } from 'h3';
import { db } from '../../db/client';
import { users } from '../../db/schema';
import { getUserSession } from '../../utils/auth-user';

export default defineEventHandler(async (event) => {
  const current = await getUserSession(event);
  if (!current) throw createError({ statusCode: 401 });

  const rows = await db
    .select({ email: users.email, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, current.userId))
    .limit(1);
  const row = rows[0];
  if (!row) throw createError({ statusCode: 404 });

  return { email: row.email, createdAt: row.createdAt };
});
