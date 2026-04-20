// GET /api/admin/users/[id] — user detail + linked jobs / payments stats.
// Spec: jobs/phase2-nuxt/PLAN-api-admin-wave-b.md Task 2.
//
// Read endpoint — best-effort audit. anonymousAccessToken is NEVER returned
// (per-job tokens, admin doesn't need them here; leaking would hand out
// unauthenticated job access).
import { desc, eq, sql } from 'drizzle-orm';
import { createError, defineEventHandler, getValidatedRouterParams } from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { jobs } from '~/server/db/schema/jobs';
import { payments } from '~/server/db/schema/payments';
import { users } from '~/server/db/schema/users';
import { getAdminSession } from '~/server/utils/auth-admin';
import { auditRead } from '~/server/utils/admin-audit';

const RECENT_JOBS_LIMIT = 10;
const RECENT_PAYMENTS_LIMIT = 20;

const paramsSchema = z.object({ id: z.string().uuid() });

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse);

  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  auditRead(event, session, 'user_viewed', { targetType: 'user', targetId: id });

  const [
    userRows,
    jobsCountRow,
    recentJobs,
    paymentsTotalRow,
    paymentsSucceededRow,
    recentPaymentRows,
  ] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        deletedAt: users.deletedAt,
        blockedAt: users.blockedAt,
        blockedReason: users.blockedReason,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(eq(jobs.userId, id)),
    // Explicit column list — intentionally omits anonymousAccessToken.
    db
      .select({
        id: jobs.id,
        status: jobs.status,
        progressStage: jobs.progressStage,
        progressPct: jobs.progressPct,
        sourceSoftware: jobs.sourceSoftware,
        targetSoftware: jobs.targetSoftware,
        uploadFilename: jobs.uploadFilename,
        uploadSize: jobs.uploadSize,
        billingEmail: jobs.billingEmail,
        deltaSyncsUsed: jobs.deltaSyncsUsed,
        deltaSyncsAllowed: jobs.deltaSyncsAllowed,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt,
        expiresAt: jobs.expiresAt,
      })
      .from(jobs)
      .where(eq(jobs.userId, id))
      .orderBy(desc(jobs.createdAt))
      .limit(RECENT_JOBS_LIMIT),
    db
      .select({
        count: sql<number>`count(*)::int`,
        sum: sql<number>`coalesce(sum(${payments.amount})::bigint, 0)::bigint`,
      })
      .from(payments)
      .leftJoin(jobs, eq(jobs.id, payments.jobId))
      .where(eq(jobs.userId, id)),
    db
      .select({
        count: sql<number>`count(*)::int`,
        sum: sql<number>`coalesce(sum(${payments.amount})::bigint, 0)::bigint`,
      })
      .from(payments)
      .leftJoin(jobs, eq(jobs.id, payments.jobId))
      .where(sql`${jobs.userId} = ${id} AND ${payments.status} = 'succeeded'`),
    // Last 20 payments for this user — surfaced in the user-detail page so the
    // admin doesn't have to cross-reference /admin/payments. Join is INNER
    // (payments must belong to a job) — safer than the leftJoin used by the
    // stat queries where we want counts even when the join might be loose.
    db
      .select({
        id: payments.id,
        jobId: payments.jobId,
        stripePaymentIntentId: payments.stripePaymentIntentId,
        amount: payments.amount,
        currency: payments.currency,
        status: payments.status,
        refundedAmount: payments.refundedAmount,
        refundedAt: payments.refundedAt,
        smartbillInvoiceId: payments.smartbillInvoiceId,
        smartbillInvoiceUrl: payments.smartbillInvoiceUrl,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .innerJoin(jobs, eq(jobs.id, payments.jobId))
      .where(eq(jobs.userId, id))
      .orderBy(desc(payments.createdAt))
      .limit(RECENT_PAYMENTS_LIMIT),
  ]);

  const user = userRows[0];
  if (!user) {
    throw createError({ statusCode: 404, statusMessage: 'User not found' });
  }

  const jobsTotal = jobsCountRow[0]?.count ?? 0;
  const paymentsTotal = paymentsTotalRow[0]?.count ?? 0;
  const paymentsSucceeded = paymentsSucceededRow[0]?.count ?? 0;
  const revenueBani = Number(paymentsSucceededRow[0]?.sum ?? 0);

  return {
    user: {
      id: user.id,
      email: user.email,
      createdAt: user.createdAt ? user.createdAt.toISOString() : null,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
      blockedAt: user.blockedAt ? user.blockedAt.toISOString() : null,
      blockedReason: user.blockedReason ?? null,
    },
    stats: {
      jobsTotal,
      paymentsTotal,
      paymentsSucceeded,
      revenueBani,
    },
    recentJobs: recentJobs.map((j) => ({
      ...j,
      createdAt: j.createdAt ? j.createdAt.toISOString() : null,
      updatedAt: j.updatedAt ? j.updatedAt.toISOString() : null,
      expiresAt: j.expiresAt ? j.expiresAt.toISOString() : null,
    })),
    recentPayments: recentPaymentRows.map((p) => ({
      ...p,
      refundedAt: p.refundedAt ? p.refundedAt.toISOString() : null,
      createdAt: p.createdAt ? p.createdAt.toISOString() : null,
    })),
  };
});
