# Phase 2 — Requirements

Dependencies, infrastructure, environment, and external service credentials needed for Phase 2.

---

## npm Dependencies (app/package.json)

### Runtime

```json
{
  "dependencies": {
    "nuxt": "^3.13.0",
    "vue": "^3.5.0",
    "@mantine/core": "^7.13.0",
    "@mantine/hooks": "^7.13.0",
    "@mantine/form": "^7.13.0",
    "drizzle-orm": "^0.33.0",
    "pg": "^8.12.0",
    "pg-boss": "^10.0.0",
    "zod": "^3.23.0",
    "h3": "^1.12.0",
    "stripe": "^16.0.0",
    "resend": "^4.0.0",
    "nuxt-auth-utils": "^0.5.0",
    "nuxt-csurf": "^1.6.0",
    "@fontsource/inter": "^5.1.0",
    "@fontsource/jetbrains-mono": "^5.1.0",
    "@nuxtjs/i18n": "^8.5.0",
    "@sentry/nuxt": "^8.0.0",
    "file-type": "^19.0.0",
    "nanoid": "^5.0.0"
  }
}
```

### Dev

```json
{
  "devDependencies": {
    "drizzle-kit": "^0.24.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "@testcontainers/postgresql": "^10.0.0",
    "gitleaks": "^8.0.0"
  }
}
```

**Rules:**
- Pin major versions per SPEC's stability requirements.
- No new dependencies without explicit task approval (CLAUDE.md critical rule).
- Validate each package's recent CVEs before adding (use `npm audit`).

---

## Environment Variables

Validated at boot via Zod in `app/server/utils/env.ts` (`bootstrap-env` task). Missing required var → process exits.

| Var | Required | Example | Consumed by |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | `postgresql://user:pass@postgres:5432/rapidport?sslmode=require` | Drizzle, pg-boss |
| `NODE_ENV` | no | `production` | CORS/security header branching |
| `SESSION_SECRET` | yes | 64 hex chars | session cookie signing |
| `CSRF_SECRET` | yes | 64 hex chars | CSRF token derivation |
| `EMAIL_HASH_SALT` | yes | 64 hex chars | `sha256(email + salt)` for lookups/logs |
| `STRIPE_SECRET_KEY` | yes | `sk_live_...` / `sk_test_...` | Stripe SDK |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_...` | Stripe webhook signature verify |
| `STRIPE_PUBLISHABLE_KEY` | yes | `pk_live_...` / `pk_test_...` | exposed to client for Stripe Elements |
| `SMARTBILL_USERNAME` | yes | — | SmartBill REST auth |
| `SMARTBILL_TOKEN` | yes | — | SmartBill REST auth |
| `SMARTBILL_SERIES` | yes | TBD per SPEC Q#3 | invoice numbering |
| `ANTHROPIC_API_KEY` | yes | `sk-ant-...` | Haiku mapping (shared with worker) |
| `RESEND_API_KEY` | yes | `re_...` | transactional email |
| `GOOGLE_OAUTH_CLIENT_ID` | yes | — | admin OAuth |
| `GOOGLE_OAUTH_CLIENT_SECRET` | yes | — | admin OAuth |
| `GOOGLE_OAUTH_REDIRECT_URI` | yes | `https://rapidport.ro/api/auth/google/callback` | admin OAuth |
| `ADMIN_EMAILS` | yes | `dani@tamas.ai,backup@example.com` | admin allowlist (lowercase, comma-split) |
| `SENTRY_DSN` | no | — | error tracking |
| `APP_URL` | yes | `https://rapidport.ro` | email links, OAuth redirect |

**Secrets rotation plan**: documented in `infra/hetzner-setup.md` per `infra-hetzner-setup` task. `SESSION_SECRET` and `CSRF_SECRET` rotation logs everyone out — acceptable.

---

## Database Tables (Phase 2 full schema)

All tables from SPEC §2.1 defined via Drizzle schema. `bootstrap-drizzle` generates baseline migration that subsumes Phase 1's raw SQL.

