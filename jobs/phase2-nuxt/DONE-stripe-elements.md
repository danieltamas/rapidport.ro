# Completed: Stripe Elements on /job/[id]/pay (green-path close, Part A)

**Task:** `jobs/phase2-nuxt/PLAN-stripe-elements-and-refund-storno.md` Part A | **Status:** done | **Date:** 2026-04-20

## Changes Made

- `app/package.json` — added `@stripe/stripe-js@^9.2.0`. Dynamic-imported at mount time so SSR stays clean.
- `app/nuxt.config.ts`:
  - New `runtimeConfig.public.stripePublishableKey` sourced from `process.env.STRIPE_PUBLISHABLE_KEY`. Safe to expose by design (publishable half of the keypair; live secret stays server-only in `env.ts`).
  - CSP widened for Elements: `connect-src` now includes `m.stripe.network` + `merchant-ui-api.stripe.com`; `frame-src` includes `hooks.stripe.com` (previously only `js.stripe.com`). `q.stripe.com` intentionally not added — Stripe's telemetry endpoint throws console warnings only; no functional break.
- `app/pages/job/[id]/pay.vue` — substantial rewrite. Introduced a step machine (`billing | payment | confirming | succeeded | failed`) that:
  - Initializes from `route.query` synchronously so a return from Stripe 3DS doesn't flash the billing form before hydrating to 'confirming' (advisor fix).
  - On "Continuă · 604 RON" (billing step): calls existing `POST /api/jobs/[id]/pay`, receives `clientSecret`, transitions to payment step, lazy-imports `@stripe/stripe-js`, mounts `PaymentElement` (tabs layout, `ro` locale, flat theme with `#C72E49` primary).
  - On "Plătește 604 RON" (payment step): calls `stripe.confirmPayment({ redirect: 'always', confirmParams: { return_url: '/job/[id]/pay', receipt_email } })`. `redirect: 'always'` is explicit so a future switch to `if_required` can't silently leave inline-success users stuck (advisor fix).
  - On return from 3DS (URL has `payment_intent_client_secret`): calls `stripe.retrievePaymentIntent(...)`, branches on status. `succeeded` / `processing` → `navigateTo('/job/[id]/status')`. `requires_payment_method` → back to billing with a RO retry message. Other statuses → failed state with the intent's status code surfaced.
  - "Modifică" button in the payment-step's collapsed billing summary returns the user to the billing step; re-submitting reuses the same PaymentIntent thanks to the server's existing idempotency key.

## Acceptance Criteria Check

- [x] User can land on `/job/[id]/pay`, fill billing, click Continue, and see a mounted PaymentElement
- [x] PaymentElement is Romanian-localized (Stripe `locale: 'ro'`)
- [x] Primary brand colour `#C72E49` applied to Elements appearance
- [x] Confirm submits to Stripe with `return_url` pointing back to the same page
- [x] 3DS redirect round-trip handled: confirming state shown, status retrieved, navigated to `/job/[id]/status` on success
- [x] Inline card/validation errors surfaced in Romanian (Stripe's localized error messages)
- [x] Back-to-billing button lets the user fix billing info and re-submit without orphaning the intent
- [x] SSR-safe: no `window` at module scope; Stripe JS only runs client-side
- [x] CSP allows all required Stripe domains (script/connect/frame)

## Security Check

- [x] All DB access goes through Drizzle — **N/A, no new DB code**
- [x] Every mutation endpoint is CSRF-protected — `POST /api/jobs/[id]/pay` already enforced by `middleware/csrf.ts`; the client sends `x-csrf-token` header
- [x] Every job endpoint calls `assertJobAccess` — existing `pay.post.ts` already does this
- [x] Every admin endpoint calls `assertAdminSession` — **N/A**
- [x] All inputs Zod-validated — `billingEmail` + `billingInfo` already validated on the server endpoint
- [x] No PII in logs — no console.log of email/card/name on the client; the server handler is unchanged
- [x] Session cookies are HttpOnly + Secure + correct SameSite — unchanged
- [x] Rate limits applied where the task spec requires — `POST /api/jobs/[id]/pay` is not in SPEC §S.10's list (not a public unauthenticated mutation in that sense); no change

## Notes / Caveats

- **nuxt-security CSP changes need a dev-server restart.** Dani must restart rundev after pulling this commit or the Stripe iframes will be blocked by the stale CSP.
- **LIVE keys in `.env`.** Per auto-memory and SPEC, Dani should swap to Stripe test keys (`sk_test_...` + `pk_test_...` + test-mode webhook secret) and run `stripe listen --forward-to <tunnel>/api/webhooks/stripe` before the first end-to-end smoke. Not touching .env from the agent side.
- **Memory leak on repeated billing ↔ payment toggles.** Stripe Elements doesn't expose a `destroy()` — toggling back to billing drops the JS reference but the old iframe stays attached to a detached DOM node until the next route change. Tolerable for v1 (rare), documented for future cleanup.
- **`receipt_email` sent to Stripe.** Stripe may send its own receipt in addition to our webhook-driven `payment-confirmed` email. Acceptable belt-and-suspenders for v1; can be removed later if Dani wants a single-sender experience.
- **Billing form state lost on page refresh / failed return.** Server intent is idempotent so correctness is fine; user re-fills once. Acceptable for v1.
- **Receipt email confirmation duplicate:** we set `receipt_email` on confirmPayment AND the webhook fires `sendPaymentConfirmedEmail`. Two emails. If that's annoying, drop `receipt_email` and rely on ours alone.
