# Rapidport — WinMentor → SAGA Migration Tool (v1 Complete Spec)

**Brand:** Rapidport
**Domain:** `rapidport.ro`
**Status:** Pre-build, pending Phase 0 validation
**Owner:** Dani
**Executor:** Claude Code
**Scope:** v1 only. Single Nuxt app, no micro-services, no team accounts.

---

## Product Definition

A web-based SaaS that converts a WinMentor company database export into SAGA-compatible import files, with AI-assisted field mapping and optional delta sync during the transition period.

**Target user:** Romanian accountants migrating clients from WinMentor to SAGA.

**Pricing:**
- Full migration: 499–799 RON (one-time). Includes 3 delta syncs within 30 days.
- Additional delta sync: 99 RON per run after the included allowance expires.

**Success metric for v1:** 10 paid migrations in the first 60 days post-launch.

---

## Brand

**Name:** Rapidport
**Domain:** `rapidport.ro`

**Etymology:** `rapid` (fast — in both Romanian and international use) + `port` (harbor, gateway — universally understood, works across languages). Reads naturally in Romanian, pronounceable identically by English speakers, no awkward associations.

**Positioning:** the fast port between accounting systems. The tool is a harbor where WinMentor data docks, gets inspected and translated, and departs in SAGA format. This imagery is thematic fuel — use it sparingly in copy and visuals, never overwork it.

**Tone:** technical, precise, direct. Not playful. Not corporate. Speaks to accountants the way a senior engineer speaks to them — with respect for their expertise and zero fluff.

**Logo direction:** geometric mark (agent to execute when assets are commissioned). Possible directions: a minimalist harbor/dock symbol, stylized channel between two shapes, or an abstract pairing of two geometric forms with a connector. Use signature red (`#C72E49`) as the single accent. No gradients, no illustrative details.

**Voice examples (Romanian, for UI and marketing copy):**

✓ GOOD
- "Migrare completă WinMentor → SAGA."
- "Portul de trecere între software-uri contabile."
- "Contabilitatea dvs. nu stă blocată între sisteme."
- "Verificăm fiecare înregistrare înainte de a pleca din port."

✗ AVOID
- "Cel mai rapid și mai bun tool de migrare! 🚀"  (hype + emoji)
- "Super ușor, super rapid!"  (superlatives)
- "Hai să începem!"  (too casual)
- "Soluția inovatoare pentru contabili"  (marketing speak)

