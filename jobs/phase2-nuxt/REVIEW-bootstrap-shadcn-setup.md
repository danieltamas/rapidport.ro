# Review: Install shadcn-nuxt + Tailwind v4, wire Rapidport theme tokens

**Task:** bootstrap-shadcn-setup.md
**Branch:** job/phase2-nuxt/bootstrap-shadcn-setup
**Verdict:** PASS
**Date:** 2026-04-17
**Reviewer:** Code Reviewer Agent

---

## Files Reviewed

- `app/package.json`
- `app/nuxt.config.ts`
- `app/assets/css/tailwind.css`
- `app/components.json`
- `app/lib/utils.ts`
- `app/theme/index.ts` (token source, cross-referenced)
- `jobs/phase2-nuxt/DONE-bootstrap-shadcn-setup.md`

---

## Checklist

### Dependencies

- [x] `tailwindcss@^4.0.0` — installed at 4.2.2
- [x] `@tailwindcss/vite@^4.0.0` — installed at 4.2.2
- [x] `class-variance-authority@^0.7` — installed at 0.7.1
- [x] `clsx@^2.1` — installed at 2.1.1
- [x] `tailwind-merge@^3.0` — installed at 3.5.0 (v3 required for Tailwind v4)
- [x] `lucide-vue-next@^0.400` — installed at 0.400.0
- [x] `reka-ui@^2` — installed at 2.9.6
- [x] `shadcn-nuxt@^2.0` as devDependency — installed at 2.6.2
- [x] `@nuxtjs/tailwindcss` NOT present — Tailwind v4 via `@tailwindcss/vite` only
- [x] No `@mantine/*` — `grep -c mantine package-lock.json` returns 0
- [x] `@types/react` appears only as optional peer dep of `drizzle-orm` — not installed as a real dep, React is not present in the project

### nuxt.config.ts

- [x] `'shadcn-nuxt'` added to `modules` array
- [x] `shadcn: { prefix: '', componentDir: './components/ui' }` present at top level
- [x] `import tailwindcss from '@tailwindcss/vite'` added at file top
- [x] `tailwindcss()` added to `vite.plugins`
- [x] `~/assets/css/tailwind.css` prepended to `css[]` array before `@fontsource` entries
- [x] `devServer.host: '127.0.0.1'` preserved
- [x] `devServer.port: 3015` preserved
- [x] `telemetry: false` preserved
- [x] `future.compatibilityVersion: 4` preserved
- [x] `srcDir: '.'` preserved
- [x] `typescript.strict: true` preserved
- [x] `devtools.enabled: false` preserved
- [x] `app.head.htmlAttrs.lang: 'ro'` preserved
- [x] All four `@fontsource` css imports preserved
- [x] `vite.server.allowedHosts` preserved (rapidport.ro, localhost, 127.0.0.1)
- [x] `nitro.routeRules` CORS config preserved
- [x] `compatibilityDate: '2025-10-15'` preserved
- [x] `nitro.preset: 'node-server'` preserved
- [x] `nitro.experimental.websocket: true` preserved

### CSS Token Mirror (tailwind.css :root vs theme/index.ts)

Every hex value cross-checked against the source of truth — all match exactly:

| Token | theme/index.ts | tailwind.css | Match |
|-------|---------------|-------------|-------|
| `--bg-primary` | `#0A0A0A` | `#0A0A0A` | OK |
| `--bg-secondary` | `#111111` | `#111111` | OK |
| `--bg-tertiary` | `#1A1A1A` | `#1A1A1A` | OK |
| `--bg-hover` | `#1F1F1F` | `#1F1F1F` | OK |
| `--border-default` | `#262626` | `#262626` | OK |
| `--border-strong` | `#3A3A3A` | `#3A3A3A` | OK |
| `--border-focus` | `#C72E49` | `#C72E49` | OK |
| `--text-primary` | `#FAFAFA` | `#FAFAFA` | OK |
| `--text-secondary` | `#A3A3A3` | `#A3A3A3` | OK |
| `--text-tertiary` | `#737373` | `#737373` | OK |
| `--text-disabled` | `#525252` | `#525252` | OK |
| `--accent-primary` | `#C72E49` | `#C72E49` | OK |
| `--accent-hover` | `#D8405B` | `#D8405B` | OK |
| `--accent-pressed` | `#A82541` | `#A82541` | OK |
| `--accent-subtle` | `#C72E491A` | `#C72E491A` | OK |
| `--success` | `#22C55E` | `#22C55E` | OK |
| `--warning` | `#F59E0B` | `#F59E0B` | OK |
| `--danger` | `#EF4444` | `#EF4444` | OK |
| `--info` | `#3B82F6` | `#3B82F6` | OK |
| `.light --bg-primary` | `#FFFFFF` | `#FFFFFF` | OK |
| `.light --bg-secondary` | `#FAFAFA` | `#FAFAFA` | OK |
| `.light --text-primary` | `#0A0A0A` | `#0A0A0A` | OK |
| `.light --text-secondary` | `#525252` | `#525252` | OK |

