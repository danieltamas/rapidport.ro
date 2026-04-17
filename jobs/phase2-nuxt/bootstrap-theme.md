---
title: Define design tokens in app/theme/index.ts
priority: critical
status: todo
group: bootstrap
phase: 2
branch: job/phase2-nuxt/bootstrap-theme
spec-ref: SPEC §"UI Design System" (sections "Color tokens", "Typography", "Spacing scale")
---

## Description

Create `app/theme/index.ts` as the single source of truth for every design token in the app. No hardcoded colors/fonts/spacing ANYWHERE else in the codebase — SPEC UI Design System §"Anti-patterns" and CLAUDE.md's Admin UI Design System rule enforce this. Every primitive, page, and admin UI pulls from these tokens.

This task ONLY writes the tokens. It does NOT apply them, wire Mantine, or create primitives — those are later tasks.

## Why It Matters

Without a centralized token file, the design system drifts within a week. Every new component invents its own color value, and the "infrastructure-grade technical" aesthetic from SPEC disappears into visual noise. One token file, imported everywhere, is how the design stays coherent.

## Acceptance Criteria

### File: `app/theme/index.ts`

- [ ] TypeScript module, exports typed token constants. No runtime dependencies.
- [ ] Covers every token block from SPEC §"UI Design System":
  - **Colors — dark mode (primary):** `bgPrimary #0A0A0A`, `bgSecondary #111`, `bgTertiary #1A1A1A`, `bgHover #1F1F1F`, `borderDefault #262626`, `borderStrong #3A3A3A`, `borderFocus #C72E49`, `textPrimary #FAFAFA`, `textSecondary #A3A3A3`, `textTertiary #737373`, `textDisabled #525252`
  - **Colors — accent (signature red):** `accentPrimary #C72E49`, `accentHover #D8405B`, `accentPressed #A82541`, `accentSubtle #C72E491A` (10% opacity)
  - **Colors — semantic:** `success #22C55E`, `warning #F59E0B`, `danger #EF4444`, `info #3B82F6`
  - **Colors — light mode** (for `/legal/*` pages only): `bgPrimaryLight #FFFFFF`, `bgSecondaryLight #FAFAFA`, `textPrimaryLight #0A0A0A`, `textSecondaryLight #525252`. Accent colors are shared (same red).
  - **Font families:** `fontSans 'Inter, system-ui, -apple-system, sans-serif'`, `fontMono 'JetBrains Mono, Menlo, monospace'`
  - **Font scale** (per SPEC): `displayXl`, `displayLg`, `h1`, `h2`, `h3`, `h4`, `bodyLg`, `body`, `bodySm`, `caption`, `monoBody`, `monoSm` — each with `{ size, lineHeight, letterSpacing }`
  - **Font weights:** `weightRegular 400`, `weightMedium 500`, `weightMonoRegular 450`, `weightSemibold 600`
  - **Spacing scale:** `space4`, `space8`, `space12`, `space16`, `space24`, `space32`, `space48`, `space64`, `space96`, `space128` (strictly 4px-based)
  - **Radius:** `radiusSm 4`, `radiusMd 6`, `radiusLg 8`, `radiusFull 9999` (per SPEC button/badge rules)
  - **Z-index scale:** a small ordered set for `modal`, `toast`, `dropdown`, `tooltip`, `sticky` — pick values like 10, 100, 1000, 10000
- [ ] Exports organized: named exports per group (e.g., `export const color = { ... }`, `export const fontFamily = { ... }`, `export const space = { ... }`) plus a catchall `export const theme = { color, fontFamily, ... }`
- [ ] Every value is `as const` or typed literal — the file is a const registry, not a runtime class
- [ ] `app/theme/types.ts` (optional): re-export the inferred types (e.g., `export type ColorToken = keyof typeof color`) for use in component props later
- [ ] File header comment: `// Rapidport design tokens — single source of truth. Do not hardcode colors/fonts/spacing outside this file.`

### Verification

- [ ] `cd app && npx nuxi typecheck` passes
- [ ] `cd app && npm run build` passes (build won't use the tokens yet — just verifies nothing broke)
- [ ] Grep check: `grep -rn "#[0-9A-Fa-f]\{6\}" app/ --include='*.ts' --include='*.vue' --exclude-dir=node_modules --exclude-dir=.nuxt` returns ONLY matches inside `app/theme/index.ts`. No hardcoded hex anywhere else (there shouldn't be anything else touching colors yet — this check safeguards against accidental hardcoding).

### Out of scope (other bootstrap tasks)

- Applying the theme to Mantine's provider → `bootstrap-mantine-override`
- Wiring Inter/JetBrains Mono fonts → `bootstrap-fonts`
- Using tokens in primitive components → `bootstrap-primitives`
- Loading tokens as CSS variables (if needed) → same as mantine-override

## Files to Create

- `app/theme/index.ts`
- `app/theme/types.ts` (optional — include if it keeps the main file under 500 lines)

## Files to Touch

None.

## Notes

- Do NOT add CSS files or SCSS — tokens are TS constants only in this task. CSS generation (e.g., `:root { --bg-primary: ...; }`) is wired in `bootstrap-mantine-override` via Mantine's CSS variables support OR a plugin — not this task.
- Values MUST match SPEC exactly. If SPEC says `#C72E49` that is the value — do not "round" or "adjust".
- Token names are camelCase (TypeScript convention) even though SPEC documents them as `--kebab-case` CSS vars. Kebab-case surfaces in mantine-override when the tokens are converted to CSS custom properties.
- English identifiers only.
- Keep the file under 500 lines (CLAUDE.md hard rule). If exceeded, split by concern into `theme/color.ts`, `theme/typography.ts`, `theme/spacing.ts` and re-export via `theme/index.ts`.
