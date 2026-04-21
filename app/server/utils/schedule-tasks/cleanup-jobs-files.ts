// cleanup.jobs-files — prune expired job dirs + null PII on the row.
// Matches the shape of DELETE /api/admin/jobs/[id]'s purge (minus the paid-job
// guard — expiry applies regardless of payment; legal retention is handled
// by the untouched payments row).
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { and, lt, ne, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { jobs } from '../../db/schema';
import { env } from '../env';

const DATA_ROOT = env.DATA_ROOT;
const BATCH_SIZE = 100;

export async function runCleanupJobsFiles(): Promise<{ purged: number }> {
  const expired = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(
      and(
        ne(jobs.status, 'expired'),
        sql`${jobs.expiresAt} is not null`,
        lt(jobs.expiresAt, sql`now()`),
      ),
    )
    .limit(BATCH_SIZE);

  let purged = 0;
  for (const { id } of expired) {
    try {
      await rm(join(DATA_ROOT, id), { recursive: true, force: true });
    } catch {
      // non-fatal — ENOENT, race with admin delete, etc. The DB update still happens.
    }

    const updated = await db
      .update(jobs)
      .set({
        status: 'expired',
        uploadFilename: null,
        uploadDiskFilename: null,
        billingEmail: null,
        mappingResult: null,
        discoveryResult: null,
        anonymousAccessToken: '[expired]',
        updatedAt: new Date(),
      })
      .where(and(sql`${jobs.id} = ${id}`, ne(jobs.status, 'expired')))
      .returning({ id: jobs.id });

    if (updated.length > 0) purged += 1;
  }

  return { purged };
}
