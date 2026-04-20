// GET /api/admin/ai — AI observability dashboard.
// Spec: jobs/phase2-nuxt/PLAN-api-admin-wave-b.md §Task 3.
//
// Three sections in one response:
//   1. trend30d              — daily token/cost/call totals from ai_usage (last 30 days)
//   2. topUnmappedFields     — [] for now; see TODO below
//   3. lowConfidenceMappings — mapping_cache rows with confidence < 0.7 (top 50 by hitCount desc)
//
// Admin session is enforced by middleware/admin-auth.ts; we still fetch defensively.
// Audit row is best-effort (read-only endpoint, Wave A pattern). No PII: mapping_cache
// and ai_usage contain only technical field names and token counts — no user identifiers.
import { asc, desc, lt, sql } from 'drizzle-orm';
import { createError, defineEventHandler, getHeader, getRequestIP } from 'h3';
import { db } from '~/server/db/client';
import { adminAuditLog } from '~/server/db/schema/admin_audit_log';
import { aiUsage } from '~/server/db/schema/ai_usage';
import { mappingCache } from '~/server/db/schema/mapping_cache';
import { getAdminSession } from '~/server/utils/auth-admin';
import { auditRead } from '~/server/utils/admin-audit';

const LOW_CONFIDENCE_THRESHOLD = 0.7;
const LOW_CONFIDENCE_LIMIT = 50;

export default defineEventHandler(async (event) => {
  const admin = await getAdminSession(event);
  if (!admin) {
    throw createError({ statusCode: 401 });
  }

  auditRead(event, admin, 'ai_dashboard_viewed');

  const since30d = sql`now() - interval '30 days'`;

  const [trendRows, lowConfidenceRows] = await Promise.all([
    db
      .select({
        day: sql<string>`date_trunc('day', ${aiUsage.createdAt})::date`.as('day'),
        tokensIn: sql<number>`sum(${aiUsage.tokensIn})::int`.as('tokens_in'),
        tokensOut: sql<number>`sum(${aiUsage.tokensOut})::int`.as('tokens_out'),
        costUsd: sql<number>`sum(${aiUsage.costUsd})::float`.as('cost_usd'),
        calls: sql<number>`count(*)::int`.as('calls'),
      })
      .from(aiUsage)
      .where(sql`${aiUsage.createdAt} > ${since30d}`)
      .groupBy(sql`date_trunc('day', ${aiUsage.createdAt})`)
      .orderBy(asc(sql`date_trunc('day', ${aiUsage.createdAt})`)),
    db
      .select({
        id: mappingCache.id,
        sourceSoftware: mappingCache.sourceSoftware,
        tableName: mappingCache.tableName,
        fieldName: mappingCache.fieldName,
        targetField: mappingCache.targetField,
        confidence: mappingCache.confidence,
        hitCount: mappingCache.hitCount,
        createdAt: mappingCache.createdAt,
      })
      .from(mappingCache)
      .where(lt(mappingCache.confidence, LOW_CONFIDENCE_THRESHOLD))
      .orderBy(desc(mappingCache.hitCount))
      .limit(LOW_CONFIDENCE_LIMIT),
  ]);

  // TODO(observability/worker): the worker doesn't currently log mapping misses.
  // Once it does (e.g., a new `mapping_misses` table or audit_log events with
  // `details->>'event'='mapping_miss'`), wire this query in. Until then we ship
  // an empty array rather than inventing data.
  const topUnmappedFields: unknown[] = [];

  return {
    trend30d: trendRows.map((r) => ({
      day: typeof r.day === 'string' ? r.day : String(r.day),
      tokensIn: Number(r.tokensIn ?? 0),
      tokensOut: Number(r.tokensOut ?? 0),
      costUsd: Number(r.costUsd ?? 0),
      calls: Number(r.calls ?? 0),
    })),
    topUnmappedFields,
    lowConfidenceMappings: lowConfidenceRows.map((r) => ({
      id: r.id,
      sourceSoftware: r.sourceSoftware,
      tableName: r.tableName,
      fieldName: r.fieldName,
      targetField: r.targetField,
      confidence: Number(r.confidence),
      hitCount: Number(r.hitCount ?? 0),
      createdAt: r.createdAt,
    })),
  };
});
