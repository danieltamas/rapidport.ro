// Admin job detail — full join of jobs + payments + recent audit trail.
// Spec: SPEC.md §S.14 "Admin Dashboard"; CLAUDE.md "Critical Rules".
// Guarded upstream by middleware/admin-auth.ts (assertAdminSession). We still
// fetch the session defensively for the audit row and 401 if missing.
// Every access writes an 'job_viewed' row to admin_audit_log BEFORE returning
// data (audit-precedes-data). Admin sees the full jobs row including
// anonymousAccessToken — this is intentional for troubleshooting.
import { createError, defineEventHandler, getValidatedRouterParams } from 'h3';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { jobs } from '~/server/db/schema/jobs';
import { payments } from '~/server/db/schema/payments';
import { auditLog } from '~/server/db/schema/audit_log';
import { getAdminSession } from '~/server/utils/auth-admin';
import { auditRead } from '~/server/utils/admin-audit';

const AUDIT_ROW_LIMIT = 50;

const paramsSchema = z.object({ id: z.string().uuid() });

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse);

  const session = await getAdminSession(event);
  if (!session) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });

  // Fire-and-forget audit so the data query starts immediately.
  auditRead(event, session, 'job_viewed', { targetType: 'job', targetId: id });

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
