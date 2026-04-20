# Rapidport — Changelog

Reverse-chronological log of completed tasks. Every merged task gets one entry.

Entry format: one block per task with job/group/task path, merge commit, brief summary, DONE + REVIEW references.

---

## 2026-04-20

### Product pivots + UX hardening + nuxt-security + GDPR endpoints

This session was orchestrator-direct (no task branches) — extensive UX work, product-model clarifications, and four new endpoints (`/api/auth/session`, `/api/me/*`). Not in the formal Phase 2 group system; captured here and in `jobs/HANDOFF.md`.

**Commits:** `64e2878` → `4497a95` (18 commits on main).

**Product pivots:**
- **Magic-link → 6-digit PIN** (`73da825`). `POST /api/auth/magic-link` now generates a 6-digit code; `POST /api/auth/verify` (replaces `GET /api/auth/verify`) takes `{ email, code, next? }`. `/login` is two-step (email → PinInput). Reason: corporate email gateways (Safe Links, Proofpoint) prefetch single-use URLs. `pages/verify.vue` deleted (flow is now inline).
- **Flat user auth routes** (`64e2878`). `/auth/login` → `/login`, `/verify` Vue page dropped. Admin unchanged at `/admin/login`. API routes still `/api/auth/*`.
- **`/profiles` → `/account` dashboard** (`f50522a`). `/account` is a real dashboard (stats, recent migrations, recent invoices). Sub-pages: `/account/migrations`, `/account/invoices`, `/account/profiles` (mapping overrides, de-emphasized), `/account/security`. Mapping-profile visibility (`isPublic`/`adoptionCount`) is admin-only — dropped from user surface.
- **Bidirectional framing everywhere** (`a246473`). Stats/steps/FAQ/mockup/email-footer all say "WinMentor ⇄ SAGA, în ambele direcții" / "software sursă → destinație".
- **VAT updated 19% → 21%** (`76ea8d2`) on invoices table, `/job/[id]/pay` breakdown, index footers.

**Middleware posture shift:**
- **`server/middleware/security-headers.ts` DELETED** (`2eb6a83`). Replaced by `nuxt-security` module configured in `nuxt.config.ts` with per-request nonces, `strict-dynamic`, Stripe + Google OAuth allowlist. Our own `csrf.ts` + `rate-limit.ts` remain because they match SPEC semantics.
- **`server/middleware/user-auth.ts` NEW** (`73da825`). Guards `/account` + `/account/*` (page redirect to `/login?next=<path>`) and `/api/me/*` + `/api/account/*` (JSON 401).
- **`admin-auth.ts` now redirects** to `/admin/login` on page auth failure instead of throwing 401.

**New endpoints (not in JOB.md):**
- `GET /api/auth/session` — current user session for header auth state (`73da825`).
- `DELETE /api/auth/session` — user logout (`73da825`).
- `POST /api/auth/verify` — PIN code verify, replaces `verify.get.ts` (`73da825`).
- `GET /api/me/account` — email + createdAt for Cont panel (`76ea8d2`).
- `GET /api/me/sessions` — list active sessions (marks current) (`76ea8d2`).
- `DELETE /api/me/sessions` — revoke all except current (`76ea8d2`).
- `DELETE /api/me/sessions/[id]` — revoke one (`76ea8d2`).
- `GET /api/me/export` — full GDPR JSON dump, streamed as attachment (`c5e5249`).
- `DELETE /api/me` — GDPR account deletion, atomic transaction (`bf9b38b`).

**New utilities:**
- `app/server/utils/email.ts` — single-instance Resend wrapper (`ed5131f`).
- `app/server/utils/google-oauth.ts` — PKCE helpers, raw fetch (`ed5131f`).

**New UI primitives / pages:**
- `app/error.vue` — branded 404/500 page (`64e2878`, revised `5ee28e7`).
- `app/components/layout/ConfirmDialog.vue` — reusable destructive/default confirmation modal with loading spinner, fade+zoom (`4221bf1`). **Use this for every future confirmation** — do not inline Dialog instances.
- `app/components/ui/pin-input/*` — shadcn-vue PinInput generated (`044502e`). Paste-to-distribute, auto-verify on complete.
- `app/components/ui/dialog/DialogContent.vue` — shadcn default `slide-in-from-left` dropped; fade+zoom only (`56d4172`).
- `app/components/ui/input/Input.vue` — `useVModel` → `defineModel` (`73da825`). Fixes silent v-model propagation bug.
- `/admin/login` + `/admin` page stubs (`5ee28e7`). OAuth flow has somewhere to land until pages-admin ships.

