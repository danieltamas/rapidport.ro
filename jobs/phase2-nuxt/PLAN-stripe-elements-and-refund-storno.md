# PLAN — Stripe Elements (close green path) + eFactura-aware refund → SmartBill reversal

**Author:** orchestrator | **Date:** 2026-04-20 | **Status:** awaiting Dani's approval

CLAUDE.md flags Stripe and SmartBill integration as risky — this plan covers both in one place because Dani grouped them and they share the same end-to-end flow.

Two parts, independent enough to ship sequentially but reviewed together:

- **Part A** — mount Stripe Elements on `/job/[id]/pay` so users can actually pay. The server-side `POST /api/jobs/[id]/pay` already creates a PaymentIntent and returns `clientSecret`; the client UI is the only missing piece.
- **Part B** — 4-hour-aware refund: on admin refund, also reverse the SmartBill invoice (pre-SPV = delete; post-SPV = storno/creditNote). Current `/api/admin/jobs/[id]/refund` only refunds Stripe and updates `payments.refundedAmount` — SmartBill is untouched.

---

## Ground truth from the existing code + SPEC

- `SPEC.md §Invoicing — Stripe + SmartBill Auto-Link` mandates **Stripe Elements** (line 728), SmartBill call on webhook success, and "Admin clicks refund → Stripe refund API → on success, SmartBill storno". That's the contract.
- `app/server/api/jobs/[id]/pay.post.ts` already returns `{ clientSecret, amount, currency }` and handles idempotent re-clicks. Nothing server-side to add for Part A.
- `app/server/api/webhooks/stripe.post.ts` marks the payment succeeded + queues the worker + sends the confirmation email. It intentionally **does not** call SmartBill — that's done by `runSmartBillInvoiceSweep` (cron, every 5 min). SPEC says "Call SmartBill API" on webhook; the existing async-via-sweep approach is functionally equivalent and keeps the webhook fast. No change proposed here.
- `app/server/utils/smartbill.ts` exposes `createInvoice` only. No cancel/storno primitives yet. We'll add them.
- `app/server/api/admin/jobs/[id]/refund.post.ts` does Stripe refund + `payments.refundedAmount` bump + audit. It does **not** touch SmartBill. That's the Part-B gap.
- `app/pages/job/[id]/pay.vue` has the billing form + ANAF lookup + a disabled-looking "Pay" CTA but no card entry.

Dani's guidance re: the 4h cutoff + Lexito reference:
- Lexito's `cancelInvoice` just calls `DELETE /invoice` on SmartBill, logs the error if SmartBill rejects, and keeps going. It does **not** fall back to a storno API call. The effect is that if the invoice is already at ANAF, Lexito's DB marks the invoice as stornoed but SmartBill / ANAF still see it live — that's a real bug in Lexito's fiscal consistency. Rapidport must do better: we need to actually call SmartBill's storno/reverse endpoint when the invoice is past the 4h auto-submit cutoff.

---

## Part A — Stripe Elements

### Files touched

- `app/pages/job/[id]/pay.vue` — add PaymentElement mount + confirm flow (~80 LoC net).
- `nuxt.config.ts` — expose `stripePublishableKey` under `runtimeConfig.public` (1-line addition).
- `app/server/utils/env.ts` — already validates `STRIPE_PUBLISHABLE_KEY`; no change.
- `app/package.json` — add `@stripe/stripe-js` dependency (no Vue wrapper needed — their plain-JS API is fine and one fewer abstraction to debug).

### Flow

1. User fills the existing PJ/PF billing form. ANAF lookup auto-populates company fields (unchanged).
2. On the "Continuă la plată" step, the page calls `POST /api/jobs/[id]/pay` (which it already does). Response: `{ clientSecret, amount, currency }`.
3. **NEW:** once `clientSecret` is in hand, mount Stripe Elements:
   ```ts
   const stripe = await loadStripe(config.public.stripePublishableKey)
   const elements = stripe!.elements({
     clientSecret,
     appearance: { theme: 'flat', /* map to rapidport tokens */ },
     locale: 'ro',
   })
   const paymentElement = elements.create('payment', { layout: 'tabs' })
   paymentElement.mount('#payment-element')
   ```
