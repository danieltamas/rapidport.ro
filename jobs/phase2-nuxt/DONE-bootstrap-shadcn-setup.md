# Completed: Install shadcn-nuxt + Tailwind v4, wire Rapidport theme tokens

**Task:** bootstrap-shadcn-setup.md
**Status:** done
**Date:** 2026-04-17

## Changes Made

- `app/package.json:22-35` — Added runtime deps: `tailwindcss@4.2.2`, `@tailwindcss/vite@4.2.2`, `class-variance-authority@0.7.1`, `clsx@2.1.1`, `tailwind-merge@3.5.0`, `lucide-vue-next@0.400.0`, `reka-ui@2.9.6`; added dev dep `shadcn-nuxt@2.6.2`
- `app/package-lock.json` — Regenerated after npm install
- `app/lib/utils.ts:1-6` — Standard `cn()` helper using clsx + tailwind-merge
- `app/assets/css/tailwind.css:1-111` — Tailwind v4 CSS-first setup: `@import "tailwindcss"`, `:root` custom properties mirroring `app/theme/index.ts` exactly, `.light` override for /legal/* pages, `@theme inline` block registering shadcn utility names, global dark baseline for html/body
- `app/components.json:1-16` — shadcn-vue config: style=default, typescript=true, Rapidport-flat aliases (`~/components`, `~/components/ui`, `~/lib/utils`, `~/composables`), framework=nuxt
- `app/nuxt.config.ts:2` — Import `tailwindcss` from `@tailwindcss/vite`
- `app/nuxt.config.ts:14-19` — Added `modules: ['shadcn-nuxt']` and `shadcn: { prefix: '', componentDir: './components/ui' }`
- `app/nuxt.config.ts:40` — Prepended `~/assets/css/tailwind.css` to `css[]` array before fontsource entries
- `app/nuxt.config.ts:90` — Added `plugins: [tailwindcss()]` to `vite:` block

## Acceptance Criteria Check

- [x] `tailwindcss@^4.0.0` installed (got 4.2.2)
- [x] `@tailwindcss/vite@^4.0.0` installed (got 4.2.2)
- [x] `class-variance-authority@^0.7` installed (got 0.7.1)
- [x] `clsx@^2.1` installed (got 2.1.1)
- [x] `tailwind-merge@^3.0` installed (got 3.5.0) — v3 works with Tailwind v4 per spec
- [x] `lucide-vue-next@^0.400` installed (got 0.400.0)
- [x] `reka-ui@^2` installed (got 2.9.6)
- [x] `shadcn-nuxt@^2.0` installed as dev dep (got 2.6.2)
- [x] No React deps — `grep -c "@types/react" package-lock.json` returns 2 but only as optional peer dep in drizzle-orm, not installed; no `@mantine/*` anywhere
- [x] `@nuxtjs/tailwindcss` NOT used — using Tailwind v4 via `@tailwindcss/vite` directly
- [x] `shadcn-nuxt` in modules array
- [x] `shadcn: { prefix: '', componentDir: './components/ui' }` present
- [x] `@tailwindcss/vite` plugin added to `vite.plugins`
- [x] `~/assets/css/tailwind.css` prepended to `css[]` before fontsource entries
- [x] All existing nuxt.config.ts keys preserved (devServer, nitro, typescript, devtools, telemetry, future, app.head.htmlAttrs.lang, compatibilityDate, vite.server.allowedHosts, Nitro CORS routeRules)
- [x] `app/assets/css/tailwind.css` created with `@import "tailwindcss"` first
- [x] `:root` CSS vars match `app/theme/index.ts` one-for-one
- [x] `@theme inline` block registers shadcn utility color names
- [x] `.light` override block for /legal/* pages
- [x] Global baseline html/body with dark background and Inter font
- [x] `app/components.json` created with all required fields and Rapidport-flat aliases
- [x] `app/lib/utils.ts` is the standard `cn()` helper only — nothing more
- [x] No generated component files in `app/components/ui/`
- [x] `compatibilityDate: '2025-10-15'` preserved
- [x] `future.compatibilityVersion: 4` preserved
- [x] `srcDir: '.'` preserved
- [x] `devServer.host: '127.0.0.1'` preserved

## Verification Output

### `npm install` tail
```
added 725 packages, and audited 727 packages in 24s
(+ 4 more for shadcn-nuxt = 731 total)
```

### `npx nuxi typecheck` output (clean)
```
 WARN  Component directory does not exist: .../app/components/ui
[nuxt] ℹ Running with compatibility version 4
EXIT: 0
```
(Warning is expected — components/ui is populated in the next task `bootstrap-primitives`)

### `npm run build` tail
```
✔ Client built in 3679ms
✔ Server built in 1049ms
[nitro] ✔ Generated public .output/public
[nitro] ✔ Nuxt Nitro server built
└  ✨ Build complete!
```
Note: Two sourcemap warnings from `@tailwindcss/vite:generate:build` internal plugin — cosmetic only, build succeeds.

### Accent color in built CSS
```
$ grep -il 'c72e49' app/.output/public/_nuxt/*.css
app/.output/public/_nuxt/entry.BPgQJQ8u.css
```
The CSS minifier normalizes `#C72E49` to lowercase `#c72e49` — both are the same value. Token appears as `--border-focus:#c72e49` and `--accent-primary:#c72e49` in the compiled stylesheet.

### No shadcn-vue CLI invoked
`components.json` was crafted by hand per spec (CLI would require interactive prompts). All required fields present.

## Notes

- Tailwind v4 resolves via CSS-first `@import "tailwindcss"` — no `tailwind.config.ts` needed.
- `tailwind-merge@3.5.0` (v3) is required for Tailwind v4 compatibility — v2 does not understand Tailwind v4 class names.
- `reka-ui@2.9.6` is the headless primitive layer for shadcn-vue; shadcn-nuxt peer requires it.
- `shadcn-nuxt@2.6.2` is the current stable 2.x release — installs cleanly as devDependency.
- The `@types/react` mention in package-lock.json is a listed optional peer dep from `drizzle-orm`, not an installed package. No React is present.
- Build sourcemap warnings from `@tailwindcss/vite:generate:build` are a known upstream cosmetic issue (the plugin does not emit sourcemaps for its CSS generation pass). They do not affect the output.
