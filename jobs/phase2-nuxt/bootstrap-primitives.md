---
title: Generate initial shadcn-vue primitives
priority: critical
status: todo
group: bootstrap
phase: 2
branch: job/phase2-nuxt/bootstrap-primitives
spec-ref: SPEC §"UI Design System" (Components section — Buttons, Inputs, Cards, Tables, Badges, Alerts)
---

## Description

Use the shadcn-vue CLI to generate the starter set of primitives into `app/components/ui/`. This is the last bootstrap task — when it merges, Dani can hit `https://rapidport.ro` and see the theme applied to real components, not just a bare placeholder.

Scope is narrow: generate the primitives, verify they import and build correctly, update the `pages/index.vue` placeholder to render a small sample (Card + Button) so visual confirmation is immediate. No custom styling beyond what shadcn generates + our theme CSS vars. SPEC-level fine-tuning (per-variant colors, uppercase mono badges, specific border radii, etc.) is deferred to the pages and admin tasks that consume them.

## Why It Matters

Primitives are the visual surface. With shadcn-setup done, the ground is ready — but there's no component in `app/components/ui/` yet, so the page looks like unstyled HTML regardless of how perfect the CSS vars are. This task closes that gap. After merge, the app is visibly "Rapidport" and the full bootstrap chain is complete.

## Acceptance Criteria

### Primitives generated via shadcn-vue CLI

Run from `app/`:

```bash
npx shadcn-vue@latest add button input card table badge alert
```

- [ ] Creates `app/components/ui/button/Button.vue` + `index.ts` (shadcn-vue packs each primitive in its own subfolder)
- [ ] Creates `app/components/ui/input/Input.vue` + `index.ts`
- [ ] Creates `app/components/ui/card/` with `Card.vue`, `CardHeader.vue`, `CardTitle.vue`, `CardDescription.vue`, `CardContent.vue`, `CardFooter.vue`, `index.ts`
- [ ] Creates `app/components/ui/table/` with `Table.vue`, `TableHeader.vue`, `TableBody.vue`, `TableRow.vue`, `TableHead.vue`, `TableCell.vue`, `TableCaption.vue`, `TableFooter.vue`, `index.ts`
- [ ] Creates `app/components/ui/badge/Badge.vue` + `index.ts`
- [ ] Creates `app/components/ui/alert/` with `Alert.vue`, `AlertDescription.vue`, `AlertTitle.vue`, `index.ts`
- [ ] Each generated file's Tailwind classes reference theme vars (e.g., `bg-primary`, `text-foreground`, `border-border`) — NOT raw colors. If a generated file has hardcoded hex or non-theme classes like `bg-blue-500`, that's a review-block.
- [ ] If the CLI runs interactively and pauses for prompts, accept defaults (`y`/Enter). If it still blocks, note which prompt in the DONE report; don't hang.

### Placeholder update — `app/pages/index.vue`