4. New "Plătește 604 RON" button calls `stripe.confirmPayment({ elements, confirmParams: { return_url: `${origin}/job/[id]/pay?confirmed=1` } })`.
5. After the redirect-back, the page reads `?confirmed=1 + ?payment_intent + ?payment_intent_client_secret` from the URL, calls `stripe.retrievePaymentIntent(clientSecret)` to read the final status, and:
   - `succeeded` → `navigateTo('/job/[id]/status')` (SSE polls + eventually offers the download).
   - `processing` → show "Plata este în curs de procesare" + let the webhook flip the DB state (page auto-polls status every 2s until success or timeout).
   - `requires_payment_method` → friendly RO error, let the user re-enter card details.
   - Other states → generic RO error with a reference code (the intent id short form).

### UI detail

- Keep the current two-column layout. In the **right column** (summary / CTA), below the price breakdown, insert:
  - `<div id="payment-element" class="mt-5" />` — Stripe mounts here.
  - A single CTA that says "Plătește 604 RON" and calls the confirm flow.
  - A thin "Powered by Stripe · 3D Secure" line (monospace, muted).
- Error states inline, Romanian, no stack traces. Loader on the button during confirm.

### SSR / hydration caveats

- `@stripe/stripe-js` must not be imported at the top level (it touches `window`). Use `const { loadStripe } = await import('@stripe/stripe-js')` inside a client-only `onMounted`.
- The PaymentElement needs a non-zero-height container at mount time → ensure the column has a min-height or we mount inside a `<ClientOnly>` guard.
- `nuxt.config.ts` CSP must allowlist `js.stripe.com` for `script-src`, `api.stripe.com` for `connect-src`, `m.stripe.network` for `frame-src`, and the Stripe Elements iframe domains. SPEC §S.1 already mentions `js.stripe.com`; we'll re-verify during impl.

### Dev smoke (before shipping)

- Swap `.env` to **test** Stripe keys (`sk_test_...` + `pk_test_...` + a test-mode webhook secret). Dani's current LIVE keys stay uncommitted; the auto-memory rule applies.
- `stripe listen --forward-to https://rapidport.ro/api/webhooks/stripe` (via Cloudflare tunnel) so webhook fires locally.
- Pay with `4242 4242 4242 4242` (Visa), confirm the webhook hits, check `payments.status='succeeded'`, `jobs.status='paid'`, worker picks up, email fires.

### Out of scope for Part A

- Apple Pay / Google Pay via Stripe's `paymentRequest` — Elements will render them automatically if the browser supports them; no extra integration code.
- Saved cards / customer reuse — Rapidport is per-job one-off, no customer-vault needed in v1.

---

## Part B — Refund → SmartBill reversal (eFactura-aware)

### Terminology

- **Cancel** = SmartBill `DELETE /invoice?cif&seriesname&number`. Allowed while the invoice is not yet at ANAF SPV. Outcome: invoice is gone, no SPV trace, no storno document.
- **Storno / Reverse** = SmartBill creates a creditNote (factura storno) with negative amounts referencing the original. Required after the invoice is at ANAF. SmartBill then auto-submits the creditNote to SPV too.
- Dani's SmartBill account is configured to auto-submit PJ invoices to SPV **4 hours after creation**. That's the cutoff we care about.

### Decision rule

Given that Dani's account is deterministic about 4h:

```
if payment.smartbill_invoice_id is null:
    # Sweep hadn't run yet — no invoice to reverse. Just refund Stripe.
    nothing-to-reverse

elif age(payment.smartbill_issued_at) < 4h:
    try: cancelInvoice(series, number)
    on 4xx 'already_submitted': fall-through to storno  # SmartBill's word is authoritative

else:  # >= 4h
    stornoInvoice({ seriesName, number })
```

A belt-and-suspenders variant: **query SmartBill first** via `getEfacturaStatus(series, number)`. If `pending` → cancel; if `validated|submitted` → storno. Extra 1 API call per refund. Given refunds are admin-initiated and rare, I recommend the query-first approach — it's authoritative, doesn't rely on the 4h timer being exact, and survives any account-config drift.

**My default: query-first, with a 4h fallback if the status call errors out.** Locks in behaviour even if SmartBill changes the auto-submit schedule.

### Files touched

- `app/server/utils/smartbill.ts` — add `cancelInvoice`, `reverseInvoice`, `getEfacturaStatus`. ~80 LoC net.
- `app/server/api/admin/jobs/[id]/refund.post.ts` — extend with the reversal step after Stripe succeeds. ~60 LoC net.
- `app/server/db/schema/payments.ts` — new columns (see migration below).
- `app/drizzle/0006_payments_reversal.sql` — new migration.
- `app/pages/admin/jobs/[id].vue` — render the new reversal fields if present (existing UI shows payment stats; we add a small "Invoice reversal" line).

