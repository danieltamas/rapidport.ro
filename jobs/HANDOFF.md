# Handoff — end of 2026-04-20 late session

**Date:** 2026-04-20 (very late) | **Branch:** `main` (clean) | **Ahead of origin:** 187 commits
**Focus of this session:** Admin UX hardening — popup OAuth, dark theme, mobile drawer, audit performance, dev-RSS cut, logout confirm, + filed a follow-up TODO.

---

## Mandatory reading for the next agent

1. **`CLAUDE.md`** — workflow, security rules, Git rules (NO Co-Authored-By), doc-drift rule.
2. **`docs/LOG.md`** top entry (2026-04-20 "Admin UX hardening") — covers everything below in more depth including the commit SHAs.
3. **`docs/ARCHITECTURE.md`** — current directory tree + route inventory. Was updated this session.
4. **`SPEC.md`** §2.1 (schema), §2.2 (routes), §S.4 (admin auth), §S.10 (rate limits).
5. **Auto-memory** at `~/.claude/projects/-Users-danime-Sites-rapidport-ro-app/memory/`. Latest additions this session:
   - COOP + OAuth popups (don't build BroadcastChannel/polling workarounds — the answer is one header)
   - demoanaf.ro is Dani's own product
   - Every required env var for external services needs a dev-safe placeholder + `isXxxConfigured()` guard

---

## What shipped end-to-end (the green path works)

A first-time anonymous user can today:
1. Land on `/`, click into `/upload`, drop a WinMentor archive (.zip/.tgz/.7z).
2. Auto-redirect to `/job/[id]/status` with live SSE progress (2s poll + 15s heartbeat).
3. Continue through `/job/[id]/discovery` → `/job/[id]/mapping` (mock UI; mapping data exists).
4. `/job/[id]/pay` — ANAF CUI lookup auto-fills company fields (name, address, regCom, VAT status via demoanaf.ro). Submit POSTs billingInfo to `/api/jobs/[id]/pay` which creates a Stripe PaymentIntent row + persists billingInfo.
5. **Known gap:** no Stripe Elements/Checkout UI — the PaymentIntent exists but there's no card-entry step on the client. Webhook won't fire without a real charge. See "Next up" below.
6. If webhook were to fire, worker would run conversion, bundle output, `/job/[id]/result` streams the ZIP.

Admin (`/admin`) has the full dashboard: overview, jobs list + detail with 6 action dialogs, payments list, users list + detail with grant/block/unblock/delete, AI usage, profiles promote/hide, audit log, admin sessions + revoke (self-lockout guarded).

Scheduler plugin registers 6 cron jobs (4 cleanup + SmartBill sweep + email notification sweep). Default-OFF in dev (`SCHEDULER_ENABLED=true` to opt in).

---

## What changed this session (admin surface)

- **`admin-auth` middleware** now matches bare `/admin` (was only `/admin/*`).
- **Admin layout** — `dark` class applied via `useHead({htmlAttrs:{class:'dark'}})` (not on the layout `<div>`, so shadcn Dialog portals also render dark).
- **Mobile drawer** — sidebar slides in on `<md` via hamburger; persistent sidebar on md+; collapsible to 64px.
- **Red "ADMIN — all actions logged" banner removed** from both login page and topbar. Dani's call; audit trail is a platform property, not UI chrome.
- **All 10 admin page containers** normalized to `px-4 md:px-6 py-6 max-w-[1400px] mx-auto`.
- **OAuth popup** — `window.opener.postMessage` flow (Lexito-style). The working config:
  - `nuxt.config.ts` → `security.headers.crossOriginOpenerPolicy: 'unsafe-none'` (globally). Anything stricter severs `window.opener` after the popup visits Google — don't "harden" it back without re-engineering the OAuth flow. See auto-memory.
  - `/api/auth/google/start?popup=1` prefixes the PKCE state with `p:`.
  - Callback branches on the prefix: popup mode redirects popup to `/oauth/close?status=ok|error&code=...`; non-popup mode keeps the 303→/admin legacy flow.
  - `/oauth/close.vue` `window.opener.postMessage` + `window.close()`.
  - `admin/login.vue` listens for message + polls `popup.closed` with a cancellable grace timeout (latches `aborted` so a late setTimeout can't overwrite a successful navigation).
- **Admin session IP binding** skipped in `NODE_ENV !== 'production'` — dev networking rotates IPs and was revoking sessions between refreshes.
- **Admin audit on READS is non-blocking** via `app/server/utils/admin-audit.ts:auditRead(event, admin, action, opts?)`. Fire-and-forget INSERT. `/api/admin/sessions` went from 2.26s to near-instant. Mutation endpoints keep their transactional audit (INSERT in the same tx as the mutation).
- **Admin pages are lazy-loaded** — every `useAsyncData(...)` has `{ lazy: true }` + dropped `await`. Pages navigate instantly with existing Loading/empty-state fallbacks.
- **Logout goes through `LayoutConfirmDialog`** (both desktop sidebar + mobile drawer). Previous version logged out on a single click.
- **Dev RSS** — dropped from ~1GB to the ~400MB range other Nuxt projects here use. Parity with `wam.3.0`/`wam.4.0`:
  - `sourcemap: false` (biggest win — HMR holds per-module maps)
  - `experimental.watcher: 'chokidar'`
  - `experimental.appManifest: false`
  - `nitro.typescript.generateTsConfig: false`
  - `SCHEDULER_ENABLED` now defaults to `production`-only.

---

## First action when you boot

1. **Restart `rundev`** — several response headers (COOP, dev memory settings) only apply to fresh responses, not HMR.
2. Open `/admin/login` in an incognito tab → should redirect to login (not the 401 flash).
3. Click **Continuă cu Google** → popup → complete OAuth → popup closes → you land on `/admin`. If you see "Autentificare eșuată" right after a successful login, that's the close-race regression; check commit `f22f199` is in place.
4. Click around `/admin/jobs`, `/admin/users`, etc. — should feel snappy (no 2s blank).
5. On a phone viewport, confirm the sidebar is hidden + a hamburger opens it.
6. Sign out → confirm dialog appears.

---

## Open TODOs (picked up next)

### Priority 1 — close the green path

1. **Stripe Elements on `/job/[id]/pay`** — the PaymentIntent is created + billingInfo is captured, but there's no card-entry UI. Two paths:
   - **Elements:** add `@stripe/stripe-js`, mount a `PaymentElement` below the billing form, confirm on submit.
   - **Checkout redirect:** change `/api/jobs/[id]/pay` to return a Stripe Checkout Session URL; client redirects. Simpler, hosted by Stripe. Recommend this for v1.
2. **Live Stripe smoke** — your `.env` has **LIVE keys, not test**. First end-to-end should either (a) swap to test keys + `stripe listen --forward-to <tunnel>/api/webhooks/stripe`, or (b) a deliberate small-amount live charge.

### Priority 2 — quality / polish

3. **`jobs/phase2-nuxt/TODO-admin-user-detail-payments.md`** — admin user-detail page should surface a payments list (not just stat counters). Single-agent, ~30 LoC server + ~40 LoC client. Plan is in the TODO file.
4. **SmartBill env vars** — set `SMARTBILL_USERNAME`, `SMARTBILL_API_KEY`, `SMARTBILL_CIF=RO<gamerina-cif>` in `.env` to activate the invoice sweep. Without them the sweep no-ops (`{skipped:true}` every 5 min in the scheduler log).
5. **sync-complete email** — needs a worker-side `is_resync` flag on `ConvertPayload` (TS mirror in `app/server/types/queue.ts` + Pydantic in `worker/src/migrator/consumer.py` + worker branches on it). Small.

### Priority 3 — Phase 2 remaining groups

6. **i18n** — `@nuxtjs/i18n` + `app/locales/{ro,en}.json` + `?lang=en` fallback. Existing RO hard-coded strings in pages will need migration; ship infra first, migrate opportunistically.
7. **observability** — `@sentry/nuxt` + `sentry-sdk` for worker; `beforeSend` PII filter; source maps in CI. Needs Dani's Sentry DSN.
8. **infra** — `infra/docker-compose.yml` + `docker-compose.prod.yml` + root `Dockerfile` (for the Nuxt side) + `infra/Caddyfile` + `infra/hetzner-setup.md`.
9. **ci-tests** — 4 GitHub Actions (typecheck/lint, tests, security, gitleaks).
10. **gate** — Phase 2 review against SPEC §2.8.

---

## Env state

`.env` at `app/.env` (not repo root; note the nested `app/`). Required for a working boot today:

```
NODE_ENV=development
APP_URL=https://rapidport.ro
DATABASE_URL=postgresql://...

ADMIN_EMAILS=daniel@digitap.eu      # your email

RESEND_API_KEY=re_...
EMAIL_FROM=Rapidport <no-reply@rapidport.ro>

GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://rapidport.ro/api/auth/google/callback

STRIPE_SECRET_KEY=sk_... (LIVE keys per auto-memory — treat with care)
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Optional (default to dev-safe placeholders; handlers no-op until real values set):
- `SMARTBILL_USERNAME`, `SMARTBILL_API_KEY`, `SMARTBILL_CIF`, `SMARTBILL_SERIES` (default `RAPIDPORT`)
- `SCHEDULER_ENABLED=true` — force scheduled-jobs plugin on in dev
- `SCHEDULER_ENABLED=false` in a secondary dev shell if you open two

DB at migration `0005`. Run `cd app && npm run db:migrate` if cloning fresh.

---

## Rules / gotchas reinforced this session

- **COOP + popups**: `same-origin` severs opener, and `same-origin-allow-popups` only helps when the *popup* has `unsafe-none` COOP — if the popup inherits the parent's `same-origin-allow-popups`, opener is still severed. Rapidport uses `unsafe-none` globally. Don't "harden" without reworking the OAuth flow. (In auto-memory.)
- **Admin session IP binding** is prod-only. Dev networking (cloudflared, docker bridges, VPN) rotates IPs.
- **Dev memory settings are load-bearing** — `sourcemap: false`, chokidar watcher, `appManifest: false`, `nitro.typescript.generateTsConfig: false`. Do not re-enable casually.
- **Admin audit on reads must be fire-and-forget** via `auditRead()`. Sync audit on a read endpoint blocks every request by one DB round-trip, which is how `/api/admin/sessions` reached 2.26s. Mutation endpoints keep sync/transactional audit.
- **Dani's local .env has LIVE Stripe keys** — don't trigger `paymentIntents.create` without explicit go. Saved in auto-memory.
- **Orchestrator CWD drifts** into worker worktrees mid-wave when workers hit the Bash-denied bug. `cd /Users/danime/Sites/rapidport.ro/app` + `git status` before assuming you're on main.
- **Worker prompts need "MANDATORY, not optional" salvage clause.** The last workers that had Bash denied still shipped deliverables because the prompt forced Write-tool salvage.

---

## Harness bugs still live

1. **Bash-denied flake** on spawned workers. Fix: prompts force Write-tool salvage; orchestrator creates the branch + commits. Mitigation works, ~1 of 4 workers hits it per wave.
2. **Stale worktree base** — occasionally a worker's worktree is created from a pre-current commit, so they can't see recent migrations/utils. Mitigation: worker prompts instruct to branch from the group branch and verify with `git branch --show-current` first.

---

## Previous handoff preserved below for history

(Everything below this line is the prior end-of-session handoff before this admin hardening round. Keep for reference; the summary above supersedes it on any conflict.)

---
