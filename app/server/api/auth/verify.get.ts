// Magic-link verify: consume single-use token, find-or-create user, issue session,
// best-effort claim anonymous jobs, redirect. Spec: SPEC.md §S.3; CODING.md §13.5.
import { createHash } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { createError, defineEventHandler, getHeader, getValidatedQuery, sendRedirect } from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { jobs, magicLinkTokens, users } from '~/server/db/schema';
import { createUserSession } from '~/server/utils/auth-user';

const querySchema = z.object({
  token: z.string().min(32),
  next: z.string().optional(),
});

const INVALID_MSG = 'Link invalid sau expirat';
const USED_MSG = 'Link deja folosit';

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Same-origin + leading-slash check for open-redirect prevention. Reject protocol-relative
// paths like `//evil.com` by requiring a single leading slash followed by a non-slash char.
function safeRedirectTarget(next: string | undefined): string {
  if (!next) return '/';
  if (next.length < 1 || next[0] !== '/') return '/';
  if (next.length >= 2 && next[1] === '/') return '/';
  if (next.startsWith('/\\')) return '/';
  return next;
}

// Extract jobId values from `job_access_<jobId>` cookies without using h3's getCookie
// (which requires knowing names). Parse the raw Cookie header.
function extractClaimJobIds(cookieHeader: string | undefined): string[] {
  if (!cookieHeader) return [];
  const ids: string[] = [];
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    const name = (eq === -1 ? part : part.slice(0, eq)).trim();
    if (!name.startsWith('job_access_')) continue;
    const jobId = name.slice('job_access_'.length);
    if (uuidRe.test(jobId)) ids.push(jobId);
  }
  return ids;
}

export default defineEventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse);
  const tokenHash = sha256Hex(query.token);

  const rows = await db
    .select({
      id: magicLinkTokens.id,
      email: magicLinkTokens.email,
      consumedAt: magicLinkTokens.consumedAt,
      expiresAt: magicLinkTokens.expiresAt,
    })
    .from(magicLinkTokens)
    .where(eq(magicLinkTokens.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) throw createError({ statusCode: 400, statusMessage: INVALID_MSG });
  if (row.consumedAt !== null) throw createError({ statusCode: 400, statusMessage: USED_MSG });
  if (row.expiresAt.getTime() < Date.now()) {
    throw createError({ statusCode: 400, statusMessage: INVALID_MSG });
  }

  const email = row.email.toLowerCase();
  const emailHash = sha256Hex(email);
  const now = new Date();

  const userId = await db.transaction(async (tx) => {
    // Atomic single-use claim: only succeeds if consumedAt is still null.
    const consumed = await tx
      .update(magicLinkTokens)
      .set({ consumedAt: now })
      .where(and(eq(magicLinkTokens.id, row.id), isNull(magicLinkTokens.consumedAt)))
      .returning({ id: magicLinkTokens.id });

    if (consumed.length === 0) {
      throw createError({ statusCode: 400, statusMessage: USED_MSG });
    }

    const existing = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let uid: string;
    if (existing[0]) {
      uid = existing[0].id;
      await tx.update(users).set({ lastLoginAt: now }).where(eq(users.id, uid));
    } else {
      const inserted = await tx
        .insert(users)
        .values({ email, emailHash, lastLoginAt: now })
        .returning({ id: users.id });
      uid = inserted[0]!.id;
    }

    return uid;
  });

  await createUserSession(userId, event);

  // Best-effort: claim anonymous jobs whose access cookies are present on this request.
  let jobClaimedCount = 0;
  try {
    const candidateIds = extractClaimJobIds(getHeader(event, 'cookie'));
    for (const jobId of candidateIds) {
      const claimed = await db
        .update(jobs)
        .set({ userId })
        .where(and(eq(jobs.id, sql`${jobId}::uuid`), isNull(jobs.userId)))
        .returning({ id: jobs.id });
      if (claimed.length > 0) jobClaimedCount += 1;
    }
  } catch {
    // swallow — job claim is opportunistic, must not break login
  }

  console.info(
    JSON.stringify({ event: 'magic_link_verified', userId, job_claimed_count: jobClaimedCount }),
  );

  return sendRedirect(event, safeRedirectTarget(query.next), 303);
});
