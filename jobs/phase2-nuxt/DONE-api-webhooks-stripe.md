# Completed: api-webhooks-stripe (Wave 4c)

**Task:** PLAN-api-webhooks-stripe.md | **Status:** done (single-agent: orchestrator implemented after Dani approved plan with sensible defaults) | **Date:** 2026-04-20

## Plan resolution

Dani's answers (committed as `740a758`):
1. **`payments` schema:** sweep later — no migration. Sweep filter: `status='succeeded' AND smartbill_invoice_id IS NULL`.
2. **Job state on payment:** `status='paid' + progressStage='queued'` ✓.
3. **Confirmation email:** skip until `email-templates` ships. TODO marker added in handler.
4. **Live exercise path:** Dani decides operationally; no code impact.

## Changes Made

- `app/server/api/webhooks/stripe.post.ts:1-160` — new file. POST `/api/webhooks/stripe`.
  - Reads raw body (Buffer). 400 on missing body or `stripe-signature` header.
  - `stripe.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET, 300)` — 5-min replay window. Verification failure → 400 with `stripe_webhook_verification_failed` log (only error name, never the signature header).
  - Dedup: `INSERT INTO stripe_events (id, type) ON CONFLICT DO NOTHING RETURNING id` — empty result returns `{ok, dedup:true}` 200.
  - Non-`payment_intent.succeeded` events return `{ok, ignored:true, type}` 200 — Stripe stops retrying.
  - For succeeded intents:
    - SELECT `payments` by `stripePaymentIntentId`. Unknown intent → 200 `unknown_intent` (not our charge). Already-succeeded → 200 `already_processed` (defensive idempotency for concurrent deliveries that bypassed the dedup row).
    - UPDATE `payments.status='succeeded'`.
    - UUID-validate `intent.metadata.jobId` via Zod. Missing/invalid → 200 `missing_jobId` log.
    - UPDATE `jobs` → `status='paid'`, `progressStage='queued'`, `progressPct=0`, `updatedAt=now`.
    - SELECT `uploadDiskFilename`. Missing → 200 `missing_upload` log (sweep cron recovery path).
    - `publishConvert({job_id, input_path: /data/jobs/{id}/upload/{diskName}, output_dir: /data/jobs/{id}/output, mapping_profile: null})`.
    - publishConvert wrapped in try/catch — failure logs `stripe_webhook_publish_failed` and still returns 200. Sweep cron is the recovery path (TODO observability).
  - Two TODO markers: payment-confirmed email + smartbill-client invoice issuance.

## Acceptance Criteria Check

- [x] HMAC signature verified via `stripe.webhooks.constructEvent`
- [x] 5-min replay window enforced (third arg to constructEvent)
- [x] Raw body used (`readRawBody(event, false)` → Buffer); never parsed JSON before verification
- [x] Dedup against `stripe_events.id` via INSERT ... ON CONFLICT DO NOTHING
- [x] `payment_intent.succeeded` side effects in this order: payments → jobs → publishConvert
- [x] Idempotent: replays / unknown-intent / missing-jobId / missing-upload all return 200 with structured ack flags so Stripe stops retrying
- [x] All DB access via Drizzle, no raw SQL
- [x] CSRF exempt automatically (route is under `/api/webhooks/`)
- [x] Webhook secret read via validated `env.STRIPE_WEBHOOK_SECRET`

## Security Check

- [x] All DB access goes through Drizzle (or parameterized `sql` template) — Drizzle, no raw SQL
- [x] Every mutation endpoint is CSRF-protected — N/A (webhook, exempted by middleware/csrf.ts; authenticated by HMAC)
- [x] Every job endpoint calls `assertJobAccess` — N/A (webhook, server-to-server)
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A
- [x] All inputs Zod-validated (body + query + params) — `intent.metadata.jobId` UUID-validated; raw body verified by Stripe SDK
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — only opaque IDs (event id, job id, payment id) and error names
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A
- [x] Rate limits applied where the task spec requires — not in SPEC §S.10's enumerated list (webhooks are protected by signature)

## Open follow-ups (flagged for next sessions)

- **`email-templates` task** must add `payment-confirmed.vue` and wire it from a callback in this handler. TODO marker in code.
- **`smartbill-client` task** (blocked on SPEC Q#3 invoice series name) should sweep `payments WHERE status='succeeded' AND smartbill_invoice_id IS NULL`. TODO marker in code.
- **observability/cron** task should add a sweep for `payments.status='succeeded'` jobs that have no pgboss `convert` row enqueued — recovery path for the rare case where `publishConvert` fails after the payments row is updated.

## Validation

`cd app && npx nuxi typecheck` → EXIT=0. Live webhook exercise blocked by Dani's LIVE-keys policy until explicit go.

## Branch + commit

Branch: `job/phase2-nuxt/api-webhooks-stripe` (off `main` — solo task, no group)
Commit: `feat(api): POST /api/webhooks/stripe — verified, dedup'd, idempotent`
