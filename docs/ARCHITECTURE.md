# Rapidport — Architecture

Current system architecture. Updated after every task that changes routes, schema, middleware, worker stages, services, or directory structure.

---

## Current State (2026-04-20)

Pre-production. Pre-launch.

- `phase0-discovery` — **done, merged to main** (2026-04-18).
- `phase1-worker` — **done, merged to main** (2026-04-19). Python worker (21 modules, 7,409 LoC) on main; gate passed with deferrals documented in `jobs/phase1-worker/GATE.md`.
- `phase2-nuxt` — groups done on main: `bootstrap` (7/7, 2026-04-17), `security-baseline` (3/3, 2026-04-19), `schema` (6/6, 2026-04-19), `auth-user` (5/5, 2026-04-19), `auth-admin` (4/4, 2026-04-19), **`api-jobs` (6/6 user-facing handlers, 2026-04-20)**. The 2026-04-20 session also shipped orchestrator-direct: PIN auth refactor, nuxt-security adoption, `/account` dashboard, GDPR endpoints, Wave 4 prep utilities (`utils/queue.ts`, `utils/stripe.ts`, `types/queue.ts`). See `docs/LOG.md` for full list. **Next wave:** `api-jobs` Wave 4b (pay + download/resync) and Wave 4c (Stripe webhook). **Remaining groups:** api-jobs, api-webhooks, api-admin, pages-admin, remaining pages-public (`/job/[id]/status`, `/job/[id]/result`), gdpr-cleanup (cron only — endpoints done), email-guide, i18n, observability, infra, ci-tests, gate.

**Product rules established in the 2026-04-20 session (not in SPEC.md — see jobs/HANDOFF.md):**
- Auth is **6-digit PIN** on email, not magic-link URL (corporate gateways prefetch).
- User auth routes are flat (`/login`, no `/verify`). Admin stays nested (`/admin/login`).
- Mapping-profile visibility (`isPublic`/`adoptionCount`) is **admin-only** — the user never sees a "make public" toggle. Platform learns invisibly via `mapping_cache`.
- VAT is **21%** on user-facing pages.
- All confirmation UIs use `<LayoutConfirmDialog>` — no ad-hoc Dialog instances.
- `/account` is a **dashboard** (migrations + invoices + stats), not a profile list.

**UI kit decision (2026-04-17):** switched from Mantine (React-only, incompatible with Vue/Nuxt) to **shadcn-nuxt** (Vue port of shadcn/ui) + **Tailwind v4 via `@tailwindcss/vite`**. Theme preserved verbatim per SPEC §"UI Design System". See `docs/LOG.md` for details.

See `jobs/INDEX.md` for live status.

---

## Directory Structure

