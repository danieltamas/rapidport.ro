# Rapidport — Changelog

Reverse-chronological log of completed tasks. Every merged task gets one entry.

Entry format: one block per task with job/group/task path, merge commit, brief summary, DONE + REVIEW references.

---

## 2026-04-20

### Email notification sweep — `mapping-ready` + `conversion-ready`

**Merge:** `8c4c891`. Closes the worker→Nuxt notification gap deferred from email-templates. Uses the scheduler plugin (just shipped).

- Migration `0005`: `jobs.email_mapping_ready_sent_at` + `jobs.email_conversion_ready_sent_at` (both nullable timestamptz). Fire-once markers.
- `emails/{mapping-ready,conversion-ready}.ts` — inline HTML+text renderers per `docs/emails-copy.md` §1 + §3.
- `schedule-tasks/email-notification-sweep.ts` — two batch-50 sweeps (mapping-ready fires on `status='mapped' OR progressStage='reviewing'`; conversion-ready on `status='succeeded'`). Recipient = `billingEmail` with leftJoin fallback to `user.email`. Scheduled every 2 min.
- `plugins/schedule.ts` — registers `email.notification-sweep`.

**sync-complete NOT wired** — requires an `is_resync` flag on `ConvertPayload` the worker doesn't set yet. Flagged in `docs/emails-copy.md` "Open question".

### Hotfix: dev-safe SmartBill env defaults

**Commit:** `1fdeb39`. After the SmartBill merge (`2958488`), the env validator blew up on every request because Dani's local `.env` didn't yet have `SMARTBILL_USERNAME`/`SMARTBILL_CIF`. Root cause: I made them `z.string().min(1)` (hard-required) instead of giving dev-safe placeholders like `ADMIN_EMAILS` already has.

Fix:
- `env.ts` — SmartBill vars now have dev-safe defaults (`dev-noop@example.test`, `dev-noop`, `RO00000000`).
- `smartbill.ts` — new `isSmartBillConfigured()` guard detects the placeholders.
- `smartbill-invoice-sweep.ts` — short-circuits `{skipped: true}` when not configured so the sweep doesn't rack up failed SmartBill API calls and escalate to `admin_audit_log` every 5 min in dev.

**Rule saved to auto-memory:** every new required env var for an external service must get a dev-safe placeholder default + an `isXxxConfigured()` guard in its downstream util. Don't repeat.

### `smartbill-client` + `gdpr-cleanup-cron` — SmartBill REST client + scheduled-jobs plugin

**Merge:** `2958488` (branch `job/phase2-nuxt/smartbill-and-cleanup` → main, --no-ff). Single-agent; both plans approved with defaults.

Shared `plugins/schedule.ts` registers all scheduled jobs so the two tasks are one coherent change. Opt-out via `SCHEDULER_ENABLED=false` for secondary dev shells.

**New env (4, boot-validated):** `SMARTBILL_USERNAME`, `SMARTBILL_API_KEY`, `SMARTBILL_CIF`, `SMARTBILL_SERIES` (default `RAPIDPORT`), `SCHEDULER_ENABLED`.

**New `utils/smartbill.ts`:** typed `createInvoice({reference, client: pj|pf, totalRon, description?})` hitting `POST https://ws.smartbill.ro/SBORO/api/invoice` via HTTP Basic. 3× exponential backoff on 5xx/network; fast-fail on 4xx. Typed `SmartBillError` (`kind: 'auth'|'validation'|'server'|'network'|'unknown'`). PJ invoices set `useEFactura: true` so SmartBill auto-queues to SPV when the account is configured.

**Scheduled jobs (cron):**
- `cleanup.jobs-files` (6h) — batch 100; recursive fs.rm on the job dir (non-fatal ENOENT); `status='expired'` + null PII columns with idempotent WHERE guard. Mirrors admin-delete purge shape.
- `cleanup.oauth-state` (1h) — DELETE PKCE rows where `createdAt < now() - 10 minutes` (table has no expiresAt column, TTL is by convention).
- `cleanup.rate-limits` (1h) — DELETE sliding-window rows where `windowStart < now() - 1 hour`.
- `cleanup.orphan-files` (daily 3am UTC) — readdir `/data/jobs/`, drop UUID-named dirs with no matching `jobs.id` (partial uploads, manual fs edits).
- `smartbill.invoice-sweep` (5m) — SELECT payments WHERE `status='succeeded' AND smartbill_invoice_id IS NULL AND createdAt > now() - 7 days` (JOINed with jobs for billingEmail); issues invoice via client; updates `smartbillInvoiceId`/`Url`. Escalates to `admin_audit_log` with `action='smartbill_invoice_stuck'` after 20 consecutive failures per payment.

**`utils/queue.ts`:** `getBoss()` is now exported (was private). No other behaviour change — `publishConvert`/`publishDiscover` still the only publish surface.

**Process note:** the scheduler opt-out via env is a v1 compromise. When we scale to N Nitro processes, swap to a Postgres advisory-lock electorate so only one holds the scheduler leadership. Tracked in `PLAN-gdpr-cleanup-cron.md`.

### `pages-admin` — 8 admin dashboard pages + shell layout

**Merge:** `06c4077` (group `job/phase2-nuxt/pages-admin` → main, --no-ff).

Shell + overview landed single-agent (`43da111`). Rest shipped via 5 parallel workers — **all 5 hit the harness Bash-denied flake**, but all 5 used the mandatory-salvage clause in the prompt and wrote canonical files via Write. Orchestrator committed each as a separate commit on the group branch.

**New files:**
- `app/layouts/admin.vue` — dark-mode shell; collapsible 240/64px sidebar w/ lucide icons; topbar with route breadcrumb + persistent ADMIN red banner; sign-out wired via `/api/admin/logout`.
- `app/pages/admin/index.vue` — 7-card overview bound to `/api/admin/stats` (total jobs, revenue 30d RON, paid/succeeded/failed 30d, AI cost 30d USD, users).
- `app/pages/admin/jobs/{index,[id]}.vue` — list (Zod filters + pagination + URL sync) + detail (metadata + Actions card with 6 dialogs: refund / extend-syncs / resend-download / force-state / re-run / delete; payments + audit tables).
- `app/pages/admin/payments/index.vue` — list with status/q/refunded filters; job link to detail; SmartBill invoice link if present.
- `app/pages/admin/users/{index,[id]}.vue` — list w/ state filter (active|blocked|deleted) + detail w/ 4 action dialogs (grant/block/unblock/delete; delete requires typing DELETE); stats strip + recent jobs.
- `app/pages/admin/ai/index.vue` — 30-day trend strip + CSS bar chart (no chart lib) + top unmapped fields (muted empty-state note) + low-confidence mappings (color-coded: <0.5 destructive, <0.7 warning).
- `app/pages/admin/profiles/index.vue` — list with visibility filter + promote/hide dialogs.
- `app/pages/admin/audit/index.vue` — paginated admin_audit_log read with 6-field filter bar (incl. datetime-local); expand-row for JSON details; target-type-aware deep links to /admin/jobs or /admin/users.
- `app/pages/admin/sessions/index.vue` — list active admin sessions; revoke button disabled on current (server also enforces); CURRENT badge; ConfirmDialog.

