// Route: POST /api/auth/magic-link
// Issues a magic-link email. Plaintext token is emailed; only the SHA-256 hash is
// persisted. Rate limit: 5 requests / hour / email, fail-closed per CODING.md §13.6.
// Always responds `{ ok: true }` to prevent account enumeration.
import { randomBytes, createHash } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client';
import { magicLinkTokens } from '../../db/schema';
import { env } from '../../utils/env';
import { sendEmail } from '../../utils/email';

const BodySchema = z.object({
  email: z.string().email().transform((s) => s.trim().toLowerCase()),
});

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, BodySchema.parse);

  // Rate limit check — fail-closed: any DB error returns 503 with Retry-After.
  try {
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(magicLinkTokens)
      .where(and(eq(magicLinkTokens.email, email), gt(magicLinkTokens.createdAt, windowStart)));
    const recentCount = rows[0]?.count ?? 0;
    if (recentCount >= RATE_LIMIT_MAX) {
      throw createError({ statusCode: 429, statusMessage: 'Too Many Requests' });
    }
  } catch (err: unknown) {
    // Re-throw our own 429. Everything else is a store-unavailable scenario.
    if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode?: number }).statusCode === 429) {
      throw err;
    }
    setResponseHeader(event, 'Retry-After', 5);
    throw createError({ statusCode: 503, statusMessage: 'Service Unavailable' });
  }

  // Issue token: plaintext emailed, hash stored.
  const plaintextToken = randomBytes(32).toString('hex');
  const tokenHash = createHash('sha256').update(plaintextToken).digest('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  const ipAddress = getRequestIP(event, { xForwardedFor: true }) ?? null;

  try {
    await db.insert(magicLinkTokens).values({ email, tokenHash, expiresAt, ipAddress });
  } catch {
    // Insertion failure is the only place we may surface an error to the client,
    // because without persistence the link would be unusable. Keep message generic.
    setResponseHeader(event, 'Retry-After', 5);
    throw createError({ statusCode: 503, statusMessage: 'Service Unavailable' });
  }

  const verifyUrl = `${env.APP_URL}/api/auth/verify?token=${plaintextToken}`;

  const result = await sendEmail({
    to: email,
    subject: 'Autentifică-te pe Rapidport',
    html: renderHtml(verifyUrl),
    text: renderText(verifyUrl),
  });

  if ('error' in result) {
    // Do not leak the failure to the caller (would enable enumeration / probing).
    // `sendEmail` already logged the provider error name with no PII.
    console.warn('magic_link_issued', { delivery: 'failed' });
  } else {
    console.info('magic_link_issued', { delivery: 'sent' });
  }

  return { ok: true as const };
});

// Email body helpers — Romanian user-facing copy. Kept inline per task spec
// (dedicated templating lives in the separate email-templates task).
function renderHtml(verifyUrl: string): string {
  return `<!doctype html>
<html lang="ro"><body style="font-family:Inter,Arial,sans-serif;color:#111;background:#fff;padding:24px;">
<h1 style="font-size:20px;margin:0 0 16px;">Autentifică-te pe Rapidport</h1>
<p style="margin:0 0 16px;">Apasă butonul de mai jos pentru a te conecta. Link-ul este valabil 15 minute și poate fi folosit o singură dată.</p>
<p style="margin:0 0 24px;">
  <a href="${verifyUrl}" style="display:inline-block;background:#C72E49;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Intră în cont</a>
</p>
<p style="margin:0 0 8px;font-size:13px;color:#555;">Dacă butonul nu funcționează, copiază link-ul în browser:</p>
<p style="margin:0 0 24px;font-size:13px;word-break:break-all;"><a href="${verifyUrl}">${verifyUrl}</a></p>
<p style="margin:0;font-size:12px;color:#888;">Dacă nu ai solicitat această autentificare, ignoră acest email.</p>
</body></html>`;
}

function renderText(verifyUrl: string): string {
  return `Autentifică-te pe Rapidport

Folosește link-ul de mai jos pentru a te conecta. Este valabil 15 minute și poate fi folosit o singură dată.

${verifyUrl}

Dacă nu ai solicitat această autentificare, ignoră acest email.
`;
}
