// Admin audit helpers.
//
// auditRead: FIRE-AND-FORGET audit insert for READ endpoints. Don't await —
// returns void immediately so the request isn't blocked on the insert
// round-trip. A read endpoint showing 2s+ total latency is almost always
// this call blocking before the actual data query; this helper removes that.
//
// For MUTATION endpoints, do the audit INSIDE the same transaction as the
// mutation (see any admin/jobs/[id]/*.post.ts for the pattern). Those stay
// synchronous on purpose — paper trail has to be atomic with the change.
import { createHash } from 'node:crypto';
import type { H3Event } from 'h3';
import { getHeader, getRequestIP } from 'h3';
import { db } from '../db/client';
import { adminAuditLog } from '../db/schema';
import type { AdminSession } from './auth-admin';

const USER_AGENT_MAX = 500;

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export type AuditReadOpts = {
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
};

export function auditRead(
  event: H3Event,
  admin: AdminSession,
  action: string,
  opts?: AuditReadOpts | Record<string, unknown>,
): void {
  const ipHash = sha256Hex(getRequestIP(event, { xForwardedFor: true }) ?? '');
  const userAgent = getHeader(event, 'user-agent')?.slice(0, USER_AGENT_MAX);

  // opts may be either a typed AuditReadOpts (with targetType/targetId/details)
  // or a plain details-shaped object. Detect via the well-known keys.
  const o = opts as AuditReadOpts | undefined;
  const targetType = o?.targetType ?? null;
  const targetId = o?.targetId ?? null;
  const details =
    o && !('targetType' in o) && !('targetId' in o) && !('details' in o)
      ? (o as unknown as Record<string, unknown>)
      : (o?.details ?? null);

  // Deliberately not awaited. Failures are logged only.
  void db
    .insert(adminAuditLog)
    .values({
      adminEmail: admin.email,
      action,
      targetType,
      targetId,
      details,
      ipHash,
      userAgent,
    })
    .catch((err: unknown) => {
      console.warn('admin_audit_log_failed', { action, name: (err as Error)?.name });
    });
}
