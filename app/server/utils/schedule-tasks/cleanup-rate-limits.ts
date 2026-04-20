// cleanup.rate-limits — prune sliding-window rate-limit rows past their relevant
// window. The middleware uses a 1h window for its widest SPEC limit; anything
// older can't contribute to a live count.
import { lt, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { rateLimits } from '../../db/schema';

export async function runCleanupRateLimits(): Promise<{ deleted: number }> {
  const deleted = await db
    .delete(rateLimits)
    .where(lt(rateLimits.windowStart, sql`now() - interval '1 hour'`))
    .returning({ id: rateLimits.id });

  return { deleted: deleted.length };
}
