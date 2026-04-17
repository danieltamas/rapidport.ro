---
job: phase2-nuxt
phase: 2
title: Nuxt App, Admin, Productization
status: blocked
blocked-by: phase1-worker
duration-estimate: 5-7 days
gate: SPEC §2.8
---

# Phase 2 — Nuxt App, Admin, Productization

Goal: ship the public app, admin dashboard, payment + invoicing integrations, observability, deployment, and CI. End state: a real accountant can upload a WinMentor archive, pay, download SAGA-importable files; Dani can manage everything from `/admin/*`.

**Reference:** SPEC.md §"PHASE 2 — Nuxt App, Admin, Productization"

**Entry condition:** `phase1-worker` gate = passed for all groups EXCEPT `bootstrap`. CLI + pg-boss consumer must be production-ready before `auth-*`, `api-*`, `pages-*`, `gdpr-cleanup`, and `email-guide` groups start.

**Bootstrap exception:** the `bootstrap` group (Nuxt scaffold, theme tokens, fonts, Zod env validation, Drizzle baseline schema, shadcn-nuxt + Tailwind v4 setup, shadcn primitives) depends on NO Phase 0 or Phase 1 output. It runs immediately in parallel with Phase 0 discovery — unblocking the Drizzle schema for Phase 1's worker (no raw-SQL stopgap) and priming the foundation so later Phase 2 groups layer onto a running app.

---

## Phase 2 Groups