```
rapidport.ro/app/                      # repo root (note: this is the project dir, not a Nuxt subfolder)
│
├── app/                               # Nuxt 3 (SSR + Nitro), Node 22 LTS, dev port 3015
│   ├── nuxt.config.ts                 # ssr true, ts strict, devServer.port 3015, nitro websocket experimental, @fontsource css imports
│   ├── tsconfig.json                  # extends .nuxt/tsconfig.json, strict + noUncheckedIndexedAccess + noImplicitOverride
│   ├── package.json                   # nuxt^3.13 vue^3.5 zod^3.23 @fontsource/inter^5 @fontsource/jetbrains-mono^5 runtime
│   ├── package-lock.json              # committed for reproducible installs
│   ├── app.vue                        # minimal <NuxtLayout><NuxtPage /></NuxtLayout>
│   ├── error.vue                      # branded 404/500 page — SiteHeader + SiteFooter + theme tokens
│   ├── pages/
│   │   ├── index.vue                  # landing (MinIO-inspired, bidirectional copy, uses <LayoutSiteHeader />)
│   │   ├── login.vue                  # PIN auth: step 1 email → step 2 6-digit PinInput (auto-verify on complete)
│   │   ├── upload.vue                 # file upload drop zone (API wiring pending with api-jobs-upload)
│   │   ├── account/
│   │   │   ├── index.vue              # dashboard — stats cards, recent migrations, recent invoices, quick links
│   │   │   ├── migrations.vue         # full migration history (stub until api-jobs-list)
│   │   │   ├── invoices.vue           # SmartBill invoices table, PDF download (stub until smartbill-client)
│   │   │   ├── profiles.vue           # mapping overrides — framed as advanced, empty-state default
│   │   │   └── security.vue           # Cont panel + sessions list + data export + danger-zone delete (all wired)
│   │   ├── admin/
│   │   │   ├── login.vue              # 'Sign in with Google' button → /api/auth/google/start
│   │   │   └── index.vue              # placeholder dashboard stub (logout button wired) — pages-admin owns the real one
│   │   ├── job/[id]/
│   │   │   ├── discovery.vue          # (pre-existing)
│   │   │   ├── mapping.vue            # (pre-existing)
│   │   │   └── pay.vue                # (pre-existing — VAT updated to 21%)
│   │   └── legal/                     # terms/privacy/dpa/refund (pre-existing)
│   ├── assets/css/
│   │   └── tailwind.css               # @import "tailwindcss"; :root Rapidport tokens + shadcn alias vars + @theme inline + .light overrides + html/body dark baseline
│   ├── components.json                # shadcn-vue config (Rapidport-flat aliases; 'framework' key dropped — new shadcn-vue CLI rejects it)
│   ├── components/layout/             # Rapidport-specific layout components (auto-imported as Layout*)
│   │   ├── SiteHeader.vue             # auth-aware nav: logged-in email dropdown (Contul meu / Securitate / Ieșire) or Autentificare link
│   │   ├── SiteFooter.vue             # global footer
│   │   ├── LegalPage.vue              # legal page wrapper
│   │   └── ConfirmDialog.vue          # reusable confirmation modal — v-model:open, variant default/destructive, loading, fade+zoom
│   ├── components/ui/                 # shadcn primitives — auto-imported by shadcn-nuxt
│   │   ├── accordion/                 # Accordion, AccordionContent, AccordionItem, AccordionTrigger
│   │   ├── alert/                     # Alert, AlertDescription, AlertTitle
│   │   ├── badge/                     # Badge + variants (default, secondary, destructive, outline)
│   │   ├── button/                    # Button + variants (default, destructive, outline, secondary, ghost, link)
│   │   ├── card/                      # Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
│   │   ├── dialog/                    # Dialog — shadcn default slide-in-from-left REMOVED; fade+zoom only
│   │   ├── input/                     # Input using defineModel (switched from useVModel — fixes silent v-model propagation)
│   │   ├── pin-input/                 # PinInput + Group + Slot + Separator (reka-ui wrapper) — paste-distributes, @complete
│   │   └── table/                     # Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption, TableFooter, TableEmpty
│   ├── lib/
│   │   └── utils.ts                   # cn() helper (clsx + tailwind-merge)
│   ├── theme/                         # design tokens — TypeScript source of truth; mirrored by tailwind.css :root
│   │   ├── index.ts                   # color (dark+light+accent+semantic), fontFamily, fontScale, fontWeight, space, radius, zIndex
│   │   └── types.ts                   # inferred TypeScript types for props (ColorToken, FontScaleToken, etc.)
│   ├── server/
│   │   ├── db/
│   │   │   ├── schema.ts              # re-exports all sibling schema files
│   │   │   ├── schema/
│   │   │   │   ├── jobs.ts            # jobs — Phase 1 progress_* + Phase 2 user/anon/upload/discovery/mapping/billing; uploadDiskFilename added by 0003
│   │   │   │   ├── mapping_cache.ts   # cached Haiku field mappings, unique (source, table, field)
│   │   │   │   ├── ai_usage.ts        # per-call Anthropic token + cost tracking
│   │   │   │   ├── users.ts           # users — email (unique) + email_hash (indexed) + deleted_at soft-delete
│   │   │   │   ├── sessions.ts        # user sessions — token_hash (SHA-256), user_id FK cascade, no IP bind
│   │   │   │   ├── magic_link_tokens.ts  # hashed single-use tokens — 15-min TTL, email+expires_at index
│   │   │   │   ├── admin_sessions.ts  # admin sessions — email, ip_hash (IP-bound), 8h TTL
│   │   │   │   ├── admin_oauth_state.ts  # PKCE state+verifier — 10-min TTL (cron-pruned)
│   │   │   │   ├── payments.ts        # Stripe payment + SmartBill invoice records, refund tracking
│   │   │   │   ├── stripe_events.ts   # Stripe webhook idempotency dedup by event ID
│   │   │   │   ├── mapping_profiles.ts  # saved mapping rule sets — user_id FK, isPublic, adoptionCount
│   │   │   │   ├── audit_log.ts       # user-facing audit — append-only, anonymized on GDPR delete
│   │   │   │   ├── admin_audit_log.ts # every admin action — append-only, NEVER purged
│   │   │   │   ├── rate_limits.ts     # sliding-window state for middleware/rate-limit.ts
│   │   │   │   └── metrics.ts         # admin dashboard time-series (jobs/hour, payment success, etc.)
│   │   │   └── client.ts              # pg Pool (max 20) + Drizzle instance, exports `db` and `pool`
│   │   ├── middleware/                # Nitro global middleware (alphabetical load order)
│   │   │   ├── admin-auth.ts          # /admin/* → redirect to /admin/login on failure; /api/admin/* → 401/403 JSON
│   │   │   ├── csrf.ts                # double-submit cookie (rp_csrf ↔ x-csrf-token), webhook exempt
│   │   │   ├── rate-limit.ts          # sliding window on rate_limits table; fail-closed for admin login
│   │   │   └── user-auth.ts           # /account/* → redirect to /login?next=<path>; /api/me/* + /api/account/* → 401 JSON
│   │   │                              # (security-headers.ts REMOVED — nuxt-security module handles CSP/HSTS/etc)
│   │   ├── types/
│   │   │   └── queue.ts               # snake_case mirror of worker Pydantic ConvertPayload + DiscoverPayload
│   │   ├── utils/
│   │   │   ├── env.ts                 # Zod EnvSchema (ADMIN_EMAILS + Resend + Google OAuth + Stripe); only reader of process.env
│   │   │   ├── auth-user.ts           # user session lifecycle — SHA-256 hashed tokens, 30d TTL
│   │   │   ├── auth-admin.ts          # admin session lifecycle — 8h TTL, IP-hash bound, 'admin_session' cookie
│   │   │   ├── anonymous-token.ts     # per-job access token — cookie job_access_${id}, SameSite Strict
│   │   │   ├── assert-admin-session.ts # IP drift → revoke+401; allowlist miss → 403
│   │   │   ├── assert-job-access.ts   # three-way gate: admin (+audit) → owner → anon token → 403
│   │   │   ├── email.ts               # Resend wrapper, single-instance, sendEmail() — never logs recipient/body
│   │   │   ├── google-oauth.ts        # PKCE + authorize URL + token exchange + userinfo (raw fetch, no SDK)
│   │   │   ├── queue.ts               # pg-boss publisher singleton — publishConvert/publishDiscover, lazy init + createQueue
│   │   │   └── stripe.ts              # Stripe SDK singleton + jobPaymentIdempotencyKey('job_{id}_pay')
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── magic-link.post.ts       # issue 6-digit PIN email — rate-limited 5/hr per email, fail-closed (name kept for back-compat)
│   │   │   │   ├── verify.post.ts           # consume PIN code + atomic find-or-create user + session + anonymous-job claim
│   │   │   │   ├── session.get.ts           # current user session { email } or { email: null } — header auth state
│   │   │   │   ├── session.delete.ts        # user logout — revoke + clear cookie
│   │   │   │   └── google/
│   │   │   │       ├── start.get.ts         # PKCE + state → Google authorize URL (302)
│   │   │   │       └── callback.get.ts      # one-shot state → allowlist → createAdminSession
│   │   │   ├── me/
│   │   │   │   ├── account.get.ts           # { email, createdAt } for Cont panel
│   │   │   │   ├── export.get.ts            # GDPR JSON dump — streams as attachment
│   │   │   │   ├── index.delete.ts          # GDPR account deletion — atomic transaction, soft-delete users
│   │   │   │   ├── sessions.get.ts          # list active sessions (marks current)
│   │   │   │   ├── sessions.delete.ts       # revoke all except current
│   │   │   │   └── sessions/[id].delete.ts  # revoke one specific
│   │   │   ├── admin/
│   │   │   │   └── logout.post.ts           # revokeAdminSession + audit
│   │   │   └── jobs/
│   │   │       ├── index.post.ts            # POST /api/jobs — Zod {source,target,billingEmail?}; mints anon token; sets cookie; 10/hr/IP rate limit
│   │   │       ├── [id].get.ts              # GET  /api/jobs/[id] — assertJobAccess first; strips anonymousAccessToken from response
│   │   │       └── [id]/
│   │   │           ├── upload.put.ts        # PUT  /api/jobs/[id]/upload — multipart, magic-byte sniff (zip|tgz|7z), 500MB cap, 3/hr/IP; persists uploadDiskFilename
│   │   │           ├── discover.post.ts     # POST /api/jobs/[id]/discover — uses jobs.uploadDiskFilename; publishDiscover(); progress=queued
│   │   │           ├── events.get.ts        # GET  /api/jobs/[id]/events — SSE (2s poll, 15s heartbeat, terminal-state close, 10min cap)
│   │   │           ├── mapping.patch.ts     # PATCH /api/jobs/[id]/mapping — Zod-validated mapping update; state guard mapped→reviewing
│   │   │           ├── pay.post.ts          # POST /api/jobs/[id]/pay — Stripe PaymentIntent (60_400 bani RON); idempotent re-click; returns clientSecret only
│   │   │           ├── download.get.ts      # GET  /api/jobs/[id]/download — streams /data/jobs/{id}/output.zip; 501 if no zip bundler wired
│   │   │           └── resync.post.ts       # POST /api/jobs/[id]/resync — quota-gated (deltaSyncsUsed/Allowed); publishConvert() with mapping_profile=null; atomic ++
│   │   └── plugins/
│   │       ├── env-check.ts           # side-effect import of env — validation fires at Nitro boot
│   │       └── queue-shutdown.ts      # Nitro 'close' hook → stopQueue() for graceful pg-boss shutdown
│   ├── drizzle.config.ts              # drizzle-kit CLI config (documented process.env exception)
│   ├── drizzle/
│   │   ├── 0000_steady_malcolm_colcord.sql   # baseline — jobs (minimal), mapping_cache, ai_usage
│   │   ├── 0001_nebulous_malcolm_colcord.sql # Wave 1 — users, sessions, magic_link_tokens
│   │   ├── 0002_bouncy_star_brand.sql        # Wave 2 — 9 new tables + jobs ALTER + FKs
│   │   └── meta/                      # drizzle-kit journal + snapshot
│   └── .nvmrc                         # Node 22

├── .env.example                       # env placeholders — real .env is gitignored
│
├── worker/                            # Python 3.12 worker — NOT YET IMPLEMENTED (Phase 1)
│
├── samples/                           # gitignored — real WinMentor + SAGA data
│   ├── winmentor/20260409.TGZ         # 8 MB; 19,600 files (447 root + 51 monthly folders, Dec 2021 → Feb 2026)
│   └── saga/CONT_BAZA.FDB             # 37 MB Firebird DB — SAGA internal storage, schema source
│
├── jobs/                              # multi-agent job tracking
│   ├── INDEX.md                       # master status
│   ├── phase0-discovery/              # 5 tasks + JOB + REQUIREMENTS
│   ├── phase1-worker/                 # JOB + REQUIREMENTS (tasks expanded at spawn time)
│   └── phase2-nuxt/                   # JOB + REQUIREMENTS + expanded tasks as they run
│
├── docs/                              # this file, LOG, ADRs (added as created)
│
├── CLAUDE.md                          # project rules
├── ONSTART.md                         # agent operating manual
├── CODING.md                          # engineering patterns
├── SPEC.md                            # product spec
├── SECURITY_REVIEWER.md               # audit playbook
├── TESTING.md                         # two-layer rule
└── .gitignore                         # Nuxt + Python + samples + .claude + graphify-out
```

