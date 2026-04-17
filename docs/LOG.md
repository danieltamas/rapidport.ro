# Rapidport — Changelog

Reverse-chronological log of completed tasks. Every merged task gets one entry.

Entry format: one block per task with job/group/task path, merge commit, brief summary, DONE + REVIEW references.

---

## 2026-04-17

### `phase2-nuxt / bootstrap / bootstrap-fonts` — merged to group branch

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
