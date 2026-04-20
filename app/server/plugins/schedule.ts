// Nitro scheduler plugin. Registers all Rapidport scheduled jobs + work handlers
// against pg-boss. Set `SCHEDULER_ENABLED=false` in a dev shell to prevent
// double-firing when two Nitro processes share a DB (single-instance v1;
// advisory-lock electorate will replace this when we scale).
//
// Jobs:
//   cleanup.jobs-files       every 6h  → prune expired /data/jobs/<id>/ + null PII
//   cleanup.oauth-state      hourly    → DELETE PKCE rows > 10 min old
//   cleanup.rate-limits      hourly    → DELETE sliding-window rows > 1h old
//   cleanup.orphan-files     daily 3am → DELETE filesystem dirs with no matching jobs.id
//   smartbill.invoice-sweep  every 5m  → issue SmartBill invoices for succeeded, unlinked payments
import { env } from '../utils/env';
import { getBoss } from '../utils/queue';
import { runCleanupJobsFiles } from '../utils/schedule-tasks/cleanup-jobs-files';
import { runCleanupOauthState } from '../utils/schedule-tasks/cleanup-oauth-state';
import { runCleanupRateLimits } from '../utils/schedule-tasks/cleanup-rate-limits';
import { runCleanupOrphanFiles } from '../utils/schedule-tasks/cleanup-orphan-files';
import { runSmartBillInvoiceSweep } from '../utils/schedule-tasks/smartbill-invoice-sweep';

type JobDef = {
  name: string;
  cron: string;
  run: () => Promise<object>;
};

const JOBS: JobDef[] = [
  { name: 'cleanup.jobs-files', cron: '0 */6 * * *', run: runCleanupJobsFiles },
  { name: 'cleanup.oauth-state', cron: '0 * * * *', run: runCleanupOauthState },
  { name: 'cleanup.rate-limits', cron: '0 * * * *', run: runCleanupRateLimits },
  { name: 'cleanup.orphan-files', cron: '0 3 * * *', run: runCleanupOrphanFiles },
  { name: 'smartbill.invoice-sweep', cron: '*/5 * * * *', run: runSmartBillInvoiceSweep },
];

async function runTask(def: JobDef): Promise<void> {
  const start = Date.now();
  console.info('scheduler_run_start', { name: def.name });
  try {
    const result = await def.run();
    console.info('scheduler_run_end', {
      name: def.name,
      ms: Date.now() - start,
      ...result,
    });
  } catch (err) {
    console.error('scheduler_task_failed', {
      name: def.name,
      ms: Date.now() - start,
      reason: (err as Error).name,
    });
  }
}

export default defineNitroPlugin(async () => {
  if (!env.SCHEDULER_ENABLED) {
    console.info('scheduler_disabled_via_env');
    return;
  }

  try {
    const boss = await getBoss();

    for (const def of JOBS) {
      // createQueue is idempotent — pg-boss v10 needs the queue before schedule/work.
      await boss.createQueue(def.name);
      await boss.schedule(def.name, def.cron);
      await boss.work(def.name, () => runTask(def));
    }

    console.info('scheduler_registered', { jobs: JOBS.map((j) => j.name) });
  } catch (err) {
    console.error('scheduler_registration_failed', { reason: (err as Error).name });
  }
});