**Not yet present** (will appear in later tasks):
- `app/theme/` — design tokens (bootstrap-theme)
- `app/components/primitives/` — Mantine-override layer (bootstrap-primitives)
- `app/server/` — Nitro routes, middleware, utils, db, types (auth + api + webhook tasks)
- `app/drizzle/` + `app/server/db/schema.ts` — Drizzle (bootstrap-drizzle)
- `app/locales/` — Romanian + English i18n (i18n task)
- `infra/` — docker-compose, Caddyfile, Hetzner runbook (infra tasks)
- `migrations/001_worker_bootstrap.sql` — Phase 1 stopgap, to be subsumed by Drizzle

---

## External Dependencies (as of bootstrap-nuxt merge)

### Runtime

| Package | Version | Status |
| --- | --- | --- |
| `nuxt` | `^3.13` | installed |
| `vue` | `^3.5` | installed |
| `zod` | `^3.23` | installed |
| `@fontsource/inter` | `^5.2` | installed (weights 400/500/600) |
| `@fontsource/jetbrains-mono` | `^5.2` | installed (weight 400) |
| `drizzle-orm` | `^0.33` | installed |
| `pg` | `^8.12` | installed |
| `pg-boss` | `^10.0` | installed (not yet initialized — Phase 2 `queue` tasks will wire) |
| `tailwindcss` | `^4.2` | installed via `@tailwindcss/vite` |
| `@tailwindcss/vite` | `^4.2` | installed |
| `class-variance-authority` | `^0.7` | installed (shadcn peer) |
| `clsx` | `^2.1` | installed (shadcn peer) |
| `tailwind-merge` | `^3.5` | installed (v3 for Tailwind v4 compat) |
| `lucide-vue-next` | `^0.400` | installed (icon set) |
| `reka-ui` | `^2.9` | installed (Vue port of Radix — shadcn headless base) |
| `@vueuse/core` | `^14.2` | installed (shadcn CLI promoted from transitive; used by `Input`, `TableEmpty`) |

