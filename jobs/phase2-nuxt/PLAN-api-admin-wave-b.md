# PLAN — api-admin Wave B

**Author:** orchestrator | **Date:** 2026-04-20 | **Status:** awaiting Dani's approval

CLAUDE.md flags admin mutations + delete + Stripe operations as risky. This plan covers all 4 Wave B task groups so Wave A's recovery rhythm doesn't have to repeat 8 more times.

Wave B = 4 worker tasks, ~14 endpoints total. All mutations: synchronous `admin_audit_log` write (NOT best-effort). All Stripe ops: idempotency keys. All destructive ops: require an explicit `reason` field captured in the audit row.

---

## Task 1 — `api-admin-jobs-actions` (~6 endpoints)

| Endpoint | Action | Notes |
|---|---|---|
| `POST /api/admin/jobs/[id]/refund` | Stripe refund | Body: `{amount?: number, reason: string}`. Default amount = full remaining (`amount - refundedAmount`). `stripe.refunds.create({payment_intent, amount?, reason: 'requested_by_customer'}, {idempotencyKey: 'refund_'+paymentId+'_'+amount})`. Update `payments.refundedAmount += amount`, `refundedAt=now`. Audit `action='job_refunded'`, details `{amount, reason, stripeRefundId}`. |
| `POST /api/admin/jobs/[id]/extend-syncs` | Bump `deltaSyncsAllowed` | Body: `{additional: number(1..20), reason: string}`. Atomic increment via `sql\`${jobs.deltaSyncsAllowed} + ${additional}\``. Audit `action='job_syncs_extended'`. |
| `POST /api/admin/jobs/[id]/resend-download` | Resend download link email | Recipient = `billingEmail` ?? user email. Inline RO email (one-shot — same template style as payment-confirmed; copy: "Linkul de descărcare pentru migrarea #{idShort}: {downloadUrl}"). Audit `action='download_link_resent'`. |
| `POST /api/admin/jobs/[id]/force-state` | Manually set `jobs.status` | Body: `{from: status, to: status, reason: string(min:5)}`. **Optimistic lock:** UPDATE WHERE status=from; if 0 rows → 409 stale. Allowed transitions documented in handler (no arbitrary jumps — e.g., can't force succeeded→created). Audit `action='job_force_state'`, details `{from, to, reason}`. |
| `POST /api/admin/jobs/[id]/re-run` | Re-publishConvert | Read schema for `uploadDiskFilename`; if missing → 409. Publish `ConvertPayload` same shape as `resync.post.ts`. Audit `action='job_rerun'`. Does NOT increment `deltaSyncsUsed` (admin override; that's a quota for the user, not a billing event for retries). |
| `DELETE /api/admin/jobs/[id]` | Purge job | Hard-delete: `rm -rf /data/jobs/{id}/`, then UPDATE jobs SET status='expired', upload_filename=null, upload_disk_filename=null, billing_email=null, mapping_result=null, discovery_result=null, anonymous_access_token='[deleted]'. Keep the row for audit linkage. Audit `action='job_deleted'`, details `{reason: body.reason}`. Does NOT touch payments (legal retention). |

**Files:** `app/server/api/admin/jobs/[id]/{refund,extend-syncs,resend-download,force-state,re-run,index.delete}.post.ts` (5 .post + 1 .delete = 6 files).

**Required Dani decisions:**
- A1: For `force-state`, which transitions are allowed? My default proposal: `succeeded ↔ failed`, `failed → created` (retry), `created → expired` (cancel before pay), `paid → expired` (cancel after pay — flagged as "should usually go via refund first"). Reject everything else.
- A2: For `delete`, do we also push a Stripe refund automatically if `payments.status='succeeded'` and not refunded? My default: NO — admin must call refund first if they want money returned; delete is not a refund. Cleaner audit trail.
- A3: For `resend-download`, since the conversion-ready email isn't wired to the worker yet, this is the only way an admin can fire it manually. Same template? Or a more generic "Aveți un mesaj de la Rapidport" wrapper? My default: re-use the conversion-ready copy from `docs/emails-copy.md`.

---

## Task 2 — `api-admin-users` (~5 endpoints)

| Endpoint | Action | Notes |
|---|---|---|
| `GET /api/admin/users` | Paginated list | Filters: `q?` (email substring), `state?: 'active'\|'blocked'\|'deleted'`, `page/pageSize/sort/order`. Returns `{rows, page, pageSize, total}`. Audit `users_list_viewed`. |
| `GET /api/admin/users/[id]` | Detail + linked data | `Promise.all` over user, jobs (count + last 10), payments (count + sum). `anonymousAccessToken` not in response (per-job tokens, irrelevant here). Audit `user_viewed`. |
| `POST /api/admin/users/[id]/grant-syncs` | Bump `jobs.deltaSyncsAllowed` for all of the user's jobs | Body: `{additional: number(1..20), reason: string}`. UPDATE jobs WHERE user_id=$1 SET delta_syncs_allowed = delta_syncs_allowed + $2. Audit `user_syncs_granted` with `{count_jobs_affected}`. |
| `POST /api/admin/users/[id]/block` | Block user | **Schema gap — see Decision B1.** Default plan: add a small migration `0004` adding `users.blocked_at timestamp` (nullable), separate from `deleted_at`. Block sets `blocked_at=now, reason=...`. Unblock clears it. The user-auth middleware would need to check `blocked_at IS NULL` — that's a separate small change to `auth-user.ts:getUserSession` (treat blocked-at-set as no-session). Audit `user_blocked` / `user_unblocked`. |
| `DELETE /api/admin/users/[id]` | GDPR purge | Same effect as `DELETE /api/me` — soft-delete user (set deletedAt), revoke sessions, burn magic-link tokens, delete mapping_profiles, null `audit_log.userId`. Body: `{reason: string}`. Audit `user_deleted` (NEVER purged from admin_audit_log). |

**Files:** `app/server/api/admin/users/{index.get,[id].get,[id]/grant-syncs.post,[id]/block.post,[id].delete}.ts` (5 files).

**Required Dani decisions:**
- B1: Block — add `users.blocked_at` column (migration 0004), or reuse `deletedAt` with a magic sentinel like setting deletedAt to a future date? My default: **add the column.** Cleaner separation. ~15 LoC migration + middleware adjustment.
- B2: Unblock — POST `/admin/users/[id]/unblock` (separate endpoint) or reuse `block` with a body flag? My default: separate endpoint. Symmetric, audits cleaner.
- B3: Delete — same code path as `DELETE /api/me`? Refactor `me/index.delete.ts` to extract a `purgeUserData(userId)` helper that both call? My default: yes — extract a helper to `app/server/utils/purge-user.ts`, both endpoints call it. Lower drift risk than re-implementing.

---

## Task 3 — `api-admin-ai` (~1 endpoint, multi-section response)

| Endpoint | Sections in response |
|---|---|
| `GET /api/admin/ai` | `trend30d` (daily token-in, token-out, cost USD over last 30 days, grouped by day) · `topUnmappedFields` (top N source fields with no `mapping_cache` row, derived from `audit_log` mapping events — if not feasible, document and ship empty array) · `lowConfidenceMappings` (mapping_cache rows where `confidence < 0.7`, top 50 by hitCount desc) |

Audit `ai_dashboard_viewed`. Read-only — no mutations.

**Required Dani decisions:**
- C1: `topUnmappedFields` requires either a fresh table or a derived query against `audit_log`/`mapping_cache`. Realistically the data isn't there yet — until the worker logs every mapping miss, this section is empty. **My default: ship the endpoint with `topUnmappedFields: []` + a code comment + a TODO in HANDOFF.md so a future task wires the worker side.** Acceptable?

---

## Task 4 — `api-admin-misc` (~5 endpoints under different paths)

| Endpoint | Action | Notes |
|---|---|---|
| `GET /api/admin/profiles` | List `mapping_profiles` | Paginated; filter `isPublic?` ; sort by adoptionCount. |
| `POST /api/admin/profiles/[id]/promote` | Set `isPublic=true` | Audit `profile_promoted`. |
| `POST /api/admin/profiles/[id]/hide` | Set `isPublic=false` | Audit `profile_hidden`. |
| `GET /api/admin/audit` | Paginated `admin_audit_log` read | Filters: `adminEmail?`, `action?`, `targetType?`, date range. Read-only; itself audited (`audit_log_viewed`) — meta but compliant. |
| `GET /api/admin/sessions` | List active `admin_sessions` | Marks current; admin email + ipHash + lastSeenAt. |
| `DELETE /api/admin/sessions/[id]` | Revoke an admin session | NOT the current one (admin can't lock themselves out — explicit reject if id matches their own). Audit `admin_session_revoked`. |

**Settings + errors deferred:**
- `GET /api/admin/settings` (env display redacted, maintenance toggles) → defer until we have env mutability needs. Currently env is boot-validated and immutable; nothing to display that isn't already in `.env.example`.
- `GET /api/admin/errors` (Sentry digest) → defer until the `observability-sentry` task lands. There's no error source to query.

**Files:** `app/server/api/admin/{profiles/index.get,profiles/[id]/promote.post,profiles/[id]/hide.post,audit/index.get,sessions/index.get,sessions/[id].delete}.ts` (6 files).

**Required Dani decisions:**
- D1: defer settings + errors until their dependencies exist? My default: **yes**, ship the 6 above and skip the 2 stubs. They'd be empty handlers anyway.

---

## Cross-cutting

**`admin_audit_log` policy for Wave B:**
- READS: best-effort (try/catch, never blocks). Wave A pattern.
- MUTATIONS: synchronous, transactional with the mutation. If audit insert fails, the mutation is rolled back. This is stricter than Wave A. Reason: every admin destructive op MUST have a paper trail; better to fail the request than to land a silent change.

**Idempotency:**
- Refund: idempotency key `refund_{paymentId}_{amount}` so repeated clicks don't double-refund.
- Re-run: no idempotency key on `publishConvert` (each click is a fresh job; admin discretion).

**Schema migration `0004` (only if Decision B1 = "add column"):**
- `ALTER TABLE users ADD COLUMN blocked_at timestamptz;`
- `ALTER TABLE users ADD COLUMN blocked_reason text;`
- + `auth-user.ts:getUserSession` returns null when `blocked_at IS NOT NULL`.

**Wave shape:**
- Wave B prep (orchestrator): if B1=add column, run the migration + helper extraction (`purge-user.ts`) in 1 commit before workers spawn.
- Wave B workers: 4 parallel — one per task. All file-disjoint. Each `~5-6` endpoints, larger than Wave A workers but still single-task scope.
- Worker harness flake budget: assume 1 of 4 needs orchestrator-direct salvage. Tracked as before.

---

## What I need from you to proceed

A1, A2, A3, B1, B2, B3, C1, D1.

If you say "sensible defaults," the defaults are: A1 = the proposed transition list, A2 = no auto-refund on delete, A3 = re-use conversion-ready copy, B1 = add column (migration 0004), B2 = separate unblock endpoint, B3 = extract helper, C1 = ship endpoint with empty `topUnmappedFields`, D1 = defer settings + errors.

Wave B will be ~14 endpoints + 1 migration + 1 helper extraction. Estimated 4 worker turns (similar duration to Wave A).