**Bug fixes of note:**
- **SSR cookie forward** (`0c09d64`, `bc4c353`). Nuxt's `$fetch` on SSR doesn't forward client cookies to its own API routes. Pattern now: `const headers = import.meta.server ? useRequestHeaders(['cookie']) : undefined; $fetch('/api/...', { headers })`. Every page that renders auth state needs this.
- **Index page bypassed SiteHeader** (`284bfc7`). Had a hardcoded nav; replaced with `<LayoutSiteHeader />`.
- **`/login` auth redirect** (`284bfc7`). If already logged in, navigateTo(next || '/account').
- **CSP dev disable** (`5bcd1de`) — then replaced by nuxt-security (`2eb6a83`).

**SmartBill env rename** (`19240a3`, `984f60e`): `SMARTBILL_USERNAME`/`SMARTBILL_TOKEN` → single `SMARTBILL_API_KEY` across CODING.md, SECURITY_REVIEWER.md, REQUIREMENTS.md.

**Handoff** (`4497a95`): `jobs/HANDOFF.md` rewritten for next agent — next wave is `api-jobs`.

---

## 2026-04-19

### `phase2-nuxt / auth-user + auth-admin` Wave 3 B — both groups complete

**Merge commits:**
- `fa83d64` — auth-user final (magic-link request + verify)
- `367d900` — auth-admin final (google start + callback + admin logout)
- `ed5131f` — prep (env extension + `utils/email.ts` Resend wrapper + `utils/google-oauth.ts` PKCE helpers + `resend` dep)

**Summary:** 5 handler workers in parallel. 4 shipped clean; `auth-admin-logout` was written by the worker but blocked at `git add` by the harness — orchestrator reconstructed the handler from the spec (it's 35 lines; worker's draft was lost when its worktree was removed). All other handlers landed as submitted.

**New handlers on main:**
- `POST /api/auth/magic-link` — Zod email, fail-closed 5/hr rate limit, Resend email with Romanian copy, `{ ok: true }` regardless of outcome (no account enumeration).
- `GET /api/auth/verify` — atomic `consumed_at` update + find-or-create user + session + best-effort anonymous job claim from `job_access_*` cookies; redirect guarded against protocol-relative / backslash-escaped paths.
- `GET /api/auth/google/start` — PKCE state+verifier persisted in `admin_oauth_state`, 302 to Google.
- `GET /api/auth/google/callback` — one-shot DELETE RETURNING on state (prevents replay), 10-min TTL, email_verified + ADMIN_EMAILS allowlist re-check, audits every denial path.
- `POST /api/admin/logout` — defensive `getAdminSession` + `revokeAdminSession` + audit row.

**Extended:**
- `app/server/utils/env.ts` — +5 required vars (`RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`).
- `app/server/utils/email.ts` — single-instance Resend client, `sendEmail()` wrapper; never logs recipient or body.
- `app/server/utils/google-oauth.ts` — `createPkce()` / `buildAuthorizeUrl()` / `exchangeCode()` / `fetchUserInfo()` (raw fetch, no SDK dep).
- `.env.example` — new Resend + Google OAuth placeholders.

**Phase 2 auth is complete.** Both auth groups fully on main (5/5 auth-user, 4/4 auth-admin).

**Reports:** `jobs/phase2-nuxt/DONE-auth-{magic-link-request,magic-link-verify,google-start,google-callback,admin-logout}.md`

### `phase2-nuxt / auth-user + auth-admin` Wave 3 (A1 + A2) — merged to main

**Merge commits:**
- `8d5ea44` — auth-user A1 (session util + anonymous token)
- `fb5f067` — auth-admin A1 (session trio + ADMIN_EMAILS env)
- `6ee8d9e` — auth-user A2 (assertJobAccess gate)

**Summary:** Four of nine auth tasks landed. Shape: A1 ran three utility workers in parallel (`auth-session-util`, `auth-anonymous-token`, `auth-admin-session`), all file-disjoint. A2 ran `auth-job-access` solo after A1 was on main (composes the three utilities into the three-way gate per CODING.md §13.8).

