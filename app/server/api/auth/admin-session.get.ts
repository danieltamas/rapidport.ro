// GET /api/auth/admin-session — lightweight "am I signed in as admin?" probe.
// Used by the admin login page to poll for session establishment while the
// Google OAuth popup runs — sidesteps COOP which severs window.opener when
// the popup navigates to accounts.google.com and back.
//
// Not under /api/admin/* so the admin-auth middleware doesn't 401 on the
// unauthed state; we return JSON with a boolean instead.
import { defineEventHandler } from 'h3';
import { getAdminSession } from '~/server/utils/auth-admin';

export default defineEventHandler(async (event) => {
  const session = await getAdminSession(event);
  if (!session) return { authed: false as const };
  return { authed: true as const, email: session.email };
});
