// POST /api/admin/jobs/[id]/resend-download — re-send the conversion-ready email.
// Spec: PLAN-api-admin-wave-b.md Task 1; email copy from docs/emails-copy.md §3.
//
// Recipient = job.billingEmail ?? leftJoin(users).email.
// Audit row is synchronous + transactional (there's no mutation beyond the
// audit, so the tx is effectively just the INSERT — we still wrap for
// symmetry with the other Wave B endpoints).
// Email send happens AFTER the audit row is committed, so a send failure
// doesn't roll back the audit trail (admin did "attempt" the resend).
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRequestHeader, getRequestIP, getValidatedRouterParams, readValidatedBody } from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { adminAuditLog } from '~/server/db/schema/admin_audit_log';
import { jobs } from '~/server/db/schema/jobs';
import { users } from '~/server/db/schema/users';
import { getAdminSession } from '~/server/utils/auth-admin';
import { env } from '~/server/utils/env';
import { sendEmail } from '~/server/utils/email';

const USER_AGENT_MAX = 500;

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({}).strict();

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

function renderConversionReady(jobId: string): { subject: string; html: string; text: string } {
  const idShort = jobId.slice(0, 8);
  const downloadUrl = `${env.APP_URL}/api/jobs/${jobId}/download`;
  const guideUrl = `${env.APP_URL}/guide/saga-import.pdf`;
  const subject = `Migrarea #${idShort} — fișierele SAGA sunt gata`;

  const text = [
    'Bună,',
    '',
    `Conversia migrării #${idShort} s-a încheiat. Pachetul cu fișierele de import SAGA e gata.`,
    '',
    `Descărcați: ${downloadUrl}`,
    `Ghid de import în SAGA: ${guideUrl}`,
    '',
    'Pachetul rămâne disponibil 30 de zile.',
    '',
    'Aveți 3 sincronizări delta incluse pentru a aduce datele noi din WinMentor în SAGA pe parcursul tranziției.',
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0A0A0A; max-width: 480px; margin: 0 auto;">
      <p style="font-size: 16px; line-height: 1.5;">Bună,</p>
      <p style="font-size: 16px; line-height: 1.5;">Conversia migrării <strong>#${idShort}</strong> s-a încheiat. Pachetul cu fișierele de import SAGA e gata.</p>
      <p style="font-size: 14px; line-height: 1.5;"><a href="${downloadUrl}" style="color: #C72E49; text-decoration: none;">Descărcați pachetul →</a></p>
      <p style="font-size: 14px; line-height: 1.5;"><a href="${guideUrl}" style="color: #C72E49; text-decoration: none;">Ghid de import în SAGA →</a></p>
      <p style="font-size: 14px; line-height: 1.5; color: #666;">Pachetul rămâne disponibil 30 de zile.</p>
      <p style="font-size: 14px; line-height: 1.5; color: #666;">Aveți 3 sincronizări delta incluse pentru a aduce datele noi din WinMentor în SAGA pe parcursul tranziției.</p>
      <hr style="border: none; border-top: 1px solid #E5E5E5; margin: 32px 0;">
      <p style="font-size: 12px; color: #999;">Rapidport — portare WinMentor ⇄ SAGA, în ambele direcții</p>
    </div>
  `;

  return { subject, html, text };
}

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);
  await readValidatedBody(event, BodySchema.parse);

  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  // Load job + user email in one query.
  const [row] = await db
    .select({
      jobId: jobs.id,
      status: jobs.status,
      billingEmail: jobs.billingEmail,
      userEmail: users.email,
      userDeletedAt: users.deletedAt,
    })
    .from(jobs)
    .leftJoin(users, eq(jobs.userId, users.id))
    .where(eq(jobs.id, id))
    .limit(1);

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' });
  }

  if (row.status !== 'succeeded') {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'not_ready' },
    });
  }

  // Prefer explicit billingEmail; fall back to linked user email (only if
  // account isn't GDPR-deleted — a deleted user's email is @rapidport.invalid).
  const userEmail = row.userDeletedAt ? null : row.userEmail;
  const recipient = row.billingEmail ?? userEmail;
  if (!recipient) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Conflict',
      data: { error: 'no_recipient' },
    });
  }

  const ipHash = sha256Hex(getRequestIP(event, { xForwardedFor: true }) ?? '');
  const userAgent = (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX) || null;

  // Audit FIRST (transactional — the only mutation here is the audit row).
  await db.transaction(async (tx) => {
    await tx.insert(adminAuditLog).values({
      adminEmail: session.email,
      action: 'download_link_resent',
      targetType: 'job',
      targetId: id,
      details: {},
      ipHash,
      userAgent,
    });
  });

  // Send AFTER audit commit. Cause-only log on failure; non-fatal to response.
  const { subject, html, text } = renderConversionReady(id);
  try {
    await sendEmail({ to: recipient, subject, html, text });
  } catch {
    console.warn('resend_download_email_failed');
  }

  return { ok: true };
});
