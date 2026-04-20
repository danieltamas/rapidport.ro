// Admin jobs list — paginated + filterable view over the `jobs` table.
// Spec: SPEC.md §"Admin Dashboard" / §S.4; CLAUDE.md "Critical Rules"
// (every admin endpoint writes to admin_audit_log even for passive reads).
//
// Guard: /api/admin/* is pre-guarded by middleware/admin-auth.ts which calls
// assertAdminSession. We still call getAdminSession defensively so the handler
// is safe in isolation + so we have the admin email for the audit row.
//
// Response NEVER includes `anonymousAccessToken` — admin UI doesn't need it
// for a listing view and leaking it would hand out unauthenticated job access.
import { createError, defineEventHandler, getValidatedQuery } from 'h3';
import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { jobs } from '~/server/db/schema/jobs';
import { getAdminSession } from '~/server/utils/auth-admin';
import { auditRead } from '~/server/utils/admin-audit';

const QuerySchema = z.object({
  status: z.enum(['created', 'paid', 'succeeded', 'failed', 'expired']).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(['createdAt', 'updatedAt', 'status']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// Whitelisted sort columns — never interpolate user input into ORDER BY.
const SORT_COLUMNS = {
  createdAt: jobs.createdAt,
  updatedAt: jobs.updatedAt,
  status: jobs.status,
} as const;

export default defineEventHandler(async (event) => {
  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const query = await getValidatedQuery(event, QuerySchema.parse);

  auditRead(event, session, 'jobs_list_viewed', {
    filters: {
      status: query.status ?? null,
      q: query.q ?? null,
      page: query.page,
      pageSize: query.pageSize,
      sort: query.sort,
      order: query.order,
    },
  });

  // Build WHERE clauses.
  const conditions: SQL[] = [];
  if (query.status) {
    conditions.push(eq(jobs.status, query.status));
  }
  if (query.q) {
    const like = `%${query.q}%`;
    const prefix = `${query.q}%`;
    const orClause = or(
      sql`${jobs.id}::text ILIKE ${prefix}`,
      ilike(jobs.billingEmail, like),
    );
    if (orClause) conditions.push(orClause);
  }
  const whereClause = conditions.length ? and(...conditions) : undefined;

  const sortCol = SORT_COLUMNS[query.sort];
  const orderBy = query.order === 'asc' ? asc(sortCol) : desc(sortCol);
  const offset = (query.page - 1) * query.pageSize;

  const rows = await db
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
      createdAt: jobs.createdAt,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(query.pageSize)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(jobs)
    .where(whereClause);
  const total = totalRow?.count ?? 0;

  return {
    rows: rows.map((r) => ({
      ...r,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
});
