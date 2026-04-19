// Strict admin session assertion — CODING.md §13.7 reference implementation.
// Enforces: cookie present, row found, not revoked, not expired, IP unchanged,
// email still in ADMIN_EMAILS allowlist. Any failure throws 401/403 — never returns null.
import { Buffer } from 'node:buffer';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { H3Event } from 'h3';
import { createError, getCookie, getRequestIP } from 'h3';
import { env } from './env';
import { getAdminSession, revokeAdminSession, type AdminSession } from './auth-admin';

const COOKIE_NAME = 'admin_session';

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return timingSafeEqual(bufA, bufB);
}

export async function assertAdminSession(event: H3Event): Promise<AdminSession> {
  // 1. Cookie must exist.
  if (!getCookie(event, COOKIE_NAME)) {
    throw createError({ statusCode: 401 });
  }

  // 2. Session row must exist, not revoked, not expired.
  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401 });
  }

  // 3. IP binding — any change revokes + 401.
  const currentIpHash = sha256Hex(getRequestIP(event, { xForwardedFor: true }) ?? '');
  if (!constantTimeEqualHex(session.ipHash, currentIpHash)) {
    await revokeAdminSession(session.sessionId, event);
    throw createError({ statusCode: 401, statusMessage: 'Session invalidated — IP changed.' });
  }

  // 4. Allowlist re-check — ADMIN_EMAILS is already normalized lowercase in env.ts.
  if (!env.ADMIN_EMAILS.includes(session.email.toLowerCase())) {
    await revokeAdminSession(session.sessionId, event);
    throw createError({ statusCode: 403 });
  }

  return session;
}
