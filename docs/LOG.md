# Rapidport — Changelog

Reverse-chronological log of completed tasks. Every merged task gets one entry.

Entry format: one block per task with job/group/task path, merge commit, brief summary, DONE + REVIEW references.

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
