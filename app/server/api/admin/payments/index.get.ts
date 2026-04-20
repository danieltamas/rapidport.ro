// GET /api/admin/payments — admin list of payments with filters, pagination,
// and sort. Surfaces billingEmail via a LEFT JOIN on jobs. Refund actions are
// handled by a separate endpoint (api-admin-jobs-actions, later wave).
//
// Auth: middleware/admin-auth.ts already asserts admin session upstream; we
// still call getAdminSession() defensively and 401 if missing (pattern matches
// api/admin/logout.post.ts).
//
// Every invocation writes an admin_audit_log row (action=payments_list_viewed)
// capturing the filters, IP hash, and UA — per CLAUDE.md "every passive read of
// customer data MUST be logged". Audit failures are swallowed (best-effort) so
// they cannot mask the actual admin response.
import { and, asc, desc, eq, gt, ilike, or, sql, type SQL } from 'drizzle-orm';
import { createError, defineEventHandler, getValidatedQuery } from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { jobs } from '~/server/db/schema/jobs';
import { payments } from '~/server/db/schema/payments';
import { getAdminSession } from '~/server/utils/auth-admin';
import { auditRead } from '~/server/utils/admin-audit';

const statusEnum = z.enum([
  'requires_payment_method',
  'requires_action',
  'processing',
  'succeeded',
  'failed',
  'canceled',
]);

const refundedEnum = z.enum(['yes', 'no', 'partial']);
const sortEnum = z.enum(['createdAt', 'amount', 'status']);
const orderEnum = z.enum(['asc', 'desc']);

const querySchema = z.object({
  status: statusEnum.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  refunded: refundedEnum.optional(),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  sort: sortEnum.optional().default('createdAt'),
  order: orderEnum.optional().default('desc'),
});

// Whitelisted ORDER BY column map — never trust user-supplied identifiers.
const SORT_COLUMNS = {
  createdAt: payments.createdAt,
  amount: payments.amount,
  status: payments.status,
} as const;

export default defineEventHandler(async (event) => {
  // 1. Defensive admin-session check (middleware already enforces).
  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  // 2. Validate query.
  const filters = await getValidatedQuery(event, querySchema.parse);

  // 3. Audit — fire-and-forget so the data query starts immediately.
  auditRead(event, session, 'payments_list_viewed', { filters });

  // 4. Build WHERE predicates.
  const where: SQL[] = [];

  if (filters.status) {
    where.push(eq(payments.status, filters.status));
  }

  if (filters.q) {
    // Match: Stripe PI id substring (ILIKE) OR jobId cast-to-text prefix.
    const like = `%${filters.q}%`;
    const prefix = `${filters.q}%`;
    const qClause = or(
      ilike(payments.stripePaymentIntentId, like),
      sql`${payments.jobId}::text ILIKE ${prefix}`,
    );
    if (qClause) where.push(qClause);
  }

  if (filters.refunded === 'yes') {
    where.push(gt(payments.refundedAmount, 0));
  } else if (filters.refunded === 'no') {
    where.push(eq(payments.refundedAmount, 0));
  } else if (filters.refunded === 'partial') {
    // refundedAmount > 0 AND refundedAmount < amount
    where.push(gt(payments.refundedAmount, 0));
    where.push(sql`${payments.refundedAmount} < ${payments.amount}`);
  }

  const whereExpr = where.length > 0 ? and(...where) : undefined;

  // 5. Query rows (JOIN onto jobs for billingEmail).
  const sortCol = SORT_COLUMNS[filters.sort];
  const orderExpr = filters.order === 'asc' ? asc(sortCol) : desc(sortCol);
  const offset = (filters.page - 1) * filters.pageSize;

  const rows = await db
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
      createdAt: payments.createdAt,
      billingEmail: jobs.billingEmail,
    })
    .from(payments)
    .leftJoin(jobs, eq(jobs.id, payments.jobId))
    .where(whereExpr)
    .orderBy(orderExpr)
    .limit(filters.pageSize)
    .offset(offset);

  // 6. Separate count.
  const countRows = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(payments)
    .leftJoin(jobs, eq(jobs.id, payments.jobId))
    .where(whereExpr);
  const total = countRows[0]?.total ?? 0;

  return {
    rows,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
  };
});
