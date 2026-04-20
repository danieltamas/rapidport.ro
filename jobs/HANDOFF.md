# Handoff — end of 2026-04-21 session

**Date:** 2026-04-21 (rolled over from late 2026-04-20) | **Branch:** `main` (clean)
**Focus of this session:** closed the green-path payment flow — Stripe Elements on `/job/[id]/pay`, eFactura-aware refund → SmartBill reversal (cancel <4h / storno ≥4h via query-first), `is_resync` plumbing for the future sync-complete email. Plus small polish: idempotent session revoke, admin user-detail payments list.

For a live view of what's on your branch vs. origin, run `git log --oneline origin/main..HEAD`. Numbers get stale the moment anyone pushes, so they're not pinned here.

---

## Mandatory reading for the next agent

1. **`CLAUDE.md`** — workflow, security rules, Git rules (NO Co-Authored-By), doc-drift rule.
2. **`docs/LOG.md`** top entries for 2026-04-20 — cover this session's commits in detail.
3. **`docs/ARCHITECTURE.md`** — current directory tree + route inventory. Updated.
4. **`SPEC.md`** §Invoicing (line 725 onward — Stripe+SmartBill auto-link), §2.1 (schema), §2.2 (routes), §S.10 (rate limits + pricing).
5. **`jobs/phase2-nuxt/PLAN-stripe-elements-and-refund-storno.md`** — the plan that Parts A + B implement. Reference if you need to understand why a particular branch was chosen.
6. **Auto-memory** at `~/.claude/projects/-Users-danime-Sites-rapidport-ro-app/memory/`. No new entries this session — the relevant rules (LIVE Stripe keys, COOP, etc.) are still current.

---

## What shipped end-to-end (the green path now works, pending smoke)

A first-time anonymous user can today:
1. Land on `/`, click into `/upload`, drop a WinMentor archive (.zip/.tgz/.7z).
2. Auto-redirect to `/job/[id]/status` with live SSE progress.
3. Continue through `/job/[id]/discovery` → `/job/[id]/mapping` (mock UI; mapping data exists).
4. `/job/[id]/pay` — ANAF CUI lookup auto-fills company fields. Fill billing, click **Continuă · 604 RON** → Stripe Elements mounts (tabs layout, ro locale, flat theme, `#C72E49` primary).
5. **NEW:** Enter card, click **Plătește 604 RON** → `stripe.confirmPayment({ redirect: 'always' })` → 3DS round-trip → returns to `/job/[id]/pay` → page detects `?payment_intent_client_secret`, retrieves status, navigates to `/job/[id]/status` on success.
6. Webhook flips job to `paid` + queued, worker picks up, bundle produced, `/job/[id]/result` streams the ZIP.
7. Admin refund triggers Stripe refund + SmartBill reversal (cancel if pre-SPV, storno if at ANAF) in one atomic admin action.

**Gaps before live traffic:**
- First Stripe smoke requires test-key swap + `stripe listen` (see "First action when you boot" below).
- First post-4h refund may uncover a `reverseInvoice` endpoint mismatch — inferred from SmartBill docs, not verified in production. Dialog will show an amber banner if it 404s; admin can reconcile manually.
- SmartBill env vars not yet set in `.env` (sweep no-ops silently until they are).

Admin dashboard (`/admin`) is feature-complete for v1: overview, jobs list + detail with 6 action dialogs, payments list with `?userId=<uuid>` filter, users list + detail with payments table + grant/block/unblock/delete, AI usage, profiles promote/hide, audit log, sessions + revoke.

Scheduler plugin: 6 cron jobs (4 cleanup + SmartBill sweep + email-notification sweep). Default-OFF in dev (`SCHEDULER_ENABLED=true` to opt in). Email-notification sweep still handles mapping-ready + conversion-ready only; sync-complete is follow-up work now that the `is_resync` plumbing is in.

---

## What changed this session

Ordered by what a next agent needs to know. Commits tagged.

**Session-revoke 404 bug (`2a8c6dc`).** `DELETE /api/me/sessions/[id]` is now idempotent — if the session exists and belongs to the caller but is already revoked, returns `{ok: true}` instead of 404. The client also refreshes the list in `finally` so stale rows vanish on any outcome. Original bug was a stale `useAsyncData` list racing the second revoke click.

