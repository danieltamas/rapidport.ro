// POST /api/admin/jobs/[id]/force-state — admin override of jobs.status.
// Spec: PLAN-api-admin-wave-b.md Task 1, Decision A1.
//
// Allowed transitions ONLY:
//   succeeded → failed
//   failed    → succeeded
//   failed    → created
//   created   → expired
//   paid      → expired  (warning: consider refunding first)
//
// Optimistic lock: UPDATE jobs SET status=to WHERE id=$1 AND status=from.
// If 0 rows updated → 409 stale_state. UPDATE + admin_audit_log INSERT in one tx.
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { createError, defineEventHandler, getRequestHeader, getRequestIP, getValidatedRouterParams, readValidatedBody } from 'h3';
import { z } from 'zod';
import { db } from '~/server/db/client';
import { adminAuditLog } from '~/server/db/schema/admin_audit_log';
import { jobs } from '~/server/db/schema/jobs';
import { getAdminSession } from '~/server/utils/auth-admin';

const USER_AGENT_MAX = 500;

// All job statuses we recognize — superset used for Zod validation. The
// transition whitelist below restricts which pairs are allowed.
const STATUSES = ['created', 'paid', 'queued', 'running', 'succeeded', 'failed', 'expired'] as const;

const ParamsSchema = z.object({ id: z.string().uuid() });
const BodySchema = z.object({
  from: z.enum(STATUSES),
  to: z.enum(STATUSES),
  reason: z.string().min(5).max(500),
});

type Status = (typeof STATUSES)[number];

// [from, to, optional warning] tuples.
const ALLOWED_TRANSITIONS: Array<{ from: Status; to: Status; warning?: string }> = [
  { from: 'succeeded', to: 'failed' },
  { from: 'failed', to: 'succeeded' },
  { from: 'failed', to: 'created' },
  { from: 'created', to: 'expired' },
  { from: 'paid', to: 'expired', warning: 'consider running refund first' },
];

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, ParamsSchema.parse);
  const { from, to, reason } = await readValidatedBody(event, BodySchema.parse);

  const session = await getAdminSession(event);
  if (!session) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
  }

  const match = ALLOWED_TRANSITIONS.find((t) => t.from === from && t.to === to);
  if (!match) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unprocessable Entity',
      data: {
        error: 'invalid_transition',
        allowed: ALLOWED_TRANSITIONS.map((t) => ({ from: t.from, to: t.to })),
      },
    });
  }

  const ipHash = sha256Hex(getRequestIP(event, { xForwardedFor: true }) ?? '');
  const userAgent = (getRequestHeader(event, 'user-agent') ?? '').slice(0, USER_AGENT_MAX) || null;

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(jobs)
      .set({ status: to, updatedAt: new Date() })
      .where(and(eq(jobs.id, id), eq(jobs.status, from)))
      .returning({ id: jobs.id });

    if (updated.length === 0) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Conflict',
        data: { error: 'stale_state' },
      });
    }

    await tx.insert(adminAuditLog).values({
      adminEmail: session.email,
      action: 'job_force_state',
      targetType: 'job',
      targetId: id,
      details: { from, to, reason },
      ipHash,
      userAgent,
    });
  });

  return {
    ok: true,
    from,
    to,
    warnings: match.warning ? [match.warning] : [],
  };
});
