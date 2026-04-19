// Admin session lifecycle — create / read / revoke.
// Spec: SPEC.md §S.4 "Admin Authentication"; CODING.md §13.7 "Session Binding".
// Opaque 32-byte tokens (NOT JWTs). Cookie holds plaintext token; DB stores SHA-256.
// IP-bound at creation; 8h TTL. Separate from user sessions by design.
import { createHash, randomBytes } from 'node:crypto';
import type { H3Event } from 'h3';
import { deleteCookie, getCookie, getRequestIP, getRequestHeader, setCookie } from 'h3';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { adminSessions } from '../db/schema/admin_sessions';

const COOKIE_NAME = 'admin_session';
const TTL_SECONDS = 8 * 60 * 60;
const USER_AGENT_MAX = 512;

export type AdminSession = {
  sessionId: string;
  email: string;
  expiresAt: Date;
  ipHash: string;
};

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export async function createAdminSession(
  email: string,
  event: H3Event,
): Promise<{ token: string }> {
  const token = randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(token);
  const ipHash = sha256Hex(getRequestIP(event, { xForwardedFor: true }) ?? '');
  const ua = (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TTL_SECONDS * 1000);

  await db.insert(adminSessions).values({
    email: email.toLowerCase(),
    tokenHash,
    ipHash,
    userAgent: ua || null,
    expiresAt,
  });

  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: TTL_SECONDS,
  });

  return { token };
}

export async function getAdminSession(event: H3Event): Promise<AdminSession | null> {
  const token = getCookie(event, COOKIE_NAME);
  if (!token) return null;

  const tokenHash = sha256Hex(token);
  const [row] = await db
    .select()
    .from(adminSessions)
    .where(and(eq(adminSessions.tokenHash, tokenHash), isNull(adminSessions.revokedAt)))
    .limit(1);

  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  return {
    sessionId: row.id,
    email: row.email,
    expiresAt: row.expiresAt,
    ipHash: row.ipHash,
  };
}

export async function revokeAdminSession(sessionId: string, event?: H3Event): Promise<void> {
  await db
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(eq(adminSessions.id, sessionId));

  if (event) {
    deleteCookie(event, COOKIE_NAME, { path: '/' });
  }
}