| Table | Group | Purpose |
| --- | --- | --- |
| `users` | schema-users-sessions | user accounts (magic link) |
| `sessions` | schema-users-sessions | active user sessions (revocable) |
| `magic_link_tokens` | schema-users-sessions | hashed single-use tokens |
| `admin_sessions` | schema-admin | IP-bound admin sessions |
| `admin_oauth_state` | schema-admin | PKCE state during OAuth flow |
| `jobs` | schema-jobs-payments | extend Phase 1's minimal `jobs` with all Phase 2 columns |
| `payments` | schema-jobs-payments | Stripe + SmartBill link |
| `stripe_events` | schema-jobs-payments | webhook dedup |
| `mapping_profiles` | schema-profiles | saved per-user mapping profiles (public/private) |
| `mapping_cache` | schema-profiles | Phase 1 table — extend if needed |
| `audit_log` | schema-audit | user-facing action log |
| `admin_audit_log` | schema-audit | admin action log (append-only, never purged) |
| `rate_limits` | schema-support | sliding window counters |
| `metrics` | schema-support | admin dashboard time-series |
| `ai_usage` | (already from Phase 1) | Phase 1 table — reference only |

---

## External Services

| Service | Access | Test mode available? | Failure mode |
| --- | --- | --- | --- |
| Stripe | API key + webhook secret | yes (`sk_test_`, Stripe CLI for webhooks) | retry transient 5xx, surface 4xx to user |
| SmartBill | username + token | no (production only; needs test SRL account) | retry 3× (10s, 60s, 300s), mark invoice pending, daily reconcile cron |
| Anthropic | API key (shared with worker) | yes (separate project recommended) | retry 2× with backoff, field → unknown on exhaustion |
| Resend | API key | yes (test mode + test emails) | retry 2×, surface failure to user on magic link if all retries exhaust |
| Google OAuth | client ID + secret + redirect URI | yes (`localhost` redirect for dev) | no retries — surface to admin immediately |

---

## Infrastructure

| Component | Config | Source |
| --- | --- | --- |
| Host | Hetzner CX32 (or equivalent — 4 vCPU, 8 GB RAM, 40+ GB SSD) | `infra-hetzner-setup` |
| OS | Debian 12 (stable) | `infra-hetzner-setup` |
| Reverse proxy | Caddy 2.x (auto HTTPS via Let's Encrypt) | `infra-caddyfile` |
| App container | Node 22 LTS image | `infra-docker-compose` |
| Worker container | Python 3.12-slim, non-root | Phase 1 `bootstrap-dockerfile` |
| Database | Postgres 16 (host or container — decide per Phase 2 infra task) | `infra-docker-compose` |
| Volumes | `/data/jobs/` (shared), `pgdata/` (Postgres), `caddy_data/` (certs) | `infra-docker-compose` |
| Backup | Hetzner snapshots daily + pg_dump to remote storage | `infra-hetzner-setup` |

---

## CI Secrets (GitHub Actions)

| Secret | Purpose |
| --- | --- |
| `DEPLOY_SSH_KEY` | deploy to Hetzner |
| `SENTRY_AUTH_TOKEN` | source map upload |
| `GITHUB_TOKEN` | provided by GitHub Actions — used for PR comments |

No runtime secrets (Stripe, Anthropic, etc.) in CI — tests use mocks and fixtures; end-to-end tests run against local Docker-composed stack.

---

## Deliverables

| Category | Owner group | Location |
| --- | --- | --- |
| Nuxt app | bootstrap, security-baseline, auth-*, api-*, pages-*, email-guide, i18n, observability | `app/` |
| DB schema | schema | `app/server/db/schema/*.ts` + `app/drizzle/` |
| Emails | email-guide | `app/server/emails/*.vue` |
| Landing + legal | pages-public | `app/pages/index.vue`, `app/pages/legal/*` |
| Admin UI | pages-admin | `app/pages/admin/*` |
| SAGA import guide | email-guide | `docs/saga-import-guide.md` + `app/public/guide/saga-import.pdf` |
| Docker + Caddy | infra | `docker-compose.yml`, `docker-compose.prod.yml`, `infra/Caddyfile` |
| Runbook | infra | `infra/hetzner-setup.md` |
| CI | ci-tests | `.github/workflows/*.yml` |
| DONE/REVIEW/GATE | each task + phase2-gate | `jobs/phase2-nuxt/*.md` |