### Dev

| Package | Version | Status |
| --- | --- | --- |
| `typescript` | `^5.5` | installed |
| `@types/node` | `^22` | installed |
| `vitest` | `^2` | installed — 6 moderate CVEs; dev-only path |
| `@vitest/coverage-v8` | `^2` | installed |

### Pending (added by later tasks)

`@mantine/core`, `@mantine/hooks`, `@mantine/form`, `drizzle-orm`, `drizzle-kit`, `pg`, `pg-boss`, `stripe`, `resend`, `nuxt-auth-utils`, `nuxt-csurf`, `@fontsource/inter`, `@fontsource/jetbrains-mono`, `@nuxtjs/i18n`, `@sentry/nuxt`, `file-type`, `nanoid`, `@testcontainers/postgresql`.

### External services (not wired yet)

Stripe, SmartBill, Anthropic (Haiku), Resend, Google OAuth, Sentry.

---

## Runtime Topology (planned; not yet deployed)

Per SPEC §"Architecture Overview":

```
Caddy (HTTPS, request_body max 500M)
  │
  ├── Nuxt 3 container (Node 22 LTS, port 3015 dev → 80/443 behind Caddy in prod)
  │     ├── Nitro HTTP (user + admin routes, webhooks, SSE)
  │     ├── Drizzle → Postgres
  │     └── pg-boss publisher → Postgres queue tables
  │
  ├── Python worker container (Python 3.12, non-root, mem 1g, cpu 1.0, net-isolated)
  │     ├── pg-boss subscriber → Postgres queue tables
  │     ├── asyncpg → Postgres (jobs, mapping_cache, ai_usage)
  │     └── Anthropic API egress only
  │
  ├── Postgres 16 container (shared: app + pg-boss + rate_limits + audit)
  │
  └── Shared /data/jobs/ volume (mounted into Nuxt + worker)
```

---

## Change log for this file

Only append major architectural shifts here; routine additions are covered by `docs/LOG.md`.

- 2026-04-17: initial version at `bootstrap-nuxt` merge.
