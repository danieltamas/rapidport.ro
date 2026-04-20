// DELETE /api/me — GDPR account deletion (SPEC §S.11). User-initiated.
//
// Delegates the actual purge to `purgeUserData` (shared with
// `DELETE /api/admin/users/[id]`). Side effects beyond the purge:
//   - Clear the session cookie client-side (caller is now unauthenticated).
//
// Guarded by user-auth middleware + CSRF middleware (DELETE is a mutation).
import { createError, defineEventHandler, setCookie } from 'h3';
import { getUserSession } from '../../utils/auth-user';
import { purgeUserData } from '../../utils/purge-user';

export default defineEventHandler(async (event) => {
  const current = await getUserSession(event);
  if (!current) throw createError({ statusCode: 401 });

  await purgeUserData({ userId: current.userId, email: current.email });

  setCookie(event, 'session', '', { maxAge: 0, path: '/' });

  return { ok: true };
});
