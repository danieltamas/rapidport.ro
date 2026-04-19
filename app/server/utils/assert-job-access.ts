// Three-way job access gate. Spec: CODING.md §13.8 "Job Access — Three-Way Ownership Check".
// Order is load-bearing: admin → user → anonymous token. Default-deny 403.
// NOTE: callers must not serialize `anonymousAccessToken` into public responses;
// api-jobs-get strips it before returning to clients.
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createError, getHeader, getRequestIP, type H3Event } from 'h3';
import { db } from '../db/client';
import { adminAuditLog, jobs } from '../db/schema';
import { getAdminSession } from './auth-admin';
import { getUserSession } from './auth-user';
import { verifyAnonymousToken } from './anonymous-token';

const USER_AGENT_MAX = 500;

function sha256Hex(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}

export async function assertJobAccess(
  jobId: string,
  event: H3Event,
): Promise<typeof jobs.$inferSelect> {
  // Step 0 — fetch the job first so admin probing also 404s on missing IDs.
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  if (!job) {
    throw createError({ statusCode: 404 });
  }

  // Step 1 — admin session wins; log the access (best-effort, never blocks).
  const admin = await getAdminSession(event);
  if (admin) {
    try {
      const ipHash = sha256Hex(getRequestIP(event, { xForwardedFor: true }) ?? '');
      const ua = getHeader(event, 'user-agent')?.slice(0, USER_AGENT_MAX);
      await db.insert(adminAuditLog).values({
        adminEmail: admin.email,
        action: 'job_access',
        targetType: 'job',
        targetId: jobId,
        ipHash,
        userAgent: ua,
      });
    } catch {
      console.warn('admin_audit_log insert failed for job_access');
    }
    return job;
  }

  // Step 2 — user session: must own the job.
  const user = await getUserSession(event);
  if (user && job.userId === user.userId) {
    return job;
  }

  // Step 3 — anonymous per-job token.
  if (verifyAnonymousToken(event, jobId, job.anonymousAccessToken)) {
    return job;
  }

  // Default deny.
  throw createError({ statusCode: 403 });
}