**Admin user-detail payments list (`21a8db0`).** `/admin/users/[id]` now has a Payments section below Recent jobs + a "View all →" link to `/admin/payments?userId=<uuid>`. The payments list endpoint learned an optional `userId` UUID query param; the page renders a "user: …" pill with a clear button when the filter is active.

**Plan for Stripe + SmartBill (`4e8ed2e`).** `jobs/phase2-nuxt/PLAN-stripe-elements-and-refund-storno.md` — two-part plan, approved by Dani with decisions D3 (disallow partial refunds), SBA (verify `/invoice/reverse` shape at first real run), SBB (pre-0006 rows → assume storno path), SBC (query eFactura status first, 4h timer fallback).

**Part A — Stripe Elements (`73c9701`).** PaymentElement mounts on `/job/[id]/pay` after billing form submit. Step machine `billing → payment → confirming → succeeded/failed`. `redirect: 'always'` explicit so inline-success can never silently strand the user. Step initializes synchronously from `route.query.payment_intent_client_secret` to avoid hydration flash after 3DS return. `@stripe/stripe-js` added as a dependency, dynamic-imported client-side only. CSP widened in `nuxt.config.ts` for `m.stripe.network`, `merchant-ui-api.stripe.com`, `hooks.stripe.com`. `runtimeConfig.public.stripePublishableKey` exposed.

**Part B — eFactura-aware refund + SmartBill reversal (`18d1836`).**
- Migration 0006: `payments` gains `smartbill_issued_at`, `smartbill_canceled_at`, `smartbill_storno_invoice_id`, `smartbill_storno_invoice_url`, `smartbill_stornoed_at`.
- `app/server/utils/smartbill.ts` refactored — shared `sbFetch` helper; new primitives `cancelInvoice`, `reverseInvoice`, `getEfacturaStatus`, `splitInvoiceId`.
- `getEfacturaStatus` normalizes to `pending | validated | rejected | unknown`. `submitted` maps to `validated` (already at SPV → past cancel window).
- Sweep stamps `smartbill_issued_at` on success — load-bearing for the 4h fallback.
- `POST /api/admin/jobs/[id]/refund` rewritten: full refunds only (D3 — body is `{ reason }` only, `amount` rejected via `z.never().optional()`). Decide cancel-vs-storno via query-first; 4h timer when status is unknown; null issuedAt → storno (SBB). On-cancel validation rejection → upgrade to storno. Idempotency guard short-circuits when `smartbill_canceled_at` or `smartbill_storno_invoice_id` is already set.
- Admin UI: refund dialog removes amount field; payments table gains a SmartBill column (invoice link + CANCELLED badge + storno sub-row); partial-success amber banner keeps dialog open when Stripe refunded but SmartBill reversal failed.

**Priority 2.5 — `is_resync` plumbing (`12019ea`).** The Python worker now knows whether a convert run is a resync or an initial conversion.
- Migration 0007: `jobs.last_run_was_resync boolean not null default false`.
- `ConvertPayload` TS + Pydantic: `is_resync?: boolean` / `is_resync: bool = False`.
- Worker `_mark_rp_succeeded` takes `is_resync` and stamps `jobs.last_run_was_resync` atomically with `status='succeeded'`.
- `resync.post.ts` publishes `is_resync: true`; Stripe webhook publishes `is_resync: false` explicitly.
- The sync-complete email itself is still deferred (needs an `email_sync_complete_sent_at` column + reset-on-each-resync semantics so multiple delta-syncs fire multiple emails).

---

## First action when you boot

1. **Restart `rundev`.** The CSP headers in `nuxt.config.ts` aren't HMR'd — any Stripe testing will fail with CSP errors until you restart.
2. **Swap `.env` to Stripe TEST keys.** Dani's `.env` has LIVE keys per auto-memory. Before the first Elements smoke:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_... (from `stripe listen`)
   ```
   Then `stripe listen --forward-to https://rapidport.ro/api/webhooks/stripe` in a side terminal.
