# Completed: /admin/ai dashboard + /admin/profiles list
**Task:** pages-admin-ai-profiles.md | **Status:** done (salvage — Bash denied) | **Date:** 2026-04-20

## Salvage note
Bash was denied in this worker session — branch checkout, `npm install`, and `nuxi typecheck` could not be run. Per the task's salvage protocol, files were written via the Write tool at their canonical worktree paths. The orchestrator must handle branch creation (`job/phase2-nuxt/pages-admin-ai-profiles` off `job/phase2-nuxt/pages-admin`), add the files, run typecheck, and commit.

## Changes Made
- `app/pages/admin/ai/index.vue` (NEW) — `/admin/ai` dashboard with three sections:
  - 30-day trend: totals strip (tokensIn, tokensOut, costUsd, calls summed across window) + CSS-only bar chart of daily `costUsd` (one flex div per day, height proportional to max, title tooltip). No charting library.
  - Top unmapped fields: table; if empty, shows muted note "Worker doesn't yet log mapping misses — see TODO in api/admin/ai/index.get.ts".
  - Low-confidence mappings: table with confidence colored — `<0.5` destructive, `<0.7` accent-primary, else default. JetBrains Mono for IDs, field names, timestamps, amounts.
- `app/pages/admin/profiles/index.vue` (NEW) — `/admin/profiles` list:
  - Filter bar: visibility (`all|public|private`), sort (`adoptionCount|createdAt|name`), order, page size.
  - Table: name, source/target versions (mono), visibility badge (rectangular, uppercase mono, red outline when public, border for private), adoption, owner `userId` sliced to 8 chars (mono), created timestamp.
  - Per-row action: "Hide" (red outline, destructive variant styling) when public, "Promote" (outline variant) when private. Both open inline confirm dialog with reason textarea, min. 3-char validation, `x-csrf-token` header via `readCsrf()` reading `rp_csrf` cookie. On success, refetches.
  - Pagination: Prev/Next, URL-synced via `router.replace({ query })` for `visibility`, `sort`, `order`, `page`, `pageSize`.
  - SSR cookie-forwarding: `useRequestHeaders(['cookie'])` passed to `$fetch` on server.

## Acceptance Criteria Check
- [x] `definePageMeta({ layout: 'admin' })` on both pages
- [x] English only in code and UI (admin is English per CLAUDE.md)
- [x] shadcn primitives only (no charting lib) — CSS bar chart via flex divs
- [x] Dark theme, JetBrains Mono for IDs/numbers/dates, no fabricated data (empty states instead)
- [x] `/admin/ai` three sections present
- [x] `/admin/profiles` filter bar + table + per-row actions + pagination + URL sync
- [x] CSRF header on POST /promote and /hide
- [x] No modification of shared utils, layouts, or other admin pages

## Security Check
- [x] All DB access goes through Drizzle — N/A, pages only consume server APIs
- [x] Every mutation endpoint is CSRF-protected — `x-csrf-token` sent on `/promote` and `/hide`
- [x] Every job endpoint calls `assertJobAccess` — N/A, admin pages
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — server-side, not this task
- [x] All inputs Zod-validated — N/A for page components; reason is min-3 client-side, server enforces
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — no logging added; `userId` trimmed to 8 chars in UI
- [x] Session cookies are HttpOnly + Secure + correct SameSite — unchanged
- [x] Rate limits applied where the task spec requires — N/A (server-side)

## Validation
Not run — Bash denied. Orchestrator: please run `cd app && npx nuxi typecheck` after incorporating the files.

## Commit message
`feat(pages-admin): /admin/ai dashboard + /admin/profiles list with promote/hide`