**Assets to produce during Phase 2:**
- Logo (SVG, light + dark variants)
- Favicon (32px, 16px)
- OG image (1200×630, used for all pages unless overridden)
- Email header banner (600px wide)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                       Nuxt 3 (SSR + Nitro)                       │
│                   Node 22 LTS — single process                   │
│                                                                  │
│  Public:  /, /upload, /job/[id]/*, /profiles, /legal/*           │
│  Auth:    /auth/*  (magic link for users)                        │
│  Admin:   /admin/*  (Google OAuth, Dani-only allowlist)          │
│  API:     /api/*                                                 │
└────────┬────────────────────────────┬──────────────┬─────────────┘
         │                            │              │
         │  Drizzle                   │  pg-boss     │  Stripe SDK
         │                            │  publish     │  SmartBill SDK
         ▼                            ▼              ▼
  ┌─────────────┐           ┌─────────────────┐   ┌──────────────┐
  │ PostgreSQL  │◄──────────│  pg-boss queue  │   │   Stripe     │
  │             │           │  (same Postgres)│   │   (cards)    │
  │ users       │           └────────┬────────┘   └──────┬───────┘
  │ jobs        │                    │                   │ webhook
  │ profiles    │                    │  pg-boss          │ → SmartBill
  │ payments    │                    │  consume          │   invoice
  │ audit_log   │                    ▼                   ▼
  │ mapping_*   │           ┌─────────────────┐   ┌──────────────┐
  │ admin_*     │           │ Python 3.12     │   │  SmartBill   │
  └─────────────┘           │ Worker          │   │   (invoice)  │
                            │                 │   └──────────────┘
                            │ - extract ZIP   │
                            │ - parse Paradox │
                            │ - map (Haiku)   │
                            │ - generate SAGA │
                            └────────┬────────┘
                                     │
                                     ▼
                            ┌─────────────────┐
                            │ /data/jobs/{id}/│
                            │  ├── upload/    │
                            │  └── output/    │
                            │ (volume-mounted)│
                            └─────────────────┘
```

**Key design decisions:**

1. **Single Nuxt app hosts everything** — public pages, user auth, admin dashboard, API. No splits. No separate admin deployment. Routes protected by middleware.
2. **Python worker is its own service.** Paradox parsing has no JS equivalent. Worker consumes jobs from pg-boss queue, reads/writes shared volume.
3. **pg-boss as queue.** Reuses Postgres. No Redis.
4. **Local disk storage.** Files transient (30-day TTL). Volume-mounted into both containers.
5. **Canonical intermediate schema.** Always WinMentor→Canonical→SAGA. Enables future targets without N×M work.
6. **Haiku for mapping.** Cost matters.
7. **Mapping profiles first-class.** Saved per user, shareable. Network effect.
8. **Stripe + SmartBill auto-link.** Reuse Lexito pattern.
9. **Two auth flows in one app.** Users: magic link. Admin (Dani only): Google OAuth with email allowlist. Separate session cookies, separate middleware, separate tables.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + Backend + Admin | Nuxt 3 (SSR) on Node 22 LTS | Single codebase, single deploy. |
| UI kit | shadcn-nuxt (Vue port of shadcn/ui) + Tailwind v4 | You own the source; atomic primitives; dark-first; no theme to fight. Matches Dani's existing stack in other projects. |
| Database | PostgreSQL 16 | Everything + pg-boss + rate_limits. |
| ORM | Drizzle | SQL transparency. |
| Queue | pg-boss | Reuses Postgres. |
| Worker | Python 3.12 | Only language with working Paradox parsers. |
| File storage | Local disk, volume-mounted | Transient, 30-day TTL. |
| AI | Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) | Semantic field mapping. |
| Payments | Stripe | Already in use. |
| Invoicing | SmartBill API | Romanian fiscal compliance. |
| Email | Resend | Transactional email. |
| User auth | Magic link (custom implementation) | No password management burden. |
| Admin auth | Google OAuth 2.0 via `nuxt-auth-utils` | Allowlisted emails. Reuses Lexito pattern. |
| Error tracking | Sentry (hosted) or self-hosted Glitchtip | Both Nuxt and worker. |
| Deployment | Docker Compose on Hetzner CX32 or equivalent | Two containers + Postgres. |
| Reverse proxy | Caddy | Automatic HTTPS. |

---

## SECURITY — Baseline Requirements (NOT OPTIONAL)

Every line of code must honor these. Security is a Phase 1 gate, not a Phase 3 polish.

### S.1 — Transport & Headers

Enforced by Nitro middleware on all responses:
- HTTPS only. HTTP → HTTPS redirect at Caddy.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `Content-Security-Policy`: strict, no `unsafe-inline`, no `unsafe-eval`. Allowlist for `js.stripe.com`, `accounts.google.com` (admin OAuth), SmartBill if needed.
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (or CSP `frame-ancestors 'none'`)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy`: deny camera, microphone, geolocation, payment except Stripe origin

**Implementation:** `app/server/middleware/security-headers.ts`. Applied globally, no exceptions.

### S.2 — CSRF Protection

Every state-changing request (POST, PUT, PATCH, DELETE) is CSRF-protected:
- Double-submit cookie pattern OR `nuxt-csurf`
- Token issued server-side via `Set-Cookie` with `SameSite=Strict`, `HttpOnly=false`, `Secure=true`
- Client sends via `X-CSRF-Token` header on every mutation
- Server rejects 403 if missing or mismatched
- Webhook endpoints (`/api/webhooks/*`) exempted — they verify via provider signature
- **Admin routes also require CSRF** — no exceptions

**The #1 demoanaf regression. Do not ship a mutation endpoint without CSRF verification.**

### S.3 — User Authentication (Magic Link)

**Anonymous mode (default for users):**
- Job access gated by `anonymousAccessToken` cookie (separate capability from job UUID in URL)
- UUID in URL is 128-bit unguessable
- Anonymous access token cookie scoped to `/job/{id}/*`, HttpOnly, Secure, SameSite=Strict
- Email captured at payment step (stored on job row, hashed for lookups)

**Optional magic link:**
- User requests login via email → `POST /api/auth/magic-link`
- Server generates single-use, 15-min-expiring token (signed, stored hashed in `magic_link_tokens`)
- Email sent via Resend with `/api/auth/verify?token=xyz` (API consumes the token and redirects to `/`)
- Consumption creates session: `HttpOnly=true, Secure=true, SameSite=Lax, Max-Age=30d`
- Session stored server-side in `sessions` table (not JWT — enables revocation)
- Anonymous jobs in same browser auto-claimed to account on login

### S.4 — Admin Authentication (Google OAuth)

**Completely separate from user auth:**

- Admin login at `/admin/login` → Google OAuth 2.0 flow via `nuxt-auth-utils`
- On successful OAuth callback, server checks returned email against `ADMIN_EMAILS` env var (comma-separated allowlist)
- If email not in allowlist → reject, log attempt to `admin_audit_log`, 403 to user
- If email allowed → create `admin_session` row with 8-hour TTL, IP hash, user agent
- Admin session cookie: `admin_session` (distinct from user `session`), `HttpOnly=true, Secure=true, SameSite=Strict, Max-Age=8h`
- Admin middleware checks `admin_session` cookie → validates against DB → binds session to originating IP (hashed)
- IP change → session invalidated, forced re-auth
- All admin actions logged to `admin_audit_log` (separate from `audit_log`)
- Admin session renewal requires Google reauth (no silent refresh for sensitive tooling)

**Critical:** admin session and user session CAN coexist in the same browser (you might test the user flow while logged into admin). They never share state, never share middleware, never share cookies.

### S.5 — Job Ownership Verification

On EVERY job endpoint, before any other logic:

```typescript
async function assertJobAccess(jobId: string, ctx: H3Event) {
  const job = await db.query.jobs.findFirst({ where: eq(jobs.id, jobId) })
  if (!job) throw createError({ statusCode: 404 })
  
  // Admins can access any job (admin session check)
  const adminSession = await getAdminSession(ctx)
  if (adminSession) {
    await logAdminAccess(adminSession, jobId, 'job_access')
    return job
  }
  
  const session = await getUserSession(ctx)
  if (session && job.userId === session.userId) return job
  
  const urlToken = getCookie(ctx, `job_access_${jobId}`) ?? getHeader(ctx, 'x-job-token')
  if (urlToken && constantTimeCompare(urlToken, job.anonymousAccessToken)) return job
  
  throw createError({ statusCode: 403 })
}
```

Admin access auto-logged to `admin_audit_log`. Admins should know every time they look at customer data, it's recorded.

### S.6 — Input Validation

All inputs validated with Zod. No exceptions.
- `await readValidatedBody(event, schema.parse)` for bodies
- `getValidatedQuery` / `getValidatedRouterParams` for query/URL params
- Reject with 400 on failure — never 500, never silent

**File upload validation:**
- Max size: 500 MB. Enforced at Caddy (`request_body max_size`) AND Nitro (`maxBytes`)
- Allowed: `.zip`, `.7z`, `.rar`
- Magic byte check — verify file header matches extension
- Filename stripped to basename; stored as `{uuid}.{ext}` server-side

**Archive expansion (zip bomb):**
- Python worker uses `zipfile` with pre-extraction checks:
  - Compressed-to-expanded ratio cap (reject if > 50×)
  - Total uncompressed size cap: 5 GB
  - Entry count cap: 10,000
  - No symlinks, no absolute paths
  - All extracted paths must resolve within job directory (`Path.resolve()` + prefix check)

### S.7 — SQL, XSS, Secrets

- **SQL:** Drizzle only. If raw SQL needed, parameterized `sql` template tag. Constant-time comparisons for token checks (`crypto.timingSafeEqual`).
- **XSS:** No `v-html`. User-provided content always rendered as text. Error messages never echo user input verbatim.
- **Secrets:** no secrets in code, enforced by `gitleaks` pre-commit. `.env.example` with placeholders, `.env` gitignored. Env validation at boot via Zod. Rotation plan documented for all keys.
- **DB connection:** SSL required (`sslmode=require`) even on localhost.

### S.8 — Stripe Webhook Security

- `POST /api/webhooks/stripe` exempted from CSRF
- Signature verification mandatory via `constructEvent`
- Reject events older than 5 minutes (replay protection)
- Dedup by event ID in `stripe_events` table
- Only act on `payment_intent.succeeded`

### S.9 — Worker Sandboxing

- Non-root user (`USER worker` in Dockerfile)
- Write access only to `/data/jobs/` via volume
- No network access except Anthropic API + Postgres (Docker network isolation)
- Memory: 1 GB. CPU: 1 core. Per-job timeout: 15 minutes hard kill.
- Paradox parser in subprocess with its own limits
- Logs to stdout only

### S.10 — Rate Limiting

| Endpoint | Limit | Key |
|---|---|---|
| `POST /api/jobs` | 10/hour | IP |
| `PUT /api/jobs/[id]/upload` | 3/hour | IP |
| `POST /api/auth/magic-link` | 5/hour | email |
| `GET /admin/login` | 10/hour | IP |
| Webhooks | unlimited (signature-verified) | — |
| Other GETs | 300/min | IP |
| Other mutations | 60/min | session or IP |

Rate limit state in `rate_limits` table. Sliding window. 429 + `Retry-After` on violation.

### S.11 — GDPR

- Only PII collected: email. File contents never indexed.
- Auto-deletion: job folders after 30 days. Mapping profiles retained without company data.
- `DELETE /api/me` → purges user data, 24-hour SLA
- `GET /api/me/export` → JSON dump of user data
- DPA template at `/legal/dpa`. Privacy policy at `/legal/privacy`.
- Logs never contain PII. Emails hashed. CIFs redacted as `RO*****`. File contents never logged.

### S.12 — Audit Logs (Two Separate)

**`audit_log` (user-facing actions):**
- Job lifecycle, auth events, payments, data access, profile share
- 2-year retention
- Anonymized on user deletion (hash-only references)

**`admin_audit_log` (admin actions — separate table):**
- Admin login attempts (success and failure)
- Every customer data view (who viewed which job)
- Every mutation (refund issued, delta sync extended, download resent, job state forced, user deleted)
- IP hash, user agent, timestamp
- **Retained indefinitely. Never purged. Never editable.**
- Accessible via `/admin/audit` — read-only

### S.13 — Security Gate

No feature ships without:
- [ ] All mutations require valid CSRF token
- [ ] All job endpoints call `assertJobAccess`
- [ ] Admin routes use `assertAdminSession` middleware + IP binding
- [ ] All inputs Zod-validated
- [ ] No `v-html` or unsanitized rendering
- [ ] Security headers present (automated test)
- [ ] Rate limits enforced (automated test)
- [ ] Stripe webhook signature verification works (Stripe CLI test)
- [ ] Google OAuth allowlist enforced (non-allowed email logged + rejected)
- [ ] Worker container runs as non-root with network isolation
- [ ] Zip bomb test passes
- [ ] No secrets in git history (`gitleaks` clean)
- [ ] HTTPS enforced, HSTS set

---

## User Auth Flow

**Anonymous (default):**
1. Land on `/upload` → drop file
2. `POST /api/jobs` with CSRF → receive `{ jobId, anonymousAccessToken }`
3. Client stores token in cookie scoped to `/job/{jobId}/*`
4. All subsequent requests include cookie
5. User bookmarks `/job/{id}/status`
6. Email captured at payment step
7. Download link emailed for cross-device access

**Optional magic link:**
1. User clicks "Log in to save profiles"
2. Enters email → `POST /api/auth/magic-link` (rate limited)
3. Signed single-use token (15 min TTL) stored hashed
4. Email sent with `/api/auth/verify?token=xyz` (API handler, not a page)
5. `GET /api/auth/verify` → validates, creates session, sets HttpOnly cookie, 303 → `/`
6. Anonymous jobs in same browser auto-claimed to account
7. `/profiles` page accessible

**Session:** 30-day sliding. Revocable from `/account/security`.

---

## Admin Auth Flow (Google OAuth, Dani only)

1. Navigate to `/admin` → redirected to `/admin/login`
2. Click "Sign in with Google" → OAuth flow via `nuxt-auth-utils`
3. Google returns email
4. Server checks email against `ADMIN_EMAILS` env var
5. Not allowed → log to `admin_audit_log`, redirect to error page
6. Allowed → create `admin_session` row, set cookie (8h TTL, IP-bound)
7. Redirect to `/admin` dashboard
8. Every request re-validates session + IP match
9. IP change → force re-auth
10. `/admin/logout` → `DELETE admin_sessions` row + clear cookie

**Env setup:**
```
ADMIN_EMAILS=dani@tamas.ai,dani.tamas@gmail.com
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://rapidport.ro/auth/google/callback
```

---

## Admin Dashboard — Feature Set

Single Nuxt area at `/admin/*`. All pages mobile-responsive but optimized for desktop.

### `/admin` — Dashboard home

Above-the-fold stats cards:
- **Revenue today / this week / this month** (RON) with delta vs previous period
- **AI cost today / this week / this month** (USD, converted display in RON)
- **Net today** (revenue − Stripe fees − AI costs)
- **Active jobs** (by state: uploading, discovering, mapping, converting)
- **Jobs completed today** with success rate
- **Queue depth** (pg-boss backlog)
- **Worker health** (last heartbeat, current job, memory usage)

Below: activity feed (last 50 events across jobs/payments/auth).

### `/admin/jobs`

- Filterable list: state, date range, amount paid, source software, has errors
- Search: email, job UUID, filename, CIF
- Columns: ID (short), user email, state, created, progress, amount, actions
- Pagination 50/page

### `/admin/jobs/[id]`

Everything about a job:
- State history timeline
- Upload metadata (filename, size, detected WinMentor version)
- Discovery results (tables, record counts)
- Mapping results (auto vs manual vs unmapped counts)
- Conversion report (JSON view + download)
- Payment info (Stripe ID, SmartBill invoice link, amount)
- Audit log entries for this job
- Error log if failed
- File browser: `/data/jobs/{id}/upload/` and `/output/` (read-only, downloads disabled in prod except for debugging)

**Action buttons (all logged to `admin_audit_log`):**
- Issue refund (triggers Stripe refund + SmartBill storno)
- Extend delta syncs (increment `deltaSyncsAllowed`)
- Resend download link (triggers email)
- Force state transition (dropdown to target state, reason required)
- Re-run conversion (republishes pg-boss job)
- Mark as failed (with reason)
- Delete job data early (before 30-day TTL)

### `/admin/payments`

- List all payments: status, amount, Stripe fee, net, invoice link, refund status
- Filter by status, date, amount
- Ability to issue refund from here
- Refund history sub-tab

### `/admin/users`

- List users: email, jobs count, total spent, last seen, deletion status
- Search by email (partial match)
- Click into user detail

### `/admin/users/[id]`

- Email, creation date, last seen
- All jobs by this user
- All payments by this user
- Total spent / total refunded
- Actions: trigger GDPR deletion, grant bonus delta syncs, block user (prevents new jobs)

### `/admin/ai`

AI cost/usage tracking:
- Daily Haiku calls + cost (USD)
- Trend chart (30 days)
- Tokens in / out averages
- Cache hit rate (mapping_cache efficacy)
- **Top unmapped fields** (signals to improve rule-based mapper) — table of `(source_software, table, field)` grouped by frequency
- **Low-confidence mappings** (confidence < 0.7) — drill-down for manual review

### `/admin/profiles`

- List mapping profiles (public + private)
- Adoption stats (how many jobs used each profile)
- Ability to promote a private profile to public
- Ability to deprecate/hide a profile

### `/admin/audit`

- `admin_audit_log` viewer, paginated
- Filter by action type, date, admin email
- Read-only. No edit, no delete.

### `/admin/errors`

- Recent errors from both Nuxt and Python worker
- Grouped by fingerprint
- Link out to Sentry for full stack traces
- Count trends (7-day sparkline per error)

### `/admin/settings`

- Display current env config (read-only, secrets redacted)
- Admin session list (revoke any session)
- Manual maintenance actions:
  - Trigger file cleanup cron
  - Reindex mapping cache
  - Re-fetch Stripe dispute status

---

## Mobile Responsiveness

**Fully responsive:**
- Landing, upload, status page, payment page, emails
- Admin dashboard home (cards reflow to single column)

**Desktop-recommended:**
- Admin jobs/users/payments lists (dense tables)
- Job detail page (lots of metadata)

**Desktop-only (explicit warning):**
- `/job/[id]/mapping` — mapping 800+ fields isn't usable on phones. Romanian banner: "Pentru o experiență optimă, folosiți un laptop sau desktop."
- `/admin/jobs/[id]` action buttons work on mobile, but file browser doesn't

---

## UI Design System

**Aesthetic direction: "Infrastructure-grade technical."** Reference: **min.io** (https://min.io). Not consumer SaaS, not cutesy, not friendly-illustrated. The tool processes real accounting data — the UI must *feel* like it's worth 499 RON to accountants who are skeptical of web apps.

**Before writing any component, the agent MUST read `/mnt/skills/public/frontend-design/SKILL.md` for the environment's design tokens, patterns, and constraints.**

### Design principles

1. **Dark-first for admin, dark-leading for public.** Public pages default to dark hero sections with lighter content zones below. Admin dashboard is dark throughout.
2. **Data is the hero.** Big numbers, monospace IDs, technical field names displayed proudly. The content carries the design — stats like "498 tables parsed", "17,284 records converted", "99.8% success rate" function as visual anchors.
3. **High contrast, low saturation.** Near-black backgrounds, near-white text, one signature red accent. No mid-tones for body UI.
4. **No friendliness theater.** No cute mascots, no pastel gradients, no emoji in UI, no hand-drawn illustrations, no rounded-everywhere pill buttons, no "Hey there! 👋" copy. Accountants see through it instantly and trust drops.
5. **Monospace for technical data.** CIFs, table names, field names, file paths, UUIDs, timestamps, amounts in reports — all monospace. This signals "we're working with your actual data, not approximations."
6. **Line icons only.** Thin stroke (1.5px), geometric, monochrome. No filled illustrations. Reference: Lucide icon set or similar.
7. **Grid alignment visible.** Content snaps to a strong grid. No free-floating elements. Spacing values drawn from a 4px/8px scale, not arbitrary.
8. **Motion is functional, not decorative.** Progress bars animate. Skeleton loaders pulse. Hover states transition in <150ms. No parallax, no confetti, no bouncing entrances.

### Color tokens

```
-- Base (dark mode — primary) --
--bg-primary       #0A0A0A      near-black, page background
--bg-secondary     #111111      elevated surface (cards, modals)
--bg-tertiary      #1A1A1A      nested surface, input backgrounds
--bg-hover         #1F1F1F      interactive hover state

--border-default   #262626      subtle dividers
--border-strong    #3A3A3A      input borders, card outlines
--border-focus     #C72E49      focus ring

--text-primary     #FAFAFA      headings, critical labels
--text-secondary   #A3A3A3      body text, descriptions
--text-tertiary    #737373      metadata, timestamps
--text-disabled    #525252

-- Accent (MinIO-inspired signature red) --
--accent-primary   #C72E49      primary CTAs, active states, links
--accent-hover     #D8405B      hover on primary
--accent-pressed   #A82541      active/pressed
--accent-subtle    #C72E491A    10% opacity, backgrounds for accent blocks

-- Semantic --
--success          #22C55E      conversion successful, mapping green tier
--warning          #F59E0B      mapping yellow tier, needs review
--danger           #EF4444      errors, mapping red tier, destructive actions
--info             #3B82F6      informational, neutral notifications

-- Light mode (public pages that aren't dark hero) --
--bg-primary-light       #FFFFFF
--bg-secondary-light     #FAFAFA
--text-primary-light     #0A0A0A
--text-secondary-light   #525252
(accent colors remain the same)
```

### Typography

```
-- Families --
--font-sans   'Inter', system-ui, -apple-system, sans-serif
--font-mono   'JetBrains Mono', 'Menlo', monospace

-- Scale --
display-xl    64px / 1.05 / -0.04em  (hero headlines only)
display-lg    48px / 1.1  / -0.03em
h1            36px / 1.15 / -0.02em
h2            28px / 1.2  / -0.02em
h3            22px / 1.3  / -0.01em
h4            18px / 1.4  /  0
body-lg       17px / 1.6  /  0
body          15px / 1.6  /  0   (default)
body-sm       13px / 1.5  /  0
caption       12px / 1.4  /  0.01em
mono-body     14px / 1.5  /  0   (technical data)
mono-sm       12px / 1.4  /  0
```

**Weights:**
- Headings: 600 (semibold). Never 700+ — too heavy for this density.
- Body: 400 (regular)
- Metadata: 500 (medium)
- Monospace: 450 (medium-regular)

**Usage rules:**
- Headline weight never exceeds 600
- Never uppercase entire phrases except in tiny technical labels (TABLE, FIELD, CIF)
- Numbers in stats displayed at display-lg or h1 with mono font variant
- No italic styling anywhere in UI chrome

### Spacing scale

Strictly 4px-based: `4, 8, 12, 16, 24, 32, 48, 64, 96, 128`. No arbitrary values. Component internal padding in multiples of 4. Section gaps in multiples of 8.

### Components

**Buttons:**
- Shape: rectangular with 6px radius. Never pill-shaped. Never fully square.
- Primary: red (`--accent-primary`) background, white text. Bold but not shouting.
- Secondary: transparent background, `--border-strong` outline, `--text-primary` text.
- Tertiary/link: `--accent-primary` text, no background, underline on hover only.
- Destructive: red outline + red text on transparent. Never red-fill for destructive — reserve fill for primary CTA.
- Heights: `32px` (small), `40px` (default), `48px` (large hero CTA)
- Padding: horizontal `16px` default, `24px` on large

**Inputs:**
- Background `--bg-tertiary`, border `--border-strong`, text `--text-primary`
- Focus ring: 2px `--accent-primary` + 2px transparent offset (for accessibility)
- Labels above input, never floating/material-style
- Monospace for inputs accepting CIF, IBAN, IDs
- Placeholder text at `--text-tertiary`

**Cards:**
- Background `--bg-secondary`, border `1px solid --border-default`, radius `8px`
- No shadow in dark mode. Border + elevation-through-color only.
- Internal padding `24px` default

**Tables:**
- Dense by default (row height `40px`), toggleable to `48px` comfortable
- Borders between rows only, not columns (min.io pattern)
- Monospace for ID columns, timestamps, amounts
- Zebra striping OFF by default — clean horizontal lines only
- Sort indicators as small chevrons next to column label
- Hover state: row background `--bg-hover`

**Status badges (for job states, mapping tiers):**
- Small rounded rectangles (radius `4px`), not pills
- Outlined style: `1px` border + matching text color, transparent background
- Uppercase technical label + monospace: `MAPPED`, `REVIEWING`, `CONVERTING`, `READY`, `FAILED`

**Progress indicators:**
- Linear bar default, 4px thick, `--accent-primary` fill on `--bg-tertiary` track
- Percentage shown inline in monospace, right-aligned
- No spinners except for <2s operations. Use skeleton loaders for known-duration waits.

**Modals / Dialogs:**
- Dark overlay at 70% opacity
- Modal on `--bg-secondary` with `--border-strong` outline
- Max width `640px` for confirmations, `960px` for complex forms
- Close button top-right, minimal (X icon, no background)

**Alerts / Toasts:**
- Inline alerts: left border accent (4px) in semantic color, background in matching subtle variant
- Toasts: bottom-right, same styling, auto-dismiss after 5s unless destructive

### Landing page structure

Follow min.io's pattern. Brand leverages double meaning: "rapid" (fast) + "port" (gateway/harbor between systems). Use this naturally in copy — don't over-explain.

1. **Hero (dark):**
   - Big headline (display-xl): Romanian, direct, no marketing speak. E.g., "De la WinMentor la SAGA în 15 minute." Or "Contabilitatea, în portul potrivit." (leverages brand without stating it)
   - Subhead (body-lg, secondary text): one sentence explaining the problem solved — "Migrare completă, cu verificare pas cu pas și suport pentru sincronizări ulterioare."
   - Two CTAs side by side: primary "Începe migrarea" + secondary "Vezi cum funcționează"
   - Optional: subtle background motion (video or CSS animation of data flowing between tables)

2. **Credibility strip (logos):**
   - Monochrome logo wall of Romanian accounting software (WinMentor, SAGA, Ciel, SmartBill, Oblio logos displayed in grayscale)
   - Caption: "Compatibil cu software-ul folosit de contabili români"

3. **Stats band (dark):**
   - Three large numbers in mono: "498 tabele analizate per migrare", "17,284 înregistrări convertite în 3 minute", "99.8% rată de succes la import SAGA"
   - Each with one-line caption below

4. **How it works (alternating dark/light):**
   - 3-step flow: Upload → Review mapping → Download SAGA files
   - Each step with a thin line icon + terse description
   - Right side of each step: small product screenshot

5. **Pricing (dark):**
   - Two cards side by side (Standard / Heavy)
   - Feature list in monospace-adjacent style
   - Clear CTA per card

6. **FAQ (light):**
   - Accordion style, no decoration
   - Real accountant concerns: data privacy, import failure recovery, supported versions

7. **Footer (dark):**
   - Minimal: contact, legal links, email, no social media icons unless you actually post

### Admin dashboard design

Consistent with public dark aesthetic. Specific rules:

- Sidebar navigation: `--bg-secondary`, fixed width 240px, collapsible to 64px icon-only
- Top bar: `--bg-primary` with a single-pixel `--border-default` bottom, shows breadcrumbs + admin email + logout
- Main content area: `--bg-primary` with cards at `--bg-secondary`
- Stats cards use the same monospace-number treatment as landing page
- Data tables dense by default, comfortable toggle available
- Action buttons always labeled (never icon-only without aria-label)
- Red banner at top-right of every admin page: "ADMIN — all actions logged" (small, constant reminder)

### Anti-patterns — do NOT do any of these

- Purple/indigo gradients (current AI-tool cliché)
- Glassmorphism / frosted glass effects
- Oversized rounded corners (>12px) anywhere
- Emoji in UI chrome (🎉 on success, 👋 on welcome, etc.)
- Illustration libraries (unDraw, Humaans, Storyset)
- Pastel color palettes
- System font stack as primary (Inter specifically, not `-apple-system`)
- Bootstrap-style blue primary
- Centered max-width-768 "article" layouts
- Floating labels (Material Design)
- Bouncy spring animations
- Dark mode with pure #000 background (use #0A0A0A)
- Shadow-heavy cards (`box-shadow` all over)
- Animated emoji or lottie files
- Full-width text without max-width limit (line length must stay readable)

### Implementation notes for Claude Code

- Use **shadcn-nuxt** (Vue port of shadcn/ui) + **Tailwind v4** via `@tailwindcss/vite`. Shadcn's philosophy: components are generated into `app/components/ui/` and you own the source — customize them freely, no theme provider to override.
- Theme tokens live in `app/theme/index.ts` as the TypeScript source of truth. A mirrored CSS file at `app/assets/css/tailwind.css` defines matching CSS custom properties and registers them as Tailwind utilities via `@theme`. Shadcn components use `bg-background`, `text-foreground`, `bg-primary`, etc. — those Tailwind classes resolve through our theme vars to Rapidport's values.
- Generate primitives via `npx shadcn-vue@latest add <name>` — start with `Button`, `Input`, `Card`, `Table`, `Badge`, `Alert`. Pages and admin routes import from `~/components/ui/` directly (that's where shadcn drops them); there is no additional "primitives wrapper" layer.
- Inter + JetBrains Mono via `@fontsource/inter` and `@fontsource/jetbrains-mono` packages. Self-host, don't link Google Fonts (privacy + speed).
- Dark mode is default everywhere except `/legal/*` pages (light for readability of long text). Light mode opts in via `class="light"` on a wrapper element — no FOUC flicker, no theme provider.
- `reka-ui` is shadcn-vue's headless primitive base (Vue equivalent of Radix); it comes in transitively.
- No React, no Mantine, no @mantine/* dependencies anywhere in the tree.
- Test on real hardware: this design only works if rendering is crisp. Subpixel font rendering matters.

---

## Invoicing — Stripe + SmartBill Auto-Link

**Flow:**
1. User pays via Stripe Elements
2. Stripe webhook `payment_intent.succeeded` → Nuxt handler
3. Handler:
   a. Verifies signature, dedups via `stripe_events`
   b. Marks job `PAID`
   c. Publishes `convert` pg-boss job
   d. Calls SmartBill API with billing info captured at payment:
      - PJ: CIF, nume firmă, adresă, județ, cod poștal, J-number
      - PF: nume, adresă, județ, cod poștal
   e. SmartBill returns invoice PDF URL → stored on `payments` row
4. Email to user: download link for SAGA files + invoice PDF

**SmartBill failure handling:**
- Retry 3× with exponential backoff (10s, 60s, 300s)
- Still failing → alert via email to admin + row has `smartbill_invoice_id = null`
- Daily cron reconciles unpaid invoices
- Admin can manually trigger re-issue from `/admin/jobs/[id]`

**Refund flow:**
- Admin clicks refund → Stripe refund API → on success, SmartBill storno
- Both actions logged in `admin_audit_log`

---

## Localization

**Primary: Romanian.** All user-facing text in Romanian.
- UI labels, buttons, errors, emails, landing, legal pages, SAGA import guide — all RO
- Error messages always RO, never technical, with reference code

**Admin dashboard: English.** It's for Dani. English is more precise for operational tools.

**User-facing English fallback:** available via `?lang=en` for technical users. i18n strings in `app/locales/ro.json`, `app/locales/en.json`.

---

## Observability

### Logging
- Structured JSON to stdout (both Nuxt + worker)
- Levels: error, warn, info, debug. Prod at `info`.
- Every line: timestamp, level, service, job_id (if relevant), message, meta
- **No PII.** Emails hashed (SHA-256 prefix 8 chars), CIFs redacted.
- Docker logging driver → journald → optional forwarding to BetterStack/Axiom

### Error tracking
- Sentry (hosted) or self-hosted Glitchtip
- Both Nuxt and Python worker
- Source maps uploaded in CI
- PII scrubbing via `beforeSend` filter

### Metrics
- Written to `metrics` table in Postgres
- Queried by admin dashboard home directly
- Tracked: jobs/hour, success rate, conversion time percentiles, payment success rate, Haiku calls per job (cost tracking), errors/hour

---

## PHASE 0 — Discovery & Validation

**Duration:** 2–3 days.

### 0.1 — Complete WinMentor data sample

Full zipped company folder(s) from real WinMentor installations. At least 2 versions if possible. Ask inbound accountants, reward with free migration.

**Deliverable:** `samples/winmentor/[company1]/`, `samples/winmentor/[company2]/`

### 0.2 — Complete SAGA import schema

Install SAGA C 3.0 via UTM/CrossOver on Mac. Create test company, enter records, export each entity type. Reverse-engineer the DBF/XML structure.

**Deliverable:** `samples/saga/import-templates/[entity].xml|dbf` + `docs/saga-schemas.md`

### 0.3 — Critical table inventory

Classify all ~498 WinMentor .DB files:

| Classification | Rule | Priority |
|---|---|---|
| CORE NOMENCLATURE | Master data (NPART*, NART, NGEST, NPLAN) | Must convert |
| TRANSACTIONAL | Monthly folders | Must convert |
| LOOKUP | Static (NLOCATII, NMONEDE) | Skip if SAGA has equivalent |
| CONFIG | WinMentor settings | Skip |
| CACHE | Temporary | Skip |
| DECLARATION | D394*, D406*, D39416* | Skip — SAGA generates its own |

**Deliverable:** `docs/winmentor-tables.md`

### 0.4 — Code mapping strategy

- Fresh target (recommended v1)
- Offset codes (`WM_12345`)
- Merge mode (by CIF/name — v2 differentiator)

**Deliverable:** `docs/adr-001-code-mapping.md`

### 0.5 — Gate review

- [ ] Real WinMentor company folder locally
- [ ] SAGA accepts manually-crafted import for 3+ entity types
- [ ] Table inventory complete
- [ ] Code mapping strategy decided

---

## PHASE 1 — Core Pipeline (Python worker)

**Duration:** 5–7 days.

### 1.1 — Project structure

```
migrator/
├── README.md
├── SPECS.md
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
├── .gitignore
├── .gitleaks.toml
│
├── app/                                # Nuxt 3
│   ├── nuxt.config.ts
│   ├── package.json
│   ├── pages/
│   │   ├── index.vue                   # Landing (RO)
│   │   ├── upload.vue
│   │   ├── job/[id]/
│   │   │   ├── status.vue              # Mobile-friendly
│   │   │   ├── discovery.vue
│   │   │   ├── mapping.vue             # Desktop-only
│   │   │   ├── pay.vue
│   │   │   └── result.vue
│   │   ├── profiles/index.vue
│   │   ├── account/
│   │   │   └── security.vue
│   │   ├── auth/
│   │   │   ├── login.vue
│   │   │   └── verify.vue
│   │   ├── legal/
│   │   │   ├── terms.vue
│   │   │   ├── privacy.vue
│   │   │   └── dpa.vue
│   │   └── admin/
│   │       ├── index.vue               # Dashboard
│   │       ├── login.vue
│   │       ├── jobs/
│   │       │   ├── index.vue
│   │       │   └── [id].vue
│   │       ├── payments.vue
│   │       ├── users/
│   │       │   ├── index.vue
│   │       │   └── [id].vue
│   │       ├── ai.vue
│   │       ├── profiles.vue
│   │       ├── audit.vue
│   │       ├── errors.vue
│   │       └── settings.vue
│   ├── server/
│   │   ├── api/
│   │   │   ├── jobs/                   # user-facing job endpoints
│   │   │   ├── auth/                   # magic link
│   │   │   ├── me/                     # GDPR endpoints
│   │   │   ├── admin/                  # admin-only mutations
│   │   │   │   ├── jobs/
│   │   │   │   │   ├── [id]/refund.post.ts
│   │   │   │   │   ├── [id]/extend-syncs.post.ts
│   │   │   │   │   ├── [id]/resend-download.post.ts
│   │   │   │   │   ├── [id]/force-state.post.ts
│   │   │   │   │   ├── [id]/re-run.post.ts
│   │   │   │   │   └── [id]/delete.delete.ts
│   │   │   │   ├── users/[id]/...
│   │   │   │   ├── stats.get.ts
│   │   │   │   └── settings/...
│   │   │   ├── auth/google/
│   │   │   │   ├── start.get.ts        # OAuth initiate
│   │   │   │   └── callback.get.ts     # OAuth callback
│   │   │   └── webhooks/
│   │   │       ├── stripe.post.ts
│   │   │       └── smartbill.post.ts
│   │   ├── middleware/
│   │   │   ├── security-headers.ts
│   │   │   ├── csrf.ts
│   │   │   ├── rate-limit.ts
│   │   │   ├── admin-auth.ts           # /admin/* protection
│   │   │   └── audit.ts
│   │   ├── db/
│   │   │   ├── schema.ts
│   │   │   └── client.ts
│   │   └── utils/
│   │       ├── queue.ts
│   │       ├── stripe.ts
│   │       ├── smartbill.ts
│   │       ├── google-oauth.ts
│   │       ├── auth-user.ts
│   │       ├── auth-admin.ts
│   │       ├── assert-job-access.ts
│   │       ├── assert-admin-session.ts
│   │       ├── env.ts                  # Zod-validated env
│   │       └── email.ts
│   ├── locales/{ro,en}.json
│   └── drizzle/
│
├── worker/                             # Python worker
│   ├── pyproject.toml
│   ├── Dockerfile
│   ├── src/migrator/
│   │   ├── cli.py
│   │   ├── consumer.py                 # pg-boss consumer
│   │   ├── extractor.py
│   │   ├── parsers/
│   │   │   ├── paradox.py
│   │   │   ├── winmentor.py
│   │   │   └── registry.py
│   │   ├── canonical/
│   │   ├── mappers/
│   │   │   ├── rule_based.py
│   │   │   └── ai_assisted.py
│   │   ├── generators/
│   │   │   ├── saga_xml.py
│   │   │   └── saga_dbf.py
│   │   ├── reports/
│   │   │   └── conversion_report.py
│   │   └── utils/
│   │       ├── archive.py              # zip bomb protection
│   │       └── version.py
│   ├── tests/
│   └── samples/                        # gitignored
│
├── docs/
│   ├── architecture.md
│   ├── adr-001-code-mapping.md
│   ├── adr-002-paradox-fallback.md
│   ├── adr-003-anonymous-auth.md
│   ├── adr-004-admin-oauth.md
│   ├── winmentor-tables.md
│   ├── saga-schemas.md
│   ├── saga-import-guide.md
│   ├── questions-for-dani.md
│   └── saga-rejections.md
│
└── infra/
    ├── Caddyfile
    └── hetzner-setup.md
```

### 1.2 — Paradox parser

Handles:
- Standard `.DB` files (pypxlib)
- `.MB` memo files (pypxlib)
- Non-standard tables (custom binary fallback — proven on BUGET1.DB)
- CP852 and CP1250 encodings

Fallback parser reads header manually:
- Bytes 0–1: record size
- Bytes 2–3: header size
- Field names: null-terminated strings in header
- Field types: (type + size) pairs
- Data section starts at `header_size` offset

### 1.3 — WinMentor table registry

```python
TABLE_REGISTRY = {
    'NPART':      {'entity': 'partner',       'role': 'master'},
    'NPARTB':     {'entity': 'partner',       'role': 'master_backup'},
    'NART':       {'entity': 'article',       'role': 'master'},
    'NGEST':      {'entity': 'gestiune',      'role': 'master'},
    'CASH':       {'entity': 'cash_register', 'role': 'transactional'},
    'BANG':       {'entity': 'bank_account',  'role': 'transactional'},
}

MONTHLY_TABLES = {
    'INTRARI':    {'entity': 'invoice_in'},
    'IESIRI':     {'entity': 'invoice_out'},
    'NOTE':       {'entity': 'journal_entry'},
}
```

Registry expanded as new tables are discovered during real migrations.

### 1.4 — Canonical schema (Pydantic)

```python
class Partner(BaseModel):
    source_id: str
    name: str
    cif: str | None
    registration_number: str | None
    address: Address
    is_supplier: bool
    is_customer: bool
    source_metadata: dict

class Article(BaseModel):
    source_id: str
    name: str
    code: str
    unit: str
    vat_rate: Decimal
    article_type: str
    is_stock: bool
    source_metadata: dict

class JournalEntry(BaseModel):
    date: date
    document_number: str
    debit_account: str
    credit_account: str
    amount: Decimal
    description: str
    partner_source_id: str | None
```

Minimal but complete. `source_metadata` catches unmapped fields — no data loss.

### 1.5 — Mapping engine

**Tier 1 (rule-based):** deterministic mappings covering ~80% of common fields. `CodFis → cif`, `Denumire → name`, etc.

**Tier 2 (Haiku):** invoked only for unmapped fields. Results cached in `mapping_cache` (keyed by source_software + table + field).

Prompt:
```
You are mapping a field from WinMentor (Romanian accounting software) to a canonical accounting schema.

Source field:
  Table: {table_name}
  Field: {field_name}
  Type: {field_type}
  Samples: {sample_values}

Canonical target fields (choose one or "unknown"):
{canonical_fields_json}

Respond with JSON only:
{{
  "target": "field_name_or_unknown",
  "confidence": 0.0-1.0,
  "reasoning": "one sentence"
}}
```

Every Haiku call logs token counts to a `ai_usage` table for admin tracking.

### 1.6 — SAGA generators

Format priorities (from SAGA docs):
- Terți → DBF
- Articole → DBF
- Articole contabile → CSV/XLS
- Intrări/Ieșiri → XML (`F_<cif>_<nr>_<data>.xml`)
- Încasări/Plăți → XML (`I_<data>.xml`, `P_<data>.xml`)

Every generator output must pass SAGA's import screen. If rejected, fix before continuing.

### 1.7 — Conversion report

Every conversion produces `report.json` in output ZIP:

```json
{
  "worker_version": "1.2.3",
  "canonical_schema_version": "1.0.0",
  "source_software": "winmentor",
  "source_version_detected": "8.5.2",
  "target_software": "saga",
  "target_version": "C 3.0",
  "started_at": "2026-04-17T10:00:00Z",
  "completed_at": "2026-04-17T10:03:42Z",
  "ai_usage": {
    "haiku_calls": 47,
    "tokens_in": 12450,
    "tokens_out": 2340,
    "cost_usd": 0.018
  },
  "summary": {
    "partners":        { "total": 847,   "converted": 842,   "skipped": 3, "errors": 2 },
    "articles":        { "total": 2341,  "converted": 2341,  "skipped": 0, "errors": 0 },
    "journal_entries": { "total": 18247, "converted": 18240, "skipped": 0, "errors": 7 }
  },
  "issues": [
    {
      "entity": "partner",
      "source_id": "12345",
      "severity": "error",
      "message": "CIF invalid format",
      "details": "Expected RO followed by digits, got 'ABC123'"
    }
  ]
}
```

Plus human-readable `report.pdf` (Romanian) for the accountant.

### 1.8 — CLI interface

```bash
python -m migrator.cli convert \
  --input /path/to/winmentor-export.7z \
  --output /path/to/saga-import/ \
  --target saga \
  --mapping-profile auto \
  --save-profile ./profile.json

python -m migrator.cli inspect /path/to/winmentor-export.7z
```

### 1.9 — pg-boss consumer

```python
async def handle_convert_job(job):
    job_id = job.data['job_id']
    input_path = Path(f'/data/jobs/{job_id}/upload')
    output_path = Path(f'/data/jobs/{job_id}/output')
    
    await run_conversion(
        input_path,
        output_path,
        progress_callback=lambda stage, pct: update_job_progress(job_id, stage, pct)
    )
```

Progress updates go to Postgres. Nuxt SSE endpoint polls DB every 2s and pushes to client.

### 1.10 — Phase 1 gate

- [ ] CLI converts real WinMentor export to SAGA files
- [ ] SAGA imports files successfully (Terți, Articole, Articole Contabile minimum)
- [ ] No data loss
- [ ] Mapping profile save/load works
- [ ] pg-boss consumer works end-to-end
- [ ] Conversion report generated with accurate counts + AI usage
- [ ] Worker non-root with memory/CPU/time limits
- [ ] Zip bomb test passes
- [ ] All Phase 1 SECURITY items (S.13) satisfied

---

## PHASE 2 — Nuxt App, Admin, Productization

**Duration:** 5–7 days (was 4–6; admin adds ~1–2 days).

### 2.1 — Drizzle schema

```typescript
// app/server/db/schema.ts

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailHashed: text('email_hashed').notNull(),
  blocked: boolean('blocked').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
})

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at').notNull(),
  userAgent: text('user_agent'),
  ipHash: text('ip_hash'),
  createdAt: timestamp('created_at').defaultNow(),
  revokedAt: timestamp('revoked_at'),
})

export const magicLinkTokens = pgTable('magic_link_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow(),
})

// ADMIN — separate from user auth
export const adminSessions = pgTable('admin_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),  // Google-verified email
  expiresAt: timestamp('expires_at').notNull(),
  userAgent: text('user_agent'),
  ipHash: text('ip_hash').notNull(),  // bound to this IP
  createdAt: timestamp('created_at').defaultNow(),
  revokedAt: timestamp('revoked_at'),
})

export const adminOauthState = pgTable('admin_oauth_state', {
  state: text('state').primaryKey(),  // random, short-lived
  codeVerifier: text('code_verifier').notNull(),  // PKCE
  createdAt: timestamp('created_at').defaultNow(),
  // rows expire after 10 min via cron
})

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  anonymousAccessToken: text('anonymous_access_token').notNull(),
  status: text('status').notNull(),
  sourceSoftware: text('source_software').notNull(),
  targetSoftware: text('target_software').notNull(),
  uploadFilename: text('upload_filename'),
  uploadSize: bigint('upload_size', { mode: 'number' }),
  discoveryResult: jsonb('discovery_result'),
  mappingResult: jsonb('mapping_result'),
  mappingProfileId: uuid('mapping_profile_id').references(() => mappingProfiles.id),
  progressStage: text('progress_stage'),
  progressPct: integer('progress_pct').default(0),
  workerVersion: text('worker_version'),
  canonicalSchemaVersion: text('canonical_schema_version'),
  deltaSyncsUsed: integer('delta_syncs_used').default(0),
  deltaSyncsAllowed: integer('delta_syncs_allowed').default(3),
  billingEmail: text('billing_email'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
})

export const mappingProfiles = pgTable('mapping_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  name: text('name').notNull(),
  sourceSoftwareVersion: text('source_software_version'),
  targetSoftwareVersion: text('target_software_version'),
  mappings: jsonb('mappings').notNull(),
  isPublic: boolean('is_public').default(false),
  adoptionCount: integer('adoption_count').default(0),  // for admin analytics
  createdAt: timestamp('created_at').defaultNow(),
})

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => jobs.id),
  stripePaymentIntentId: text('stripe_payment_intent_id').unique(),
  stripeFeeAmount: integer('stripe_fee_amount'),  // in RON cents, for net calc
  smartbillInvoiceId: text('smartbill_invoice_id'),
  smartbillInvoiceUrl: text('smartbill_invoice_url'),
  amount: integer('amount').notNull(),
  currency: text('currency').default('ron'),
  status: text('status').notNull(),
  refundedAmount: integer('refunded_amount').default(0),
  refundedAt: timestamp('refunded_at'),
  billingInfo: jsonb('billing_info'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  processedAt: timestamp('processed_at').defaultNow(),
})

export const aiUsage = pgTable('ai_usage', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').references(() => jobs.id),
  model: text('model').notNull(),
  tokensIn: integer('tokens_in').notNull(),
  tokensOut: integer('tokens_out').notNull(),
  costUsd: real('cost_usd').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  jobId: uuid('job_id').references(() => jobs.id),
  event: text('event').notNull(),
  details: jsonb('details'),
  ipHash: text('ip_hash'),
  createdAt: timestamp('created_at').defaultNow(),
})

// ADMIN audit log — SEPARATE, never purged
export const adminAuditLog = pgTable('admin_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminEmail: text('admin_email').notNull(),
  action: text('action').notNull(),           // refund_issued, job_viewed, user_deleted...
  targetType: text('target_type'),            // job, user, payment, profile
  targetId: text('target_id'),
  details: jsonb('details'),
  ipHash: text('ip_hash'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const mappingCache = pgTable('mapping_cache', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceSoftware: text('source_software').notNull(),
  tableName: text('table_name').notNull(),
  fieldName: text('field_name').notNull(),
  targetField: text('target_field').notNull(),
  confidence: real('confidence').notNull(),
  reasoning: text('reasoning'),
  hitCount: integer('hit_count').default(1),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => ({
  uniq: unique().on(t.sourceSoftware, t.tableName, t.fieldName),
}))

export const rateLimits = pgTable('rate_limits', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: text('key').notNull(),
  windowStart: timestamp('window_start').notNull(),
  count: integer('count').default(1),
}, (t) => ({
  idx: index().on(t.key, t.windowStart),
}))

export const metrics = pgTable('metrics', {
  id: uuid('id').primaryKey().defaultRandom(),
  metric: text('metric').notNull(),
  value: real('value').notNull(),
  meta: jsonb('meta'),
  recordedAt: timestamp('recorded_at').defaultNow(),
}, (t) => ({
  idx: index().on(t.metric, t.recordedAt),
}))
```

### 2.2 — Nitro server routes

**User-facing:**
```
POST   /api/jobs                          Create job
GET    /api/jobs/[id]                     Get job (assertJobAccess)
PUT    /api/jobs/[id]/upload              Multipart upload
POST   /api/jobs/[id]/discover            Publish pg-boss discover
GET    /api/jobs/[id]/events              SSE progress
PATCH  /api/jobs/[id]/mapping             Edit mapping
POST   /api/jobs/[id]/pay                 Create Stripe PaymentIntent
POST   /api/jobs/[id]/resync              Delta sync
GET    /api/jobs/[id]/download            Stream ZIP

POST   /api/auth/magic-link               Request magic link
GET    /api/auth/verify                   Consume magic link
DELETE /api/auth/session                  Logout

DELETE /api/me                            GDPR deletion
GET    /api/me/export                     GDPR export

POST   /api/webhooks/stripe               Stripe webhook (signature-verified)
POST   /api/webhooks/smartbill            SmartBill webhook (if applicable)
```

**Admin-only (assertAdminSession middleware):**
```
GET    /api/admin/stats                   Dashboard stats
GET    /api/admin/jobs                    List jobs (filtered)
GET    /api/admin/jobs/[id]               Job detail (bypasses ownership)
POST   /api/admin/jobs/[id]/refund        Issue Stripe refund + SmartBill storno
POST   /api/admin/jobs/[id]/extend-syncs  Increment deltaSyncsAllowed
POST   /api/admin/jobs/[id]/resend-download Trigger email
POST   /api/admin/jobs/[id]/force-state   Force state transition (reason required)
POST   /api/admin/jobs/[id]/re-run        Republish pg-boss convert job
DELETE /api/admin/jobs/[id]               Early deletion (before TTL)

GET    /api/admin/users                   List users
GET    /api/admin/users/[id]              User detail
POST   /api/admin/users/[id]/grant-syncs  Bonus delta syncs
POST   /api/admin/users/[id]/block        Block user
DELETE /api/admin/users/[id]              GDPR deletion from admin

GET    /api/admin/payments                List payments
GET    /api/admin/ai                      AI usage stats
GET    /api/admin/profiles                List mapping profiles
PATCH  /api/admin/profiles/[id]           Promote/hide profile
GET    /api/admin/audit                   Read admin_audit_log
GET    /api/admin/errors                  Recent error digest
GET    /api/admin/settings                Display env config (redacted)
DELETE /api/admin/sessions/[id]           Revoke admin session
POST   /api/admin/maintenance/cleanup     Trigger file cleanup cron
```

**Admin OAuth:**
```
GET    /api/auth/google/start             Initiate OAuth (sets PKCE state)
GET    /api/auth/google/callback          OAuth callback, allowlist check, create admin_session
POST   /api/admin/logout                  Destroy admin_session
```

### 2.3 — Stripe + SmartBill integration

**Flow:**
1. User submits billing form → `POST /api/jobs/[id]/pay`
2. Nuxt creates Stripe PaymentIntent with idempotency key `job_{id}_pay`
3. Returns `client_secret` + publishable key
4. Frontend Stripe Elements collects card (PSD2 3DS handled by Stripe)
5. Stripe webhook `payment_intent.succeeded` → `POST /api/webhooks/stripe`
6. Handler:
   - Verifies signature
   - Dedups via `stripe_events`
   - Marks job `PAID`
   - Records `stripe_fee_amount` on payment row (from `balance_transaction`)
   - Publishes `convert` pg-boss job
   - Calls SmartBill with billing info
   - Stores invoice URL
7. Emails user

### 2.4 — Emails (Resend, Romanian)

Templates in `app/server/emails/`:
- `magic-link.vue`, `job-submitted.vue`, `mapping-ready.vue`
- `payment-confirmed.vue`, `conversion-ready.vue`, `sync-complete.vue`
- `job-failed.vue`

### 2.5 — SAGA import guide

`docs/saga-import-guide.md` rendered to PDF, served at `/guide/saga-import.pdf`.

Content: how to open Import Date screen, configure each entity import, order of imports (Terți → Articole → Gestiuni → Articole Contabile → Intrări/Ieșiri), troubleshooting, support contact.

Link in every result email.

### 2.6 — Support inbox

`support@rapidport.ro` forwarding to Dani's inbox. Listed on every job status page, error emails, landing page footer, legal pages. No ticket system in v1.

### 2.7 — File cleanup cron

pg-boss scheduled job every 6 hours:
- Delete job folders in `/data/jobs/` older than 30 days
- Mark jobs `EXPIRED`
- Delete expired `admin_oauth_state` rows (>10 min old)
- Do NOT delete mapping profiles, audit logs, admin audit logs, payment records

### 2.8 — Phase 2 gate

- [ ] End-to-end user flow: upload → discover → map → pay (test) → convert → download
- [ ] Stripe test payment with Romanian test card (3DS path)
- [ ] SmartBill test invoice issued on webhook
- [ ] 2+ real migrations completed by beta accountants
- [ ] Error recovery tested (upload fail, payment timeout, conversion error, worker crash)
- [ ] GDPR: ToS, Privacy, DPA at `/legal/*`, 30-day auto-delete working
- [ ] SSE progress works on mobile and desktop
- [ ] Magic link auth end-to-end
- [ ] **Admin dashboard functional:** Google OAuth allowlist enforced, all admin pages load, all admin action buttons work and log to `admin_audit_log`
- [ ] Admin Session IP-binding enforced (change IP → forced re-auth)
- [ ] Admin access to any job logged
- [ ] **UI matches design system:** Mantine defaults overridden, dark theme applied, Inter + JetBrains Mono loaded, no anti-patterns present (no blue primary, no rounded-everywhere, no emoji in chrome, no pastel gradients)
- [ ] Theme tokens centralized in `app/theme/` — no hardcoded colors in components
- [ ] Primitives layer (`app/components/primitives/`) exists and is the only consumer of Mantine
- [ ] All S.13 security gate items verified
- [ ] Automated security tests in CI (headers, CSRF, rate limits, webhook signatures, admin allowlist)

---

## Open Questions — Resolve in Phase 0

1. **Legal entity.** Billing under Gamerina, Digitap, or new SRL? Affects SmartBill series, VAT.
2. **SAGA version support.** SAGA C 3.0 only, or also SAGA PS?
3. **SmartBill series.** Dedicated series for this product or existing?
4. **Refund policy.** Recommendation: full refund within 7 days if conversion fails. Posted at `/legal/refund`.
5. **Admin emails.** Which Google accounts go in `ADMIN_EMAILS`? (Dani's primary + backup?)

---

## Execution Notes for Claude Code

- **Always read this file at session start.**
- **Security is a Phase 1 gate.** Review S.13 at every PR. Not optional.
- **Admin is part of v1.** Phase 2 is incomplete without `/admin/*` working end-to-end.
- **Work phase-by-phase.** Don't start Phase 1 before Phase 0 gates pass.
- **Commit frequently** with conventional commits (`feat:`, `fix:`, `chore:`, `sec:` for security).
- **No speculative features.** Every line serves a Phase 0/1/2 goal.
- **Test with real data only.** Synthetic data hides edge cases.
- **When stuck on unknown WinMentor behavior:** add to `docs/questions-for-dani.md`, proceed with assumption, flag clearly.
- **When SAGA rejects generated files:** capture error + generator version + input in `docs/saga-rejections.md`.
- **Python worker and Nuxt = separate containers.** Contract: pg-boss jobs + shared volume.
- **All data mutation via Drizzle.** No raw SQL except in pg-boss internals.
- **All inputs Zod-validated** before use.
- **Every mutation endpoint has CSRF.** Every job endpoint calls `assertJobAccess`. Every admin endpoint calls `assertAdminSession`. No exceptions.
- **Every admin action logs to `admin_audit_log`.** Including passive reads of customer data.
- **Admin auth and user auth never share code paths.** Separate tables, separate middleware, separate cookies.
- **Never log PII.** Hash emails, redact CIFs, drop file contents.
- **Worker runs as non-root** with memory/CPU/time limits.
- **Every output file includes version metadata.** Worker version + canonical schema version logged per job.
- **Before writing any frontend component**, read `/mnt/skills/public/frontend-design/SKILL.md`. The UI aesthetic is "infrastructure-grade technical" (min.io reference) — dark, data-heavy, monospace for technical content, signature red accent, no AI-tool clichés. See UI Design System section.
- **No Mantine defaults in production.** Theme override is required before any page ships. If the app looks like default Mantine blue/rounded, it is not ready.