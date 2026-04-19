// Google OAuth 2.0 helpers (PKCE + state). Admin login only — no user OAuth in v1.
// Raw fetch, no SDK — smaller attack surface, no extra npm dep.
// Flow:
//   start   → generate state + codeVerifier, persist in admin_oauth_state, 302 to Google.
//   callback → verify state, exchange code+verifier for tokens, fetch userinfo, allowlist-check.
import { createHash, randomBytes } from 'node:crypto';
import { env } from './env';

export type GooglePkce = { state: string; codeVerifier: string; codeChallenge: string };

/** Generates a cryptographically random state + PKCE pair. Caller persists state+verifier. */
export function createPkce(): GooglePkce {
  const state = randomBytes(32).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
  return { state, codeVerifier, codeChallenge };
}

/** Builds the Google authorize URL. openid+email+profile scope; prompt=select_account so admin picks. */
export function buildAuthorizeUrl(state: string, codeChallenge: string): string {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', env.GOOGLE_OAUTH_CLIENT_ID);
  u.searchParams.set('redirect_uri', env.GOOGLE_OAUTH_REDIRECT_URI);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid email profile');
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', codeChallenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('prompt', 'select_account');
  u.searchParams.set('access_type', 'online');
  return u.toString();
}

export type GoogleTokenResponse = { access_token: string; id_token?: string; expires_in: number };

/** Exchanges authorization code + verifier for tokens. Throws on non-2xx. */
export async function exchangeCode(code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier,
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`google_token_exchange_failed:${res.status}`);
  return (await res.json()) as GoogleTokenResponse;
}

export type GoogleUserInfo = { sub: string; email: string; email_verified: boolean; name?: string };

/** Fetches verified-email profile with the access token. Throws on non-2xx. */
export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`google_userinfo_failed:${res.status}`);
  return (await res.json()) as GoogleUserInfo;
}
