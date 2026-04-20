// Admin job detail — full join of jobs + payments + recent audit trail.
// Spec: SPEC.md §S.14 "Admin Dashboard"; CLAUDE.md "Critical Rules".
// Guarded upstream by middleware/admin-auth.ts (assertAdminSession). We still
// fetch the session defensively for the audit row and 401 if missing.
// Every access writes an 'job_viewed' row to admin_audit_log BEFORE returning
// data (audit-precedes-data). Admin sees the full jobs row including
// anonymousAccessToken — this is intentional for troubleshooting.
import { createHash } from 'node:crypto';
import { createError, defineEventHandler, getRequestHeader, getRequestIP, getValidatedRouterParams } from 'h3';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { jobs } from '~/server/db/schema/jobs';
import { payments } from '~/server/db/schema/payments';
import { auditLog } from '~/server/db/schema/audit_log';
import { adminAuditLog } from '~/server/db/schema/admin_audit_log';
import { getAdminSession } from '~/server/utils/auth-admin';

const USER_AGENT_MAX = 500;
const AUDIT_ROW_LIMIT = 50;

const paramsSchema = z.object({ id: z.string().uuid() });

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse);

  // Defensive session fetch — middleware already threw if invalid, but we need
  // adminEmail for the audit row.
  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const ipHash = createHash('sha256')
    .update(getRequestIP(event, { xForwardedFor: true }) ?? '')
    .digest('hex');
  const userAgent = (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX) || null;

  // Audit-precedes-data: write the admin read row BEFORE returning anything.
  // Best-effort — log the failure but never block the admin from seeing the
  // record. (A missed audit is a review flag, not a denial of service.)
  try {
    await db.insert(adminAuditLog).values({
      adminEmail: session.email,
      action: 'job_viewed',
      targetType: 'job',
      targetId: id,
      ipHash,
      userAgent,
    });
  } catch (err) {
    console.error('admin_audit_log insert failed', { action: 'job_viewed', targetId: id, err: (err as Error).message });
  }

  const [jobRows, paymentRows, auditRows] = await Promise.all([
    db.select().from(jobs).where(eq(jobs.id, id)).limit(1),
    db.select().from(payments).where(eq(payments.jobId, id)).orderBy(desc(payments.createdAt)),
    db
      .select()
      .from(auditLog)
      .where(eq(auditLog.jobId, id))
      .orderBy(desc(auditLog.createdAt))
      .limit(AUDIT_ROW_LIMIT),
  ]);

  const job = jobRows[0];
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' });
  }

  return {
    job,
    payments: paymentRows,
    audit: auditRows,
  };
});
