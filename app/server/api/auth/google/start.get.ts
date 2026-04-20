// GET /api/auth/google/start — admin OAuth login entry point.
// Generates PKCE state + verifier, persists row in admin_oauth_state, then
// 302-redirects to Google's authorize URL. Callback consumes the state row.
//
// Popup mode: pass `?popup=1` — the state token is prefixed with `p:` so the
// callback serves a postMessage HTML page (and closes) instead of a server
// redirect to /admin. Used by the admin login page to avoid a full-page
// redirect round-trip.
//
// Rate limiting is handled by the global rate-limit middleware for /admin/login;
// no additional logic here. No PII / no secret logged.
import { createError, defineEventHandler, getValidatedQuery, sendRedirect } from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { adminOauthState } from '~/server/db/schema';
import { buildAuthorizeUrl, createPkce } from '~/server/utils/google-oauth';

const QuerySchema = z.object({
  popup: z.union([z.literal('1'), z.literal('true')]).optional(),
});

export const POPUP_STATE_PREFIX = 'p:';

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, QuerySchema.parse);
  const isPopup = query.popup === '1' || query.popup === 'true';

  const pkce = createPkce();
  // Prefix the state with `p:` when in popup mode. Google treats state as
  // opaque; we get it back verbatim in the callback and branch on the prefix.
  const state = isPopup ? `${POPUP_STATE_PREFIX}${pkce.state}` : pkce.state;

  try {
    await db.insert(adminOauthState).values({ state, codeVerifier: pkce.codeVerifier });
  } catch {
    console.warn('google_oauth_start_db_failed');
    throw createError({ statusCode: 503, statusMessage: 'Service unavailable' });
  }

  const url = buildAuthorizeUrl(state, pkce.codeChallenge);
  console.info('google_oauth_start', { popup: isPopup });
  return sendRedirect(event, url, 302);
});