### Schema additions

New nullable columns on `payments` (migration 0006):

```sql
ALTER TABLE payments
  ADD COLUMN smartbill_issued_at      timestamptz,      -- stamped when sweep issues the invoice
  ADD COLUMN smartbill_canceled_at    timestamptz,      -- set when we DELETE the invoice (< 4h path)
  ADD COLUMN smartbill_storno_invoice_id text,          -- e.g. "RAPIDPORT-STRN-2026-0007"
  ADD COLUMN smartbill_storno_invoice_url text,
  ADD COLUMN smartbill_stornoed_at    timestamptz;      -- set when storno creditNote is issued (>= 4h path)
```

`smartbill_issued_at` is load-bearing for the 4h check — currently the sweep doesn't stamp when it issued the invoice. We'll have the sweep start stamping it on success. Existing rows with `smartbill_invoice_id` but no `smartbill_issued_at` degrade gracefully to "assume stornoed path" (safer default than "assume cancel path", because a failed cancel on a submitted invoice is the worse error).

### SmartBill client additions (pseudocode)

```ts
// DELETE /invoice?cif=...&seriesname=...&number=...
export async function cancelInvoice(series: string, number: string): Promise<void>

// POST /invoice/reverse with body { companyVatCode, seriesName, number, issueDate }
// → returns { series, number, url }  of the new STORNO invoice
export async function reverseInvoice(series: string, number: string, issueDate: string):
  Promise<{ number: string; series: string; url: string | null }>

// GET /invoice/paymentstatus?cif&seriesname&number
// → returns { status: 'pending' | 'validated' | 'rejected', efacturaId? }
export async function getEfacturaStatus(series: string, number: string):
  Promise<{ status: 'pending' | 'validated' | 'rejected'; efacturaId?: string }>
```

Exact endpoint paths + payload shapes to be re-verified against SmartBill's current docs at implementation time. `cancelInvoice` endpoint shape is confirmed via Lexito's production code; `reverseInvoice` endpoint needs confirmation (SmartBill has historically shipped `POST /invoice/reverse` — must verify). If the endpoint shape differs, impl stops and asks before shipping.

### Refund handler flow (refund.post.ts)

Current flow:

```
1. Validate. 2. Admin check. 3. Look up succeeded payment. 4. Compute amount.
5. stripe.refunds.create(). 6. TX: update payments + audit.
```

New flow:

```
1-5. (unchanged)
6. Look up smartbill_invoice_id + smartbill_issued_at from payments.
7. If no invoice yet → jump to 10 with reversalKind='none'.
8. Call getEfacturaStatus(series, number).
   - pending (or API errors AND hoursSince < 4) → reversalKind='cancel'
   - validated/submitted (or API errors AND hoursSince >= 4) → reversalKind='storno'
   - rejected → reversalKind='none' (original was never valid at ANAF — no reversal needed, just a note for audit)
9. Depending on reversalKind:
   - cancel: await cancelInvoice(series, number). On 4xx 'already_submitted' → escalate to storno.
   - storno: await reverseInvoice(series, number, today). Capture new number/url.
   - none: skip.
10. TX: update payments.refundedAmount + refundedAt + (canceled_at OR storno_invoice_id + stornoed_at). INSERT admin_audit_log.
11. Return { ok, refundId, amount, refundedTotal, reversal: { kind, invoiceId?, invoiceUrl? } }.
```