**New files:**
- `app/server/utils/auth-user.ts` — user session lifecycle (SHA-256 hash in DB, plaintext in cookie, 30d TTL).
- `app/server/utils/anonymous-token.ts` — per-job scoped cookie (`job_access_${jobId}`, SameSite=Strict), constant-time verify.
- `app/server/utils/auth-admin.ts` — admin session lifecycle (8h TTL, IP-hash bound, cookie `admin_session`).
- `app/server/utils/assert-admin-session.ts` — IP drift → revoke + 401; allowlist re-check per request → 403.
- `app/server/utils/assert-job-access.ts` — three-way check: admin (with `admin_audit_log` insert) → user-owner → anonymous token → default-deny 403. 404 on missing job before auth probing.
- `app/server/middleware/admin-auth.ts` — guards `/admin/*` and `/api/admin/*` (exempts `/admin/login` + `/api/auth/google/*`).

**Extended:**
- `app/server/utils/env.ts` — +`ADMIN_EMAILS` (comma-split → lowercased email array, dev-noop default, prod must configure).
- `.env.example` — commented `ADMIN_EMAILS` template.

**Remaining auth tasks:** `auth-magic-link-request`, `auth-magic-link-verify` (user), `auth-google-start`, `auth-google-callback`, `auth-admin-logout` (admin).

**Reports:** `jobs/phase2-nuxt/DONE-auth-{session-util,anonymous-token,admin-session,job-access}.md`

### `phase2-nuxt / schema` group Wave 2 — merged to main

**Merge commit:** `528df46` (group → main, --no-ff)

**Task commits (squashed):**
- `7df4131` — `feat(db): admin_sessions + admin_oauth_state schema sub-files`
- `fc677b7` — `feat(db): extend jobs + add payments + stripe_events`
- `a354dfa` — `feat(db): mapping_profiles schema sub-file`
- `a7ccfdb` — `feat(db): audit_log + admin_audit_log schema sub-files`
- `b5dfa99` — `feat(db): rate_limits + metrics schema sub-files`
- `3a46e66` — `feat(db): consolidate Wave 2 schema — barrel exports + migration 0002` (orchestrator)

**Summary:** 5 parallel schema workers each added their own sub-files under `app/server/db/schema/` — no worker touched the barrel or ran `db:generate` (file-disjoint by design). Orchestrator then appended 9 re-export lines to `schema.ts`, wired the `jobs.mappingProfileId` FK to `mappingProfiles.id` (deferred from the `schema-jobs-payments` worker with a forward-reference stub), and ran `npm run db:generate` once to produce `app/drizzle/0002_bouncy_star_brand.sql` covering every Wave 2 table + ALTER.

**New tables:** `admin_sessions`, `admin_oauth_state`, `payments`, `stripe_events`, `mapping_profiles`, `audit_log`, `admin_audit_log`, `rate_limits`, `metrics`.

**Extended:** `jobs` gets 11 new columns (userId FK, anonymousAccessToken, sourceSoftware, targetSoftware, uploadFilename, uploadSize, discoveryResult, mappingResult, mappingProfileId FK, billingEmail, expiresAt) + 3 indexes.

**Migration 0002:** 9 CREATE TABLE, 11 ALTER jobs ADD COLUMN, 5 FKs, many indexes. Not yet applied — operator task.

**Downstream unblocks:** `auth-user` (sessions/magic_link_tokens/users), `auth-admin` (admin_sessions, admin_oauth_state, admin_audit_log), `api-jobs-*` (extended jobs + payments), `api-webhooks` (stripe_events), `api-admin-*` (admin_audit_log, metrics), `pages-mapping` (mapping_profiles + save/load carry-forward).

**Reports:** `jobs/phase2-nuxt/DONE-schema-{admin,jobs-payments,profiles,audit,support}.md`

### `phase2-nuxt / security-baseline` group — merged to main

**Merge commit:** `6f475c3` (group → main, --no-ff)

**Task commits (squashed into group):**
- `8688db1` — `sec(nuxt): add global security-headers middleware`
- `cfb6fb1` — `sec(api): CSRF middleware with double-submit cookie pattern`
- `edf89a3` — `sec(api): sliding-window rate limit middleware`

