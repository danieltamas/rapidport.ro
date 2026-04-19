// POST /api/auth/magic-link — issues a 6-digit authentication code emailed to the user.
// The name 'magic-link' is historical; the flow is code-based now to avoid
// corporate email-gateway link rewriting (Safe Links, Proofpoint) which prefetch URLs
// and consume single-use tokens before the user clicks.
//
// Security:
// - SPEC §S.3 magic-link semantics: single-use, 15-min TTL, stored SHA-256-hashed.
// - SPEC §S.10 rate limit: 5/hour per email — fail-closed per CODING.md §13.6.
// - Always returns { ok: true } so a caller cannot enumerate registered emails.
// - No PII in logs.
import { createHash, randomInt } from 'node:crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import {
  createError,
  defineEventHandler,
  getRequestIP,
  readValidatedBody,
  setResponseHeader,
} from 'h3';
import { z } from 'zod';
import { db } from '../../db/client';
import { magicLinkTokens } from '../../db/schema';
import { sendEmail } from '../../utils/email';

const RATE_LIMIT_PER_HOUR = 5;
const CODE_TTL_MS = 15 * 60 * 1000;

const BodySchema = z.object({
  email: z.string().email().transform((v) => v.trim().toLowerCase()),
});

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

function generateCode(): string {
  // 000000–999999 uniform; zero-padded to 6 digits for display.
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function renderEmail(code: string): { html: string; text: string } {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0A0A0A; max-width: 440px; margin: 0 auto;">
      <p style="font-size: 16px; line-height: 1.5;">Bună,</p>
      <p style="font-size: 16px; line-height: 1.5;">Folosiți acest cod pentru a vă autentifica pe Rapidport:</p>
      <p style="font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 36px; font-weight: 600; letter-spacing: 8px; background: #F5F5F5; padding: 16px 24px; border-radius: 8px; text-align: center; margin: 24px 0;">${code}</p>
      <p style="font-size: 14px; line-height: 1.5; color: #666;">Codul este valabil 15 minute și poate fi folosit o singură dată.</p>
      <p style="font-size: 14px; line-height: 1.5; color: #666;">Dacă nu ați cerut acest cod, ignorați acest email.</p>
      <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 32px 0;">
      <p style="font-size: 12px; color: #999;">Rapidport — migrare WinMentor → SAGA</p>
    </div>
  `;
  const text = `Codul de autentificare Rapidport: ${code}\n\nValabil 15 minute, o singură folosință.\n\nDacă nu ați cerut acest cod, ignorați acest email.`;
  return { html, text };
}

export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, BodySchema.parse);

  try {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(magicLinkTokens)
      .where(
        and(
          eq(magicLinkTokens.email, email),
          sql`${magicLinkTokens.createdAt} > now() - interval '1 hour'`,
        ),
      );
    const used = result[0]?.count ?? 0;
    if (used >= RATE_LIMIT_PER_HOUR) {
      setResponseHeader(event, 'Retry-After', 3600);
      throw createError({ statusCode: 429, statusMessage: 'Too Many Requests' });
    }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'statusCode' in err) throw err;
    setResponseHeader(event, 'Retry-After', 5);
    throw createError({ statusCode: 503, statusMessage: 'Service Unavailable' });
  }

  try {
    await db
      .update(magicLinkTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(magicLinkTokens.email, email),
          isNull(magicLinkTokens.consumedAt),
          gt(magicLinkTokens.expiresAt, new Date()),
        ),
      );
  } catch {
    // Not fatal — TTL handles it.
  }

  const code = generateCode();
  const tokenHash = sha256Hex(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  const ipAddress = getRequestIP(event, { xForwardedFor: true }) ?? undefined;

  try {
    await db.insert(magicLinkTokens).values({
      email,
      tokenHash,
      expiresAt,
      ipAddress,
    });
  } catch {
    setResponseHeader(event, 'Retry-After', 5);
    throw createError({ statusCode: 503, statusMessage: 'Service Unavailable' });
  }

  const { html, text } = renderEmail(code);
  try {
    await sendEmail({
      to: email,
      subject: 'Codul dvs. de autentificare Rapidport',
      html,
      text,
    });
  } catch {
    console.warn('magic_link_email_send_failed');
  }

  return { ok: true };
});
