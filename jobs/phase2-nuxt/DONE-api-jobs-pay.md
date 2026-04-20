# Completed: POST /api/jobs/[id]/pay — Stripe PaymentIntent creation

**Task:** api-jobs-pay.md | **Status:** done | **Date:** 2026-04-20
**Branch:** `job/phase2-nuxt/api-jobs-4b-pay` (off `job/phase2-nuxt/api-jobs-4b`)
**Worktree:** `/Users/danime/Sites/rapidport.ro/app/.claude/worktrees/agent-a73572db`

## Changes Made

- `app/server/api/jobs/[id]/pay.post.ts` — NEW single-file handler.
  - Validates UUID path param with Zod, then `assertJobAccess(id, event)` FIRST.
  - State guard: only allows payment if `job.status === 'mapped'` OR `job.progressStage === 'reviewing'`; otherwise 409 `not_ready_for_payment`.
  - Body Zod schema `{ billingEmail?: string.email().max(255) }` (strict). Persists to `jobs.billingEmail` via Drizzle when supplied and changed.
  - Idempotent re-click: queries `payments` for a row with the same `jobId` and `status != 'failed'`; if found with a `stripePaymentIntentId`, retrieves that intent from Stripe and returns its refreshed `client_secret` instead of creating a new intent. Falls through to create a new intent only if no existing row — still dedup'd by Stripe via `jobPaymentIdempotencyKey(id)`.
  - Stripe call uses the shared `stripe` client + `jobPaymentIdempotencyKey(id)` helper from `~/server/utils/stripe`. Amount `60400` bani, currency `'ron'`, `metadata: { jobId: id }`, `automatic_payment_methods: { enabled: true }`.
  - Inserts `payments` row only on first success (no duplicate rows on re-click).
  - Returns ONLY `{ clientSecret, amount, currency }` — never the full intent, no metadata, no email.

## Pricing (v1 flat)

Defined inline as constants in the handler for auditability:
- `PRICE_NO_VAT_RON = 499`
- `VAT_RON = round(499 * 0.21) = 105`
- `TOTAL_RON = 604`
- `AMOUNT_BANI = 60400`
- `CURRENCY = 'ron'`

No delta-sync add-on pricing in v1 (SPEC §S.10 — 3 syncs included with base price).

## Acceptance Criteria Check

- [x] Handler exists at `app/server/api/jobs/[id]/pay.post.ts` (single file, new).
- [x] UUID path param Zod-validated.
- [x] `assertJobAccess` called first, before any other logic.
- [x] State guard: rejects 409 `not_ready_for_payment` unless `status='mapped'` or `progressStage='reviewing'`.
- [x] Idempotent against re-clicks: existing non-failed `payments` row → retrieve + reuse `client_secret`.
- [x] Optional `billingEmail` in body (Zod, strict); persisted to `jobs.billingEmail` via Drizzle when provided.
- [x] Uses shared `stripe` client + `jobPaymentIdempotencyKey(id)` helper.
- [x] Stripe intent uses `automatic_payment_methods: { enabled: true }`, currency `'ron'`, amount `60400`, `metadata: { jobId: id }`.
- [x] `payments` row written via Drizzle on first success (jobId, stripePaymentIntentId, amount, currency, status).
- [x] Response is `{ clientSecret, amount, currency }` only — no full intent, no metadata.
- [x] No schema extension (used existing columns only).

## Security Check

- [x] All DB access goes through Drizzle (select/insert/update on `jobs` + `payments`). No raw SQL.
- [x] CSRF: mutation endpoint protected globally by `server/middleware/csrf.ts` (no bypass).
- [x] `assertJobAccess(jobId, event)` called FIRST, before any side effect.
- [x] Not an admin endpoint — admin session still works transparently via `assertJobAccess` (audit row emitted there).
- [x] All inputs Zod-validated (path param `id` + optional body `billingEmail`). 400 on invalid body.
- [x] No PII in logs (no `console.log` at all; email/intent/card never logged).
- [x] Session cookies untouched (no cookie manipulation in this handler).
- [x] Rate limits: SPEC §S.10 does not list `POST /api/jobs/[id]/pay` among the rate-limited routes; rate limiting is centralized in `middleware/rate-limit.ts` — no wiring in handler. Stripe's own idempotency key protects against replay.
- [x] Only `clientSecret` + amount + currency returned; never the full intent, never metadata.

## Validation

- Typecheck: **NOT executed** — Bash permissions denied in this worker sandbox for `npm install`, `npx nuxi typecheck`, and `ln -s`. Per task spec's "Salvage authorization", file written via Write only. Orchestrator must run `cd app && npx nuxi typecheck` from a Bash-enabled context.
- Static review of handler against imported types: imports match existing handlers (`discover.post.ts`, `index.post.ts`). Schema columns all exist with matching types (`payments.amount: integer`, `payments.currency: text`, `payments.status: text`, `payments.jobId: uuid`, `payments.stripePaymentIntentId: text.unique()`; `jobs.billingEmail: text`). Drizzle `and`/`eq`/`ne` all exported from `drizzle-orm`. Stripe SDK `paymentIntents.create` signature matches `(params, { idempotencyKey })`. `intent.status` is a string union assignable to `text`.

## Blockers for orchestrator

- Run `cd app && npx nuxi typecheck` from a Bash-enabled shell to confirm EXIT=0.
- Commit message: `feat(api): POST /api/jobs/[id]/pay — Stripe PaymentIntent w/ idempotency`.
- Do NOT run any end-to-end payment test against `.env` until Dani explicitly swaps to Stripe test keys — current `.env` has LIVE keys.

## Files Created

- `app/server/api/jobs/[id]/pay.post.ts`
- `jobs/phase2-nuxt/DONE-api-jobs-pay.md` (this file)