Important: SmartBill calls are **outside the DB tx** for the same reason the Stripe refund is (external side-effects don't roll back). If SmartBill succeeds but the DB tx fails, we log loudly — admin must reconcile. Unlike Stripe, SmartBill double-action is harmless: a second refund click sees `smartbill_canceled_at IS NOT NULL` or `smartbill_storno_invoice_id IS NOT NULL` and short-circuits.

### Partial refunds

This is the one design decision that needs Dani's call:

- Stripe allows partial refunds. `POST /api/admin/jobs/[id]/refund` already supports `{ amount }` on the body schema.
- SmartBill fiscal rules: a storno is typically full-reverse of the original, not a partial. Romanian fiscal law permits a partial creditNote (e.g. one line stornoed), but for a single-line-item invoice (our case), partial makes little fiscal sense.

Three options:

- **D1 (simplest, recommended):** partial Stripe refunds are allowed, but **SmartBill is only reversed on a full refund**. Partial refunds set `payments.refundedAmount` + note in audit "partial; SmartBill untouched". The original invoice remains valid at ANAF for the full amount; partial refunds are handled at the admin's discretion and left fiscally asymmetric. Low engineering, real-world acceptable for small B2B SaaS where partials are rare.
- **D2 (strictest):** partial refunds always issue a full storno on SmartBill + immediately issue a new (reduced) invoice. Complex, requires customer to accept new invoice. Not recommended for v1.
- **D3 (disallow):** refund endpoint refuses `amount < remaining`. Admin can only full-refund. Cleanest fiscally but loses operational flexibility.

**My default: D1.**

### Admin UI additions

On `/admin/jobs/[id]` (refund dialog):
- After submit, success message shows `"Refunded 604 RON. SmartBill: <kind>."` where kind is "canceled", "storno #RAPIDPORT-STRN-...", or "none".
- The payment card gains two small fields when relevant: "Canceled at: <ts>" or "Storno: <number> [link]".

---

## Required Dani decisions

- **D1 / D2 / D3** — partial refund SmartBill policy (see above). Default: D1.
- **SBA:** `POST /invoice/reverse` endpoint shape — to be re-verified against SmartBill's current docs at impl. If SmartBill's endpoint name or payload differs materially, impl stops and asks.
- **SBB:** `smartbill_issued_at` backfill — we don't stamp it today. For existing `smartbill_invoice_id != null` rows that predate migration 0006, we default to "assume stornoed path" (safer). Alternative: backfill from `payments.created_at + 5 min` assuming sweep ran within one cycle; that's a heuristic, reject if you want strictness.
- **SBC:** Query-first vs. time-only decision for cancel-vs-storno. Default: query-first, with 4h fallback on API error. Cheaper alternative: time-only, 1 fewer API call per refund.

---

## Estimate

| Chunk | LoC | Risk |
|---|---|---|
| Part A — Stripe Elements | ~80 client + ~5 config + 1 dep | Medium — needs live browser test; touches money flow but server already complete |
| Part B.1 — smartbill.ts primitives | ~80 | Low — mirrors createInvoice pattern |
| Part B.2 — refund.post.ts rework | ~60 | Medium — external side-effects ordering matters |
| Part B.3 — migration 0006 + schema | ~15 + ~5 | Low |
| Part B.4 — sweep stamps smartbill_issued_at | ~2 | Low |
| Part B.5 — admin UI reversal display | ~30 | Low |

**Total:** ~280 LoC + 1 migration + 1 dependency.

## Test plan

- **A1:** Stripe test keys swap. Fire a $test charge end-to-end with `stripe listen`. Verify: webhook hits, `payments.status='succeeded'`, `jobs.status='paid'`, worker picks up, email fires.
- **A2:** 3DS test card (`4000 0027 6000 3184`) — verify `return_url` round-trip + auto-confirm after OTP.
- **A3:** Network error mid-confirm — verify friendly RO error + no orphaned payment.
- **B1:** Dev stub: with `isSmartBillConfigured() === false`, refund endpoint returns `reversalKind='none'` without trying SmartBill. Tested today already via unit of the sweep.
- **B2:** Live SmartBill (impl time): create a test invoice via sweep, wait <4h, trigger refund → verify cancel path + smartbill_canceled_at set.
- **B3:** Live SmartBill, >4h scenario: create an invoice, manually stamp `smartbill_issued_at` to 5h ago, refund → verify storno path + smartbill_storno_invoice_id + url set + URL resolves.
- **B4:** Partial refund (if D1 chosen) → verify SmartBill is NOT touched, audit row notes "partial".
- **B5:** Double-refund click: second click sees storno/cancel already done, short-circuits.

## Ordering / branching

Single job `phase2-greenpath`, two groups:
- `job/phase2-greenpath/elements` — Part A (3 small tasks: dep + config + pay.vue)
- `job/phase2-greenpath/refund-reversal` — Part B (5 small tasks: migration, smartbill primitives, refund handler, sweep stamp, admin UI)

Part A ships first (users can actually pay). Part B ships second (admin can properly refund). Part B has a plan-gate if SmartBill's `reverseInvoice` endpoint shape requires clarification.

## What this plan explicitly does NOT do

- Apple Pay / Google Pay explicit integration beyond what Elements auto-provides.
- Saved payment methods / customer reuse.
- Dashboard-initiated "re-issue invoice" button (already a deferred TODO in docs).
- sync-complete email's `is_resync` flag (separate tracking in HANDOFF Priority 2.5).
- SmartBill webhook receiver (still deferred per PLAN-smartbill-client SB4).