**Summary:** Three Nitro middleware modules land the SPEC §S.1/§S.2/§S.10 baseline. `security-headers.ts` sets HSTS, strict CSP (no `unsafe-inline`/`unsafe-eval`, Stripe + Google OAuth allowlisted), X-Frame, Referrer, Permissions-Policy. `csrf.ts` enforces double-submit cookie (`rp_csrf` ↔ `x-csrf-token`) on POST/PUT/PATCH/DELETE with `crypto.timingSafeEqual`; only `/api/webhooks/*` is exempt (admin routes are NOT). `rate-limit.ts` implements sliding-window against the `rate_limits` table for `POST /api/jobs` (10/h), `PUT /api/jobs/{id}/upload` (3/h), and `GET /admin/login` (10/h fail-closed); all SQL is parameterized via Drizzle `sql` template.

**Deferred to follow-up tasks:**
- Magic-link `body.email` rate limit — handled in the `auth-magic-link-request` handler (middleware runs before body validation).
- Catch-all `Other GETs 300/min` and `Other mutations 60/min` from SPEC §S.10.
- CSP nonce for any future inline SSR style.
- Client-side CSRF helper (composable) — lands with `pages-*` tasks.

**Reports:** `jobs/phase2-nuxt/DONE-security-{headers,csrf,rate-limit}.md`

### `phase2-nuxt / schema / schema-users-sessions` — merged to main

**Merge commit:** `e3ecf05` (group → main, --no-ff) · task: `4ff2111`

**Summary:** First task in the `schema` group. Added three Drizzle tables (`users`, `sessions`, `magic_link_tokens`) as per-table sub-files under `app/server/db/schema/` — matching the existing `jobs.ts` / `mapping_cache.ts` / `ai_usage.ts` split pattern. Barrel `app/server/db/schema.ts` re-exports them. Generated migration `app/drizzle/0001_nebulous_malcolm_colcord.sql` (3 CREATE TABLE + 1 FK cascade + 4 indexes). Establishes the "one sub-file per table group" convention for the remaining five `schema-*` tasks to parallelize without touching each other's files. Migration not yet applied — operator runs `npm run db:migrate` against the live DB.

**Reports:** `jobs/phase2-nuxt/DONE-schema-users-sessions.md`

---

## 2026-04-18

### `phase0-discovery / discovery / saga-import-schema` — committed to main

**Commits:** `64cfa0c` (schema docs), `5d6faa1` (DONE report)

**Summary:** Reverse-engineered SAGA C 3.0 import file formats from a live Firebird 3.x production database (`samples/saga/CONT_BAZA.FDB`, ODS 12, 195 tables, WIN1252). Prior worker had already extracted `docs/saga-fdb-schema.sql` (40,371 lines DDL) via `jacobalberty/firebird:3.0` Docker + isql; ODS version confirmed from file header bytes (offset 0x12 = 0x0C = 12). FDB columns cross-referenced against SAGA C 3.0 official manual + askit.ro + forum posts.

**Deliverables:**
- `docs/saga-schemas.md` — 689 lines; all 7 entities documented (Terți/Clienti, Terți/Furnizori, Articole, Articole Contabile, Intrări, Ieșiri, Încasări, Plăți) with FDB column specs, import file formats, field mappings, gotchas, and XML/DBF samples
- `docs/saga-rejections.md` — stub with 8 known pre-validation risk flags for Phase 1 generators
- `.gitignore` — already had correct entries (`docs/saga-fdb-schema.sql`, `samples/saga/CONT_BAZA.readonly.FDB`) from prior attempt; verified, not changed

**Key findings:** No dedicated INCASARI/PLATI tables — payments stored in REGISTRU + NOTE_FACTURI + OP. Invoices routed by SAGA based on XML tags (not filename): `<FurnizorCIF>` matching own company CIF → Iesiri, otherwise → Intrari. Date format in XML is `dd.mm.yyyy`. DBF encoding is WIN1252. PKs are Firebird generator-assigned — import files must not provide them.

**Phase C deferred:** SAGA C 3.0 is Windows-only, unavailable on dev machine. Live import validation deferred to Phase 1 `generators-*` tasks.

**Reports:** `jobs/phase0-discovery/DONE-saga-import-schema.md`

**Open questions for Dani:** DBF vs XML for Terți/Articole in Phase 1; deduplication vs overwrite behavior; EUR/USD invoice support in v1; chart of accounts pre-existence requirement.

---

## 2026-04-17

### `phase2-nuxt / bootstrap / bootstrap-primitives` — merged to main — **bootstrap group complete (7/7)**

**Merge commit:** `174a452`

