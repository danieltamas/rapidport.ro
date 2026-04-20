# Handoff — Wave 4 / 4b / 4c all shipped. Upload→pay→convert→download loop is wired

**Date:** 2026-04-20 (end of session) | **Last orchestrator session:** Wave 4 prep + 6 handlers + schema fix 0003 + Wave 4b (pay + download/resync) + Wave 4c (Stripe webhook). | **Next:** SmartBill client (still SPEC-blocked) OR `email-templates` (Resend) OR ZIP bundling on the worker side so download stops returning 501.

The full critical-path code is now on main. To actually ship a paid migration end-to-end, you need:
1. **Live Stripe smoke** — see live-keys note below.
5. **api-admin Wave A DONE**: 4 read-only admin endpoints (stats, jobs-list, jobs-detail, payments) on main. **Wave B (jobs-actions / users / ai / misc) NOT dispatched** — these include refund / force-state / delete mutations; warrant a written plan + Dani approval before spawning workers.

2. ~~Worker output bundling~~ **DONE** (`95ea945`): `worker/src/migrator/utils/archive.py:bundle_output()` zips `output/` → `output.zip` atomically inside `consumer.run_convert`, before `_mark_rp_succeeded`. Download handler no longer 501s on the happy path.
3. ~~Email templates~~ partial (`cd00697`): payment-confirmed wired into webhook; copy for all 5 approved templates locked in `docs/emails-copy.md`. Three deferred templates (mapping-ready, conversion-ready, sync-complete) need worker→Nuxt notification glue — see "Deferred wiring" in the copy doc.
4. **SmartBill client** — UNBLOCKED. Series = `RAPIDPORT`, entity = Gamerina SRL. `app/server/utils/smartbill.ts` + `api-webhooks-smartbill` are ready to ship whenever it makes sense in priority order.

---

## Wave 4 status (just landed on main)

Merge: `437edaf`. Six handlers + Wave 4 prep + cloudflared host fix all on main.

| Endpoint | File | Notes |
|---|---|---|
| `POST /api/jobs` | `app/server/api/jobs/index.post.ts` | Anon token + cookie; 10/hr/IP rate limit (middleware) |
| `GET  /api/jobs/[id]` | `app/server/api/jobs/[id].get.ts` | `assertJobAccess` first; `anonymousAccessToken` stripped |
| `PUT  /api/jobs/[id]/upload` | `app/server/api/jobs/[id]/upload.put.ts` | Multipart, magic-byte sniff, 500MB cap, 3/hr/IP |
| `POST /api/jobs/[id]/discover` | `app/server/api/jobs/[id]/discover.post.ts` | readdir on-disk path (see TODO below) |
| `GET  /api/jobs/[id]/events` | `app/server/api/jobs/[id]/events.get.ts` | SSE — 2s poll, 15s heartbeat, terminal-state close |
| `PATCH /api/jobs/[id]/mapping` | `app/server/api/jobs/[id]/mapping.patch.ts` | mapped→reviewing state guard |

**Worker harness re-confirmed:** Bash-denied bug recurred for the discover worker; salvaged orchestrator-direct (commit `546f5fc` on its task branch, then squash-merged). Future worker prompts should pre-authorize a write-only fallback so the salvage round-trip can collapse to a SendMessage.

## TODO carried into Wave 4b — schema gap on upload disk filename

