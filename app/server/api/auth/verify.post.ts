// POST /api/auth/verify — validates the 6-digit code, consumes it atomically,
// creates/finds the user, issues a session, claims any anonymous jobs the
// browser holds cookies for, returns { redirectTo }.
//
// Security:
// - Token stored SHA-256-hashed; plaintext code never in DB, only compared via hash.
// - Atomic consume + find-or-create in one transaction (defeats lookup→update race).
// - Generic errors so a caller cannot distinguish registered/unregistered emails.
// - No PII in logs.
import { createHash } from 'node:crypto';
import { and, eq, isNull, gt, sql } from 'drizzle-orm';
import {
  createError,
  defineEventHandler,
  getRequestIP,
  readValidatedBody,
} from 'h3';
import { z } from 'zod';
import { db } from '../../db/client';
import { jobs, magicLinkTokens, users } from '../../db/schema';
import { createUserSession } from '../../utils/auth-user';

const BodySchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
  next: z.string().optional(),
});

const NEXT_RE = /^\/(?!\/)(?!\\)/; // must start with / but not // or /\

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

function safeNext(raw: unknown): string {
  if (typeof raw !== 'string') return '/account';
  if (!NEXT_RE.test(raw)) return '/account';
  return raw;
}

function parseJobAccessCookies(cookieHeader: string | undefined): string[] {
  if (!cookieHeader) return [];
  const jobIds: string[] = [];
  for (const part of cookieHeader.split(';')) {
    const [rawName] = part.trim().split('=');
    if (!rawName || !rawName.startsWith('job_access_')) continue;
    const id = rawName.slice('job_access_'.length);
    if (/^[0-9a-f-]{36}$/i.test(id)) jobIds.push(id);
  }
  return jobIds;
}

export default defineEventHandler(async (event) => {
  const { email, code, next } = await readValidatedBody(event, BodySchema.parse);
  const tokenHash = sha256Hex(code);

  // Look up the token by (email, tokenHash). Match scoped to email so brute-forcing
  // a code without knowing the email can't succeed.
  const rows = await db
    .select()
    .from(magicLinkTokens)
    .where(and(eq(magicLinkTokens.email, email), eq(magicLinkTokens.tokenHash, tokenHash)))
    .limit(1);
  const token = rows[0];

  if (!token || token.consumedAt || token.expiresAt < new Date()) {
    throw createError({ statusCode: 400, statusMessage: 'Cod invalid sau expirat' });
  }

  const ipAddress = getRequestIP(event, { xForwardedFor: true }) ?? undefined;

  // Atomic: conditional consume + find-or-create user. Race-safe.
  const userId = await db.transaction(async (tx) => {
    const consumed = await tx
      .update(magicLinkTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(magicLinkTokens.id, token.id),
          isNull(magicLinkTokens.consumedAt),
        ),
      )
      .returning({ id: magicLinkTokens.id });
    if (consumed.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Cod deja folosit' });
    }

    const existing = await tx.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    let uid = existing[0]?.id;
    if (!uid) {
      const inserted = await tx
        .insert(users)
        .values({ email, emailHash: sha256Hex(email) })
        .returning({ id: users.id });
      uid = inserted[0]?.id;
    }
    if (!uid) throw createError({ statusCode: 500, statusMessage: 'User creation failed' });

    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, uid));
    return uid;
  });

  await createUserSession(userId, event);

  // Best-effort anonymous-job claim from job_access_* cookies.
  try {
    const cookieHeader = event.node.req.headers.cookie;
    const jobIds = parseJobAccessCookies(cookieHeader);
    if (jobIds.length > 0) {
      for (const jobId of jobIds) {
        await db
          .update(jobs)
          .set({ userId })
          .where(and(eq(jobs.id, jobId), isNull(jobs.userId)));
      }
    }
  } catch {
    // Non-blocking.
  }

  const redirectTo = safeNext(next);
  void ipAddress; // ip is captured in the session row by createUserSession
  return { ok: true, redirectTo };
});
