# Rapidport — Architecture

Current system architecture. Updated after every task that changes routes, schema, middleware, worker stages, services, or directory structure.

---

## Current State (2026-04-17)

Pre-production. Pre-launch. Three jobs in progress:

- `phase0-discovery` — samples acquired; `table-inventory` + `saga-import-schema` tasks ready to run
- `phase2-nuxt/bootstrap` group — `bootstrap-nuxt` done (on group branch, not yet on main); 6 tasks remaining in the group
- `phase1-worker` and rest of `phase2-nuxt` — blocked per SOP

See `jobs/INDEX.md` for live status.

---

## Directory Structure

```
rapidport.ro/app/                      # repo root (note: this is the project dir, not a Nuxt subfolder)
│
├── app/                               # Nuxt 3 (SSR + Nitro), Node 22 LTS, dev port 3015
│   ├── nuxt.config.ts                 # ssr true, ts strict, devServer.port 3015, nitro websocket experimental
│   ├── tsconfig.json                  # extends .nuxt/tsconfig.json, strict + noUncheckedIndexedAccess + noImplicitOverride
│   ├── package.json                   # nuxt^3.13 vue^3.5 zod^3.23 runtime; TS + vitest dev
│   ├── package-lock.json              # committed for reproducible installs
│   ├── app.vue                        # minimal <NuxtLayout><NuxtPage /></NuxtLayout>
│   ├── pages/
│   │   └── index.vue                  # "Rapidport — in progress" placeholder (to be replaced by pages-landing)
│   └── .nvmrc                         # Node 22
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
