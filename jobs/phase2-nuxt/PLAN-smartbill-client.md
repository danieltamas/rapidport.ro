# PLAN — smartbill-client + api-webhooks-smartbill

**Author:** orchestrator | **Date:** 2026-04-20 | **Status:** awaiting Dani's approval

CLAUDE.md flags SmartBill integration as risky. This plan covers the client wrapper, the invoice-issuance sweep, and (optional) the webhook handler.

---

## Scope

1. **`app/server/utils/smartbill.ts`** — typed REST client. Single-instance authenticated by `env.SMARTBILL_API_KEY`. Retry 3× exp backoff on 5xx. Idempotent via our reference field.
2. **`app/server/utils/invoice-sweep.ts`** — sweep function called from a pg-boss scheduled job (lives in the gdpr-cleanup-cron plan, wired there).
3. **`app/server/api/webhooks/smartbill.post.ts`** — optional; SmartBill webhook receiver for invoice status updates (paid → factura, canceled, voided). **My default: defer this unless you tell me SmartBill supports signed webhooks.** Otherwise polling via the sweep is sufficient.

## Env

Extend `env.ts`:
- `SMARTBILL_API_KEY` (required in prod; auth is `Authorization: Basic base64(username:apikey)` or `token:token` depending on SmartBill's scheme — confirm at implementation time from SmartBill docs).
- `SMARTBILL_USERNAME` — may be the account email; needed for Basic Auth format. **Need Dani to confirm the auth shape** after re-reading SmartBill's current API docs.
- `SMARTBILL_CIF = 'RO<Gamerina-CIF>'` — the issuing entity's CIF. Static, could also be a constant in code; env is cleaner for multi-entity later.
- `SMARTBILL_SERIES = 'RAPIDPORT'` — invoice series (already decided).

Alternatively `SMARTBILL_CIF` + `SMARTBILL_SERIES` could be constants in `utils/smartbill.ts` since they don't rotate. My default: **constants in code**, less config surface.

## Invoice payload

SmartBill's `POST /SBORO/api/invoice` shape (representative — confirmed at implementation time):

```ts
{
  companyVatCode: env.SMARTBILL_CIF,
  seriesName: 'RAPIDPORT',
  isDraft: false,
  client: { ... },              // PJ or PF from payments.billingInfo jsonb
  products: [{
    name: 'Conversie migrare WinMentor → SAGA',
    measuringUnitName: 'buc',
    quantity: 1,
    price: 604,                 // total with VAT in RON
    isTaxIncluded: true,
    taxName: 'Normala',
    taxPercentage: 21,
  }],
  usePaymentTax: false,
  mentions: `Ref. plată Stripe: pi_... · Rapidport job #${idShort}`,
}
```

Key decisions the implementation will hard-code unless overridden:
- **Single line item** (vs. split base + VAT). `isTaxIncluded: true` + `taxPercentage: 21`. SmartBill computes the base from the gross.
- **Currency:** RON (matches Stripe intent).
- **Client shape:** `payments.billingInfo` is currently jsonb with a known shape (TBD — read the /job/[id]/pay.vue billing form and mirror). If `billingInfo` is null (e.g. anonymous flow without billing capture), issue as persoană fizică with the `billingEmail` as the only identifier — SmartBill allows this for consumer invoices.
- **eFactura submission:** SmartBill API has a separate `useEFactura: true` flag on recent series. PJ invoices require eFactura in Romania (SPV compliance). Plan: if client shape is PJ (has CIF), set `useEFactura: true`; else omit. **Dani to confirm** the current SmartBill account is configured for eFactura on series RAPIDPORT.

Response: `{ number: 'RAPIDPORT-2026-0001', series, url, ... }`. We persist:
- `payments.smartbillInvoiceId = number`
- `payments.smartbillInvoiceUrl = url`

## Sweep (invoice issuance)

- Runs every 5 minutes via pg-boss (registered in gdpr-cleanup-cron's plugin — a single scheduled-jobs plugin is cleaner than two).
- Query: `SELECT payments.* FROM payments JOIN jobs ON payments.job_id = jobs.id WHERE payments.status='succeeded' AND payments.smartbill_invoice_id IS NULL AND payments.created_at > now() - interval '7 days'` (recent succeeded payments without an invoice).
- For each row:
  1. Read `jobs.billingEmail` + `payments.billingInfo` to compose the `client` block.
  2. Call `smartbill.createInvoice(...)` with `mentions` including the `jobId` + `stripePaymentIntentId` — used as idempotency key on our side (a second run finds the row already has `smartbill_invoice_id` set).
  3. Update the payments row.
  4. Fire-and-forget email (once `conversion-ready`-style notification glue lands): "Factura #... e disponibilă." — deferred for now; sweep just logs `'smartbill_invoice_issued'`.
- On failure: log `smartbill_invoice_issue_failed` with `{paymentId, reason}`. Don't retry immediately; the next sweep picks it up. After N consecutive failures (say 20), escalate by writing to `admin_audit_log` with `action='smartbill_invoice_stuck'` so the admin dashboard surfaces it.

## Security

- API key in env (boot-validated). Never logged.
- Client response never logged verbatim; we log only `invoiceNumber` and a status.
- No PII in logs.
- SmartBill endpoint is `https://ws.smartbill.ro/SBORO/api/...` — pin in the client; no user-controlled URL construction.

## Files

- `app/server/utils/smartbill.ts` — ~120 LoC: client + `createInvoice(input) -> {id, url, number}` + error taxonomy.
- `app/server/utils/invoice-sweep.ts` — ~80 LoC: the sweep loop.
- `app/server/utils/env.ts` — +`SMARTBILL_API_KEY` (+ `SMARTBILL_USERNAME` if Dani confirms Basic Auth).
- `.env.example` — placeholders.
- Tests: worker has `tests/` stubbed out (no test infra yet — deferred).

## Required Dani decisions

- **SB1:** SmartBill auth scheme — Basic Auth with username+apikey, or Bearer token? (Their docs have changed over time; needs fresh lookup.)
- **SB2:** eFactura on series RAPIDPORT — is the SmartBill account set up to submit SPV automatically when `useEFactura: true`? If not, I'll still set the flag and SmartBill will queue it when you enable it.
- **SB3:** Include the Stripe intent ID in `mentions` (audit-friendly) or keep it out of the invoice text (privacy)? My default: include — it's not customer-PII, it's a reference.
- **SB4:** Webhook receiver now or defer to v1.1? My default: defer. Polling the sweep every 5 min is fine for a low-volume v1 and we already have the retry pattern.
- **SB5:** On a second-sweep attempt of a SmartBill-issued invoice (idempotency): trust our DB (`smartbill_invoice_id IS NOT NULL` = skip) or also ping SmartBill with a GET-by-mentions query to double-check? My default: trust our DB; if it's wrong, manual admin intervention via the /admin/payments page (future "edit invoice ID" admin action).

Sensible defaults = SB2/SB3/SB4/SB5 as above. SB1 needs a look-up.

Estimated ~200 LoC + 1 env var. No schema changes (`payments.smartbillInvoiceId`/`Url` already exist from the schema-jobs-payments task).
