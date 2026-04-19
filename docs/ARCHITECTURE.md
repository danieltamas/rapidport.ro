# Rapidport — Architecture

Current system architecture. Updated after every task that changes routes, schema, middleware, worker stages, services, or directory structure.

---

## Current State (2026-04-19)

Pre-production. Pre-launch.

- `phase0-discovery` — **done, merged to main** (2026-04-18).
- `phase1-worker` — **done, merged to main** (2026-04-19). Python worker (21 modules, 7,409 LoC) on main; gate passed with deferrals documented in `jobs/phase1-worker/GATE.md`.
- `phase2-nuxt` — Wave 1 merged (2026-04-19): `security-baseline` group (3/3) + `schema-users-sessions` (first of 6 `schema-*` tasks). Bootstrap group already on main (7/7, merged 2026-04-17).

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
│   ├── pages/
│   │   └── index.vue                  # "Rapidport — in progress" placeholder (to be replaced by pages-landing)
│   ├── assets/css/
│   │   └── tailwind.css               # @import "tailwindcss"; :root Rapidport tokens + shadcn alias vars + @theme inline + .light overrides + html/body dark baseline
│   ├── components.json                # shadcn-vue config (Rapidport-flat aliases)
│   ├── components/ui/                 # shadcn primitives — auto-imported by shadcn-nuxt
│   │   ├── alert/                     # Alert, AlertDescription, AlertTitle
│   │   ├── badge/                     # Badge + variants (default, secondary, destructive, outline)
│   │   ├── button/                    # Button + variants (default, destructive, outline, secondary, ghost, link)
│   │   ├── card/                      # Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
│   │   ├── input/                     # Input with useVModel
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
│   │   │   │   ├── jobs.ts            # minimal jobs table — Phase 1 worker uses progress_* cols
│   │   │   │   ├── mapping_cache.ts   # cached Haiku field mappings, unique (source, table, field)
│   │   │   │   ├── ai_usage.ts        # per-call Anthropic token + cost tracking
│   │   │   │   ├── users.ts           # users — email (unique) + email_hash (indexed) + deleted_at soft-delete
│   │   │   │   ├── sessions.ts        # user sessions — token_hash (SHA-256), user_id FK cascade, no IP bind
│   │   │   │   └── magic_link_tokens.ts  # hashed single-use tokens — 15-min TTL, email+expires_at index
│   │   │   └── client.ts              # pg Pool (max 20) + Drizzle instance, exports `db` and `pool`
│   │   ├── middleware/                # Nitro global middleware (alphabetical load order)
│   │   │   ├── csrf.ts                # double-submit cookie (rp_csrf ↔ x-csrf-token), webhook exempt
│   │   │   ├── rate-limit.ts          # sliding window on rate_limits table; fail-closed for admin login
│   │   │   └── security-headers.ts    # HSTS, strict CSP (no unsafe-*), X-Frame, Referrer, Permissions-Policy
│   │   ├── utils/
│   │   │   └── env.ts                 # Zod EnvSchema; the only reader of process.env in app code
│   │   └── plugins/
│   │       └── env-check.ts           # side-effect import of env — validation fires at Nitro boot
│   ├── drizzle.config.ts              # drizzle-kit CLI config (documented process.env exception)
│   ├── drizzle/
│   │   ├── 0000_steady_malcolm_colcord.sql   # baseline migration — jobs, mapping_cache, ai_usage
│   │   ├── 0001_nebulous_malcolm_colcord.sql # schema-users-sessions — users, sessions, magic_link_tokens
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
