// User session lifecycle (create/get/revoke). Spec: SPEC.md §S.3 "User Authentication".
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull, gt } from 'drizzle-orm';
import {
  deleteCookie,
  getCookie,
  getHeader,
  getRequestIP,
  setCookie,
  type H3Event,
} from 'h3';
import { db } from '../db/client';
import { sessions, users } from '../db/schema';

export type UserSession = {
  sessionId: string;
  userId: string;
  email: string;
  expiresAt: Date;
};

const COOKIE_NAME = 'session';
const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const UA_MAX_LEN = 500;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createUserSession(
  userId: string,
  event: H3Event,
  opts?: { ttlMs?: number },
): Promise<{ token: string }> {
  const ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const token = randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const now = Date.now();
  const expiresAt = new Date(now + ttlMs);

  const ipAddress = getRequestIP(event, { xForwardedFor: true }) ?? null;
  const ua = getHeader(event, 'user-agent') ?? null;
  const userAgent = ua ? ua.slice(0, UA_MAX_LEN) : null;

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
    ipAddress,
    userAgent,
  });

  setCookie(event, COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(ttlMs / 1000),
  });

  return { token };
}

export async function getUserSession(event: H3Event): Promise<UserSession | null> {
  try {
    const token = getCookie(event, COOKIE_NAME);
    if (!token) return null;

    const tokenHash = hashToken(token);
    const now = new Date();

    const rows = await db
      .select({
        sessionId: sessions.id,
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
        email: users.email,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return {
      sessionId: row.sessionId,
      userId: row.userId,
      email: row.email,
      expiresAt: row.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function revokeSession(sessionId: string, event?: H3Event): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, sessionId));

  if (event) {
    deleteCookie(event, COOKIE_NAME, { path: '/' });
  }
}