**Summary:** Generated 6 shadcn-vue primitives (+ TableEmpty helper) under `app/components/ui/{button,input,card,table,badge,alert}/`. 27 files total, every one using Tailwind theme utilities (`bg-primary`, `text-foreground`, `bg-card`, `border-input`, etc.) — zero hardcoded hex. All imports use `~/` aliases. `app/pages/index.vue` now shows a Card+Badge+Button showcase proving the theme+primitives+Tailwind @theme pipeline works end-to-end.

**Dep added:** `@vueuse/core@^14` (CLI-forced by Input.vue's `useVModel` + TableEmpty.vue's `reactiveOmit`). Spec permitted this.

**Reports:** DONE + REVIEW (approved).

**Bootstrap group status: DONE.** Main has a running theme-applied Nuxt app. Remaining Phase 2 groups (security-baseline, schema, auth, api, pages, admin, gdpr, email, i18n, observability, infra, ci-tests) are blocked on Phase 1 gate per SOP.

### `phase2-nuxt / bootstrap / bootstrap-shadcn-setup` — merged to main

**Merge commit:** `19e949e`

**Summary:** Installed `shadcn-nuxt`, Tailwind v4 via `@tailwindcss/vite`, and peer deps (`reka-ui`, `class-variance-authority`, `clsx`, `tailwind-merge@3`, `lucide-vue-next`). Created `app/assets/css/tailwind.css` mirroring `app/theme/index.ts` values as CSS custom properties + shadcn alias vars + `@theme inline` registering them as Tailwind utilities. Added `app/components.json` (Rapidport-flat aliases) + `app/lib/utils.ts` (standard `cn()`). `nuxt.config.ts` extended without touching existing keys. No components generated — that was `bootstrap-primitives` next.

**Reports:** DONE + REVIEW (approved).

### UI library swap — Mantine → shadcn-nuxt (spec correction)

SPEC.md originally specified Mantine as the UI kit. Mantine is React-only; no viable Vue/Nuxt port exists. After orchestrator review, switched to **shadcn-nuxt** (Vue port of shadcn/ui) + **Tailwind v4 via `@tailwindcss/vite`** — matches the pattern Dani uses in his `play.wam.4.0` project and every other active Nuxt project.

**Theme is preserved verbatim** — SPEC §"UI Design System" color/typography/spacing tokens stay as-is; only the component library under them changes. Shadcn's philosophy (copy-paste components, you own the source) maps cleanly onto the SPEC's "primitives layer" concept. Primitives now live at `app/components/ui/` (shadcn default) rather than `app/components/primitives/`.

**Docs updated:** SPEC.md (Tech Stack + UI implementation notes), CLAUDE.md (Stack + Admin UI rules), jobs/phase2-nuxt/JOB.md (bootstrap table + gate criteria), jobs/phase2-nuxt/REQUIREMENTS.md (dep list swap).

**Task renames:** `bootstrap-mantine-override` → `bootstrap-shadcn-setup` (new spec at `jobs/phase2-nuxt/bootstrap-shadcn-setup.md`). `bootstrap-primitives` kept its name — now means "generate the initial shadcn primitives via `npx shadcn-vue@latest add`".

### `phase2-nuxt / bootstrap / bootstrap-drizzle` — merged to main

**Merge commit:** `ae4e284` (on `main`; group branch retired — no longer used now that we merge each task directly to main)

**Summary:** Drizzle ORM end-to-end. Multi-file schema split under `app/server/db/schema/{jobs,mapping_cache,ai_usage}.ts` + re-export barrel `app/server/db/schema.ts`. `app/server/db/client.ts` creates the pg Pool (max 20) via `env.DATABASE_URL`. `app/drizzle.config.ts` uses schema glob with a documented process.env exception for the CLI tool. Generated baseline migration at `app/drizzle/0000_steady_malcolm_colcord.sql` + meta files. DATABASE_URL flipped from optional to required in EnvSchema.

**Deps added:** `drizzle-orm@^0.33`, `pg@^8.12`, `pg-boss@^10.0`, `drizzle-kit@^0.24`, `@types/pg@^8`. Scripts: `db:generate`, `db:migrate`, `db:push`, `db:studio`.

**Reports:** DONE + REVIEW (approved) on main.

### Workflow revision — group branches retired for solo-task rounds

After the Round 1 (theme+env+fonts) parallel merge created the confusion where `https://rapidport.ro` couldn't reach Nuxt (group branch had the app files, main didn't → rundev ran against main with orphan `app/package.json`, got port 3000 defaults), SOP revised: solo-task bootstrap rounds merge task → main directly. The group branch `job/phase2-nuxt/bootstrap` has been deleted locally + remote. Multi-task parallel rounds can still use a short-lived group branch if needed.