Zero drift. All 23 values (19 dark root + 4 light overrides) match exactly.

### shadcn Alias Vars (no hardcoded hex)

All shadcn-expected vars (`--background`, `--foreground`, `--primary`, `--destructive`, `--border`, `--input`, `--ring`, etc.) alias to Rapidport vars via `var(--bg-primary)` etc. No hex values duplicated in the alias section. Verified via output grep — all entries show `var(--...)` pattern.

### @theme inline Block

All required color registrations present: `--color-background` through `--color-ring`. Font families (`--font-sans`, `--font-mono`) and radius utilities (`--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full`) also registered correctly. Tailwind utilities will resolve `bg-background`, `text-foreground`, `bg-primary`, etc.

### components.json

- [x] `$schema: "https://shadcn-vue.com/schema.json"` present
- [x] `style: "default"` present
- [x] `typescript: true` present
- [x] `tailwind.css: "./assets/css/tailwind.css"` present
- [x] `tailwind.baseColor: "slate"` present
- [x] `tailwind.cssVariables: true` present
- [x] `aliases.components: "~/components"` — Rapidport-flat, correct
- [x] `aliases.utils: "~/lib/utils"` — Rapidport-flat, correct
- [x] `aliases.ui: "~/components/ui"` — Rapidport-flat, correct
- [x] `aliases.composables: "~/composables"` — Rapidport-flat, correct
- [x] `framework: "nuxt"` present
- [x] No WAM-style `layers/base/...` paths

### lib/utils.ts

- [x] Standard `cn()` helper only — `clsx` + `twMerge`, nothing extra
- [x] TypeScript with `ClassValue` type import

### Out of Scope — Confirmed Clean

- [x] No files in `app/components/ui/` — directory does not exist on this branch
- [x] `app/theme/index.ts` not modified
- [x] `app/pages/index.vue` not modified
- [x] No server files modified

### Build Verification

- [x] `npm install` — clean exit (727 packages audited)
- [x] `npx nuxi prepare` — exits 0, only expected warning: `Component directory does not exist: .../components/ui` (normal, populated in next task)
- [x] `npx nuxi typecheck` — passes, no errors
- [x] `npm run build` — exits 0, `.output/` produced. Two sourcemap warnings from `@tailwindcss/vite:generate:build` are a known upstream cosmetic issue, do not affect output.
- [x] Accent color `c72e49` confirmed in compiled CSS: `app/.output/public/_nuxt/entry.BPgQJQ8u.css` contains `--border-focus:#c72e49`, `--accent-primary:#c72e49`, `--accent-subtle:#c72e491a` (CSS minifier normalizes to lowercase)

### Git Hygiene

- [x] 4 commits on branch, all Conventional Commits format: `feat(ui): ...` / `docs(jobs): ...`
- [x] Author on all commits: `Daniel Tamas <hello@danieltamas.ro>`
- [x] No `Co-Authored-By` trailers — confirmed 0 matches
- [x] Diff is clean: only the 7 expected files changed (`app/package.json`, `app/package-lock.json`, `app/nuxt.config.ts`, `app/assets/css/tailwind.css`, `app/components.json`, `app/lib/utils.ts`, `jobs/phase2-nuxt/DONE-bootstrap-shadcn-setup.md`)

---

## Summary

Implementation is correct and complete. Every acceptance criterion is met. The CSS-token-mirror is exact — zero drift between `theme/index.ts` and `tailwind.css`. The shadcn alias variables use `var(--...)` references instead of hardcoded hex, eliminating drift surface. The `@theme inline` block correctly registers Tailwind utility names. Build produces compiled CSS with the accent color token. All existing `nuxt.config.ts` keys are preserved. No components were generated (correctly deferred to `bootstrap-primitives`). No React or Mantine deps present.

**Verdict: PASS — ready to merge.**
