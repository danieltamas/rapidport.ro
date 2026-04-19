// GET /api/auth/session — returns { email } when a valid user session exists,
// else { email: null }. Used by the site header to render auth state.
// Never throws; always 200.
import { defineEventHandler } from 'h3';
import { getUserSession } from '../../utils/auth-user';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  return { email: session?.email ?? null };
});
