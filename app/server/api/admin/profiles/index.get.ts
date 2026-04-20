// GET /api/admin/profiles — admin list of mapping profiles.
// Returns metadata only — the `mappings` jsonb is intentionally NOT in the
// response (it can be large; admin can fetch a single profile via a separate
// endpoint when one ships).
import { and, asc, desc, eq, type SQL } from 'drizzle-orm';
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
import { adminAuditLog, mappingProfiles } from '../../../db/schema';
import { getAdminSession } from '../../../utils/auth-admin';
import { auditRead } from '../../../utils/admin-audit';

const QuerySchema = z.object({
  isPublic: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  sort: z.enum(['adoptionCount', 'createdAt', 'name']).default('adoptionCount'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const SORT_COLUMNS = {
  adoptionCount: mappingProfiles.adoptionCount,
  createdAt: mappingProfiles.createdAt,
  name: mappingProfiles.name,
} as const;

export default defineEventHandler(async (event) => {
  const admin = await getAdminSession(event);
  if (!admin) throw createError({ statusCode: 401 });

  const q = await getValidatedQuery(event, QuerySchema.parse);

  auditRead(event, admin, 'profiles_list_viewed', q);

  const conditions: SQL[] = [];
  if (q.isPublic === 'true') conditions.push(eq(mappingProfiles.isPublic, true));
  if (q.isPublic === 'false') conditions.push(eq(mappingProfiles.isPublic, false));
  const where = conditions.length ? and(...conditions) : undefined;

  const sortCol = SORT_COLUMNS[q.sort];
  const orderBy = q.order === 'asc' ? asc(sortCol) : desc(sortCol);

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        id: mappingProfiles.id,
        name: mappingProfiles.name,
        sourceSoftwareVersion: mappingProfiles.sourceSoftwareVersion,
        targetSoftwareVersion: mappingProfiles.targetSoftwareVersion,
        isPublic: mappingProfiles.isPublic,
        adoptionCount: mappingProfiles.adoptionCount,
        userId: mappingProfiles.userId,
        createdAt: mappingProfiles.createdAt,
      })
      .from(mappingProfiles)
      .where(where)
      .orderBy(orderBy)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(mappingProfiles)
      .where(where),
  ]);

  return {
    rows,
    page: q.page,
    pageSize: q.pageSize,
    total: Number(totalRows[0]?.n ?? 0),
  };
});