The upload handler stores files with a random on-disk filename `{randomUUID}.{ext}` but only persists `uploadFilename` (the user's *original* filename) to `jobs`. Discover currently `readdir`s the upload dir to recover the path. Wave 4b's `api-jobs-download-resync` and any future delta-sync flow will hit the same gap.

**Recommended Wave 4b prep (single migration):** add `jobs.uploadDiskFilename text` column. Backfill is unnecessary (only the in-flight job needs it; the column is null for old rows and the discover handler can keep the readdir fallback for a release). Drop the readdir branch from `discover.post.ts` once shipped.

## Wave 4b — next 2 parallel workers

After the schema fix above (or accepting the readdir for now):

| Task | File | Key points |
|---|---|---|
| `api-jobs-pay` | `app/server/api/jobs/[id]/pay.post.ts` | `stripe.paymentIntents.create({ amount, currency: 'ron', metadata: { jobId } })` with `idempotencyKey: jobPaymentIdempotencyKey(id)` (use the helper from `utils/stripe.ts`). Compute amount from job (base + delta-sync slots, VAT 21%). Return `client_secret` only. **Live keys in `.env` — see auto-memory note.** |
| `api-jobs-download-resync` | `app/server/api/jobs/[id]/download.get.ts` + `app/server/api/jobs/[id]/resync.post.ts` | Download streams output ZIP (`/data/jobs/{id}/output/...`); Resync checks `deltaSyncsUsed < deltaSyncsAllowed`, increments, publishes a delta-sync job. |

## Wave 4c — solo

`api-webhooks-stripe` at `app/server/api/webhooks/stripe.post.ts`. Use `stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET)`. 5-min replay window. Dedup via `stripe_events` (INSERT on event id, ON CONFLICT DO NOTHING). On `payment_intent.succeeded`: mark job PAID, `publishConvert({ job_id, input_path, output_dir })` (see Pydantic shape — also requires the on-disk filename!), send confirmation email, trigger SmartBill invoice. Idempotent end-to-end. **Webhook is exempt from CSRF middleware via the `/api/webhooks/*` allowlist.**

---

## Stripe — Dani's `.env` has LIVE keys (not test)

Wave 4b workers can ship `api-jobs-pay`. **Do not run a live end-to-end without confirmation.** Either swap to test keys for the first exercise, or get explicit authorization for a small-amount live smoke (€0.50). Saved as project memory; new sessions will see this.

## Open SPEC questions still blocking

- **Q#1 (legal entity):** ✅ ANSWERED — Gamerina SRL, already wired across footer/terms/privacy/dpa/invoices. SmartBill is configured under Gamerina.
- **Q#3 (SmartBill series):** still placeholder `RAPIDPORT-YYYY-NNNN`. Blocks `smartbill-client`.
- **Q#4 (refund policy):** unanswered. Blocks `pages-legal/refund.vue` + admin refund flow. Does NOT block Wave 4b/4c.

---

## Previous handoff (preserved below for context)



Read this first in the new session. Then read `jobs/INDEX.md` and `jobs/phase2-nuxt/JOB.md`.

---

## One-glance status

| Group | State | Notes |
|---|---|---|
| 0 Discovery | ✅ done | Merged 2026-04-18. See `docs/saga-schemas.md`. |
| 1 Worker | ✅ done | Merged 2026-04-19. `worker/` on main. See `jobs/phase1-worker/GATE.md`. |
| 2.bootstrap | ✅ done | 7/7 merged 2026-04-17. |
| 2.security-baseline | ✅ done | 3/3 merged 2026-04-19. **Note: `security-headers.ts` middleware was DELETED and replaced by nuxt-security module** — see "Big shifts" below. |
| 2.schema | ✅ done | 6/6 merged 2026-04-19. 12 tables + 2 migrations. |
| 2.auth-user | ✅ done | 5/5 merged 2026-04-19. |
| 2.auth-admin | ✅ done | 4/4 merged 2026-04-19. |
| **2.api-jobs** | ⏭️ **next up** | 8 handler tasks. Most parallelizable. See "Next wave" below. |
| 2.api-webhooks | blocked on SPEC Q#1/Q#3 for smartbill-client; stripe-client ready | |
| 2.api-admin | unblocked | 8 admin endpoints. |
| 2.pages-public | partially done outside the job system | Landing, upload, legal already exist (pre-dated); missing `/job/[id]/status`, `/job/[id]/result`. The login/verify/account pages were already built + later refactored heavily in this session (see "What's on main that wasn't tasked"). |
| 2.pages-admin | blocked on api-admin | 8 admin pages. Stubs exist for `/admin/login` + `/admin` (shipped in this session). |
| 2.gdpr-cleanup | **partially done** | `DELETE /api/me` ✓ (GET /api/me/export ✓) — **shipped this session, not via the formal gdpr-cleanup group**. Still missing: the pg-boss cleanup cron (30-day file sweep, `admin_oauth_state` expiry, `rate_limits` pruning, orphan files). |
| 2.email-guide | blocked | 3 tasks: Resend wrapper (done in Wave 3 B prep!), templates (mostly stubs), SAGA import guide PDF. |
| 2.i18n, observability, infra, ci-tests, gate | not started | |

---

## What's on main that wasn't in JOB.md

This session did more than just the formal groups. Be aware before reading JOB.md literally:

### 1. Product pivots (read before writing any UI task)

- **Magic-link → 6-digit PIN**. The flow is no longer a clickable URL; `POST /api/auth/magic-link` emits a 6-digit code and `POST /api/auth/verify` takes `{ email, code }`. `pages/login.vue` is a two-step form (email → PinInput). Reason: Microsoft Safe Links / Proofpoint prefetch single-use URLs. Email subject + body reflect this; the `/verify` Vue page was removed. **Old SPEC.md copy mentioning `/auth/verify?token=xyz` links has been updated, but anything you generate from memory should use the code flow.**
- **Flat user-facing auth routes**. `/login` (not `/auth/login`), no user `/verify` page. Admin stays at `/admin/login`. API routes unchanged (`/api/auth/*`).
- **`/profiles` is dead**. Replaced by `/account` as a real dashboard with sub-pages:
  - `/account` — dashboard (stats, recent migrations, recent invoices, quick links)
  - `/account/migrations` — full migration history
  - `/account/invoices` — SmartBill invoices with PDF download
  - `/account/profiles` — mapping-profile overrides (advanced, de-emphasized)
  - `/account/security` — account info, sessions list, data export, account deletion
- **Mapping profile "visibility" is gone from the user surface.** The `mapping_profiles.isPublic` + `adoptionCount` columns still exist in schema, but they're admin-only now (curation tool in `/admin/profiles`). Rationale: user-facing "public vs private" toggle was cognitive overhead for a thing that should be learned invisibly via `mapping_cache`. See discussion in the session transcript if this ever comes up.
- **VAT 21%** (not 19%). Updated across all user-facing pages. Worker code still references 19% historically — that's fine because worker VAT comes from source invoices at runtime, not defaults.
- **Bidirectional framing everywhere**. "WinMentor ⇄ SAGA, în ambele direcții". Stats/steps/FAQ on landing updated. Steps say "software sursă" / "software destinație" rather than naming either. Email footer updated.

### 2. Middleware posture changes

- **`server/middleware/security-headers.ts` was DELETED.** It conflicted with the nuxt-security module we now use. nuxt-security owns HSTS/CSP/X-Frame/Referrer/Permissions/nonces.
- **nuxt-security module** is configured in `nuxt.config.ts` with per-request nonces, `strict-dynamic`, Stripe + Google OAuth origins allowlisted. `rateLimiter: false` and `csrf: false` because we keep our own (`middleware/csrf.ts` + `middleware/rate-limit.ts`) which match SPEC semantics.
- **`server/middleware/user-auth.ts` is new.** Guards `/account` + `/account/*` (page redirect to `/login?next=<path>`) and `/api/me/*` + `/api/account/*` (JSON 401). Disjoint from admin-auth.
- **`admin-auth.ts` now redirects** to `/admin/login` on page auth failure (used to throw 401). API paths still 401.

### 3. New endpoints not in JOB.md

Shipped during this session, orchestrator-direct:
- `GET /api/auth/session` — current user session for header rendering
- `DELETE /api/auth/session` — user logout
- `GET /api/me/account` — email + createdAt for the Cont panel
- `GET /api/me/sessions` — list active sessions (marks current)
- `DELETE /api/me/sessions` — revoke all except current
- `DELETE /api/me/sessions/[id]` — revoke specific
- `GET /api/me/export` — full GDPR JSON dump, streamed as attachment
- `DELETE /api/me` — GDPR account deletion (soft-delete users, revoke sessions, null audit_log.userId, delete mapping_profiles, burn magic-link tokens, jobs+payments kept for legal retention)

Also new shared clients under `app/server/utils/`:
- `email.ts` — single-instance Resend wrapper (`sendEmail()`)
- `google-oauth.ts` — PKCE + authorize URL + code exchange + userinfo (raw fetch, no SDK)

### 4. UI primitives and patterns

- **`components/layout/ConfirmDialog.vue`** — reusable destructive/default confirm modal with loading spinner, cancel, fade+zoom transitions (I patched `DialogContent.vue` to drop shadcn's default sideways-slide animation). Used by logout, session revoke, revoke-all-sessions, account delete. **Use this for all confirmation UIs** going forward; don't inline `<Dialog>` instances.
- **`components/ui/pin-input/`** — shadcn-vue PinInput generated via CLI. Used by `/login` step 2. Paste-to-distribute + auto-verify on complete.
- **`components/ui/input/Input.vue`** — switched from `useVModel` passive pattern to `defineModel`. The old pattern was silently not propagating v-model from parents (first keystroke didn't enable submit buttons). All new shadcn-vue Input consumers benefit.
- **`error.vue`** — branded 404/500 page at `app/error.vue` with SiteHeader + SiteFooter, Romanian copy, working `clearError({ redirect: '/' })` button.

### 5. SSR cookie forwarding

When a Vue page calls its own `/api/...` during SSR, Nuxt's `$fetch` does **NOT** automatically forward the incoming request cookies. This broke session awareness on every page that fetched `/api/auth/session` during SSR. Pattern now used across the codebase:

```ts
const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined
const { data } = await useAsyncData('session', () =>
  $fetch<Shape>('/api/...', { headers }),
)
```

If you see a page that renders as logged-out despite a valid session cookie, this is the first thing to check.

### 6. `pages-admin` stubs

`/admin/login` (Google OAuth entry) and `/admin` (placeholder home with logout) exist as minimal stubs so the OAuth loop has somewhere to land. Real dashboard is the `pages-admin` group's job.

---

## Harness bugs / env quirks (carry-forward from Phase 1 + this session)

### 1. Worker worktrees sometimes base off stale commits / drift
Documented in prior HANDOFF. Still happening occasionally in this session — one worker's `git add` was denied, another's shell CWD drifted into the main checkout. **Mitigation that worked:** orchestrator reconstructs small tasks directly when the harness flakes (did it for `auth-admin-logout`).

### 2. Bash CWD drifts between `/app` and `/app/app`
Especially after `cd app && npx nuxi typecheck` — the next Bash call may or may not be in `/app/app`. **Mitigation:** prefix multi-step commands with `cd /Users/danime/Sites/rapidport.ro/app/app &&` or `cd /Users/danime/Sites/rapidport.ro/app &&` explicitly.

### 3. `useRequestHeaders(['cookie'])` MUST be passed explicitly on SSR fetches
Otherwise auth state breaks. See §5 above.

### 4. `nuxi typecheck` exit code is weird with pipes
`npx nuxi typecheck | tail -X` can report STATUS=0 even on real errors. Run without pipe when validating.

### 5. Dialog animations
Default shadcn-vue DialogContent has `slide-in-from-left-1/2` + `-translate-x-1/2` that combine weirdly. We dropped the slide classes in `DialogContent.vue`. If you regenerate via `npx shadcn-vue@latest add dialog`, the shadcn defaults will come back — re-apply the fix.

### 6. shadcn-vue CLI rejects `"framework": "nuxt"` key
Dropped it from `app/components.json`. If the CLI throws on future `add` calls, check that.

---

## Environment / secrets

`.env` at repo root (`/Users/danime/Sites/rapidport.ro/app/.env`) must have (Dani set these):

```
NODE_ENV=development
APP_URL=https://rapidport.ro
DATABASE_URL=postgresql://rapidport:...@127.0.0.1:5432/rapidport?sslmode=disable

ADMIN_EMAILS=daniel@digitap.eu            # SPEC Q#5 — real value in

RESEND_API_KEY=re_...
EMAIL_FROM=Rapidport <no-reply@rapidport.ro>

GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://rapidport.ro/api/auth/google/callback
```

Not yet set (blocking future work):
- Stripe keys (blocks `api-jobs-pay` + `api-webhooks-stripe`)
- SmartBill key (**blocked on SPEC Q#1 + Q#3** — legal entity + invoice series name)
- Anthropic key (needed once worker runs real jobs; not blocking UI work)
- Sentry DSN (observability group)

**Remember:** `env.ts` at `app/server/utils/env.ts` is the Zod validator — extend it when adding a new env var so boot fails loudly in prod if missing.

---

## Database

Local Postgres via Postgres.app 16. Migrations 0000/0001/0002 applied.

All 13 tables on main:
- `jobs`, `mapping_cache`, `ai_usage` (Phase 1 baseline)
- `users`, `sessions`, `magic_link_tokens` (auth-user)
- `admin_sessions`, `admin_oauth_state`, `admin_audit_log` (auth-admin)
- `payments`, `stripe_events` (payments)
- `mapping_profiles` (user overrides)
- `audit_log` (user-facing audit)
- `rate_limits`, `metrics` (support)

pg-boss will create its own `pgboss.*` schema on first worker connection. Schema owner is `rapidport` (`ALTER SCHEMA public OWNER TO rapidport`) — no CREATE EXTENSION needed.

---

## Open SPEC decisions (Dani-only)

These block specific future tasks. Dani must answer before those tasks can start:

- **Q#1: legal entity for invoices.** Gamerina SRL / Digitap / new SRL? Blocks `smartbill-client` + the "Emitent: ..." footer on `/account/invoices`.
- **Q#3: SmartBill invoice series.** I used `RAPIDPORT-YYYY-NNNN` as placeholder in UI stubs. Blocks `smartbill-client`.
- **Q#4: refund policy specifics.** Blocks `pages-legal/refund.vue` copy and `api-admin-jobs-actions` refund flow business rules.

Q#5 (ADMIN_EMAILS allowlist): answered — Dani set it.

---

## Next wave — api-jobs

**This is the critical path to the first customer.** Nothing the user flow needs (upload → pay → convert → download) works end-to-end because `api-jobs` hasn't shipped. The `/upload` Vue page exists but has no backend to POST to.

### Tasks (8) — SPEC §2.2 routes, see `jobs/phase2-nuxt/JOB.md` §api-jobs

| # | Task | Endpoint | Notes |
|---|---|---|---|
| 1 | `api-jobs-create` | `POST /api/jobs` | Issues anonymous token, 10/hr rate limit per IP (already in rate-limit middleware). Uses `generateAnonymousToken()` + `setAnonymousTokenCookie()` from `utils/anonymous-token.ts`. |
| 2 | `api-jobs-get` | `GET /api/jobs/[id]` | `assertJobAccess(id, event)` FIRST. Strip `anonymousAccessToken` from response before returning. |
| 3 | `api-jobs-upload` | `PUT /api/jobs/[id]/upload` | Multipart, 500 MB cap (Caddy enforces), magic-byte check (.zip/.tar.gz/.7z/.tgz). 3/hr rate limit per IP (already in middleware). Store as `/data/jobs/{id}/upload/{uuid}.{ext}`. |
| 4 | `api-jobs-discover` | `POST /api/jobs/[id]/discover` | Publishes pg-boss `discover` job. Need `app/server/utils/queue.ts` (pg-boss publisher — **not yet written**). |
| 5 | `api-jobs-events-sse` | `GET /api/jobs/[id]/events` | SSE, 2s Postgres poll of `jobs.progress_stage` + `progress_pct`, heartbeat every 15s. |
| 6 | `api-jobs-mapping` | `PATCH /api/jobs/[id]/mapping` | Zod-validated mapping updates written to `jobs.mapping_result` jsonb. |
| 7 | `api-jobs-pay` | `POST /api/jobs/[id]/pay` | Creates Stripe PaymentIntent. **Depends on `stripe-client` util (api-webhooks group) — run that first or parallel.** |
| 8 | `api-jobs-download-resync` | `GET /api/jobs/[id]/download` + `POST /api/jobs/[id]/resync` | Stream ZIP of output files, enforce `deltaSyncsUsed < deltaSyncsAllowed`. |

### Missing util before tasks 4 + 7

Two utils need to be written before their tasks:
- **`app/server/utils/queue.ts`** — pg-boss publisher wrapper (`publishDiscover()`, `publishConvert()`). Reads `DATABASE_URL`, maintains a single pg-boss instance, graceful shutdown via Nitro hook. Small task — bundle it into `api-jobs-discover` or do first as prep.
- **`app/server/utils/stripe.ts`** — `stripe-client` from api-webhooks group. Prep task, then `api-jobs-pay` + `api-webhooks-stripe` can run in parallel after.

### Suggested wave shape

- **Wave 4 prep (orchestrator, 1 commit):** `queue.ts` + `stripe.ts` + small type files in `app/server/types/queue.ts` (mirror Python Pydantic ConvertPayload/DiscoverPayload shapes from `worker/src/migrator/consumer.py` — **this is the Phase 1 cross-phase dependency** flagged in the Phase 1 GATE).
- **Wave 4 workers (6 parallel):** api-jobs-create, api-jobs-get, api-jobs-upload, api-jobs-discover, api-jobs-events-sse, api-jobs-mapping. All file-disjoint, all consume utils already on main.
- **Wave 4b (2 parallel after Wave 4):** api-jobs-pay, api-jobs-download-resync. Pay depends on stripe.ts; download depends on the file-store layout which is shaped by api-jobs-upload.
- **Wave 4c:** api-webhooks-stripe handler (depends on stripe.ts + stripe_events schema).

### Cross-phase sync check

**IMPORTANT:** before shipping `api-jobs-discover`, verify `app/server/types/queue.ts` exactly matches `worker/src/migrator/consumer.py` Pydantic models `DiscoverPayload` and `ConvertPayload`. No drift is acceptable — runtime will silently drop jobs if payloads don't parse.

---

## Other remaining work after api-jobs

- **api-webhooks-stripe** — Stripe webhook handler (constructEvent signature verify, 5-min replay window, `stripe_events` dedup, `payment_intent.succeeded` → mark PAID + publish convert + call SmartBill + email user, idempotent).
- **smartbill-client + api-webhooks-smartbill** — blocked on SPEC Q#1 + Q#3.
- **api-admin** — 8 admin endpoints; all guarded by admin-auth middleware that's already wired.
- **pages-admin** — 8 admin pages; `/admin` + `/admin/login` are stubs that can be extended.
- **pages-public remaining:** `/job/[id]/status` and `/job/[id]/result`. The pages-public tasks in JOB.md are partially out of date — many pages were built outside the job system. Verify what exists before spawning.
- **gdpr-cleanup-cron** — only the pg-boss scheduled job remains (delete /data/jobs/{id}/ older than 30d, mark jobs EXPIRED, prune rate_limits, orphan sweep). DELETE /api/me and GET /api/me/export already shipped.
- **email-guide** — Resend wrapper is done; still need 7 templates (`app/server/emails/*.vue`) and the SAGA import guide PDF.
- **i18n** — Romanian + English locales.
- **observability** — Sentry + metrics table writers.
- **infra** — docker-compose, Caddyfile, Hetzner runbook.
- **ci-tests** — GitHub Actions workflows.
- **gate** — Phase 2 gate review task.

---

## Product rules the next agent should not re-derive

Things that are NOT in SPEC.md but matter:

1. **No public mapping profiles for users.** `isPublic` + `adoptionCount` are admin-only. The user never sees a "make this public" toggle.
2. **Mapping learning is invisible.** `mapping_cache` absorbs high-confidence AI mappings from every migration automatically; the user doesn't opt into sharing — nothing of theirs is shared. Only the field→field mapping is cached, never company data.
3. **VAT is 21%** on user-facing pages.
4. **All confirmation UIs use `<LayoutConfirmDialog>`** — not ad-hoc Dialog instances. Variants: `default`, `destructive`. Props: `title`, `description`, `confirmLabel`, `cancelLabel`, `loading`, `v-model:open`.
5. **PIN auth, not magic-link.** `/login` is two-step, emails contain a 6-digit code.
6. **`/account` is a real dashboard** (migrations + invoices + stats), not a profile list.
7. **Admin login always stays at `/admin/login`** (nested under admin section). User login is flat at `/login`.

---

## Contact / escalation

- SPEC.md is the product truth. When the code contradicts SPEC, check `docs/LOG.md` for the decision that changed it; if nothing there, ask Dani before acting.
- Merge conflicts during squash: don't force-resolve. Rebase task branch on the latest group branch, re-test, retry.
- Hook failures: fix the root cause, don't `--no-verify`.
- Post-hook `task-complete-gate.sh` fires on Stop events if orchestrator is on a task branch without a DONE report. **Always return to `main` before ending a turn.**

Good luck. api-jobs is the big one.
