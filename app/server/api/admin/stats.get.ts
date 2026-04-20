// GET /api/admin/stats — dashboard numbers for the admin home page.
// Spec: SPEC.md §"Admin Dashboard" / §S.4 admin audit.
//
// Admin session presence is enforced by middleware/admin-auth.ts; we still
// fetch it defensively to populate the audit row. Every read of customer-
// adjacent data writes one admin_audit_log row.
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { createError, defineEventHandler, getHeader, getRequestIP } from 'h3';
import { db } from '../../db/client';
import { aiUsage, jobs, payments, users } from '../../db/schema';
import { getAdminSession } from '../../utils/auth-admin';
import { auditRead } from '../../utils/admin-audit';

export default defineEventHandler(async (event) => {
  const admin = await getAdminSession(event);
  if (!admin) {
    throw createError({ statusCode: 401 });
  }

  auditRead(event, admin, 'stats_viewed');

  // Live queries — no caching for v1. Date filter is `now() - interval '30 days'`
  // via parameterised sql template.
  const since30d = sql`now() - interval '30 days'`;

  const [
    [jobsTotalRow],
    [jobsPaidRow],
    [jobsSucceededRow],
    [jobsFailedRow],
    [revenueRow],
    [aiCostRow],
    [usersTotalRow],
  ] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(jobs),
    db.select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.status, 'paid'), gt(jobs.createdAt, since30d))),
    db.select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.status, 'succeeded'), gt(jobs.createdAt, since30d))),
    db.select({ n: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.status, 'failed'), gt(jobs.createdAt, since30d))),
    db.select({ n: sql<number>`coalesce(sum(${payments.amount}), 0)::bigint` })
      .from(payments)
      .where(and(eq(payments.status, 'succeeded'), gt(payments.createdAt, since30d))),
    db.select({ n: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)::float` })
      .from(aiUsage)
      .where(gt(aiUsage.createdAt, since30d)),
    db.select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(isNull(users.deletedAt)),
  ]);

  return {
    jobsTotal: Number(jobsTotalRow?.n ?? 0),
    jobsPaidLast30d: Number(jobsPaidRow?.n ?? 0),
    jobsSucceededLast30d: Number(jobsSucceededRow?.n ?? 0),
    jobsFailedLast30d: Number(jobsFailedRow?.n ?? 0),
    revenueLast30dBani: Number(revenueRow?.n ?? 0),
    aiCostLast30dUsd: Number(aiCostRow?.n ?? 0),
    usersTotal: Number(usersTotalRow?.n ?? 0),
  };
});
