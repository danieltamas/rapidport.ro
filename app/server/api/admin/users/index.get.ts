// GET /api/admin/users — paginated + filterable list of users.
// Spec: jobs/phase2-nuxt/PLAN-api-admin-wave-b.md Task 2; CLAUDE.md rules.
//
// Guard: /api/admin/* is pre-guarded by middleware/admin-auth.ts which calls
// assertAdminSession. We still call getAdminSession defensively so the handler
// is safe in isolation + we have the admin email for the audit row.
//
// Read endpoint → audit is best-effort (swallow failures, never block response).
import { and, asc, desc, eq, ilike, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { createError, defineEventHandler, getValidatedQuery } from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { users } from '~/server/db/schema/users';
import { getAdminSession } from '~/server/utils/auth-admin';
import { auditRead } from '~/server/utils/admin-audit';

const querySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  state: z.enum(['active', 'blocked', 'deleted']).optional(),
  page: z.coerce.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
  sort: z.enum(['createdAt', 'lastLoginAt', 'email']).optional().default('createdAt'),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Whitelisted ORDER BY column map — never interpolate user-supplied identifiers.
const SORT_COLUMNS = {
  createdAt: users.createdAt,
  lastLoginAt: users.lastLoginAt,
  email: users.email,
} as const;

export default defineEventHandler(async (event) => {
  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const filters = await getValidatedQuery(event, querySchema.parse);

  auditRead(event, session, 'users_list_viewed', { filters });

  const where: SQL[] = [];

  if (filters.q) {
    where.push(ilike(users.email, `%${filters.q}%`));
  }

  if (filters.state === 'active') {
    where.push(isNull(users.deletedAt));
    where.push(isNull(users.blockedAt));
  } else if (filters.state === 'blocked') {
    where.push(isNotNull(users.blockedAt));
  } else if (filters.state === 'deleted') {
    where.push(isNotNull(users.deletedAt));
  }

  const whereExpr = where.length > 0 ? and(...where) : undefined;

  const sortCol = SORT_COLUMNS[filters.sort];
  const orderExpr = filters.order === 'asc' ? asc(sortCol) : desc(sortCol);
  const offset = (filters.page - 1) * filters.pageSize;

  const rows = await db
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
    .where(whereExpr)
    .orderBy(orderExpr)
    .limit(filters.pageSize)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(whereExpr);
  const total = totalRow?.count ?? 0;

  return {
    rows: rows.map((r) => ({
      id: r.id,
      email: r.email,
      createdAt: r.createdAt ? r.createdAt.toISOString() : null,
      lastLoginAt: r.lastLoginAt ? r.lastLoginAt.toISOString() : null,
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      blockedAt: r.blockedAt ? r.blockedAt.toISOString() : null,
      blockedReason: r.blockedReason ?? null,
    })),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
  };
});