Replace the text-only placeholder with a minimal showcase proving the theme+primitives integrate. Keep the page intentionally sparse — this is a *visual smoke test*, not the landing page (that's `pages-landing` later).

```vue
<script setup lang="ts">
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { Badge } from '~/components/ui/badge'
</script>

<template>
  <div class="min-h-dvh flex items-center justify-center p-4">
    <Card class="max-w-md w-full">
      <CardHeader>
        <div class="flex items-center justify-between gap-4">
          <CardTitle>Rapidport</CardTitle>
          <Badge variant="outline">in progress</Badge>
        </div>
        <CardDescription>
          WinMentor → SAGA migration tool. Bootstrap complete; pages coming.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex gap-2">
        <Button variant="default">Primary</Button>
        <Button variant="outline">Secondary</Button>
      </CardContent>
    </Card>
  </div>
</template>
```

- [ ] Renders without errors in build
- [ ] Imports from `~/components/ui/...` work (path aliases correct per `components.json`)
- [ ] Copy is English (this is placeholder content; Romanian lands in `pages-landing`)
- [ ] No hardcoded colors; only Tailwind utility classes + components

### Verification

- [ ] `cd app && npm install` — no new deps added by the CLI (primitives use already-installed `reka-ui`, `cva`, `clsx`, `tailwind-merge`)
- [ ] `cd app && npx nuxi prepare` — clean exit
- [ ] `cd app && npx nuxi typecheck` — 0 errors
- [ ] `cd app && npm run build` — clean build, `.output/` produced
- [ ] `find app/.output/public/_nuxt -name '*.css' | xargs grep -l 'c72e49\|C72E49'` — accent color still in compiled CSS (smoke-test that theme vars survived)
- [ ] `ls app/components/ui/` shows at least 6 subdirectories: `button/`, `input/`, `card/`, `table/`, `badge/`, `alert/`
- [ ] **NO** `npm run dev` — the user tests via rundev

### Out of scope

- Custom Button variants matching SPEC exactly (rectangular vs pill, specific heights 32/40/48, red-outline destructive) — pages tasks will tune as needed
- Uppercase monospace job-state badges (`MAPPED`, `CONVERTING`, `READY`, `FAILED`) — that's a specific variant the job-status page will add
- Dark/light mode toggle — not needed yet (dark is default everywhere except `/legal/*` which doesn't exist yet)
- Additional primitives (Select, Dialog, Dropdown, Tabs, Sonner toast, etc.) — each pages/admin task adds what it needs
- The actual landing page — that's `pages-landing`

## Files to Create

- `app/components/ui/button/Button.vue` + `app/components/ui/button/index.ts`
- `app/components/ui/input/Input.vue` + `app/components/ui/input/index.ts`
- `app/components/ui/card/Card.vue`, `CardHeader.vue`, `CardTitle.vue`, `CardDescription.vue`, `CardContent.vue`, `CardFooter.vue`, `index.ts`
- `app/components/ui/table/Table.vue`, `TableHeader.vue`, `TableBody.vue`, `TableRow.vue`, `TableHead.vue`, `TableCell.vue`, `TableCaption.vue`, `TableFooter.vue`, `index.ts`
- `app/components/ui/badge/Badge.vue` + `app/components/ui/badge/index.ts`
- `app/components/ui/alert/Alert.vue`, `AlertDescription.vue`, `AlertTitle.vue`, `index.ts`

(Exact file breakdown follows whatever `shadcn-vue@latest add` generates — the list above is the expected shape; don't hand-craft these.)

## Files to Touch

- `app/pages/index.vue` — replace text placeholder with the Card+Badge+Button showcase shown above

## Files NOT to Touch

- `app/theme/index.ts` — tokens stay
- `app/assets/css/tailwind.css` — CSS vars stay
- `app/components.json` — config stays
- `app/lib/utils.ts` — helper stays
- `nuxt.config.ts` — no config changes needed (shadcn-nuxt module auto-registers components)
- `app/server/**` — no backend changes
- `app/package.json` — no new deps (unless the CLI insists, which it shouldn't since peers are installed)

## Notes

- shadcn-vue's CLI may write to `app/components.json` if asked about it; accept the existing values. It may ask about aliases — confirm matching current `components.json`.
- If a generated component imports from `@/components/ui/...` (alias style from the React world), **rewrite the import to `~/components/ui/...`** to match Nuxt's alias. shadcn-vue usually handles this correctly with the `framework: 'nuxt'` flag in components.json, but verify each file.
- If auto-import via `shadcn-nuxt` is configured, you don't strictly need explicit `import { Button } from '~/components/ui/button'` in `pages/index.vue`. But being explicit is clearer for a bootstrap commit; leave the imports in.
- shadcn components import `cn` from `~/lib/utils` or `@/lib/utils`. Confirm they resolve via the `aliases.utils` in `components.json`.
- English-only identifiers. Romanian copy comes later.
- Commit split suggestion:
  1. `feat(ui): generate shadcn primitives — button, input, card, table, badge, alert`
  2. `feat(pages): showcase primitives on index placeholder`
  3. `docs(jobs): DONE report for bootstrap-primitives`
