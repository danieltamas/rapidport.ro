// email-notification.sweep — fires the two worker-triggered transactional
// emails (mapping-ready, conversion-ready) once per job. Runs on the scheduler
// every 2 minutes.
//
// Fire-once semantics via nullable `email_<type>_sent_at` columns on jobs.
// Admin re-run / user resync don't re-send because the column is already set.
// sync-complete is NOT wired here yet — the `is_resync` plumbing landed in
// migration 0007 (`jobs.last_run_was_resync` now gets stamped by the worker),
// but the sweep itself is a follow-up: it'd need a `email_sync_complete_sent_at`
// column PLUS a trigger to reset the flag on each fresh resync so multiple
// delta-syncs fire multiple emails. See docs/emails-copy.md "Deferred wiring".
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { jobs, users } from '../../db/schema';
import { sendMappingReadyEmail } from '../../emails/mapping-ready';
import { sendConversionReadyEmail } from '../../emails/conversion-ready';

const BATCH = 50;

type Row = {
  id: string;
  billingEmail: string | null;
  userEmail: string | null;
};

function recipient(row: Row): string | null {
  return row.billingEmail ?? row.userEmail ?? null;
}

async function sweepMappingReady(): Promise<number> {
  const pending = await db
    .select({
      id: jobs.id,
      billingEmail: jobs.billingEmail,
      userEmail: users.email,
    })
    .from(jobs)
    .leftJoin(users, eq(jobs.userId, users.id))
    .where(
      and(
        isNull(jobs.emailMappingReadySentAt),
        or(inArray(jobs.status, ['mapped']), eq(jobs.progressStage, 'reviewing')),
      ),
    )
    .limit(BATCH);

  let sent = 0;
  for (const row of pending) {
    const to = recipient(row);
    if (!to) continue;
    await sendMappingReadyEmail(row.id, to);
    await db
      .update(jobs)
      .set({ emailMappingReadySentAt: sql`now()` })
      .where(eq(jobs.id, row.id));
    sent += 1;
  }
  return sent;
}

async function sweepConversionReady(): Promise<number> {
  const pending = await db
    .select({
      id: jobs.id,
      billingEmail: jobs.billingEmail,
      userEmail: users.email,
    })
    .from(jobs)
    .leftJoin(users, eq(jobs.userId, users.id))
    .where(and(isNull(jobs.emailConversionReadySentAt), eq(jobs.status, 'succeeded')))
    .limit(BATCH);

  let sent = 0;
  for (const row of pending) {
    const to = recipient(row);
    if (!to) continue;
    await sendConversionReadyEmail(row.id, to);
    await db
      .update(jobs)
      .set({ emailConversionReadySentAt: sql`now()` })
      .where(eq(jobs.id, row.id));
    sent += 1;
  }
  return sent;
}

export async function runEmailNotificationSweep(): Promise<{
  mappingReady: number;
  conversionReady: number;
}> {
  const [mappingReady, conversionReady] = await Promise.all([
    sweepMappingReady(),
    sweepConversionReady(),
  ]);
  return { mappingReady, conversionReady };
}
