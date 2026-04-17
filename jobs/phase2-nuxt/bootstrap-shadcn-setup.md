---
title: Install shadcn-nuxt + Tailwind v4, wire Rapidport theme tokens
priority: critical
status: todo
group: bootstrap
phase: 2
branch: job/phase2-nuxt/bootstrap-shadcn-setup
spec-ref: SPEC §"UI Design System" (theme preserved); supersedes the Mantine references in SPEC §"Tech Stack" (see Background)
---

## Background

SPEC.md originally specified "Mantine (via Nuxt module)" as the UI kit. Mantine is a React library — no Vue/Nuxt port exists. After orchestrator-approved review, the UI kit was changed to **shadcn-nuxt** (Vue port of shadcn/ui) to match the pattern used in Dani's `play.wam.4.0` project. The Rapidport **theme** (colors, typography, spacing, components visual rules) from SPEC §"UI Design System" is preserved verbatim — shadcn's component set is re-skinned with our theme tokens.

This task installs the UI infrastructure. It does NOT generate any components — that's `bootstrap-primitives` next.

## Acceptance Criteria

### Deps added to `app/package.json`

- [ ] Runtime: `@nuxtjs/tailwindcss` is NOT used (prefer Tailwind v4 via Vite plugin — matches WAM's pattern). Instead:
  - `tailwindcss@^4.0.0`
  - `@tailwindcss/vite@^4.0.0`
  - `class-variance-authority@^0.7`
  - `clsx@^2.1`
  - `tailwind-merge@^3.0` (v3 works with Tailwind v4)
  - `lucide-vue-next@^0.400` (icon set — shadcn components reference lucide-vue)
  - `reka-ui@^2` (Vue port of Radix — shadcn-vue's headless primitive base)
- [ ] Dev: `shadcn-nuxt@^2.0` (module) + anything its peer deps require
- [ ] `package-lock.json` updated + committed
- [ ] No React deps — `@types/react`, `@mantine/*` etc. must not appear

### `app/nuxt.config.ts`

- [ ] Add `'shadcn-nuxt'` to the `modules: [...]` array
- [ ] Add top-level `shadcn: { prefix: '', componentDir: './components/ui' }` — matches the project's flat layout (no layers)
- [ ] Add `@tailwindcss/vite` plugin to `vite.plugins`:
  ```ts
  import tailwindcss from '@tailwindcss/vite'
  // ...
  vite: {
    plugins: [tailwindcss()],
    server: { allowedHosts: [...] },  // keep existing
  }
  ```
- [ ] Add `~/assets/css/tailwind.css` to the `css: [...]` array (before the `@fontsource` entries so tokens are defined before any component CSS loads)
- [ ] Do NOT remove or reorder: `devServer`, `nitro`, `typescript`, `devtools`, `telemetry`, `future`, `app.head.htmlAttrs.lang`, `compatibilityDate`, font `css[]` imports, existing Vite `allowedHosts`, Nitro CORS `routeRules`
- [ ] Typecheck still passes

### CSS token file — `app/assets/css/tailwind.css`

Single file. Order matters:

```css
@import "tailwindcss";

/*
 * Rapidport design tokens as CSS custom properties.
 * Values mirror app/theme/index.ts (single source of truth — if you change a token,
 * update BOTH files; drift is a review-block).
 * The @theme block below registers them as Tailwind utilities so shadcn components
 * resolve bg-background, text-foreground, bg-primary, etc.
 */

:root {
  /* Rapidport-native names — use these in bespoke rules */
  --bg-primary: #0A0A0A;
  --bg-secondary: #111111;
  --bg-tertiary: #1A1A1A;
  --bg-hover: #1F1F1F;

  --border-default: #262626;
  --border-strong: #3A3A3A;
  --border-focus: #C72E49;

  --text-primary: #FAFAFA;
  --text-secondary: #A3A3A3;
  --text-tertiary: #737373;
  --text-disabled: #525252;

  --accent-primary: #C72E49;
  --accent-hover: #D8405B;
  --accent-pressed: #A82541;
  --accent-subtle: #C72E491A;

  --success: #22C55E;
  --warning: #F59E0B;
  --danger: #EF4444;
  --info: #3B82F6;

  /* shadcn-expected names (alias to Rapidport tokens so shadcn components look correct) */
  --background: var(--bg-primary);
  --foreground: var(--text-primary);
  --card: var(--bg-secondary);
  --card-foreground: var(--text-primary);
  --popover: var(--bg-secondary);
  --popover-foreground: var(--text-primary);
  --primary: var(--accent-primary);
  --primary-foreground: var(--text-primary);
  --secondary: var(--bg-tertiary);
  --secondary-foreground: var(--text-primary);
  --muted: var(--bg-tertiary);
  --muted-foreground: var(--text-secondary);
  --accent: var(--bg-hover);
  --accent-foreground: var(--text-primary);
  --destructive: var(--danger);
  --destructive-foreground: var(--text-primary);
  --border: var(--border-default);
  --input: var(--border-strong);
  --ring: var(--border-focus);

  --radius: 0.375rem;  /* 6px — matches radiusMd from theme */
}

/* Light mode (for /legal/* per SPEC) — opt-in by adding class="light" on <html> or a wrapper */
.light {
  --bg-primary: #FFFFFF;
  --bg-secondary: #FAFAFA;
  --text-primary: #0A0A0A;
  --text-secondary: #525252;
  /* accent colors unchanged (signature red = same in both modes per SPEC) */
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Menlo', monospace;

  --radius-sm: calc(var(--radius) - 2px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 2px);
  --radius-full: 9999px;
}

/* Global baseline — dark by default (SPEC default everywhere except /legal/*) */
html, body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code, pre, kbd, samp, .font-mono {
  font-family: 'JetBrains Mono', 'Menlo', monospace;
}
```

The values in `:root` MUST match `app/theme/index.ts` exactly. If they drift, the reviewer rejects.

### Root `components.json` (shadcn-vue config, committed at `app/components.json`)

- [ ] Created by running `npx shadcn-vue@latest init` OR crafted by hand. Required fields:
  - `$schema`: `https://shadcn-vue.com/schema.json`
  - `style`: `'default'`
  - `typescript`: `true`
  - `tailwind.css`: `'./assets/css/tailwind.css'`
  - `tailwind.baseColor`: `'slate'` (will be overridden by our CSS vars — any base works)
  - `tailwind.cssVariables`: `true`
  - `aliases.components`: `'~/components'`
  - `aliases.utils`: `'~/lib/utils'`
  - `aliases.ui`: `'~/components/ui'`
  - `aliases.composables`: `'~/composables'`
  - `framework`: `'nuxt'`

### Utility file — `app/lib/utils.ts`

- [ ] Standard shadcn-vue `cn()` helper:
  ```ts
  import { clsx, type ClassValue } from 'clsx'
  import { twMerge } from 'tailwind-merge'

  export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
  }
  ```

### Verification

- [ ] `cd app && npm install` clean exit
- [ ] `cd app && npx nuxi prepare` clean exit
- [ ] `cd app && npx nuxi typecheck` passes — no errors
- [ ] `cd app && npm run build` passes, `.output/` produced
- [ ] `find app/.output/public/_nuxt -name '*.css' | xargs grep -l 'C72E49'` finds at least one match — proves our accent color made it into the compiled CSS
- [ ] NO `npm run dev` or any server-start command — user runs rundev

### Out of scope

- Generating shadcn components (Button, Input, Card, etc.) → `bootstrap-primitives` (next task)
- Applying theme to `pages/index.vue` beyond what global CSS does → later `pages-landing` task
- FOUC prevention script for light/dark switch → not needed yet (site is dark-only until `/legal/*` pages get added in `pages-legal` task)
- Adding any page or component styling — verification only confirms build, not visual correctness

## Files to Create

- `app/assets/css/tailwind.css`
- `app/lib/utils.ts`
- `app/components.json`

## Files to Touch

- `app/package.json` — add deps + shadcn-nuxt module
- `app/package-lock.json` — regenerated
- `app/nuxt.config.ts` — modules array, shadcn config, Vite Tailwind plugin, css array order

## Files NOT to Touch

- `app/theme/index.ts` — stays as TS token source of truth
- `app/theme/types.ts`
- Any existing `app/server/**` files (env, db)
- `app/pages/index.vue` — stays as "Rapidport — in progress" placeholder
- `.env.example`

## Notes

- Tailwind v4 uses **CSS-first theming** via `@theme` directive inside the main CSS file — there is no `tailwind.config.ts` file needed for our setup. WAM uses the same pattern with `@tailwindcss/vite`.
- `reka-ui` is the Vue equivalent of Radix — shadcn-vue components depend on it. Version compatibility is important; check shadcn-vue's current recommended peer.
- `tailwind-merge` v3 is required for Tailwind v4 compatibility.
- Do NOT install `@mantine/core` or any Mantine package. If the lockfile shows Mantine, that's a review-block.
- Keep `compatibilityDate: '2025-10-15'` and `future.compatibilityVersion: 4` in nuxt.config.ts unchanged.
- English only in code + comments. Romanian stays in user-facing string literals (placeholder is fine as-is in English until Phase 2 pages tasks add Romanian copy).
- Commit split suggestion:
  1. `feat(ui): add shadcn-nuxt + Tailwind v4 deps and utils`
  2. `feat(ui): wire Rapidport theme tokens into Tailwind @theme`
  3. `feat(ui): register shadcn-nuxt module + nuxt.config wiring`
  4. `docs(jobs): DONE report for bootstrap-shadcn-setup`
