---
title: Self-host Inter + JetBrains Mono via @fontsource
priority: high
status: todo
group: bootstrap
phase: 2
branch: job/phase2-nuxt/bootstrap-fonts
spec-ref: SPEC §"UI Design System" (Typography + Implementation notes for Claude Code)
---

## Description

Install `@fontsource/inter` and `@fontsource/jetbrains-mono`, wire them into Nuxt so every page gets Inter for body text and JetBrains Mono for technical data (CIFs, field names, IDs, timestamps, amounts). **Self-host** — never link Google Fonts (privacy + speed per SPEC implementation notes).

This task ONLY installs and wires the fonts. It does NOT apply them to components or theme — that's later tasks.

## Why It Matters

SPEC's "infrastructure-grade technical" aesthetic only works if the fonts render crisply. Inter + JetBrains Mono are chosen specifically for readability at small sizes (dense tables, monospaced IDs). Using system-ui fallbacks kills the feel.

Self-hosting also avoids the privacy/GDPR implications of sending user IP addresses to Google's font CDN on every page load.

## Acceptance Criteria

### Dependencies added to `app/package.json`

- [ ] `@fontsource/inter@^5.1.0` in `dependencies`
- [ ] `@fontsource/jetbrains-mono@^5.1.0` in `dependencies`
- [ ] `package-lock.json` updated accordingly (commit it)

### Weights loaded

Per SPEC §"Typography":
- **Inter:** weights 400 (regular), 500 (medium), 600 (semibold)
- **JetBrains Mono:** weight 450 (medium-regular — the technical data weight)

Use `@fontsource/inter/400.css`, `@fontsource/inter/500.css`, `@fontsource/inter/600.css`, `@fontsource/jetbrains-mono/400.css` (jetbrains-mono doesn't ship 450 as a separate file — load 400 and rely on font-variation-settings or `font-weight: 450` in CSS if the VF version is available; if not, 400 is the closest and acceptable).

**Prefer the variable-font (`@fontsource/inter/variable.css` and `@fontsource/jetbrains-mono/variable.css`) if available** — one file, all weights, smaller total bytes. Check the installed version's README and pick accordingly.

### Wiring

- [ ] `app/nuxt.config.ts` — add `css: ['@fontsource/inter/400.css', '@fontsource/inter/500.css', '@fontsource/inter/600.css', '@fontsource/jetbrains-mono/400.css']` (or variable-font equivalents). Place it near the existing config blocks, don't reorder unrelated keys.
- [ ] No other config changes — do NOT add Tailwind, UnoCSS, or any PostCSS pipeline. Fonts only.

### Verification

- [ ] `cd app && npm install` completes, adds the two packages, updates `package-lock.json`
- [ ] `cd app && npx nuxi typecheck` passes
- [ ] `cd app && npm run build` passes — `app/.output/public/_nuxt/` (or similar) contains the font `.woff2` files self-hosted. Confirm with `find app/.output -name '*.woff2' | head -5`
- [ ] No Google Fonts `https://fonts.googleapis.com/` or `https://fonts.gstatic.com/` URL anywhere in build output: `grep -rn 'fonts.googleapis\|fonts.gstatic' app/.output/ 2>/dev/null` returns nothing

### Out of scope

- Applying font-family in CSS → covered in `bootstrap-mantine-override` (Mantine theme sets `fontFamily: theme.fontSans`, `fontFamilyMonospace: theme.fontMono`)
- `app/theme/index.ts` already has `fontSans` / `fontMono` defined (from `bootstrap-theme`) — this task does not edit theme

## Files to Touch

- `app/package.json`
- `app/package-lock.json`
- `app/nuxt.config.ts` (add `css` key with font imports)

## Files to Create

None.

## Notes

- Self-hosted confirms: search build output for the font file references + confirm no external CDN URLs. That's the only way to prove self-hosting works.
- If `@fontsource/inter/variable.css` is available in the installed version, use it — one import replaces the three weight-specific ones. Smaller bundle.
- `font-display: swap` is the default in `@fontsource` packages — good for perceived performance.
- Do NOT add Tailwind or any CSS framework for this task. Fonts are standalone CSS imports.
- English-only identifiers (though CSS selectors etc. are language-agnostic).
- If `npm install` reports a new peer-dep warning, note it in the DONE report's Notes section — do NOT attempt to silence warnings by installing extra packages.
