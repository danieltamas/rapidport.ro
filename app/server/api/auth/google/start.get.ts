// GET /api/auth/google/start — admin OAuth login entry point.
// Generates PKCE state + verifier, persists row in admin_oauth_state, then
// 302-redirects to Google's authorize URL. Callback consumes the state row.
// Rate limiting is handled by the global rate-limit middleware for /admin/login;
// no additional logic here. No PII / no secret logged.
import { createError, defineEventHandler, sendRedirect } from 'h3';
import { db } from '~/server/db/client';
import { adminOauthState } from '~/server/db/schema';
import { buildAuthorizeUrl, createPkce } from '~/server/utils/google-oauth';

export default defineEventHandler(async (event) => {
  const { state, codeVerifier, codeChallenge } = createPkce();

  try {
    await db.insert(adminOauthState).values({ state, codeVerifier });
  } catch {
    console.warn('google_oauth_start_db_failed');
    throw createError({ statusCode: 503, statusMessage: 'Service unavailable' });
  }

  const url = buildAuthorizeUrl(state, codeChallenge);
  console.info('google_oauth_start');
  return sendRedirect(event, url, 302);
});