### `phase2-nuxt / bootstrap / bootstrap-fonts` — merged to main (via group)

**Merge commit:** `cb5fae1` (on `job/phase2-nuxt/bootstrap`)

**Summary:** Self-hosted Inter + JetBrains Mono via `@fontsource/inter` and `@fontsource/jetbrains-mono`, wired through `app/nuxt.config.ts` `css[]`. Build output verified: `.woff2` files served from `.output/public/_nuxt/`; ZERO references to `fonts.googleapis.com` / `fonts.gstatic.com`. GDPR self-hosting requirement satisfied.

**Notes:** v5 of `@fontsource` moved variable-font variants to `@fontsource-variable/*`; base packages ship per-weight files only. Used per-weight imports (Inter 400/500/600, JetBrains Mono 400) per spec fallback. JetBrains Mono 450 not shipped as separate file — 400 is SPEC-sanctioned fallback.

**Reports:** DONE + REVIEW (approved) — on group branch.

### `phase2-nuxt / bootstrap / bootstrap-env` — merged to group branch

**Merge commit:** `33cd6ad` (on `job/phase2-nuxt/bootstrap`)

**Summary:** Zod env validation at Nitro boot. `app/server/utils/env.ts` is the single reader of `process.env` — `grep` check enforced. Schema starts minimal: `NODE_ENV` (dev default), `APP_URL` (`http://localhost:3015` default), `DATABASE_URL` (optional, flipped to required in `bootstrap-drizzle`). Side-effect import in `app/server/plugins/env-check.ts` fires validation on boot; missing required vars = process exits, no fallback defaults for secrets (CODING.md §13.1 pattern).

**Reports:** DONE + REVIEW (approved) — on group branch.

### `phase2-nuxt / bootstrap / bootstrap-theme` — merged to group branch

**Merge commit:** `5955b73` (on `job/phase2-nuxt/bootstrap`)

**Summary:** Design tokens in `app/theme/index.ts` as single source of truth. Covers SPEC §"UI Design System" in full: dark-mode colors (11), accent red (4 variants), semantic (4), light-mode (4 for `/legal/*`), Inter + JetBrains Mono families, 12-entry font scale, weights (400/450/500/600), spacing scale (4px-based, 10 values), radius (sm/md/lg/full), z-index (5 layers). 148 lines, under 500-line cap. TypeScript `as const` registry; `app/theme/types.ts` re-exports inferred types. Grep check: zero hardcoded hex outside `app/theme/index.ts`.

**Reports:** DONE + REVIEW (approved) — on group branch.

### `phase2-nuxt / bootstrap / bootstrap-nuxt` — merged to group branch

**Merge commit:** `0179d3b` (on `job/phase2-nuxt/bootstrap`, not yet merged to `main` — 6 more bootstrap tasks pending before group → main merge)

**Summary:** Minimal Nuxt 3 scaffold. TypeScript strict with `noUncheckedIndexedAccess` + `noImplicitOverride`. Dev port 3015 (not Nuxt default 3000 — collides with Dani's other services). `typeCheck=false` in-build — explicit `nuxi typecheck` enforced by CI + `task-complete-gate.sh` hook. Nitro websocket experimental flag on for future SSE progress work. Core deps only (nuxt, vue, zod + TS/vitest dev); theme, fonts, Mantine, Drizzle, auth etc. deferred to their own tasks.

**Files:** `app/{package.json,package-lock.json,nuxt.config.ts,tsconfig.json,app.vue,pages/index.vue,.nvmrc}` created.

**Reports:** `jobs/phase2-nuxt/DONE-bootstrap-nuxt.md` + `jobs/phase2-nuxt/REVIEW-bootstrap-nuxt.md` (verdict: approved) — currently on group branch, will surface on main when group merges.

**Notes:**
- 6 moderate npm audit vulnerabilities reported, all in `vitest` dev dependency paths. Dev-only, zero runtime exposure. Deferred to a future `chore(nuxt): upgrade vitest to v4` task.
- Worker correctly surfaced a spec-vs-deps conflict (`typeCheck: true` needs `vue-tsc` as peer, not in spec's dep list) rather than silently adding the dep. Spec updated to `typeCheck: false` before resumption.
