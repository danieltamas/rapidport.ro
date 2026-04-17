# Completed: Self-host Inter + JetBrains Mono via @fontsource

**Task:** bootstrap-fonts.md
**Status:** done
**Date:** 2026-04-17

## Changes Made

- `app/package.json:18-19` — Added `@fontsource/inter@^5.2.8` and `@fontsource/jetbrains-mono@^5.2.8` to `dependencies`
- `app/package-lock.json` — Updated with resolved hashes for the two new packages and their transitive data
- `app/nuxt.config.ts:4-9` — Added `css` array with four per-weight imports: `@fontsource/inter/400.css`, `500.css`, `600.css`, and `@fontsource/jetbrains-mono/400.css`

## Acceptance Criteria Check

- [x] `@fontsource/inter@^5.1.0` in `dependencies` — resolved to 5.2.8
- [x] `@fontsource/jetbrains-mono@^5.1.0` in `dependencies` — resolved to 5.2.8
- [x] `package-lock.json` updated and committed
- [x] Inter weights 400/500/600 loaded
- [x] JetBrains Mono weight 400 loaded (450 unavailable; 400 is accepted per spec)
- [x] `app/nuxt.config.ts` `css` key added with four font imports; no other config changed
- [x] No Tailwind, UnoCSS, or PostCSS pipeline added
- [x] `npm install` completes cleanly (no new peer-dep warnings beyond pre-existing vulns)
- [x] `npx nuxi typecheck` passes (exit code 0)
- [x] `npm run build` passes — woff2 files present in `app/.output/public/_nuxt/`
- [x] No `fonts.googleapis.com` or `fonts.gstatic.com` URLs anywhere in build output

## Verification Output

### `cd app && npm install` (last 5 lines)
```
156 packages are looking for funding
  run `npm fund` for details

6 moderate severity vulnerabilities
(pre-existing; not introduced by this task)
```

### `npx nuxi typecheck`
```
Exit code: 0
(no output — clean pass)
```

### `npm run build` (tail)
```
[nitro] ✔ Nuxt Nitro server built
Σ Total size: 2.15 MB (524 kB gzip)
└  ✨ Build complete!
```

### `find app/.output -name '*.woff2' | head -5`
```
app/.output/public/_nuxt/jetbrains-mono-cyrillic-400-normal.BEIGL1Tu.woff2
app/.output/public/_nuxt/inter-greek-500-normal.BIZE56-Y.woff2
app/.output/public/_nuxt/inter-cyrillic-600-normal.CWCymEST.woff2
app/.output/public/_nuxt/inter-vietnamese-600-normal.Cc8MFFhd.woff2
app/.output/public/_nuxt/inter-vietnamese-400-normal.DMkecbls.woff2
```

### `grep -rn 'fonts.googleapis\|fonts.gstatic' app/.output/` — returns EMPTY
```
(no output — confirmed: zero CDN references)
```

## Notes

- `@fontsource/inter` v5 and `@fontsource/jetbrains-mono` v5 do NOT ship a `variable.css` in the base packages. Variable fonts moved to the `@fontsource-variable/*` namespace in the v5 split. Per the task scope constraint ("Install ONLY `@fontsource/inter` and `@fontsource/jetbrains-mono`"), per-weight imports (`400.css`, `500.css`, `600.css`) are used — four files total.
- JetBrains Mono weight 450 is unavailable as a separate file; weight 400 is used as the accepted fallback per spec.
- The 6 moderate severity vulnerabilities reported by `npm audit` are pre-existing in the Nuxt/Vite dependency tree and were present before this task. Not introduced by `@fontsource` packages.
- Font files are emitted to `app/.output/public/_nuxt/` covering latin, latin-ext, cyrillic, cyrillic-ext, greek, greek-ext, and vietnamese subsets — all served from our own origin, no external CDN requests.