3. **Green-path smoke.** Land on `/`, `/upload` a test archive, `/job/[id]/pay`, fill billing, click Continuă → Elements mounts → `4242 4242 4242 4242` for non-3DS; `4000 0027 6000 3184` for 3DS round-trip. Verify webhook hits, `payments.status='succeeded'`, job flips to `paid`, worker picks up.
4. **Admin refund smoke (within 4h).** Issue a SmartBill invoice via the sweep (manual call or wait 5 min), wait <4h, trigger refund via `/admin/jobs/[id]` → verify Stripe refunded + SmartBill DELETE succeeded + `smartbill_canceled_at` set.
5. **Admin refund smoke (after 4h).** **This is the risky one.** Manually stamp a payment's `smartbill_issued_at` to 5h ago, trigger refund → verify it hits `POST /invoice/reverse`. If it 404s or returns an unexpected shape, fix `reverseInvoice` in `app/server/utils/smartbill.ts`. The amber banner in the dialog will tell you immediately if the reversal failed.

---

## Open TODOs

### Priority 1 — post-smoke

1. **First post-4h refund verification.** See caveat in `DONE-refund-reversal.md`. If `POST /invoice/reverse` is named differently by SmartBill (e.g. `/invoice/creditNote`), patch the single endpoint path — the call site in `refund.post.ts` doesn't need to change.
2. **SmartBill env vars.** Set `SMARTBILL_USERNAME`, `SMARTBILL_API_KEY`, `SMARTBILL_CIF=RO<gamerina-cif>`, `SMARTBILL_SERIES=RAPIDPORT` in `.env`. Without them, `isSmartBillConfigured()` returns false and both the sweep + refund reversal silently no-op.
3. **Swap `.env` back to LIVE** before production smoke.

### Priority 2 — quality / polish

4. **sync-complete email.** Plumbing is done; needs:
   - New column `jobs.email_sync_complete_sent_at timestamptz` (migration 0008).
   - `resync.post.ts` resets it to `null` when publishing (so multi-resync fires multiple emails).
   - New `emails/sync-complete.ts` template (copy drafted in `docs/emails-copy.md` §4).
   - New `sweepSyncComplete()` in `email-notification-sweep.ts` keyed off `last_run_was_resync = true AND email_sync_complete_sent_at IS NULL`.
   Small, single-agent task once you want to wire it.
5. **Manual "re-issue SmartBill invoice" admin button.** Currently if the sweep fails for a payment, the worst-case recovery is manual DB stamping. A small admin action would let Dani click-re-issue. Nice-to-have; not blocking.
6. **Stripe receipt email vs. our own.** `confirmPayment` sets `receipt_email`, so Stripe sends its receipt in addition to our `payment-confirmed` email. If that's duplicative, drop `receipt_email` in `pay.vue`.

### Priority 3 — Phase 2 remaining groups

7. **i18n** — `@nuxtjs/i18n` + `app/locales/{ro,en}.json` + `?lang=en` fallback.
8. **observability** — `@sentry/nuxt` + `sentry-sdk` for worker; `beforeSend` PII filter; source maps in CI. Needs Dani's Sentry DSN.
9. **infra** — `infra/docker-compose.yml` + `docker-compose.prod.yml` + root `Dockerfile` + `infra/Caddyfile` + `infra/hetzner-setup.md`.
10. **ci-tests** — 4 GitHub Actions (typecheck/lint, tests, security, gitleaks).
11. **gate** — Phase 2 review against SPEC §2.8.

---

## Env state

`.env` at `app/.env` (not repo root; note the nested `app/`). Required for a working boot today:

