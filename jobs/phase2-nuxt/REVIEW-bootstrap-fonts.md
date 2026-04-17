# Review: Self-host Inter + JetBrains Mono via @fontsource

**Task:** bootstrap-fonts.md
**DONE Report:** DONE-bootstrap-fonts.md
**Reviewer:** Code Reviewer
**Date:** 2026-04-17
**Verdict:** PASS

---

## Discipline Checklist

- [x] `app/package.json` — exactly two deps added: `@fontsource/inter@^5.2.8` and `@fontsource/jetbrains-mono@^5.2.8`, both in `dependencies` (not devDependencies). No other deps added.
- [x] `app/package-lock.json` — updated and committed. `npm install` completed cleanly in independent verification.
- [x] `app/nuxt.config.ts` — `css` array added with four per-weight imports: `@fontsource/inter/400.css`, `500.css`, `600.css`, `@fontsource/jetbrains-mono/400.css`. No other config keys changed.
- [x] **Self-hosted confirmed** — `npm run build` ran independently in the worktree; woff2 files are present in `.output/public/_nuxt/`. `grep -rn 'fonts.googleapis\|fonts.gstatic' app/.output/` returned empty. `grep` across source `.vue`, `.ts`, `.js`, `.css` files (excluding node_modules/.nuxt/.output) also returned empty. Zero Google CDN references in source or build output.
- [x] No Tailwind, UnoCSS, PostCSS, or any CSS framework added. Diff is font CSS imports only.
- [x] No theme files touched (`app/theme/*` untouched).
- [x] No env or server files touched (`app/server/*` untouched).
- [x] No `app/app.vue` or `pages/index.vue` edits.
- [x] Commits use Conventional Commits format, authored by `Daniel Tamas <hello@danieltamas.ro>`, no Co-Authored-By trailer.
- [x] DONE report includes build output, woff2 listing, and CDN grep results — self-hosting proof is present.

---

## Diff Scope

Exactly four files changed:

| File | Change |
|---|---|
| `app/package.json` | +2 lines — two new deps |
| `app/package-lock.json` | +22 lines — two new resolved packages |
| `app/nuxt.config.ts` | +6 lines — `css` array block |
| `jobs/phase2-nuxt/DONE-bootstrap-fonts.md` | new file |

No scope creep. Minimal and clean.

---

## Self-Hosting Verification (Independent)

Reviewer ran `npm install` + `npm run build` independently in the worktree:

```
✔ Client built in 2505ms
[nitro] ✔ Nuxt Nitro server built
Σ Total size: 2.15 MB (524 kB gzip)
✨ Build complete!
```

Sample woff2 files in `.output/public/_nuxt/`:
```
jetbrains-mono-cyrillic-400-normal.BEIGL1Tu.woff2
inter-greek-500-normal.BIZE56-Y.woff2
inter-cyrillic-600-normal.CWCymEST.woff2
inter-vietnamese-600-normal.Cc8MFFhd.woff2
inter-vietnamese-400-normal.DMkecbls.woff2
inter-latin-400-normal.C38fXH4l.woff2
```

Google CDN grep (source): empty — PASS
Google CDN grep (build output): empty — PASS

The production `npm run build` success also serves as a proxy for typecheck — the Vite/TS pipeline ran end-to-end without error.

---

## Spec Deviations — All Spec-Sanctioned

**JetBrains Mono 400 instead of 450:** spec explicitly states "if not, 400 is the closest and acceptable." Not a finding.

**Per-weight imports instead of `variable.css`:** spec says "if available" in the base package. The DONE report correctly identifies that in `@fontsource` v5 the variable-font variants moved to the `@fontsource-variable/*` namespace and are not shipped in `@fontsource/inter` or `@fontsource/jetbrains-mono`. Per-weight imports are the correct choice given the installed packages. Not a finding.

---

## Observations (Non-Blocking)

**6 moderate npm audit vulnerabilities:** DONE report confirms these are pre-existing in the Nuxt/Vite dependency tree and were present before this task. Independently confirmed: `@fontsource` packages have no transitive deps (OFL-1.1 font-only packages). Not introduced by this task.

---

## Commits on Branch

```
76646640 Daniel Tamas <hello@danieltamas.ro> — docs(jobs): DONE report for bootstrap-fonts task
27e46f8a Daniel Tamas <hello@danieltamas.ro> — feat(ui): self-host Inter + JetBrains Mono via @fontsource
```

Both commits: Conventional Commits format, correct author, no Co-Authored-By trailer. Implementation commit body includes `Task: bootstrap-fonts.md`. Clean.

---

## Verdict: PASS

All acceptance criteria met. Self-hosting is confirmed by independent build verification — zero Google CDN references in source and build output. Diff is scoped to exactly the three files specified in the task plus the DONE report. Spec-sanctioned fallbacks are correctly applied and documented. Ready to merge task → group.
