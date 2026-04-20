# Completed: eFactura-aware refund → SmartBill reversal (Part B)

**Task:** `jobs/phase2-nuxt/PLAN-stripe-elements-and-refund-storno.md` Part B | **Status:** done | **Date:** 2026-04-20

Implements plan decisions:
- **D3** — disallow partial refunds (endpoint rejects `amount`)
- **SBA** — `POST /invoice/reverse` endpoint shape inferred from SmartBill docs (see caveat)
- **SBB** — pre-0006 rows with null `smartbill_issued_at` → default to storno path
- **SBC** — query eFactura status first; 4h timer as fallback on unknown

## Changes Made

### DB
- `app/server/db/schema/payments.ts` — added 5 columns:
  - `smartbill_issued_at timestamptz` — stamped by the sweep on successful issue
  - `smartbill_canceled_at timestamptz` — set when DELETE /invoice succeeded
  - `smartbill_storno_invoice_id text` — new storno invoice number
  - `smartbill_storno_invoice_url text` — new storno invoice URL
  - `smartbill_stornoed_at timestamptz` — set when POST /invoice/reverse succeeded
- `app/drizzle/0006_huge_gressill.sql` — generated + applied.

### SmartBill client (`app/server/utils/smartbill.ts`)
- Refactored the per-endpoint inline fetch into a shared `sbFetch(method, path, opts)` helper — same retry (3x exp backoff on 5xx/network), same error taxonomy, same errorText-in-200 handling. `createInvoice` now uses it too.
- **New primitives:**
  - `cancelInvoice(series, number)` — `DELETE /invoice?cif&seriesname&number`. Pre-SPV delete.
  - `reverseInvoice(series, number)` — `POST /invoice/reverse` with `{ companyVatCode, seriesName, number, issueDate, useEFactura: true }`. Returns `{ number, series, url }` of the new storno. **Endpoint shape inferred from SmartBill docs; no production reference** (Lexito doesn't call it). Plan marked this as verify-at-first-real-use.
  - `getEfacturaStatus(series, number)` — `GET /invoice/paymentstatus`, maps `efacturaStatus` field to one of `pending | validated | rejected | unknown`. Advisor-driven fix: `submitted` normalizes to `validated` (it means "at SPV, awaiting ANAF validation" — past the cancel window).
- `splitInvoiceId(invoiceId)` — helper that parses `"RAPIDPORT-0042"` into `{ series: 'RAPIDPORT', number: '0042' }`. Falls back to bare number + configured SMARTBILL_SERIES for legacy rows.

### Sweep (`schedule-tasks/smartbill-invoice-sweep.ts`)
- On successful `createInvoice`, stamp `smartbill_issued_at = now()`. Load-bearing for the 4h fallback in the refund handler.

### Refund handler (`app/server/api/admin/jobs/[id]/refund.post.ts`)
- Full rewrite. Body schema: `{ reason }` only (no `amount` — D3). `z.never().optional()` on amount so older clients that still pass it get a clean 400.
- Flow:
  1. Find succeeded payment. `remaining = amount - refundedAmount`. Reject if `remaining <= 0`.
  2. Stripe refund for the full remaining, outside any tx. Idempotency key `refund_{paymentId}_{amount}`.
  3. SmartBill reversal (if invoice exists + SmartBill is configured + not-already-reversed):
     - `decideReversal`: query `getEfacturaStatus`. `pending` → cancel, `validated` → storno, `rejected` → cancel (clean up local), `unknown` → 4h timer (age < 4h = cancel, else = storno; null issuedAt defaults to storno per SBB).
     - `executeReversal`: call the matching primitive. If cancel errors with `validation` (race — SmartBill just submitted to SPV), upgrade to storno via `reverseInvoice`. Record note `cancel_upgraded_to_storno`.
     - On any other reversal error: catch, record `reversal_failed_{kind}` note; Stripe has already refunded.
  4. **Idempotency guard:** if `smartbill_canceled_at` or `smartbill_storno_invoice_id` is already set, skip reversal entirely (handles post-tx-failure retry).
  5. DB tx: update payments (refundedAmount / refundedAt / canceled_at OR storno_invoice_id + url + stornoed_at) + insert admin_audit_log row with structured details.
  6. Response: `{ ok, refundId, amount, refundedTotal, reversal: { kind, invoiceId?, invoiceUrl?, note? } }`.
- DB-tx-after-externals failure path: logs `refund_db_failed_after_external` and throws 500 with `refund_db_reconcile_required` — admin must fix manually. Same defensive posture as the prior version, now covering reversal state too.

### Admin UI (`app/pages/admin/jobs/[id].vue`)
- Payment type extended with the new smartbill_* fields.
- Refund dialog: removed the amount input + helper text. New copy: "Full refund of 604 RON. SmartBill invoice is reversed automatically — cancelled if still pre-SPV, stornoed if already at ANAF."
- Payments table: new "SmartBill" column shows the invoice id (linked to `smartbill_invoice_url` if present), a `CANCELLED` badge when `smartbill_canceled_at` is set, and a `storno: <id>` sub-row when a reversal invoice exists.
- **Partial-success banner:** when the refund response comes back with `reversal.note` starting with `reversal_failed_`, the dialog stays open with an amber banner telling the admin Stripe refunded but SmartBill must be fixed manually. No more silent discovery in audit log.

## Acceptance Criteria Check

- [x] Migration 0006 adds the 5 reversal columns and applies cleanly
- [x] `smartbill.ts` gains `cancelInvoice`, `reverseInvoice`, `getEfacturaStatus`, `splitInvoiceId`
- [x] Sweep stamps `smartbill_issued_at` on success
- [x] Refund endpoint does full-only refunds and rejects `amount` in the body
- [x] Query-first cancel-vs-storno decision with 4h fallback on unknown
- [x] Cancel → storno auto-upgrade on validation rejection
- [x] Pre-0006 rows (null issuedAt) default to storno path (SBB)
- [x] `rejected` → cancel (keeps SmartBill + DB aligned with ANAF)
- [x] `submitted` → validated (past cancel window, routed to storno directly)
- [x] Reversal idempotency: already-reversed row short-circuits on re-click
- [x] Admin UI: dialog copy updated; payments table shows SmartBill invoice + reversal state; partial-success banner when reversal fails after Stripe refund

## Security Check

- [x] All DB access goes through Drizzle — yes, `db.select()`, `db.update()`, `db.transaction()`. No raw SQL.
- [x] Every mutation endpoint is CSRF-protected — unchanged; `POST /api/admin/jobs/[id]/refund` goes through middleware.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — yes. `getAdminSession` check first; audit row inserted inside the same DB tx as the payment update so the two either both succeed or both fail.
- [x] All inputs Zod-validated — body is `{ reason: z.string().min(5).max(500) }`, amount explicitly rejected via `z.never().optional()`.
- [x] No PII in logs — `console.error('refund_db_failed_after_external', ...)` only logs IDs + error name; no email/card/name. SmartBill errors carry `kind` + `status`, not raw response bodies.
- [x] Session cookies unchanged.
- [x] Rate limits — admin endpoints are not rate-limited per SPEC §S.10.

## Caveats / Things Dani Should Verify At Live Run

- **SBA — `reverseInvoice` endpoint shape is unverified in production.** Lexito doesn't call it. Inferred as `POST /SBORO/api/invoice/reverse` with body `{ companyVatCode, seriesName, number, issueDate, useEFactura: true }` from SmartBill's docs as I know them. Before the first post-4h refund, test against SmartBill's current API. If the endpoint name or payload differs (e.g. `/invoice/creditNote`), fix `reverseInvoice` in `smartbill.ts` — the call site in `refund.post.ts` doesn't need to change.
- **First live refund** — be prepared for Stripe to succeed + SmartBill to 404/4xx. The audit log + amber banner will flag the issue; reconcile by issuing the storno manually in the SmartBill web UI, then stamp the DB row manually (or add a quick admin action to backfill `smartbill_storno_invoice_id`).
- **LIVE keys in `.env`.** Per the existing auto-memory rule, swap to test keys + `stripe listen` before end-to-end smoke.
- **nuxt-security CSP was updated in Part A.** Dani must restart rundev before pay.vue testing; no change in this branch but worth re-flagging.

## What this branch does NOT do

- Manual "re-issue SmartBill invoice" admin button (still deferred; worst-case recovery is manual-plus-DB-patch).
- SmartBill webhook receiver (deferred per PLAN-smartbill-client SB4).
- sync-complete email's `is_resync` flag (separate HANDOFF Priority 2.5).