**All pages:** `definePageMeta({ layout: 'admin' })`, English-only, dark-by-default, shadcn primitives only, SSR-fetch via `useAsyncData` + `useRequestHeaders(['cookie'])` cookie-forward, `x-csrf-token` from the `rp_csrf` cookie on mutations, no fabricated data, no new deps.

**Process note:** salvage-clause language with "MANDATORY, not optional" + "Do NOT bail" worked — 5/5 workers produced deliverables despite Bash-denied. Keep this wording pattern for future waves.

### `api-admin` Wave B — 19 admin endpoints (jobs-actions + users + ai + misc) + prep

**Merge:** group `job/phase2-nuxt/api-admin-wave-b` → main, --no-ff. Plan committed `deef060`; Dani approved 8 design decisions inline.

**Prep commit (orchestrator-direct on main):**
- Migration `0004_tricky_madelyne_pryor.sql`: `users.blocked_at timestamptz` + `users.blocked_reason text` (both nullable). Applied locally.
- `auth-user.getUserSession` now also filters on `isNull(users.blockedAt)` AND `isNull(users.deletedAt)` — both blocked + GDPR-deleted users are treated as logged-out without revoking sessions; unblock re-auths cleanly.
- Extracted GDPR purge to `utils/purge-user.ts:purgeUserData(input)`. Refactored `me/index.delete.ts` to call it. Wave B's `DELETE /api/admin/users/[id]` calls the same helper — no drift.

**Task commits (4 parallel workers; 1 fully orchestrator-direct salvage when worker bailed on Bash-denied without using salvage clause):**
- `feat(admin): jobs actions — refund + extend-syncs + resend-download + force-state + re-run + delete` (worker, `de33da8`)
- `feat(admin): users — list + detail + grant-syncs + block + unblock + delete` (worker, `e4cc682`)
- `feat(admin): GET /api/admin/ai — usage trend + low-confidence mappings + audit` (worker, `41b2167`)
- `feat(admin): profiles + audit + sessions endpoints` (orchestrator salvage)

**New endpoints (all under `/api/admin/*`, every mutation writes a transactional `admin_audit_log` row — Wave B is stricter than Wave A; reads stay best-effort):**

*Jobs actions (6):*
- `POST /api/admin/jobs/[id]/refund` — Stripe refund with idempotency key `refund_{paymentId}_{amount}`. Stripe call OUTSIDE the DB tx; payments UPDATE + audit transactional. 409 if no succeeded payment or already fully refunded.
- `POST /api/admin/jobs/[id]/extend-syncs` — `{additional, reason}` → atomic `${jobs.deltaSyncsAllowed} + ${additional}` increment, transactional audit.
- `POST /api/admin/jobs/[id]/resend-download` — re-uses conversion-ready RO copy (per `docs/emails-copy.md` §3); recipient = billingEmail ?? user email; 409 `no_recipient` if neither.
- `POST /api/admin/jobs/[id]/force-state` — Dani-approved transition allowlist: `succeeded↔failed`, `failed→created`, `created→expired`, `paid→expired` (warns "consider running refund first"). Optimistic lock on `WHERE id=$1 AND status=$from` → 409 `stale_state` if 0 rows.
- `POST /api/admin/jobs/[id]/re-run` — re-publishConvert; does NOT increment `deltaSyncsUsed` (admin override, not user quota).
- `DELETE /api/admin/jobs/[id]` — paid-job guard rejects if any `payments.status='succeeded'` exists for the job (409 `paid_job_must_refund_first`); otherwise `fs.rm /data/jobs/{id}/` (non-fatal) + null PII columns + `anonymousAccessToken='[deleted]'` + status='expired' + audit transactional.

*Users (6):*
- `GET /api/admin/users` — paginated list, `state` filter (`active|blocked|deleted`), Zod sort whitelist.
- `GET /api/admin/users/[id]` — detail + `Promise.all` over jobs/payments stats + last 10 jobs (no `anonymousAccessToken`).
- `POST /api/admin/users/[id]/grant-syncs` — bumps `delta_syncs_allowed` for ALL the user's jobs; audit captures `jobsAffected`.
- `POST /api/admin/users/[id]/block` — `{reason}` → `blocked_at=now(), blocked_reason=...`; 409 `already_blocked`.
- `POST /api/admin/users/[id]/unblock` — symmetric; `{reason}` captured for audit symmetry; 409 `not_blocked`.
- `DELETE /api/admin/users/[id]` — calls `purgeUserData()` helper (shared with `DELETE /api/me`); audit captures `originalEmailHashPrefix` (sha256 first 8 chars) so the row isn't fully un-traceable but PII is gone.

