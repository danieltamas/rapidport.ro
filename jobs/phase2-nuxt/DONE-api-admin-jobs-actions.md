# Completed: api-admin-jobs-actions
**Task:** api-admin-jobs-actions | **Status:** done | **Date:** 2026-04-20

Admin mutation endpoints for operating on individual jobs from the admin
dashboard. All six follow Wave B policy: synchronous + transactional
`admin_audit_log` write (mutation and audit either both commit or both roll
back); defensive `getAdminSession`; idempotency on external side-effects.

## Changes Made
- `app/server/api/admin/jobs/[id]/refund.post.ts` — new. Looks up the
  succeeded payment, calculates remaining refundable (`amount − refundedAmount`),
  calls `stripe.refunds.create` with `idempotencyKey=refund_{paymentId}_{amount}`
  OUTSIDE the DB tx (external side-effect never rolls back), then commits a tx
  that updates `payments.refundedAmount / refundedAt` and inserts the audit row.
  If the DB tx fails after Stripe succeeded, returns 500 with
  `refund_db_reconcile_required` + the stripe refund ID; cause-only log.
  Rejects: no succeeded payment (409), already fully refunded or out-of-range
  amount (409).
- `app/server/api/admin/jobs/[id]/extend-syncs.post.ts` — new. Atomic
  increment via parameterised `sql\`${jobs.deltaSyncsAllowed} + ${additional}\``
  + audit insert in one tx. Zod clamps `additional` to 1..20.
- `app/server/api/admin/jobs/[id]/resend-download.post.ts` — new. Joins
  `users` to `jobs` once, picks recipient = `billingEmail ?? user.email`
  (user email only if `users.deletedAt IS NULL` — anonymized @rapidport.invalid
  addresses are skipped). Rejects 409 `not_ready` when status≠succeeded, 409
  `no_recipient` when both sources are null. Audit committed synchronously;
  email sent AFTER commit (cause-only log on send failure; non-fatal).
  Inline render of the docs/emails-copy.md §3 "conversion-ready" template —
  Romanian, unchanged copy, Gamerina SRL footer convention preserved.
- `app/server/api/admin/jobs/[id]/force-state.post.ts` — new. Allowed
  transition whitelist exactly matches plan A1: `succeeded→failed`,
  `failed→succeeded`, `failed→created`, `created→expired`, `paid→expired`
  (the last pushes `warnings: ["consider running refund first"]` into the
  response). Rejects 422 `invalid_transition` + returns the allowed list.
  Optimistic lock: `UPDATE ... WHERE id=$1 AND status=$from`; 0 rows → 409
  `stale_state`. UPDATE + audit in one tx.
- `app/server/api/admin/jobs/[id]/re-run.post.ts` — new. Mirrors
  `api/jobs/[id]/resync.post.ts` for the ConvertPayload shape (same
  `input_path`/`output_dir` construction from `/data/jobs/{id}`). Admin
  override: resets `progressStage='queued'`, `progressPct=0`, does NOT touch
  `deltaSyncsUsed`. UPDATE + audit committed first, `publishConvert` runs
  AFTER commit — the failure mode "row reset but nothing queued" is trivially
  re-clickable; the inverse (queued but no audit) would be worse. 409
  `upload_missing` if `uploadDiskFilename` is null.
- `app/server/api/admin/jobs/[id]/index.delete.ts` — new. Paid-job guard
  first: any succeeded payment → 409 `paid_job_must_refund_first` (per plan
  decision A2, admin must refund before delete; delete is not a refund).
  `fs.rm({recursive:true, force:true})` against `/data/jobs/{id}` is
  non-fatal — cause-only log, orphan dir handled by future cleanup cron. Tx
  UPDATEs jobs to `status='expired'`, nulls `uploadFilename`,
  `uploadDiskFilename`, `billingEmail`, `mappingResult`, `discoveryResult`,
  and sets `anonymousAccessToken='[deleted]'` — row kept for audit linkage;
  `payments` rows untouched (legal retention). Audit row inserted in the same
  tx.

## Acceptance Criteria Check
- [x] 6 new files, exact paths as spec'd. No shared util changes, no schema changes, no touching of `[id].get.ts` or other existing handlers.
- [x] Every mutation wraps UPDATE + `admin_audit_log` INSERT in `db.transaction(...)` — stricter than Wave A's best-effort pattern.
- [x] Refund uses Stripe idempotency key `refund_{paymentId}_{amount}` and runs the Stripe call outside the DB tx.
- [x] `extend-syncs` uses atomic SQL increment via parameterised `sql` template (no read-modify-write race).
- [x] `force-state` transition whitelist matches plan A1 exactly; optimistic lock rejects stale state as 409.
- [x] `re-run` does NOT increment `deltaSyncsUsed`.
- [x] `DELETE` has explicit paid-job guard → 409 before any destructive work.
- [x] `resend-download` re-uses the `docs/emails-copy.md` §3 Romanian conversion-ready copy inline.

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template — used only in `extend-syncs` for the atomic increment, with Drizzle column refs).
- [x] Every mutation endpoint is CSRF-protected — `app/server/middleware/csrf.ts:18` enforces POST/PUT/PATCH/DELETE and none of these routes are under `/api/webhooks/`.
- [x] Every job endpoint calls `assertJobAccess` — N/A. These are admin routes. Job-access is not the right guard; admin auth is.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — middleware `app/server/middleware/admin-auth.ts` enforces the session; each handler additionally calls `getAdminSession(event)` defensively and inserts an audit row (synchronously, inside the mutation tx).
- [x] All inputs Zod-validated (body + params; no query params used). 400 on failure via `readValidatedBody` / `getValidatedRouterParams`.
- [x] No PII in logs — cause-only `console.warn`/`console.error` with `name` fields. No emails, no file contents, no reason text logged.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — admin cookie set once in `auth-admin.ts:createAdminSession` with `httpOnly, secure, sameSite:'lax'`; these handlers don't touch cookies.
- [x] Rate limits applied where the task spec requires — no rate limits specified for these admin actions in the task / PLAN / S.10.

## Notes for Reviewer / Orchestrator
- **Typecheck:** could not run `npx nuxi typecheck` in this worktree (Bash-level permission restrictions in the sandbox). `npm install --ignore-scripts` had completed successfully but the subsequent typecheck invocation was blocked. Please run typecheck before merging.
- **Salvage status:** branch is `job/phase2-nuxt/api-admin-wave-b-jobs-actions`; 6 files staged, awaiting commit.
- **Commit message to use:** `feat(admin): jobs actions — refund + extend-syncs + resend-download + force-state + re-run + delete`.
- **ConvertPayload import:** `re-run.post.ts` uses `~/server/types/queue` — matches the Nuxt `~` alias used in other admin handlers.
- **`paid` status in force-state:** the transitions enum accepts `paid` as both a source and target via the shared `STATUSES` tuple, but only `paid→expired` is whitelisted. All other `paid` transitions reject at the whitelist step.
- **Refund post-Stripe DB failure:** response returns 500 with `stripeRefundId` so the operator can reconcile. Next admin click would 409 on `already_fully_refunded` once the payments row is manually updated. If Dani wants auto-recovery (a retry tx), that's a follow-up.
