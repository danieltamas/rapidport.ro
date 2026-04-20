// GET /api/admin/audit — paginated read of admin_audit_log.
// Self-audited (admin viewing the audit log writes a row of its own — meta but
// compliant with the "every admin action is audited" rule).
import { and, asc, desc, eq, gt, lt, type SQL } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import {
  createError,
  defineEventHandler,
  getHeader,
  getRequestIP,
  getValidatedQuery,
} from 'h3';
import { z } from 'zod';
import { db } from '../../../db/client';
import { adminAuditLog } from '../../../db/schema';
import { getAdminSession } from '../../../utils/auth-admin';
import { auditRead } from '../../../utils/admin-audit';

const QuerySchema = z.object({
  adminEmail: z.string().email().optional(),
  action: z.string().max(100).optional(),
  targetType: z.string().max(50).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export default defineEventHandler(async (event) => {
  const admin = await getAdminSession(event);
  if (!admin) throw createError({ statusCode: 401 });

  const q = await getValidatedQuery(event, QuerySchema.parse);

  auditRead(event, admin, 'audit_log_viewed', q);

  const conditions: SQL[] = [];
  if (q.adminEmail) conditions.push(eq(adminAuditLog.adminEmail, q.adminEmail));
  if (q.action) conditions.push(eq(adminAuditLog.action, q.action));
  if (q.targetType) conditions.push(eq(adminAuditLog.targetType, q.targetType));
  if (q.since) conditions.push(gt(adminAuditLog.createdAt, new Date(q.since)));
  if (q.until) conditions.push(lt(adminAuditLog.createdAt, new Date(q.until)));
  const where = conditions.length ? and(...conditions) : undefined;

  const orderBy = q.order === 'asc' ? asc(adminAuditLog.createdAt) : desc(adminAuditLog.createdAt);

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(adminAuditLog)
      .where(where)
      .orderBy(orderBy)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db.select({ n: sql<number>`count(*)::int` }).from(adminAuditLog).where(where),
  ]);

  return {
    rows,
    page: q.page,
    pageSize: q.pageSize,
    total: Number(totalRows[0]?.n ?? 0),
  };
});