*AI (1):*
- `GET /api/admin/ai` — `trend30d` (daily groupby on `ai_usage`), `lowConfidenceMappings` (mapping_cache where `confidence < 0.7`, ORDER BY `hitCount DESC` LIMIT 50), `topUnmappedFields: []` with TODO marker (worker doesn't log mapping misses yet — flagged for future observability task).

*Misc (6):*
- `GET /api/admin/profiles` — list (no `mappings` jsonb in response — too large), filters + whitelisted sort.
- `POST /api/admin/profiles/[id]/promote` — `isPublic=true`; 409 `already_public`.
- `POST /api/admin/profiles/[id]/hide` — `isPublic=false`; 409 `already_hidden`.
- `GET /api/admin/audit` — paginated `admin_audit_log` read with filters; self-audited (`audit_log_viewed`).
- `GET /api/admin/sessions` — list active admin sessions, marks current via `getAdminSession.sessionId`.
- `DELETE /api/admin/sessions/[id]` — self-lockout guard rejects current session (409 `cannot_revoke_current_session`).

**Settings + errors endpoints intentionally deferred** (plan D1) — settings has nothing to display today (env is boot-validated and immutable); errors needs `observability-sentry` first.

**Process notes for next agent:**
- Worker harness Bash-denied flake hit ~1 of 4 again. The api-admin-misc worker bailed without using its salvage authorization — orchestrator had to write 6 files + DONE + commit. Future worker prompts could be more forceful: "If Bash is denied, use Write tool to write all required files; do NOT stop early" rather than the current softer "salvage authorization" framing.

### `api-admin` Wave A — 4 read-only admin endpoints

**Merge:** group `job/phase2-nuxt/api-admin` → main, --no-ff.

**Task commits (squashed):**
- `feat(admin): GET /api/admin/stats — dashboard numbers + audit`
- `feat(admin): GET /api/admin/jobs — list w/ filters + pagination + audit`
- `feat(admin): GET /api/admin/jobs/[id] — full join + audit`
- `feat(admin): GET /api/admin/payments — list w/ filters + audit`

**Summary:** 4 parallel workers. 2 clean (jobs-detail `e50029c`, payments `ea4e9f8`); 1 salvaged from main-checkout files (jobs-list); 1 fully orchestrator-direct (stats — worker hit Bash-denied + a stale-base worktree that hid all admin schemas).

**New endpoints (all under `/api/admin/*`, guarded by `middleware/admin-auth.ts`, every handler writes one `admin_audit_log` row):**
- `GET /api/admin/stats` — 7 live counts/sums via `Promise.all` over a 30-day window: `jobsTotal`, `jobsPaidLast30d`, `jobsSucceededLast30d`, `jobsFailedLast30d`, `revenueLast30dBani`, `aiCostLast30dUsd`, `usersTotal`. Numbers-only response.
- `GET /api/admin/jobs` — paginated list with Zod-validated filters (status, q, page/pageSize, sort/order — sort column whitelisted). `anonymousAccessToken` stripped from rows. Separate `count(*)::int` for `total`.
- `GET /api/admin/jobs/[id]` — `Promise.all` over `jobs`, `payments`, last-50 `audit_log` rows. Admin sees everything (including `anonymousAccessToken` — they're admin). Audit row inserted BEFORE data fetch.
- `GET /api/admin/payments` — paginated list with leftJoin onto `jobs` for `billingEmail`. Filters: status, q (matches stripePaymentIntentId or jobId), refunded (yes/no/partial via `refundedAmount` comparison).

**Process notes:**
- Confirmed harness Bash-denied issue is recurring; 1 of 4 workers needed full reconstruction. Worker prompts now consistently ship a "salvage authorization" clause that lets the worker write files via Write tool only — Worker 2 used this path successfully.
- One harness side-effect: my main-checkout CWD drifted into a worker's worktree mid-flow (`pwd` printed `.claude/worktrees/agent-a6958155/`). Recovered via `cd /Users/danime/Sites/rapidport.ro/app`. Future orchestrator turns should re-`pwd` after long worker waves.

Wave B (jobs-actions, users, ai, misc — includes the refund/delete mutations) NOT yet dispatched — pausing for Dani's go since Wave B touches destructive admin actions.

### `payment-confirmed` email + email copy doc

**Merge commit:** `cd00697`. Single-agent.

- `docs/emails-copy.md` — source-of-truth for all transactional email subjects + bodies, approved by Dani. 5 templates kept (magic-link + mapping-ready + payment-confirmed + conversion-ready + sync-complete); 2 dropped (`job-submitted`, `job-failed` — status UI surfaces both).
- `app/server/emails/payment-confirmed.ts` — inline HTML+text renderer (same pattern as `magic-link.post.ts:renderEmail`). Fire-and-forget; cause-only error log.
- `stripe.post.ts` — webhook fetches `billingEmail` (with leftJoin fallback to user email) and calls `sendPaymentConfirmedEmail`. Closes the email TODO marker. Skip-with-log if neither email is available (anonymous flow with no billing email captured).

Three remaining templates need worker→Nuxt notification glue. Three options in the copy doc; recommended: pg-boss cron + nullable `email_<type>_sent_at` columns.

**Other Dani decisions captured this turn:**
- SmartBill invoice series = `RAPIDPORT` (Gamerina SRL). Closes SPEC Q#3. `smartbill-client` is fully unblocked.
- Live Stripe charge authorized for the first end-to-end smoke (~2.50 RON). Webhook endpoint must be configured in Stripe dashboard or via `stripe listen`.

### Worker `bundle_output()` — unblocks `GET /api/jobs/[id]/download`

**Merge commit:** `95ea945` (`job/phase2-nuxt/worker-bundle-output` → main, single-agent, --no-ff). Closes the highest-blocker gap from end of Wave 4b.

- `worker/src/migrator/utils/archive.py`: new `bundle_output(output_dir) -> Path`. Stdlib `zipfile.ZIP_DEFLATED` only — no new deps. Atomic write via `output.zip.tmp` + `os.replace` so the Nuxt download handler never observes a half-written file. Raises `ArchiveError` on missing-dir / empty-dir / write failure.
- `worker/src/migrator/consumer.py`: call `bundle_output(output_dir)` after `write_report_pdf` and before `_mark_rp_succeeded` — SSE 'done' then implies the zip is ready. Bundling failure raises `RuntimeError("bundle_failed: ...")` which lands in the existing `_handle_job` except branch and marks the job failed (better than 'succeeded' jobs that 501 on download).

End-to-end loop is now fully wired: upload → discover → mapping → pay → webhook → convert → **bundle** → succeeded → download streams `output.zip`.

Validation: `python3 -m py_compile` clean. `ruff` / `mypy` not installed in this dev env — flagged for next worker session.

### `api-webhooks-stripe` Wave 4c — Stripe webhook receiver

**Merge commit:** `04327f0` (`job/phase2-nuxt/api-webhooks-stripe` → main, --no-ff). Single-agent (orchestrator) per CLAUDE.md plan-then-implement for risky integrations; plan committed at `740a758` and approved by Dani with sensible defaults (no schema change, `paid+queued`, defer email).

**New endpoint:**
- `POST /api/webhooks/stripe` — `stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET, 300)` — 5-min replay window. Dedup via `stripe_events INSERT ON CONFLICT DO NOTHING` keyed by Stripe event id. Only `payment_intent.succeeded` triggers side effects: SELECT `payments` by `stripePaymentIntentId` → mark `succeeded` → UUID-validate `intent.metadata.jobId` → mark `jobs.status='paid' + progressStage='queued'` → SELECT `uploadDiskFilename` (Wave 4 schema fix) → `publishConvert({job_id, input_path, output_dir, mapping_profile: null})`. Every error path that's not "malformed/forged" returns 200 with a structured ack flag (`dedup`, `ignored`, `unknown_intent`, `already_processed`, `missing_jobId`, `missing_upload`) so Stripe stops retrying. publishConvert is try/catch'd — failures log but still 200 (sweep cron is the recovery path).

**TODO carried forward:**
- `email-templates` task must add `payment-confirmed.vue` and wire it from this handler (TODO marker in code).
- `smartbill-client` task should sweep `payments WHERE status='succeeded' AND smartbill_invoice_id IS NULL` (TODO marker in code).
- `observability` task should add a sweep cron for paid jobs that have no `pgboss.convert` row enqueued — recovery for the rare `publishConvert` failure-after-payment-recorded.

**Live-keys reminder still applies:** Dani's `.env` has LIVE Stripe keys. End-to-end exercise needs a deliberate test-key swap + Stripe CLI (`stripe listen --forward-to <tunnel>/api/webhooks/stripe`) OR explicit go on a small live-amount test.

### `api-jobs` Wave 4b — pay + download + resync

**Merge commit:** `95a78ba` (group `job/phase2-nuxt/api-jobs-4b` → main, --no-ff)

**Task commits (squashed into group):**
- `85443ee` — `feat(api): POST /api/jobs/[id]/pay — Stripe PaymentIntent w/ idempotency`
- `8a98ad6` — `feat(api): GET /api/jobs/[id]/download + POST .../resync`

**Summary:** 2 parallel workers. `api-jobs-pay` shipped via worker; `api-jobs-download-resync` was orchestrator-direct salvage (worker hit harness Bash-denied bug AND wrote files to canonical paths in main checkout — handler files were sound, picked up + committed on a fresh task branch).

**New endpoints on main:**
- `POST /api/jobs/[id]/pay` — flat 499 RON + 21% VAT = 604 RON (60_400 bani). State guard: `status='mapped' || progressStage='reviewing'`. Optional body `{billingEmail?}` writes through to `jobs.billingEmail`. Idempotent re-click: existing non-failed `payments` row → `stripe.paymentIntents.retrieve` and re-return `client_secret`. New intent uses `automatic_payment_methods` + idempotency key `job_{id}_pay`. INSERT `payments` row on first success. Returns `{clientSecret, amount, currency}` only — never the full intent.
- `GET /api/jobs/[id]/download` — state guard `status='succeeded'`. Streams `/data/jobs/{id}/output.zip` with `Content-Disposition: attachment; filename="rapidport-{idShort}.zip"` and `Cache-Control: private, no-store`. **501 `zip_bundler_unavailable` if no pre-built zip exists** — no `archiver` dep wired yet (deliberate; flagged for follow-up). Today's worker pipeline writes individual files to `output/` but doesn't bundle them; either the worker bundles before marking succeeded, or we add `archiver` here. Either way the access check + state guard + streaming shape are in place.
- `POST /api/jobs/[id]/resync` — state guard `status='succeeded'`; quota guard `deltaSyncsUsed < deltaSyncsAllowed` (defaults 0/3) → 402 `delta_sync_quota_exhausted` with `{used, allowed}`. Requires `uploadDiskFilename` (post-migration 0003). Publishes `ConvertPayload {job_id, input_path, output_dir, mapping_profile: null}` via `publishConvert()`. Atomic increment of `deltaSyncsUsed` via parameterised `sql` template (`${jobs.deltaSyncsUsed} + 1`). Returns `{ok, deltaSyncsUsed, deltaSyncsAllowed}`.

**Live-keys reminder:** Dani's `.env` has LIVE Stripe keys. The pay handler is wired but a live exercise needs explicit go (test-key swap or small live-amount authorization).

**Follow-up flagged:**
- `archiver` dep + worker-side bundling for `output.zip` so download stops returning 501.
- Decision needed if SPEC later wants a separate `delta-sync` pg-boss queue vs. reusing `convert`.

### Schema fix: `jobs.upload_disk_filename` (Wave 4 → 4b prep)

**Commit:** orchestrator-direct on main; migration `app/drizzle/0003_slow_lyja.sql`.

Closes the wiring gap flagged at Wave 4 close. Single additive nullable column. Upload handler now persists both `uploadFilename` (display) + `uploadDiskFilename` (server name); `discover.post.ts` reads the column and the readdir branch is gone. Download/resync (Wave 4b) and `api-webhooks-stripe`'s `publishConvert` (Wave 4c) can use the column without inferring the path. Applied locally via `drizzle-kit migrate`.

### `api-jobs` Wave 4 — 6 user-facing job handlers shipped to main

**Merge commit:** `437edaf` (group `job/phase2-nuxt/api-jobs` → main, --no-ff)

**Task commits (squashed into group):**
- `0aa022a` — `feat(api): POST /api/jobs — create job + anonymous token + cookie`
- `a98e101` — `feat(api): GET /api/jobs/[id] — gated read, anonymousAccessToken stripped`
- `0d3d2a2` — `feat(api): PUT /api/jobs/[id]/upload — multipart, magic-byte gated, 500MB cap`
- `973b394` — `feat(api): POST /api/jobs/[id]/discover — publish pg-boss discover job`
- `a942bb1` — `feat(api): GET /api/jobs/[id]/events — SSE progress stream`
- `849c175` — `feat(api): PATCH /api/jobs/[id]/mapping — validated mapping update`

**Summary:** 6 parallel workers in isolated worktrees. 5 shipped clean; `api-jobs-discover` was orchestrator-direct salvage after the worker hit the harness Bash-denied bug (same pattern used for `auth-admin-logout` last session). All handlers follow the same shape: Zod-validate path/body → `assertJobAccess(id, event)` FIRST → Drizzle for state mutation → tightly-scoped JSON response.

**New endpoints on main:**
- `POST /api/jobs` — Zod body `{sourceSoftware, targetSoftware, billingEmail?}` (source≠target enforced); resolves optional user via `getUserSession`; mints anonymous token; sets path-scoped cookie; returns `{id, anonymousAccessToken, source, target}`. Rate limit 10/hr/IP from middleware.
- `GET /api/jobs/[id]` — `assertJobAccess` first; returns full job row minus `anonymousAccessToken`; date columns serialized to ISO.
- `PUT /api/jobs/[id]/upload` — multipart, exactly one `file` part; Content-Length pre-flight at 500MB (411 if missing, 413 if exceeded); magic-byte sniff (zip / 7z / gzip→tgz, never trusts filename or Content-Type); persists at `/data/jobs/{id}/upload/{randomUuid}.{ext}`; only `uploadFilename` (original) + `uploadSize` written to DB. Rate limit 3/hr/IP from middleware.
- `POST /api/jobs/[id]/discover` — requires prior upload (`uploadFilename` set, 409 `not_uploaded` otherwise); resolves on-disk path by `readdir(/data/jobs/{id}/upload/)` and matching `{uuid}.{ext}` regex (409 on 0 or >1 matches); publishes `DiscoverPayload {job_id, input_path}` via `publishDiscover()`; sets `progressStage='queued'`. Worker side is currently a TODO stub (`worker/src/migrator/consumer.py:509`) — discover jobs will fail with `discover_not_implemented` until the Python side ships.
- `GET /api/jobs/[id]/events` — H3 `createEventStream`; primes with current snapshot; polls `(stage, pct, status)` every 2s, pushes only on change; named `heartbeat` event every 15s (proxy keepalive); terminal statuses (`succeeded|failed|expired`) emit final event then close; `stream.onClosed` tears down all timers (no zombie pollers); 10-min hard cap.
- `PATCH /api/jobs/[id]/mapping` — Zod body `{mappings: MappingEntry[1..5000]}`; pre-checks Content-Length (~2MB cap); state guard: `progressStage` must be `'mapped'` or `'reviewing'`; advances `mapped → reviewing`; preserves `reviewing`; returns `{ok, count}`.

**Wave-level finding (logged as TODO for next wave):** the upload handler stores files with a random on-disk filename but only persists the user's *original* filename to `jobs.uploadFilename`. Discover, future delta-sync, and GDPR file-export consumers all need the on-disk path. Today they readdir; the right fix is a schema migration adding `jobs.uploadDiskFilename`. Should land before Wave 4b's `api-jobs-download-resync` so download can stream the on-disk file directly. Documented in `DONE-api-jobs-discover.md`.

**Hard rules reinforced this wave:**
- Worker prompts must explicitly say "create branch from group, NOT main" — workers verified `git branch --show-current` before writing code.
- `npm install` inside worktrees was unavoidable (worktrees don't share `node_modules`); workers ran `npm install --ignore-scripts` for their typecheck pass. Not committed (no manifest changes).
- The Bash-denied harness bug recurred; salvage pattern (orchestrator reads spec + reconstructs) worked again. Future worker prompts should pre-empt by including a write-only fallback authorization.

### `api-jobs` Wave 4 prep — pg-boss publisher + Stripe client + queue payload types

**Commit:** `fa484b4` (orchestrator-direct on main)

**Summary:** Three small server utilities that unlock all 6 Wave 4 workers + Wave 4b pay + Wave 4c stripe webhook. File-disjoint with everything else; no handler code yet.

- `app/server/utils/queue.ts` — pg-boss publisher singleton. `publishConvert(payload)` + `publishDiscover(payload)`. Lazy-initializes the client on first send, calls `boss.createQueue()` for both names (pg-boss v10 requires explicit creation), logs only error names (no payload/PII).
- `app/server/utils/stripe.ts` — single `stripe` client (no `apiVersion` pin — uses account default), `maxNetworkRetries=2`, `timeout=20s`, `appInfo.name='rapidport.ro'`. Plus `jobPaymentIdempotencyKey(jobId)` → `'job_{id}_pay'` (Stripe's 24h dedup window covers our retry shape).
- `app/server/types/queue.ts` — snake_case TS mirrors of `worker/src/migrator/consumer.py` Pydantic `ConvertPayload` + `DiscoverPayload`. **Field names match byte-for-byte** — drift = silent worker drops. Both sides documented.
- `app/server/plugins/queue-shutdown.ts` — Nitro `close` hook calls `stopQueue()` for graceful pg-boss shutdown.
- `app/server/utils/env.ts` + `.env.example` — three required Stripe vars: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. Boot fails closed in prod if missing.
- `app/package.json` — `stripe` added. Mature SDK, no major changes from npm baseline.

**Operational note:** Dani's local `.env` has **LIVE** Stripe keys, not test. Workers can ship `api-jobs-pay` / webhook code, but the first end-to-end exercise should swap to test keys OR be a deliberate small-amount live smoke. Captured in auto-memory.

### Product pivots + UX hardening + nuxt-security + GDPR endpoints

This session was orchestrator-direct (no task branches) — extensive UX work, product-model clarifications, and four new endpoints (`/api/auth/session`, `/api/me/*`). Not in the formal Phase 2 group system; captured here and in `jobs/HANDOFF.md`.

**Commits:** `64e2878` → `4497a95` (18 commits on main).

**Product pivots:**
- **Magic-link → 6-digit PIN** (`73da825`). `POST /api/auth/magic-link` now generates a 6-digit code; `POST /api/auth/verify` (replaces `GET /api/auth/verify`) takes `{ email, code, next? }`. `/login` is two-step (email → PinInput). Reason: corporate email gateways (Safe Links, Proofpoint) prefetch single-use URLs. `pages/verify.vue` deleted (flow is now inline).
- **Flat user auth routes** (`64e2878`). `/auth/login` → `/login`, `/verify` Vue page dropped. Admin unchanged at `/admin/login`. API routes still `/api/auth/*`.
- **`/profiles` → `/account` dashboard** (`f50522a`). `/account` is a real dashboard (stats, recent migrations, recent invoices). Sub-pages: `/account/migrations`, `/account/invoices`, `/account/profiles` (mapping overrides, de-emphasized), `/account/security`. Mapping-profile visibility (`isPublic`/`adoptionCount`) is admin-only — dropped from user surface.
- **Bidirectional framing everywhere** (`a246473`). Stats/steps/FAQ/mockup/email-footer all say "WinMentor ⇄ SAGA, în ambele direcții" / "software sursă → destinație".
- **VAT updated 19% → 21%** (`76ea8d2`) on invoices table, `/job/[id]/pay` breakdown, index footers.

**Middleware posture shift:**
- **`server/middleware/security-headers.ts` DELETED** (`2eb6a83`). Replaced by `nuxt-security` module configured in `nuxt.config.ts` with per-request nonces, `strict-dynamic`, Stripe + Google OAuth allowlist. Our own `csrf.ts` + `rate-limit.ts` remain because they match SPEC semantics.
- **`server/middleware/user-auth.ts` NEW** (`73da825`). Guards `/account` + `/account/*` (page redirect to `/login?next=<path>`) and `/api/me/*` + `/api/account/*` (JSON 401).
- **`admin-auth.ts` now redirects** to `/admin/login` on page auth failure instead of throwing 401.

**New endpoints (not in JOB.md):**
- `GET /api/auth/session` — current user session for header auth state (`73da825`).
- `DELETE /api/auth/session` — user logout (`73da825`).
- `POST /api/auth/verify` — PIN code verify, replaces `verify.get.ts` (`73da825`).
- `GET /api/me/account` — email + createdAt for Cont panel (`76ea8d2`).
- `GET /api/me/sessions` — list active sessions (marks current) (`76ea8d2`).
- `DELETE /api/me/sessions` — revoke all except current (`76ea8d2`).
- `DELETE /api/me/sessions/[id]` — revoke one (`76ea8d2`).
- `GET /api/me/export` — full GDPR JSON dump, streamed as attachment (`c5e5249`).
- `DELETE /api/me` — GDPR account deletion, atomic transaction (`bf9b38b`).

**New utilities:**
- `app/server/utils/email.ts` — single-instance Resend wrapper (`ed5131f`).
- `app/server/utils/google-oauth.ts` — PKCE helpers, raw fetch (`ed5131f`).

**New UI primitives / pages:**
- `app/error.vue` — branded 404/500 page (`64e2878`, revised `5ee28e7`).
- `app/components/layout/ConfirmDialog.vue` — reusable destructive/default confirmation modal with loading spinner, fade+zoom (`4221bf1`). **Use this for every future confirmation** — do not inline Dialog instances.
- `app/components/ui/pin-input/*` — shadcn-vue PinInput generated (`044502e`). Paste-to-distribute, auto-verify on complete.
- `app/components/ui/dialog/DialogContent.vue` — shadcn default `slide-in-from-left` dropped; fade+zoom only (`56d4172`).
- `app/components/ui/input/Input.vue` — `useVModel` → `defineModel` (`73da825`). Fixes silent v-model propagation bug.
- `/admin/login` + `/admin` page stubs (`5ee28e7`). OAuth flow has somewhere to land until pages-admin ships.

**Bug fixes of note:**
- **SSR cookie forward** (`0c09d64`, `bc4c353`). Nuxt's `$fetch` on SSR doesn't forward client cookies to its own API routes. Pattern now: `const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined; $fetch('/api/...', { headers })`. Every page that renders auth state needs this.
- **Index page bypassed SiteHeader** (`284bfc7`). Had a hardcoded nav; replaced with `<LayoutSiteHeader />`.
- **`/login` auth redirect** (`284bfc7`). If already logged in, navigateTo(next || '/account').
- **CSP dev disable** (`5bcd1de`) — then replaced by nuxt-security (`2eb6a83`).

**SmartBill env rename** (`19240a3`, `984f60e`): `SMARTBILL_USERNAME`/`SMARTBILL_TOKEN` → single `SMARTBILL_API_KEY` across CODING.md, SECURITY_REVIEWER.md, REQUIREMENTS.md.

**Handoff** (`4497a95`): `jobs/HANDOFF.md` rewritten for next agent — next wave is `api-jobs`.

---

## 2026-04-19

### `phase2-nuxt / auth-user + auth-admin` Wave 3 B — both groups complete

**Merge commits:**
- `fa83d64` — auth-user final (magic-link request + verify)
- `367d900` — auth-admin final (google start + callback + admin logout)
- `ed5131f` — prep (env extension + `utils/email.ts` Resend wrapper + `utils/google-oauth.ts` PKCE helpers + `resend` dep)

**Summary:** 5 handler workers in parallel. 4 shipped clean; `auth-admin-logout` was written by the worker but blocked at `git add` by the harness — orchestrator reconstructed the handler from the spec (it's 35 lines; worker's draft was lost when its worktree was removed). All other handlers landed as submitted.

**New handlers on main:**
- `POST /api/auth/magic-link` — Zod email, fail-closed 5/hr rate limit, Resend email with Romanian copy, `{ ok: true }` regardless of outcome (no account enumeration).
- `GET /api/auth/verify` — atomic `consumed_at` update + find-or-create user + session + best-effort anonymous job claim from `job_access_*` cookies; redirect guarded against protocol-relative / backslash-escaped paths.
- `GET /api/auth/google/start` — PKCE state+verifier persisted in `admin_oauth_state`, 302 to Google.
- `GET /api/auth/google/callback` — one-shot DELETE RETURNING on state (prevents replay), 10-min TTL, email_verified + ADMIN_EMAILS allowlist re-check, audits every denial path.
- `POST /api/admin/logout` — defensive `getAdminSession` + `revokeAdminSession` + audit row.

**Extended:**
- `app/server/utils/env.ts` — +5 required vars (`RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`).
- `app/server/utils/email.ts` — single-instance Resend client, `sendEmail()` wrapper; never logs recipient or body.
- `app/server/utils/google-oauth.ts` — `createPkce()` / `buildAuthorizeUrl()` / `exchangeCode()` / `fetchUserInfo()` (raw fetch, no SDK dep).
- `.env.example` — new Resend + Google OAuth placeholders.

**Phase 2 auth is complete.** Both auth groups fully on main (5/5 auth-user, 4/4 auth-admin).

**Reports:** `jobs/phase2-nuxt/DONE-auth-{magic-link-request,magic-link-verify,google-start,google-callback,admin-logout}.md`

### `phase2-nuxt / auth-user + auth-admin` Wave 3 (A1 + A2) — merged to main

**Merge commits:**
- `8d5ea44` — auth-user A1 (session util + anonymous token)
- `fb5f067` — auth-admin A1 (session trio + ADMIN_EMAILS env)
- `6ee8d9e` — auth-user A2 (assertJobAccess gate)

**Summary:** Four of nine auth tasks landed. Shape: A1 ran three utility workers in parallel (`auth-session-util`, `auth-anonymous-token`, `auth-admin-session`), all file-disjoint. A2 ran `auth-job-access` solo after A1 was on main (composes the three utilities into the three-way gate per CODING.md §13.8).

**New files:**
- `app/server/utils/auth-user.ts` — user session lifecycle (SHA-256 hash in DB, plaintext in cookie, 30d TTL).
- `app/server/utils/anonymous-token.ts` — per-job scoped cookie (`job_access_${jobId}`, SameSite=Strict), constant-time verify.
- `app/server/utils/auth-admin.ts` — admin session lifecycle (8h TTL, IP-hash bound, cookie `admin_session`).
- `app/server/utils/assert-admin-session.ts` — IP drift → revoke + 401; allowlist re-check per request → 403.
- `app/server/utils/assert-job-access.ts` — three-way check: admin (with `admin_audit_log` insert) → user-owner → anonymous token → default-deny 403. 404 on missing job before auth probing.
- `app/server/middleware/admin-auth.ts` — guards `/admin/*` and `/api/admin/*` (exempts `/admin/login` + `/api/auth/google/*`).

**Extended:**
- `app/server/utils/env.ts` — +`ADMIN_EMAILS` (comma-split → lowercased email array, dev-noop default, prod must configure).
- `.env.example` — commented `ADMIN_EMAILS` template.

**Remaining auth tasks:** `auth-magic-link-request`, `auth-magic-link-verify` (user), `auth-google-start`, `auth-google-callback`, `auth-admin-logout` (admin).

**Reports:** `jobs/phase2-nuxt/DONE-auth-{session-util,anonymous-token,admin-session,job-access}.md`

### `phase2-nuxt / schema` group Wave 2 — merged to main

**Merge commit:** `528df46` (group → main, --no-ff)

**Task commits (squashed):**
- `7df4131` — `feat(db): admin_sessions + admin_oauth_state schema sub-files`
- `fc677b7` — `feat(db): extend jobs + add payments + stripe_events`
- `a354dfa` — `feat(db): mapping_profiles schema sub-file`
- `a7ccfdb` — `feat(db): audit_log + admin_audit_log schema sub-files`
- `b5dfa99` — `feat(db): rate_limits + metrics schema sub-files`
- `3a46e66` — `feat(db): consolidate Wave 2 schema — barrel exports + migration 0002` (orchestrator)

**Summary:** 5 parallel schema workers each added their own sub-files under `app/server/db/schema/` — no worker touched the barrel or ran `db:generate` (file-disjoint by design). Orchestrator then appended 9 re-export lines to `schema.ts`, wired the `jobs.mappingProfileId` FK to `mappingProfiles.id` (deferred from the `schema-jobs-payments` worker with a forward-reference stub), and ran `npm run db:generate` once to produce `app/drizzle/0002_bouncy_star_brand.sql` covering every Wave 2 table + ALTER.

**New tables:** `admin_sessions`, `admin_oauth_state`, `payments`, `stripe_events`, `mapping_profiles`, `audit_log`, `admin_audit_log`, `rate_limits`, `metrics`.

**Extended:** `jobs` gets 11 new columns (userId FK, anonymousAccessToken, sourceSoftware, targetSoftware, uploadFilename, uploadSize, discoveryResult, mappingResult, mappingProfileId FK, billingEmail, expiresAt) + 3 indexes.

**Migration 0002:** 9 CREATE TABLE, 11 ALTER jobs ADD COLUMN, 5 FKs, many indexes. Not yet applied — operator task.

**Downstream unblocks:** `auth-user` (sessions/magic_link_tokens/users), `auth-admin` (admin_sessions, admin_oauth_state, admin_audit_log), `api-jobs-*` (extended jobs + payments), `api-webhooks` (stripe_events), `api-admin-*` (admin_audit_log, metrics), `pages-mapping` (mapping_profiles + save/load carry-forward).

**Reports:** `jobs/phase2-nuxt/DONE-schema-{admin,jobs-payments,profiles,audit,support}.md`

### `phase2-nuxt / security-baseline` group — merged to main

**Merge commit:** `6f475c3` (group → main, --no-ff)

**Task commits (squashed into group):**
- `8688db1` — `sec(nuxt): add global security-headers middleware`
- `cfb6fb1` — `sec(api): CSRF middleware with double-submit cookie pattern`
- `edf89a3` — `sec(api): sliding-window rate limit middleware`

**Summary:** Three Nitro middleware modules land the SPEC §S.1/§S.2/§S.10 baseline. `security-headers.ts` sets HSTS, strict CSP (no `unsafe-inline`/`unsafe-eval`, Stripe + Google OAuth allowlisted), X-Frame, Referrer, Permissions-Policy. `csrf.ts` enforces double-submit cookie (`rp_csrf` ↔ `x-csrf-token`) on POST/PUT/PATCH/DELETE with `crypto.timingSafeEqual`; only `/api/webhooks/*` is exempt (admin routes are NOT). `rate-limit.ts` implements sliding-window against the `rate_limits` table for `POST /api/jobs` (10/h), `PUT /api/jobs/{id}/upload` (3/h), and `GET /admin/login` (10/h fail-closed); all SQL is parameterized via Drizzle `sql` template.

**Deferred to follow-up tasks:**
- Magic-link `body.email` rate limit — handled in the `auth-magic-link-request` handler (middleware runs before body validation).
- Catch-all `Other GETs 300/min` and `Other mutations 60/min` from SPEC §S.10.
- CSP nonce for any future inline SSR style.
- Client-side CSRF helper (composable) — lands with `pages-*` tasks.

**Reports:** `jobs/phase2-nuxt/DONE-security-{headers,csrf,rate-limit}.md`

### `phase2-nuxt / schema / schema-users-sessions` — merged to main

**Merge commit:** `e3ecf05` (group → main, --no-ff) · task: `4ff2111`

**Summary:** First task in the `schema` group. Added three Drizzle tables (`users`, `sessions`, `magic_link_tokens`) as per-table sub-files under `app/server/db/schema/` — matching the existing `jobs.ts` / `mapping_cache.ts` / `ai_usage.ts` split pattern. Barrel `app/server/db/schema.ts` re-exports them. Generated migration `app/drizzle/0001_nebulous_malcolm_colcord.sql` (3 CREATE TABLE + 1 FK cascade + 4 indexes). Establishes the "one sub-file per table group" convention for the remaining five `schema-*` tasks to parallelize without touching each other's files. Migration not yet applied — operator runs `npm run db:migrate` against the live DB.

**Reports:** `jobs/phase2-nuxt/DONE-schema-users-sessions.md`

---

## 2026-04-18

### `phase0-discovery / discovery / saga-import-schema` — committed to main

**Commits:** `64cfa0c` (schema docs), `5d6faa1` (DONE report)

**Summary:** Reverse-engineered SAGA C 3.0 import file formats from a live Firebird 3.x production database (`samples/saga/CONT_BAZA.FDB`, ODS 12, 195 tables, WIN1252). Prior worker had already extracted `docs/saga-fdb-schema.sql` (40,371 lines DDL) via `jacobalberty/firebird:3.0` Docker + isql; ODS version confirmed from file header bytes (offset 0x12 = 0x0C = 12). FDB columns cross-referenced against SAGA C 3.0 official manual + askit.ro + forum posts.

**Deliverables:**
- `docs/saga-schemas.md` — 689 lines; all 7 entities documented (Terți/Clienti, Terți/Furnizori, Articole, Articole Contabile, Intrări, Ieșiri, Încasări, Plăți) with FDB column specs, import file formats, field mappings, gotchas, and XML/DBF samples
- `docs/saga-rejections.md` — stub with 8 known pre-validation risk flags for Phase 1 generators
- `.gitignore` — already had correct entries (`docs/saga-fdb-schema.sql`, `samples/saga/CONT_BAZA.readonly.FDB`) from prior attempt; verified, not changed

**Key findings:** No dedicated INCASARI/PLATI tables — payments stored in REGISTRU + NOTE_FACTURI + OP. Invoices routed by SAGA based on XML tags (not filename): `<FurnizorCIF>` matching own company CIF → Iesiri, otherwise → Intrari. Date format in XML is `dd.mm.yyyy`. DBF encoding is WIN1252. PKs are Firebird generator-assigned — import files must not provide them.

**Phase C deferred:** SAGA C 3.0 is Windows-only, unavailable on dev machine. Live import validation deferred to Phase 1 `generators-*` tasks.

**Reports:** `jobs/phase0-discovery/DONE-saga-import-schema.md`

**Open questions for Dani:** DBF vs XML for Terți/Articole in Phase 1; deduplication vs overwrite behavior; EUR/USD invoice support in v1; chart of accounts pre-existence requirement.

---

## 2026-04-17

### `phase2-nuxt / bootstrap / bootstrap-primitives` — merged to main — **bootstrap group complete (7/7)**

**Merge commit:** `174a452`

**Summary:** Generated 6 shadcn-vue primitives (+ TableEmpty helper) under `app/components/ui/{button,input,card,table,badge,alert}/`. 27 files total, every one using Tailwind theme utilities (`bg-primary`, `text-foreground`, `bg-card`, `border-input`, etc.) — zero hardcoded hex. All imports use `~/` aliases. `app/pages/index.vue` now shows a Card+Badge+Button showcase proving the theme+primitives+Tailwind @theme pipeline works end-to-end.

**Dep added:** `@vueuse/core@^14` (CLI-forced by Input.vue's `useVModel` + TableEmpty.vue's `reactiveOmit`). Spec permitted this.

**Reports:** DONE + REVIEW (approved).

**Bootstrap group status: DONE.** Main has a running theme-applied Nuxt app. Remaining Phase 2 groups (security-baseline, schema, auth, api, pages, admin, gdpr, email, i18n, observability, infra, ci-tests) are blocked on Phase 1 gate per SOP.

### `phase2-nuxt / bootstrap / bootstrap-shadcn-setup` — merged to main

**Merge commit:** `19e949e`

**Summary:** Installed `shadcn-nuxt`, Tailwind v4 via `@tailwindcss/vite`, and peer deps (`reka-ui`, `class-variance-authority`, `clsx`, `tailwind-merge@3`, `lucide-vue-next`). Created `app/assets/css/tailwind.css` mirroring `app/theme/index.ts` values as CSS custom properties + shadcn alias vars + `@theme inline` registering them as Tailwind utilities. Added `app/components.json` (Rapidport-flat aliases) + `app/lib/utils.ts` (standard `cn()`). `nuxt.config.ts` extended without touching existing keys. No components generated — that was `bootstrap-primitives` next.

**Reports:** DONE + REVIEW (approved).

### UI library swap — Mantine → shadcn-nuxt (spec correction)

SPEC.md originally specified Mantine as the UI kit. Mantine is React-only; no viable Vue/Nuxt port exists. After orchestrator review, switched to **shadcn-nuxt** (Vue port of shadcn/ui) + **Tailwind v4 via `@tailwindcss/vite`** — matches the pattern Dani uses in his `play.wam.4.0` project and every other active Nuxt project.

**Theme is preserved verbatim** — SPEC §"UI Design System" color/typography/spacing tokens stay as-is; only the component library under them changes. Shadcn's philosophy (copy-paste components, you own the source) maps cleanly onto the SPEC's "primitives layer" concept. Primitives now live at `app/components/ui/` (shadcn default) rather than `app/components/primitives/`.

**Docs updated:** SPEC.md (Tech Stack + UI implementation notes), CLAUDE.md (Stack + Admin UI rules), jobs/phase2-nuxt/JOB.md (bootstrap table + gate criteria), jobs/phase2-nuxt/REQUIREMENTS.md (dep list swap).

**Task renames:** `bootstrap-mantine-override` → `bootstrap-shadcn-setup` (new spec at `jobs/phase2-nuxt/bootstrap-shadcn-setup.md`). `bootstrap-primitives` kept its name — now means "generate the initial shadcn primitives via `npx shadcn-vue@latest add`".

### `phase2-nuxt / bootstrap / bootstrap-drizzle` — merged to main

**Merge commit:** `ae4e284` (on `main`; group branch retired — no longer used now that we merge each task directly to main)

**Summary:** Drizzle ORM end-to-end. Multi-file schema split under `app/server/db/schema/{jobs,mapping_cache,ai_usage}.ts` + re-export barrel `app/server/db/schema.ts`. `app/server/db/client.ts` creates the pg Pool (max 20) via `env.DATABASE_URL`. `app/drizzle.config.ts` uses schema glob with a documented process.env exception for the CLI tool. Generated baseline migration at `app/drizzle/0000_steady_malcolm_colcord.sql` + meta files. DATABASE_URL flipped from optional to required in EnvSchema.

**Deps added:** `drizzle-orm@^0.33`, `pg@^8.12`, `pg-boss@^10.0`, `drizzle-kit@^0.24`, `@types/pg@^8`. Scripts: `db:generate`, `db:migrate`, `db:push`, `db:studio`.

**Reports:** DONE + REVIEW (approved) on main.

### Workflow revision — group branches retired for solo-task rounds

After the Round 1 (theme+env+fonts) parallel merge created the confusion where `https://rapidport.ro` couldn't reach Nuxt (group branch had the app files, main didn't → rundev ran against main with orphan `app/package.json`, got port 3000 defaults), SOP revised: solo-task bootstrap rounds merge task → main directly. The group branch `job/phase2-nuxt/bootstrap` has been deleted locally + remote. Multi-task parallel rounds can still use a short-lived group branch if needed.

### `phase2-nuxt / bootstrap / bootstrap-fonts` — merged to main (via group)

**Merge commit:** `cb5fae1` (on `job/phase2-nuxt/bootstrap`)

**Summary:** Self-hosted Inter + JetBrains Mono via `@fontsource/inter` and `@fontsource/jetbrains-mono`, wired through `app/nuxt.config.ts` `css[]`. Build output verified: `.woff2` files served from `.output/public/_nuxt/`; ZERO references to `fonts.googleapis.com` / `fonts.gstatic.com`. GDPR self-hosting requirement satisfied.

**Notes:** v5 of `@fontsource` moved variable-font variants to `@fontsource-variable/*`; base packages ship per-weight files only. Used per-weight imports (Inter 400/500/600, JetBrains Mono 400) per spec fallback. JetBrains Mono 450 not shipped as separate file — 400 is SPEC-sanctioned fallback.

**Reports:** DONE + REVIEW (approved) — on group branch.

### `phase2-nuxt / bootstrap / bootstrap-env` — merged to group branch

**Merge commit:** `33cd6ad` (on `job/phase2-nuxt/bootstrap`)

**Summary:** Zod env validation at Nitro boot. `app/server/utils/env.ts` is the single reader of `process.env` — `grep` check enforced. Schema starts minimal: `NODE_ENV` (dev default), `APP_URL` (`http://localhost:3015` default), `DATABASE_URL` (optional, flipped to required in `bootstrap-drizzle`). Side-effect import in `app/server/plugins/env-check.ts` fires validation on boot; missing required vars = process exits, no fallback defaults for secrets (CODING.md §13.1 pattern).

**Reports:** DONE + REVIEW (approved) — on group branch.

### `phase2-nuxt / bootstrap / bootstrap-theme` — merged to group branch

**Merge commit:** `5955b73` (on `job/phase2-nuxt/bootstrap`)

**Summary:** Design tokens in `app/theme/index.ts` as single source of truth. Covers SPEC §"UI Design System" in full: dark-mode colors (11), accent red (4 variants), semantic (4), light-mode (4 for `/legal/*`), Inter + JetBrains Mono families, 12-entry font scale, weights (400/450/500/600), spacing scale (4px-based, 10 values), radius (sm/md/lg/full), z-index (5 layers). 148 lines, under 500-line cap. TypeScript `as const` registry; `app/theme/types.ts` re-exports inferred types. Grep check: zero hardcoded hex outside `app/theme/index.ts`.

**Reports:** DONE + REVIEW (approved) — on group branch.

### `phase2-nuxt / bootstrap / bootstrap-nuxt` — merged to group branch

**Merge commit:** `0179d3b` (on `job/phase2-nuxt/bootstrap`, not yet merged to `main` — 6 more bootstrap tasks pending before group → main merge)

**Summary:** Minimal Nuxt 3 scaffold. TypeScript strict with `noUncheckedIndexedAccess` + `noImplicitOverride`. Dev port 3015 (not Nuxt default 3000 — collides with Dani's other services). `typeCheck=false` in-build — explicit `nuxi typecheck` enforced by CI + `task-complete-gate.sh` hook. Nitro websocket experimental flag on for future SSE progress work. Core deps only (nuxt, vue, zod + TS/vitest dev); theme, fonts, Mantine, Drizzle, auth etc. deferred to their own tasks.

**Files:** `app/{package.json,package-lock.json,nuxt.config.ts,tsconfig.json,app.vue,pages/index.vue,.nvmrc}` created.

**Reports:** `jobs/phase2-nuxt/DONE-bootstrap-nuxt.md` + `jobs/phase2-nuxt/REVIEW-bootstrap-nuxt.md` (verdict: approved) — currently on group branch, will surface on main when group merges.

**Notes:**
- 6 moderate npm audit vulnerabilities reported, all in `vitest` dev dependency paths. Dev-only, zero runtime exposure. Deferred to a future `chore(nuxt): upgrade vitest to v4` task.
- Worker correctly surfaced a spec-vs-deps conflict (`typeCheck: true` needs `vue-tsc` as peer, not in spec's dep list) rather than silently adding the dep. Spec updated to `typeCheck: false` before resumption.
