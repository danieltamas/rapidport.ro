// POST /api/jobs — create a new migration job (SPEC §2.2, §S.3).
//
// Flow:
//   1. Zod-validate body (source/target software, optional billing email).
//   2. Resolve optional user session (getUserSession) — anonymous is allowed.
//   3. Mint per-job anonymous access token via the shared util.
//   4. Insert jobs row (Drizzle) with status=created, awaiting_upload, 30-day
//      expiry, and the access token stored verbatim (compared in constant time
//      by the capability util on subsequent requests).
//   5. Set the path-scoped HttpOnly cookie so the browser carries access on
//      follow-up /api/jobs/{id}/* calls, and return the token once in the body
//      for clients that can't rely on cookies.
//
// CSRF is enforced globally by `server/middleware/csrf.ts`; rate limiting
// (10/hr per IP for exact `POST /api/jobs`) is wired in `middleware/rate-limit.ts`.
// No explicit wiring needed here — just don't bypass either.
import { createError, defineEventHandler, readValidatedBody } from 'h3';
import { z } from 'zod';
import { db } from '../../db/client';
import { jobs } from '../../db/schema';
import { generateAnonymousToken, setAnonymousTokenCookie } from '../../utils/anonymous-token';
import { getUserSession } from '../../utils/auth-user';

// 'auto' defers direction detection to the worker discover stage — the archive
// magic-byte sniff on /upload can't tell WinMentor from SAGA apart reliably
// enough (both ship as .tgz in some versions). Stored as null in the DB until
// discover resolves and writes the concrete direction back (follow-up wave).
const SoftwareEnum = z.enum(['winmentor', 'saga', 'auto']);

const BodySchema = z
  .object({
    sourceSoftware: SoftwareEnum.optional(),
    targetSoftware: SoftwareEnum.optional(),
    billingEmail: z.string().email().max(255).optional(),
  })
  .refine(
    (v) => {
      const s = v.sourceSoftware ?? 'auto';
      const t = v.targetSoftware ?? 'auto';
      if (s === 'auto' || t === 'auto') return true;
      return s !== t;
    },
    {
      message: 'sourceSoftware and targetSoftware must differ',
      path: ['targetSoftware'],
    },
  );

function resolveSoftware(v: 'winmentor' | 'saga' | 'auto' | undefined): 'winmentor' | 'saga' | null {
  return v === 'winmentor' || v === 'saga' ? v : null;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default defineEventHandler(async (event) => {
  let body: z.infer<typeof BodySchema>;
  try {
    body = await readValidatedBody(event, BodySchema.parse);
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid request body' });
  }

  const session = await getUserSession(event);
  const userId = session?.userId ?? null;

  const anonymousAccessToken = generateAnonymousToken();
  const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS);

  const inserted = await db
    .insert(jobs)
    .values({
      userId,
      anonymousAccessToken,
      sourceSoftware: resolveSoftware(body.sourceSoftware),
      targetSoftware: resolveSoftware(body.targetSoftware),
      billingEmail: body.billingEmail ?? null,
      status: 'created',
      progressStage: 'awaiting_upload',
      progressPct: 0,
      expiresAt,
    })
    .returning({
      id: jobs.id,
      sourceSoftware: jobs.sourceSoftware,
      targetSoftware: jobs.targetSoftware,
    });

  const row = inserted[0];
  if (!row) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create job' });
  }

  setAnonymousTokenCookie(event, row.id, anonymousAccessToken);

  return {
    id: row.id,
    anonymousAccessToken,
    sourceSoftware: row.sourceSoftware,
    targetSoftware: row.targetSoftware,
  };
});
