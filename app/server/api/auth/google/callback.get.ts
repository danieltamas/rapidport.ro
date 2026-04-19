// Google OAuth admin callback. Spec: SPEC.md §S.4; CODING.md §13.7.
// Flow: validate query → one-shot state lookup+delete → exchangeCode → fetchUserInfo →
// email_verified check → ADMIN_EMAILS allowlist → createAdminSession → audit → 303 /admin.
// Every denial path writes admin_audit_log BEFORE throwing. No tokens / codes / state in logs.
import { createHash } from 'node:crypto';
import type { H3Event } from 'h3';
import { createError, getRequestHeader, getRequestIP, getValidatedQuery, sendRedirect } from 'h3';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { adminAuditLog, adminOauthState } from '~/server/db/schema';
import { env } from '~/server/utils/env';
import { exchangeCode, fetchUserInfo } from '~/server/utils/google-oauth';
import { createAdminSession } from '~/server/utils/auth-admin';

const QuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const UA_MAX = 512;

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

async function audit(
  event: H3Event,
  adminEmail: string,
  action: string,
  details?: Record<string, unknown>,
): Promise<void> {
  const ipHash = sha256Hex(getRequestIP(event, { xForwardedFor: true }) ?? '');
  const userAgent = (getRequestHeader(event, 'user-agent') ?? '').slice(0, UA_MAX) || null;
  await db.insert(adminAuditLog).values({
    adminEmail,
    action,
    details: details ?? null,
    ipHash,
    userAgent,
  });
}

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, QuerySchema.parse);

  // Google reported an error, or user cancelled at consent screen.
  if (query.error) {
    await audit(event, 'unknown', 'oauth_provider_error', { error: query.error });
    return sendRedirect(event, '/admin/login?error=oauth_declined', 303);
  }

  if (!query.code || !query.state) {
    await audit(event, 'unknown', 'oauth_state_invalid', { reason: 'missing_params' });
    throw createError({ statusCode: 400, statusMessage: 'Invalid OAuth callback.' });
  }

  // One-shot state: delete first so a leaked state cannot be replayed.
  const [stateRow] = await db
    .delete(adminOauthState)
    .where(eq(adminOauthState.state, query.state))
    .returning();

  if (!stateRow) {
    await audit(event, 'unknown', 'oauth_state_invalid', { reason: 'not_found' });
    throw createError({ statusCode: 400, statusMessage: 'Invalid OAuth state.' });
  }

  if (stateRow.createdAt.getTime() < Date.now() - STATE_TTL_MS) {
    await audit(event, 'unknown', 'oauth_state_invalid', { reason: 'expired' });
    throw createError({ statusCode: 400, statusMessage: 'OAuth state expired.' });
  }

  // Exchange code for tokens.
  let tokens;
  try {
    tokens = await exchangeCode(query.code, stateRow.codeVerifier);
  } catch {
    await audit(event, 'unknown', 'oauth_token_exchange_failed');
    throw createError({ statusCode: 400, statusMessage: 'Token exchange failed.' });
  }

  // Fetch userinfo.
  let userinfo;
  try {
    userinfo = await fetchUserInfo(tokens.access_token);
  } catch {
    await audit(event, 'unknown', 'oauth_userinfo_failed');
    throw createError({ statusCode: 400, statusMessage: 'Userinfo fetch failed.' });
  }

  const email = userinfo.email.toLowerCase();

  if (userinfo.email_verified !== true) {
    await audit(event, email, 'oauth_email_not_verified');
    throw createError({ statusCode: 403, statusMessage: 'Email not verified.' });
  }

  if (!env.ADMIN_EMAILS.includes(email)) {
    await audit(event, email, 'oauth_not_allowlisted');
    throw createError({ statusCode: 403, statusMessage: 'Not allowlisted.' });
  }

  await createAdminSession(email, event);
  await audit(event, email, 'admin_login_succeeded');

  return sendRedirect(event, '/admin', 303);
});
