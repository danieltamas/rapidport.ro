# PLAN — api-webhooks-stripe (Wave 4c)

**Author:** orchestrator | **Date:** 2026-04-20 | **Status:** awaiting Dani's approval

CLAUDE.md flags Stripe integration + webhook handlers as risky tasks requiring a written plan before code. This is that plan.

---

## Goal

Implement `POST /api/webhooks/stripe` so that when Stripe confirms a `payment_intent.succeeded`, we:

1. Verify the request was actually sent by Stripe (signature + replay window).
2. Dedup against re-deliveries.
3. Mark the job paid.
4. Hand the job off to the worker (`publishConvert`).
5. Send a confirmation email.
6. Trigger SmartBill invoice issuance.

End-to-end idempotent: replays MUST NOT charge twice, MUST NOT enqueue twice, MUST NOT email twice, MUST NOT issue duplicate invoices.

## Non-goals

- SmartBill invoice issuance proper — `app/server/utils/smartbill.ts` is not built. We will write a stub that logs `'smartbill_invoice_pending'` and returns. The full client is `smartbill-client` (still blocked on SPEC Q#3 invoice series). The webhook will record the intent in `payments.smartbillInvoicePending=true` (or whatever the schema column is — read schema first) so the back-fill task can sweep later.
- Refund webhooks (`charge.refunded` / `payment_intent.payment_failed`) — out of scope for v1; flagged for `pages-admin` refund flow.
- Stripe Connect, subscriptions, multi-currency.

## Files

- **NEW:** `app/server/api/webhooks/stripe.post.ts` — single handler.
- **NO** schema changes. Existing `payments` + `stripe_events` cover this. Read both schema files first to confirm column names; if a needed column is missing, STOP and re-plan.
- **NO** changes to shared utils. `utils/stripe.ts` already exposes `stripe`. `utils/queue.ts` already exposes `publishConvert`. `utils/email.ts` already exposes `sendEmail`.

## CSRF

`/api/webhooks/*` is exempt from CSRF middleware (already wired). Webhooks are authenticated by Stripe's HMAC signature, not our CSRF cookie.

## Handler shape (pseudocode)

```ts
export default defineEventHandler(async (event) => {
  // 1. Read raw body (NOT parsed JSON — signature is over the raw bytes).
  const rawBody = await readRawBody(event, false);
  if (!rawBody || !(rawBody instanceof Buffer)) throw 400;

  const sig = getHeader(event, 'stripe-signature');
  if (!sig) throw 400;

  // 2. Signature + replay window verification.
  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      env.STRIPE_WEBHOOK_SECRET,
      300, // 5-minute replay window (default)
    );
  } catch {
    throw 400; // never log the signature header content
  }

  // 3. Dedup. INSERT INTO stripe_events(id) ON CONFLICT DO NOTHING; if no row
  //    inserted, the event was already processed → 200 OK no-op.
  const inserted = await db.insert(stripeEvents)
    .values({ id: stripeEvent.id, type: stripeEvent.type })
    .onConflictDoNothing()
    .returning({ id: stripeEvents.id });
  if (inserted.length === 0) return { ok: true, dedup: true };

  // 4. Dispatch by event type. Anything we don't handle → 200 OK no-op
  //    (telling Stripe to stop retrying).
  if (stripeEvent.type !== 'payment_intent.succeeded') {
    return { ok: true, ignored: true };
  }

  const intent = stripeEvent.data.object as Stripe.PaymentIntent;
  const jobId = intent.metadata?.jobId;
  if (!jobId || !isUuid(jobId)) {
    // Don't 4xx — Stripe will keep retrying. Log warning, swallow.
    console.warn('stripe_event_missing_jobId', { eventId: stripeEvent.id });
    return { ok: true, missing_jobId: true };
  }

  // 5. Side effects, in a single tx where possible.
  //    a. Update payments row → status='succeeded', stripeChargeId, paidAt.
  //    b. Update jobs row → status='paid' (or whatever the post-pay state is —
  //       confirm via grep for 'paid' or schema). Set paidAt.
  //    c. Read uploadDiskFilename — required to publishConvert.
  //    d. publishConvert({job_id, input_path, output_dir, mapping_profile}).
  //       Wrap in try/catch: if publish throws, do NOT throw to Stripe — they
  //       have already collected money; surface to oncall via console.error +
  //       admin_audit_log row, but return 200 so we don't ddos ourselves with
  //       Stripe retries enqueueing duplicate convert jobs.
  //    e. sendEmail(billingEmail) — non-blocking; on fail, log + continue.
  //    f. SmartBill stub: mark payments row 'invoice_pending=true'. The
  //       back-fill cron / smartbill-client task picks it up later.

  return { ok: true };
});
```

## Idempotency analysis

| Replay scenario | Outcome |
|---|---|
| Same event id arrives twice | Dedup row blocks step 4+ → 200 no-op |
| Two different events for the same intent (unlikely; Stripe collapses) | Both pass dedup; payments row UPDATE is idempotent (status already succeeded); convert publish would double-fire — **mitigation: SELECT payments.status FIRST inside the handler; if already succeeded, skip the publish + email + invoice steps** |
| publishConvert throws after payments row is updated | Stripe will not retry (we returned 200); job is paid but not enqueued — **mitigation: a cron that scans payments.status=succeeded with no pgboss job and re-enqueues** (deferred to a later observability task; flagged in DONE) |

## Security checklist

- [x] Signature verified via `stripe.webhooks.constructEvent` (HMAC + replay window)
- [x] Raw body used (not parsed JSON)
- [x] Webhook secret read from validated `env.STRIPE_WEBHOOK_SECRET`
- [x] Dedup against `stripe_events.id`
- [x] No PII logged (no email, no card data, no signature header)
- [x] `jobId` from intent metadata is UUID-validated before any DB use
- [x] All DB access via Drizzle (or parameterized `sql` template)
- [x] Returns 200 OK on processed-or-ignored to avoid Stripe retries; only 4xx for malformed/unsigned

## Validation

- `npx nuxi typecheck` → EXIT=0
- Manual exercise blocked by Dani's LIVE Stripe keys policy (see auto-memory). Handler ships and typechecks; first end-to-end exercise needs Dani's go.

## Open questions for Dani — please answer before I write the code

1. **`payments` schema columns:** the worker may have left `paidAt`, `stripeChargeId`, `invoicePending`, `succeededAt` columns out — I'll read the schema and adapt to whatever's there. If you want me to add a new column for "smartbill invoice pending", say so now (small migration 0004). Default plan is to just leave the row's `status='succeeded'` and let the future smartbill-client sweep `payments` rows that lack a `smartbillInvoiceId`.
2. **`jobs.status` post-payment value:** currently the schema doesn't enforce an enum. Webhook will set `status='paid'` (or `'queued'` since we publish convert immediately and the worker will set `'running'`). My preference: set `status='paid'` AND `progressStage='queued'` so the SSE stream + admin dashboard reflect the transition cleanly. OK?
3. **Email template:** there's no `payment-confirmed` email template yet (`email-templates` task hasn't shipped). Should I:
   - (A) inline a tiny RO copy in the handler ("Plata a fost primită...") — quick & ships now, gets refactored when `email-templates` lands; OR
   - (B) skip the email entirely until `email-templates` is in place (just log `'payment_confirmation_email_skipped'`)?
4. **Live-keys exercise:** to exercise this end-to-end you'll need to either (a) swap to test keys + use Stripe CLI `stripe listen --forward-to localhost:3015/api/webhooks/stripe`, or (b) point a real Stripe webhook endpoint at the production-or-tunnel URL with a test card. Which path do you want to take? (Affects nothing in the handler — just operational.)

If you say "go with sensible defaults," I'll go with: (1) no schema change, sweep later; (2) status='paid' + progressStage='queued'; (3) inline tiny RO copy; (4) you decide later.

## Estimated diff size

~150 lines for the handler; +1 LOG entry; +1 DONE report; +1 architecture entry. Single commit on a task branch, then merged via the same shape as Wave 4b.