```
NODE_ENV=development
APP_URL=https://rapidport.ro
DATABASE_URL=postgresql://...

ADMIN_EMAILS=daniel@digitap.eu

RESEND_API_KEY=re_...
EMAIL_FROM=Rapidport <no-reply@rapidport.ro>

GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://rapidport.ro/api/auth/google/callback

STRIPE_SECRET_KEY=sk_... (LIVE keys per auto-memory — swap to test for first smoke)
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Optional (default to dev-safe placeholders; handlers no-op until real values set):
- `SMARTBILL_USERNAME`, `SMARTBILL_API_KEY`, `SMARTBILL_CIF`, `SMARTBILL_SERIES` (default `RAPIDPORT`) — **still unset as of this session**; sweep + refund reversal no-op silently
- `SCHEDULER_ENABLED=true` — force scheduled-jobs plugin on in dev

DB at migration `0007`. Run `cd app && npm run db:migrate` if cloning fresh.

---

## Rules / gotchas reinforced this session

- **Stripe Elements CSP isn't HMR'd.** `nuxt-security` header changes only take effect on a fresh dev-server restart. Do not debug a CSP block without restarting first.
- **`redirect: 'always'` on `confirmPayment` is load-bearing.** Don't switch to `'if_required'` as an "optimization" — inline-success would silently strand the user on the payment step because our code doesn't handle that branch.
- **4h eFactura cutoff is configurable on SmartBill's side.** Rapidport's refund handler queries SmartBill's eFactura status first and falls back to the 4h timer only when the status call returns `unknown`. Don't rip out the query call thinking the timer is enough — SmartBill's submit schedule can change.
- **Partial refunds are disallowed.** The refund endpoint rejects `amount` via `z.never().optional()`. Romanian fiscal law permits partial creditNotes on multi-line invoices but ours is single-line, so partial storno makes no fiscal sense. Don't re-enable partials without a SmartBill storno design that handles them.
- **`reverseInvoice` endpoint shape is inferred.** Lexito doesn't call it. First post-4h refund is the verification. See DONE-refund-reversal.md caveat.
- **LIVE Stripe keys in `.env`** (still, per auto-memory). Don't charge without explicit go.
- **`_mark_rp_succeeded` in the worker stamps `last_run_was_resync` atomically with `status='succeeded'`.** Don't split them into two UPDATEs — the email sweep relies on seeing a consistent row.

---

## Harness bugs still live

1. **Bash-denied flake** on spawned workers. Prompts force Write-tool salvage; orchestrator creates the branch + commits. ~1 of 4 workers hits it per wave.
2. **Stale worktree base** — occasionally a worker's worktree is created from a pre-current commit. Mitigation: worker prompts instruct to branch from the group branch and verify with `git branch --show-current`.

---

## Previous handoff preserved below for history

(Everything below this line is the prior end-of-session handoff. Keep for reference; the summary above supersedes it on any conflict.)

---

# Handoff — end of 2026-04-20 late session

**Date:** 2026-04-20 (very late) | **Branch:** `main` (clean)
**Focus of this session:** Admin UX hardening — popup OAuth, dark theme, mobile drawer, audit performance, dev-RSS cut, logout confirm. Plus `/account/security` width parity + lazy fetches with skeletons.

### What changed (admin surface)

- **`admin-auth` middleware** now matches bare `/admin` (was only `/admin/*`).
- **Admin layout** — `dark` class applied via `useHead({htmlAttrs:{class:'dark'}})` so shadcn Dialog portals also render dark.
- **Mobile drawer** — sidebar slides in on `<md` via hamburger; persistent sidebar on md+; collapsible to 64px.
- **Red "ADMIN — all actions logged" banner removed** from both login page and topbar.
- **All 10 admin page containers** normalized to `px-4 md:px-6 py-6 max-w-[1400px] mx-auto`.
- **OAuth popup** — `window.opener.postMessage` flow (Lexito-style). Working config:
  - `nuxt.config.ts` → `security.headers.crossOriginOpenerPolicy: 'unsafe-none'` (globally)
  - `/api/auth/google/start?popup=1` prefixes PKCE state with `p:`
  - Callback branches on prefix: popup mode redirects to `/oauth/close?status=ok|error&code=...`
  - `/oauth/close.vue` `window.opener.postMessage` + `window.close()`
- **Admin session IP binding** skipped in `NODE_ENV !== 'production'` — dev networking rotates IPs.
- **Admin audit on READS is non-blocking** via `auditRead(event, admin, action, opts?)`. `/api/admin/sessions` went from 2.26s to near-instant.
- **Admin pages are lazy-loaded** — every `useAsyncData(...)` has `{ lazy: true }` + dropped `await`.
- **Logout goes through `LayoutConfirmDialog`**.
- **Dev RSS** — dropped from ~1GB to ~400MB via `sourcemap: false`, `experimental.watcher: 'chokidar'`, `experimental.appManifest: false`, `nitro.typescript.generateTsConfig: false`. `SCHEDULER_ENABLED` defaults to production-only.
