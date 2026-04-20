# PLAN — gdpr-cleanup-cron

**Author:** orchestrator | **Date:** 2026-04-20 | **Status:** awaiting Dani's approval

CLAUDE.md flags data-deletion as plan-required. This covers the scheduled cleanup worker, shared with SmartBill's invoice sweep.

---

## Scope

One Nitro plugin that registers all of Rapidport's scheduled pg-boss jobs and handles them in-process (Nuxt side). Python worker stays focused on conversion.

### Scheduled jobs

| Name | Interval | What it does |
|---|---|---|
| `cleanup.jobs-files` | every 6h | `rm -rf /data/jobs/{id}/` for any job where `expires_at < now()`. Mark those jobs `status='expired'`, null PII columns (same shape as admin delete). Preserve the row for audit linkage. |
| `cleanup.oauth-state` | hourly | DELETE from `admin_oauth_state WHERE expires_at < now()`. PKCE state rows that never got consumed. |
| `cleanup.rate-limits` | hourly | DELETE from `rate_limits WHERE window_end < now() - interval '1 hour'`. Old sliding-window records. |
| `cleanup.orphan-files` | daily | Scan `/data/jobs/` for directory names that don't match any `jobs.id`. Delete them (filesystem drift from interrupted uploads, manual edits, etc.). |
| `smartbill.invoice-sweep` | every 5 min | See PLAN-smartbill-client.md — sweeps `payments` without `smartbill_invoice_id`. |

## Plugin shape

`app/server/plugins/schedule.ts`:

```ts
export default defineNitroPlugin(async (nitro) => {
  if (!shouldRunScheduler()) return; // opt-out for dev via env or if multi-instance coordination is ever needed
  const boss = await getBoss();
  await boss.schedule('cleanup.jobs-files', '0 */6 * * *'); // cron
  await boss.schedule('cleanup.oauth-state', '0 * * * *');
  await boss.schedule('cleanup.rate-limits', '0 * * * *');
  await boss.schedule('cleanup.orphan-files', '0 3 * * *'); // 03:00 UTC
  await boss.schedule('smartbill.invoice-sweep', '*/5 * * * *');

  await boss.work('cleanup.jobs-files', cleanupJobFilesHandler);
  await boss.work('cleanup.oauth-state', cleanupOauthStateHandler);
  // ...etc

  nitro.hooks.hook('close', async () => { /* boss.stop handled by queue-shutdown plugin */ });
});
```

This requires extending `utils/queue.ts` to expose `getBoss()` (today it's private behind `publishDiscover`/`publishConvert`). Minor refactor, same singleton.

## `cleanup.jobs-files` — the destructive one

Single-transaction shape per job:
```
select id from jobs
where status != 'expired'
  and expires_at is not null
  and expires_at < now()
limit 100;

for each id:
  fs.rm('/data/jobs/' + id, { recursive: true, force: true })  // non-fatal on ENOENT
  tx: update jobs set status='expired', upload_filename=null, upload_disk_filename=null,
                      billing_email=null, mapping_result=null, discovery_result=null,
                      anonymous_access_token='[expired]'
      where id=$1 and status != 'expired';  // idempotency guard
```

Matches the `DELETE /api/admin/jobs/[id]` purge shape exactly — future refactor should extract a shared `purgeJobFiles(jobId)` helper. **Out of scope for this plan** unless you want it now (my default: ship as-is, extract later if a third caller appears — the worker-reset path might want this too).

## Idempotency / safety

- All deletes use `WHERE status != 'expired'` (or equivalent) so a double-run is a no-op.
- `fs.rm({force: true})` swallows ENOENT.
- Batch size capped at 100 per run to bound work + give the scheduler a chance to re-trigger if backlog.
- Never touches `payments` or `admin_audit_log` (legal retention).

## Observability

Every sweep logs:
- Start: `scheduler_run_start` with job name.
- End: `scheduler_run_end` with `{jobsAffected, errors}`.
- Per-job errors: `scheduler_task_failed` with `{name, reason}` (reason is error name only).

Future Sentry wiring will pick these up via `console.error`.

## Dev-mode opt-out

The scheduler starts for every Nitro boot by default, which means multiple dev servers or a dev + prod pointing at the same DB would multi-fire the sweeps. pg-boss's schedule table is DB-global, so only ONE writer should `schedule()` a given name (later `schedule()` calls just update the cron expression — harmless).

BUT the `work()` subscriber fires once per process. Two dev servers = double work.

Mitigation: `SCHEDULER_ENABLED=false` env var (opt-out). Default `true`. Set to `false` in `.env.example` with a comment.

Alternative: lease-based electorate (only one instance holds the "scheduler lock" at a time via a Postgres advisory lock). More robust, ~15 extra LoC. My default: **start with the env flag** — single-instance deploy for v1, advisory lock when we scale.

## Required Dani decisions

- **G1:** 30-day expiry applies to paid or unpaid jobs? My default: **both**. Paid jobs with their output files also get pruned at 30 days post-creation (data retention commitment). `payments` row stays for legal retention, but `/data/jobs/{id}/` contents are gone. User has been told "30 days" in the UI.
- **G2:** Orphan files — my default is to delete filesystem dirs not matching any `jobs.id`. Alternative: archive them to a `/data/orphans/` dir for 7 days before deletion. My default: **direct delete**. The only way to get an orphan is a job row that was manually deleted (not supported today) or a partial create that's already 24h+ stale — no legitimate reason to keep.
- **G3:** Advisory lock vs. env flag for single-scheduler? My default: **env flag** (simpler; single-instance v1).
- **G4:** Cron expressions above — any you want changed? (The 3am UTC orphan sweep is arbitrary; 5-min SmartBill sweep is tight but invoices shouldn't lag more than 5 min post-payment.)

Sensible defaults = G1/G2/G3/G4 as above.

Estimated ~250 LoC split across `plugins/schedule.ts` + `utils/schedule-tasks/*.ts`. No schema changes. One env var addition (`SCHEDULER_ENABLED`, default true).

## Dependency

- Depends on the shared `getBoss()` export from `utils/queue.ts` — small refactor included.
- Invoice-sweep depends on `utils/smartbill.ts` — if SmartBill is deferred, the plugin still registers the cron but `smartbill.invoice-sweep` handler no-ops with a log `'smartbill_client_not_wired'`.