| Group | Purpose | Task count | Depends on |
| --- | --- | --- | --- |
| [`bootstrap`](#group-bootstrap) | Nuxt, theme, fonts, primitives, env, Drizzle baseline | 7 | — |
| [`security-baseline`](#group-security-baseline) | headers, CSRF, rate limit middleware | 3 | bootstrap |
| [`schema`](#group-schema) | Drizzle schema for all Phase 2 tables | 6 | bootstrap |
| [`auth-user`](#group-auth-user) | magic link, session, anonymous token, `assertJobAccess` | 5 | schema, security-baseline |
| [`auth-admin`](#group-auth-admin) | Google OAuth allowlist, IP-bound admin session | 4 | schema, security-baseline |
| [`api-jobs`](#group-api-jobs) | user-facing job endpoints | 8 | auth-user, security-baseline |
| [`api-webhooks`](#group-api-webhooks) | Stripe + SmartBill integration | 3 | schema |
| [`api-admin`](#group-api-admin) | admin endpoints + `admin_audit_log` writers | 8 | auth-admin, schema |
| [`pages-public`](#group-pages-public) | landing, job flow, profiles, legal | 7 | bootstrap, api-jobs |
| [`pages-admin`](#group-pages-admin) | admin dashboard pages | 8 | bootstrap, api-admin |
| [`gdpr-cleanup`](#group-gdpr-cleanup) | GDPR endpoints, file cleanup cron | 3 | schema, auth-user |
| [`email-guide`](#group-email-guide) | Resend templates, SAGA import guide PDF | 3 | bootstrap |
| [`i18n`](#group-i18n) | Romanian + English locales | 1 | bootstrap |
| [`observability`](#group-observability) | Sentry + metrics | 2 | bootstrap |
| [`infra`](#group-infra) | docker-compose, Caddy, Hetzner setup | 3 | all code groups landed |
| [`ci-tests`](#group-ci-tests) | GitHub Actions for type/lint/tests/security/gitleaks | 4 | any code landed |
| [`gate`](#group-gate) | Phase 2 gate review | 1 | all above |

**Total:** 76 tasks.

## Progress

| Date | Task | Status | Merge commit |
| --- | --- | --- | --- |
| 2026-04-17 | `bootstrap / bootstrap-nuxt` | done (on main) | `0179d3b` (squash) → `908167b` (merge to main) |
| 2026-04-17 | `bootstrap / bootstrap-theme` | done (on main) | `5955b73` (squash) → `908167b` (merge to main) |
| 2026-04-17 | `bootstrap / bootstrap-env` | done (on main) | `33cd6ad` (squash) → `908167b` (merge to main) |
| 2026-04-17 | `bootstrap / bootstrap-fonts` | done (on main) | `cb5fae1` (squash) → `908167b` (merge to main) |
| 2026-04-17 | `bootstrap / bootstrap-drizzle` | done (on main) | `ae4e284` |
| 2026-04-17 | `bootstrap / bootstrap-shadcn-setup` | done (on main) | `19e949e` |
| 2026-04-17 | `bootstrap / bootstrap-primitives` | done (on main) | `174a452` |

**Bootstrap group complete: 7/7 tasks merged to main.** Ready for Phase 0 discovery continuation + Phase 1 worker once Phase 0 gate passes.



---

## Parallelism Map

```
bootstrap ──► security-baseline ──► schema
                                      │
                            ┌─────────┴──────────┐
                            ▼                    ▼
                        auth-user          auth-admin
                            │                    │
                            └────────┬───────────┘
                                     │
                  ┌──────────────────┼──────────────────┐
                  ▼                  ▼                  ▼
              api-jobs          api-webhooks        api-admin
                  │                  │                  │
                  └─────── + email-guide + i18n + observability (parallel) ──┐
                                                                             │
                       ┌─────────────────────────────────────────────────────┤
                       ▼                                                     │
                 pages-public ──► gdpr-cleanup                              │
                       │                                                     │
                 pages-admin ◄────────────────────────────────────────────── │
                       │                                                     │
                       └──────► infra + ci-tests (parallel) ──► gate        │
                                                                             │
```

**Peak parallelism** (can spawn simultaneously):
- All 6 `schema` tasks after `bootstrap-drizzle` (disjoint Drizzle files per table group)
- `auth-user` + `auth-admin` (fully disjoint)
- All 8 `api-jobs` tasks (one file per endpoint)
- All 8 `api-admin` tasks (one file per endpoint group)
- All 7 `pages-public` tasks (one file per page — collisions only if they share a layout; see per-task notes)
- `email-guide` + `i18n` + `observability` (independent)
- `infra` + `ci-tests` (independent of each other)

**Hard serializations:**
- `bootstrap` tasks 1→7 in order (each lays foundation for the next)
- `security-baseline` before any API/page work (middleware stack is prerequisite)
- `schema` before any route handler (routes need tables)
- `auth-*` before `api-jobs`/`api-admin` (access check helpers required)
- `api-jobs`/`api-admin` before `pages-public`/`pages-admin` (pages consume APIs)

---

## Group: `bootstrap`

Sequential. Lays the foundation for every downstream task.

| # | Task | Branch | Priority | Files touched |
| --- | --- | --- | --- | --- |
| 1 | `bootstrap-nuxt` | `...-bootstrap-nuxt` | critical | `app/package.json`, `app/nuxt.config.ts`, `app/tsconfig.json` |
| 2 | `bootstrap-theme` | `...-bootstrap-theme` | critical | `app/theme/index.ts` (design tokens — TypeScript source of truth) |
| 3 | `bootstrap-fonts` | `...-bootstrap-fonts` | high | `@fontsource/inter`, `@fontsource/jetbrains-mono` wired in `nuxt.config.ts` |
| 4 | `bootstrap-env` | `...-bootstrap-env` | critical | `app/server/utils/env.ts` — Zod validation at boot per CODING.md §13.1 |
| 5 | `bootstrap-drizzle` | `...-bootstrap-drizzle` | critical | `app/server/db/{schema.ts,client.ts}`, `app/drizzle/`, `app/package.json` scripts, **takes over from Phase 1's `migrations/001_worker_bootstrap.sql`** |
| 6 | `bootstrap-shadcn-setup` | `...-bootstrap-shadcn-setup` | critical | `shadcn-nuxt` module + Tailwind v4 (`@tailwindcss/vite`), `app/assets/css/tailwind.css` mapping theme tokens to shadcn CSS vars, `app/components.json`, `app/lib/utils.ts` — supersedes the original Mantine-override task (Mantine is React-only; see bootstrap-shadcn-setup.md Background) |
| 7 | `bootstrap-primitives` | `...-bootstrap-primitives` | critical | `npx shadcn-vue@latest add button input card table badge alert` — generated components land in `app/components/ui/*.vue` |

---

## Group: `security-baseline`

Parallel after bootstrap.

| # | Task | Branch | Priority | Files touched |
| --- | --- | --- | --- | --- |
| 1 | `security-headers` | `...-security-headers` | critical | `app/server/middleware/security-headers.ts` — HSTS, CSP (no `unsafe-inline`, allow Stripe/Google origins), X-Frame, Referrer, Permissions-Policy |
| 2 | `security-csrf` | `...-security-csrf` | critical | `app/server/middleware/csrf.ts` + `nuxt-csurf` config — webhook path exempt list is ONLY `/api/webhooks/*` |
| 3 | `security-rate-limit` | `...-security-rate-limit` | critical | `app/server/middleware/rate-limit.ts` — sliding window on `rate_limits` table; per-route limits per SPEC §S.10; **fails closed** for auth paths |

---

## Group: `schema`

Fully parallel after `bootstrap-drizzle`. Each task edits a disjoint section of `app/server/db/schema.ts` — workers touch different regions of the same file. **If parallelizing, use separate sub-files (`app/server/db/schema/*.ts`) merged in `schema.ts` to avoid conflicts** — decide in task 1.

| # | Task | Branch | Priority | Tables |
| --- | --- | --- | --- | --- |
| 1 | `schema-users-sessions` | `...-schema-users-sessions` | critical | `users`, `sessions`, `magic_link_tokens` |
| 2 | `schema-admin` | `...-schema-admin` | critical | `admin_sessions`, `admin_oauth_state` |
| 3 | `schema-jobs-payments` | `...-schema-jobs-payments` | critical | extend `jobs` with all Phase 2 columns (`userId`, `anonymousAccessToken`, `uploadFilename`, `billingEmail`, `mappingProfileId`, etc.); add `payments`, `stripe_events` |
| 4 | `schema-profiles` | `...-schema-profiles` | high | `mapping_profiles`; extend `mapping_cache` if Phase 1 shape needs growth |
| 5 | `schema-audit` | `...-schema-audit` | critical | `audit_log`, `admin_audit_log` (append-only — verify no UPDATE/DELETE paths anywhere in Phase 2) |
| 6 | `schema-support` | `...-schema-support` | medium | `rate_limits`, `metrics` |

---

## Group: `auth-user`

| # | Task | Branch | Priority | Files touched |
| --- | --- | --- | --- | --- |
| 1 | `auth-magic-link-request` | `...-auth-magic-link-request` | critical | `app/server/api/auth/magic-link.post.ts` — Zod email, rate limit 5/hr, Resend email, hashed token storage |
| 2 | `auth-magic-link-verify` | `...-auth-magic-link-verify` | critical | `app/server/api/auth/verify.get.ts` — single-use check, 15-min expiry, session creation, anonymous job claim-on-login |
| 3 | `auth-session-util` | `...-auth-session-util` | critical | `app/server/utils/auth-user.ts` — `getUserSession`, `createUserSession`, `revokeSession`; cookie flags HttpOnly+Secure+SameSite=Lax |
| 4 | `auth-anonymous-token` | `...-auth-anonymous-token` | critical | `app/server/utils/anonymous-token.ts` — generate 128-bit token, `timingSafeEqual` verify, cookie scoped to `/job/{id}/*` with SameSite=Strict |
| 5 | `auth-job-access` | `...-auth-job-access` | critical | `app/server/utils/assert-job-access.ts` — three-way check per CODING.md §13.8 |

---

## Group: `auth-admin`

| # | Task | Branch | Priority | Files touched |
| --- | --- | --- | --- | --- |
| 1 | `auth-google-start` | `...-auth-google-start` | critical | `app/server/api/auth/google/start.get.ts` — PKCE + cryptographic state; rate limit 10/hr per IP |
| 2 | `auth-google-callback` | `...-auth-google-callback` | critical | `app/server/api/auth/google/callback.get.ts` — state match, code_verifier, `email_verified`, `ADMIN_EMAILS` allowlist, non-allowed → `admin_audit_log` + 403 |
| 3 | `auth-admin-session` | `...-auth-admin-session` | critical | `app/server/utils/auth-admin.ts` + `app/server/utils/assert-admin-session.ts` + `app/server/middleware/admin-auth.ts` — IP binding per CODING.md §13.7; 8h TTL |
| 4 | `auth-admin-logout` | `...-auth-admin-logout` | high | `app/server/api/admin/logout.post.ts` — revoke session + clear cookie + `admin_audit_log` entry |

---

## Group: `api-jobs`

Parallel — one handler per task.

| # | Task | Branch | Priority | Endpoint |
| --- | --- | --- | --- | --- |
| 1 | `api-jobs-create` | `...-api-jobs-create` | critical | `POST /api/jobs` — anonymous token issued, 10/hr rate limit |
| 2 | `api-jobs-get` | `...-api-jobs-get` | critical | `GET /api/jobs/[id]` — `assertJobAccess` first, strip billing fields in public response |
| 3 | `api-jobs-upload` | `...-api-jobs-upload` | critical | `PUT /api/jobs/[id]/upload` — 500 MB cap, magic-byte check, stored as `{uuid}.{ext}`, 3/hr rate limit |
| 4 | `api-jobs-discover` | `...-api-jobs-discover` | critical | `POST /api/jobs/[id]/discover` — publish pg-boss `discover` job |
| 5 | `api-jobs-events-sse` | `...-api-jobs-events-sse` | critical | `GET /api/jobs/[id]/events` — Server-Sent Events, 2s Postgres poll, heartbeat, reconnect-friendly |
| 6 | `api-jobs-mapping` | `...-api-jobs-mapping` | critical | `PATCH /api/jobs/[id]/mapping` — Zod-validated mapping updates |
| 7 | `api-jobs-pay` | `...-api-jobs-pay` | critical | `POST /api/jobs/[id]/pay` — Stripe PaymentIntent with idempotency key `job_{id}_pay`, returns client_secret |
| 8 | `api-jobs-download-resync` | `...-api-jobs-download-resync` | critical | `GET /api/jobs/[id]/download` (stream output ZIP) + `POST /api/jobs/[id]/resync` (delta sync, counts against `deltaSyncsAllowed`) |

---

## Group: `api-webhooks`

| # | Task | Branch | Priority | Files touched |
| --- | --- | --- | --- | --- |
| 1 | `stripe-client` | `...-stripe-client` | critical | `app/server/utils/stripe.ts` — SDK wrapper, retry, typed helpers |
| 2 | `smartbill-client` | `...-smartbill-client` | critical | `app/server/utils/smartbill.ts` — REST client, retry 3× backoff, invoice series `LEXITO-[YYYY]-[XX]` TBD per SPEC open question #3 |
| 3 | `api-webhooks-stripe` | `...-api-webhooks-stripe` | critical | `app/server/api/webhooks/stripe.post.ts` — `constructEvent` signature verification, 5-min replay window, `stripe_events` dedup, `payment_intent.succeeded` side effects (mark PAID, publish convert, call SmartBill, email user), idempotent |

---

## Group: `api-admin`

Parallel. Every handler writes to `admin_audit_log` synchronously.

| # | Task | Branch | Priority | Endpoints |
| --- | --- | --- | --- | --- |
| 1 | `api-admin-stats` | `...-api-admin-stats` | high | `GET /api/admin/stats` — dashboard numbers from `metrics` + live queries |
| 2 | `api-admin-jobs-list` | `...-api-admin-jobs-list` | critical | `GET /api/admin/jobs` — filters, pagination 50/pg, whitelisted sort |
| 3 | `api-admin-jobs-detail` | `...-api-admin-jobs-detail` | critical | `GET /api/admin/jobs/[id]` — full join (job + payment + audit), bypasses ownership, logs `job_viewed` |
| 4 | `api-admin-jobs-actions` | `...-api-admin-jobs-actions` | critical | refund, extend-syncs, resend-download, force-state, re-run, delete — one file each under `app/server/api/admin/jobs/[id]/` |
| 5 | `api-admin-users` | `...-api-admin-users` | high | list + detail + grant-syncs + block + delete |
| 6 | `api-admin-payments` | `...-api-admin-payments` | high | `GET /api/admin/payments` — filters + refund trigger reuses api-admin-jobs-actions |
| 7 | `api-admin-ai` | `...-api-admin-ai` | high | `GET /api/admin/ai` — 30-day trend, top unmapped fields, low-confidence mappings |
| 8 | `api-admin-misc` | `...-api-admin-misc` | medium | profiles (list + promote/hide), audit (read `admin_audit_log`), errors (Sentry digest), settings (env display redacted, maintenance actions), sessions (revoke) |

---

## Group: `pages-public`

Parallel. Consumes `api-jobs` + `auth-user`.

| # | Task | Branch | Priority | Pages |
| --- | --- | --- | --- | --- |
| 1 | `pages-landing` | `...-pages-landing` | critical | `/` — hero, stats band, how-it-works, pricing, FAQ, footer (per SPEC UI §"Landing page structure") |
| 2 | `pages-upload` | `...-pages-upload` | critical | `/upload` — drag-drop, progress, redirect to `/job/[id]/status` |
| 3 | `pages-job-status-discovery-result` | `...-pages-job-status-discovery-result` | critical | `/job/[id]/status`, `/job/[id]/discovery`, `/job/[id]/result` — mostly passive, SSE progress |
| 4 | `pages-job-mapping` | `...-pages-job-mapping` | critical | `/job/[id]/mapping` — desktop-only RO banner on <1024px, interactive mapping UI, submit via PATCH |
| 5 | `pages-job-pay` | `...-pages-job-pay` | critical | `/job/[id]/pay` — Stripe Elements, billing info form (PJ/PF), confirmation |
| 6 | `pages-profiles-account-auth` | `...-pages-profiles-account-auth` | high | `/profiles`, `/account/security`, `/auth/login`, `/auth/verify` |
| 7 | `pages-legal` | `...-pages-legal` | critical | `/legal/terms`, `/legal/privacy`, `/legal/dpa`, `/legal/refund` — light mode, long-form readable layout |

---

## Group: `pages-admin`

Parallel. English locale.

| # | Task | Branch | Priority | Pages |
| --- | --- | --- | --- | --- |
| 1 | `pages-admin-shell` | `...-pages-admin-shell` | critical | `/admin` layout — sidebar 240px (collapsible to 64px), topbar, ADMIN red banner, breadcrumbs |
| 2 | `pages-admin-login` | `...-pages-admin-login` | critical | `/admin/login` — "Sign in with Google" button only, no user-password form |
| 3 | `pages-admin-home` | `...-pages-admin-home` | critical | `/admin` — stats cards (revenue, AI cost, net, active jobs, queue depth, worker health) + activity feed |
| 4 | `pages-admin-jobs` | `...-pages-admin-jobs` | critical | `/admin/jobs` (list) + `/admin/jobs/[id]` (detail with state timeline, action buttons, file browser) |
| 5 | `pages-admin-payments` | `...-pages-admin-payments` | high | `/admin/payments` — list, filter, refund action, refund history sub-tab |
| 6 | `pages-admin-users` | `...-pages-admin-users` | high | `/admin/users` + `/admin/users/[id]` |
| 7 | `pages-admin-ai-profiles` | `...-pages-admin-ai-profiles` | high | `/admin/ai` + `/admin/profiles` |
| 8 | `pages-admin-misc` | `...-pages-admin-misc` | medium | `/admin/audit`, `/admin/errors`, `/admin/settings` |

---

## Group: `gdpr-cleanup`

| # | Task | Branch | Priority | Files touched |
| --- | --- | --- | --- | --- |
| 1 | `gdpr-me` | `...-gdpr-me` | critical | `DELETE /api/me` (purge user PII, anonymize audit_log references) + `GET /api/me/export` (JSON dump of all user data) |
| 2 | `cleanup-cron-files` | `...-cleanup-cron-files` | critical | pg-boss scheduled job every 6h — delete `/data/jobs/{id}/` older than 30 days, mark jobs `EXPIRED`, preserve audit_log + admin_audit_log + mapping_profiles |
| 3 | `cleanup-cron-support` | `...-cleanup-cron-support` | high | `admin_oauth_state` expiry (>10 min), `rate_limits` window pruning, orphan file sweep |

---

## Group: `email-guide`

| # | Task | Branch | Priority | Files touched |
| --- | --- | --- | --- | --- |
| 1 | `resend-client` | `...-resend-client` | critical | `app/server/utils/email.ts` — Resend wrapper, retry, structured send API |
| 2 | `email-templates` | `...-email-templates` | critical | `app/server/emails/*.vue` — 7 templates (magic-link, job-submitted, mapping-ready, payment-confirmed, conversion-ready, sync-complete, job-failed), Romanian, shared theme, brand header banner |
| 3 | `saga-import-guide` | `...-saga-import-guide` | high | `docs/saga-import-guide.md` authored + rendered to PDF at `public/guide/saga-import.pdf`; linked in every result email |

---

## Group: `i18n`

| # | Task | Branch | Priority | Files touched |
| --- | --- | --- | --- | --- |
| 1 | `i18n-ro-en` | `...-i18n-ro-en` | high | `app/locales/{ro.json,en.json}` + `nuxt-i18n` setup; `?lang=en` fallback; admin dashboard hardcoded EN (no i18n); user pages defaulted to RO |

---

## Group: `observability`

| # | Task | Branch | Priority | Files touched |
| --- | --- | --- | --- | --- |
| 1 | `observability-sentry` | `...-observability-sentry` | high | `@sentry/nuxt` for Nuxt + `sentry-sdk` for Python worker; `beforeSend` filter strips PII; source maps uploaded in CI |
| 2 | `observability-metrics` | `...-observability-metrics` | high | `metrics` table writers (jobs/hour, success rate, conversion time, payment success, Haiku-per-job, errors/hour) + admin dashboard reader |

---

## Group: `infra`

| # | Task | Branch | Priority | Files touched |
| --- | --- | --- | --- | --- |
| 1 | `infra-docker-compose` | `...-infra-docker-compose` | critical | `docker-compose.yml` + `docker-compose.prod.yml` — Postgres, Nuxt, worker, Caddy; volumes for `/data/jobs/` + Postgres data; network isolation for worker; mem/cpu limits |
| 2 | `infra-caddyfile` | `...-infra-caddyfile` | critical | `infra/Caddyfile` — HTTPS (auto-Let's-Encrypt), HTTP→HTTPS redirect, `request_body max_size 500M` for upload route, security-headers passthrough |
| 3 | `infra-hetzner-setup` | `...-infra-hetzner-setup` | high | `infra/hetzner-setup.md` — runbook: CX32 provisioning, firewall, backup schedule, secret handling, rotation plan |

---

## Group: `ci-tests`

| # | Task | Branch | Priority | Files touched |
| --- | --- | --- | --- | --- |
| 1 | `ci-typecheck-lint` | `...-ci-typecheck-lint` | critical | `.github/workflows/typecheck.yml` — `npx nuxi typecheck`, `ruff check`, `mypy src/` |
| 2 | `ci-tests` | `...-ci-tests` | critical | `.github/workflows/tests.yml` — Vitest (Nuxt) + pytest (worker) with Postgres service |
| 3 | `ci-security-tests` | `...-ci-security-tests` | critical | `.github/workflows/security.yml` — automated tests for headers, CSRF rejection, rate limit, Stripe webhook signature, admin allowlist, zip bomb rejection |
| 4 | `ci-gitleaks` | `...-ci-gitleaks` | critical | `.github/workflows/gitleaks.yml` + pre-commit hook — no secrets in any commit |

---

## Group: `gate`

| # | Task | Branch | Priority | Depends on |
| --- | --- | --- | --- | --- |
| 1 | `phase2-gate` | `...-phase2-gate` | blocking | all above |

---

## Gate Criteria (SPEC §2.8)

Phase 2 is complete when ALL of these are true:

- [ ] End-to-end user flow: upload → discover → map → pay (test) → convert → download
- [ ] Stripe test payment with Romanian test card (3DS path)
- [ ] SmartBill test invoice issued on webhook
- [ ] 2+ real migrations completed by beta accountants
- [ ] Error recovery tested (upload fail, payment timeout, conversion error, worker crash)
- [ ] GDPR: ToS, Privacy, DPA, Refund at `/legal/*`, 30-day auto-delete working
- [ ] SSE progress works on mobile and desktop
- [ ] Magic link auth end-to-end
- [ ] Admin dashboard functional: Google OAuth allowlist enforced, every action logs to `admin_audit_log`
- [ ] Admin session IP-binding enforced (change IP → forced re-auth)
- [ ] Admin access to any job logged
- [ ] UI matches design system: Rapidport theme tokens applied via Tailwind `@theme`, dark mode default, Inter + JetBrains Mono loaded, zero anti-patterns from SPEC UI §"Anti-patterns"
- [ ] Theme tokens centralized in `app/theme/index.ts` (TS) + `app/assets/css/tailwind.css` (CSS) — no hardcoded colors in components
- [ ] shadcn primitives in `app/components/ui/` use the theme vars; no Mantine, no React, no `@mantine/*` in `package.json`
- [ ] All S.13 security gate items verified
- [ ] Automated security tests in CI pass (headers, CSRF, rate limits, webhook signatures, admin allowlist)

---

## Risks / Open Decisions

- **SPEC open question #1 (legal entity).** SmartBill invoice series depends on whether billing is under Gamerina, Digitap, or new SRL. Blocks `api-webhooks.smartbill-client` — resolve before that task starts.
- **SPEC open question #3 (SmartBill series).** Invoice format `LEXITO-[YYYY]-[XX]` in CLAUDE.md is Lexito-era; pick Rapidport series name. Needs Dani's call before `smartbill-client`.
- **SPEC open question #4 (refund policy).** Blocks `pages-legal` refund copy and `api-admin-jobs-actions` refund flow business rules.
- **SPEC open question #5 (ADMIN_EMAILS).** Needs Dani's primary + backup Google accounts before `auth-google-callback` can be tested end-to-end.
- **Mobile for mapping page.** Mapping 800+ fields on a phone is unusable. The Romanian desktop-only banner is non-negotiable; `pages-job-mapping` task must include it.
- **Admin dashboard is part of v1.** Phase 2 is NOT complete without every admin page + every admin action logged. Do not descope admin to "v1.1".
- **Parallel schema edits.** If `schema-*` tasks all edit `schema.ts` directly, they will conflict. Solve by splitting into `app/server/db/schema/*.ts` files in `schema-users-sessions` (first task), which every subsequent task imports/extends.
