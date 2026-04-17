# Completed: Define design tokens in app/theme/index.ts

**Task:** bootstrap-theme.md
**Status:** done
**Date:** 2026-04-17

## Changes Made

- `app/theme/index.ts:1` — File header comment per spec
- `app/theme/index.ts:6-21` — Dark mode color tokens (`colorDark`): bgPrimary through textDisabled
- `app/theme/index.ts:25-30` — Accent color tokens (`colorAccent`): accentPrimary, accentHover, accentPressed, accentSubtle (#C72E491A 8-digit hex)
- `app/theme/index.ts:34-40` — Semantic color tokens (`colorSemantic`): success, warning, danger, info
- `app/theme/index.ts:44-51` — Light mode color tokens (`colorLight`): bgPrimaryLight, bgSecondaryLight, textPrimaryLight, textSecondaryLight
- `app/theme/index.ts:55-58` — Unified `color` export (spread of all four color groups)
- `app/theme/index.ts:62-65` — Font family tokens (`fontFamily`): fontSans and fontMono with proper CSS quoting for multi-word names
- `app/theme/index.ts:70-84` — Font scale (`fontScale`): 12 entries (displayXl through monoSm), each `{ size: number, lineHeight: number, letterSpacing: string }`
- `app/theme/index.ts:88-93` — Font weight tokens (`fontWeight`): weightRegular/Medium/MonoRegular/Semibold
- `app/theme/index.ts:97-108` — Spacing scale (`space`): space4 through space128, strictly 4px-based
- `app/theme/index.ts:112-117` — Border radius tokens (`radius`): radiusSm/Md/Lg/Full
- `app/theme/index.ts:121-127` — Z-index scale (`zIndex`): sticky→dropdown→tooltip→modal→toast (ascending 10/100/1000/10000/100000)
- `app/theme/index.ts:131-140` — Catchall `theme` export bundling all groups
- `app/theme/types.ts` — Inferred TypeScript types for all token groups (ColorToken, FontScaleToken, etc.)

## Acceptance Criteria Check

- [x] TypeScript module, exports typed token constants. No runtime dependencies.
- [x] Colors — dark mode: bgPrimary #0A0A0A, bgSecondary #111111, bgTertiary #1A1A1A, bgHover #1F1F1F, borderDefault #262626, borderStrong #3A3A3A, borderFocus #C72E49, textPrimary #FAFAFA, textSecondary #A3A3A3, textTertiary #737373, textDisabled #525252
- [x] Colors — accent: accentPrimary #C72E49, accentHover #D8405B, accentPressed #A82541, accentSubtle #C72E491A
- [x] Colors — semantic: success #22C55E, warning #F59E0B, danger #EF4444, info #3B82F6
- [x] Colors — light mode: bgPrimaryLight #FFFFFF, bgSecondaryLight #FAFAFA, textPrimaryLight #0A0A0A, textSecondaryLight #525252
- [x] Font families: fontSans and fontMono with proper CSS font-stack quoting
- [x] Font scale: all 12 entries (displayXl → monoSm) with size/lineHeight/letterSpacing
- [x] Font weights: weightRegular 400, weightMedium 500, weightMonoRegular 450, weightSemibold 600
- [x] Spacing scale: space4 through space128 (10 values, 4px-based)
- [x] Radius: radiusSm 4, radiusMd 6, radiusLg 8, radiusFull 9999
- [x] Z-index: sticky 10, dropdown 100, tooltip 1000, modal 10000, toast 100000
- [x] Named exports per group + catchall `theme` export
- [x] All values `as const`
- [x] File header comment present
- [x] `app/theme/types.ts` created with inferred type exports
- [x] File is 148 lines — well under 500-line cap

## Verification Output

### `npx nuxi typecheck`

```
EXIT: 0
(no output — clean pass)
```

Note: `npm install` was required first (dependencies not yet installed in the worktree). No new packages were added — existing package.json deps were sufficient.

### `npm run build`

```
Σ Total size: 2.09 MB (510 kB gzip)
[nitro] ✔ You can preview this build using node .output/server/index.mjs
│
└  ✨ Build complete!
```

### Grep check for hardcoded hex outside app/theme/

Command: `grep -rn "#[0-9A-Fa-f]\{6\}" app/ --include='*.ts' --include='*.vue' --exclude-dir=node_modules --exclude-dir=.nuxt --exclude-dir=.output`

Result: All 24 matches are inside `app/theme/index.ts` only. No hardcoded hex in any other file.

## Notes

- `bgSecondary` uses `#111111` (6-digit canonical form) matching SPEC exactly — SPEC shows `#111111`, not `#111`.
- `accentSubtle` stored as 8-digit hex `#C72E491A` (valid CSS color). The grep `#[0-9A-Fa-f]{6}` matches its first 6 chars — still only in `app/theme/index.ts`, so the check passes correctly.
- Z-index ordering chosen as sticky(10) < dropdown(100) < tooltip(1000) < modal(10000) < toast(100000) so toasts appear above modals (e.g., confirmation toasts over open dialogs).
- Font stack strings preserve inner single-quotes for multi-word family names (`'JetBrains Mono'`, `'Inter'`) so the string is valid CSS when used directly in style declarations.
- No CSS files, no SCSS, no new npm dependencies — pure TypeScript constants only.
