# Completed: pages-admin-misc — /admin/audit + /admin/sessions
**Task:** pages-admin-misc.md | **Status:** done (salvage — Bash denied) | **Date:** 2026-04-20

## Salvage note
The worker Bash tool was denied at session start, so no branch was created and no typecheck / commit could be run. Per task spec, files were written directly at canonical paths via the Write tool. Orchestrator needs to create the branch `job/phase2-nuxt/pages-admin-misc` off `job/phase2-nuxt/pages-admin`, stage these two files, run `npx nuxi typecheck`, and commit with the message below.

**Intended branch:** `job/phase2-nuxt/pages-admin-misc` (off `job/phase2-nuxt/pages-admin`)
**Intended commit:** `feat(pages-admin): /admin/audit + /admin/sessions with revoke`
**Commit SHA:** n/a (not created — Bash denied)

## Changes Made
- `app/pages/admin/audit/index.vue` (NEW) — full audit viewer:
  - `definePageMeta({ layout: 'admin' })`, `noindex,nofollow`.
  - Filter bar (6 inputs): adminEmail, action, targetType, since (datetime-local), until (datetime-local), pageSize. Apply + Clear buttons.
  - Datetime-local values converted to ISO via `new Date(v).toISOString()` before hitting `/api/admin/audit`.
  - URL-synced via `router.replace({ query })` — page shareable / refreshable.
  - SSR-fetched first page via `useAsyncData` with `useRequestHeaders(['cookie'])` cookie-forward (per project rule in MEMORY.md).
  - `watch: [queryPayload]` re-fetches on any filter or page change.
  - Table columns: When (ISO short, mono), Admin (email, truncated), Action (bordered mono uppercase badge), Target (`{targetType} #{targetIdShort}` mono; `<NuxtLink>` to `/admin/jobs/[id]` if targetType=='job', `/admin/users/[id]` if 'user'; plain text otherwise), IP hash (mono first 8), Details (Show/Hide toggle per row).
  - Expand row renders user-agent + JSON details in a `<pre>` block (collapsed by default). Expand state held in a local `expanded` map.
  - Pagination: Prev/Next buttons + `page / totalPages` indicator, disabled at bounds, disabled during pending.
- `app/pages/admin/sessions/index.vue` (NEW) — full sessions viewer:
  - `definePageMeta({ layout: 'admin' })`, `noindex,nofollow`.
  - No pagination (bounded row count per task spec).
  - SSR-fetched via `useAsyncData` with cookie-forward.
  - Table columns: ID (mono 8), Admin email, IP hash (mono 8), UA (truncated), Created (ISO mono), Expires (ISO mono), Current (`CURRENT` bordered mono badge in primary accent color for the current row, `—` otherwise), Action (Revoke button).
  - Revoke button is destructive outline variant (red outline on transparent, per SPEC UI — NOT red fill). Disabled for the current session with tooltip "Cannot revoke the current session"; server enforces via 409 `cannot_revoke_current_session` as a backstop.
  - Confirmation uses `~/components/layout/ConfirmDialog.vue` (variant='destructive', no reason field per task spec). On confirm: `DELETE /api/admin/sessions/[id]` with `x-csrf-token` header read from the `rp_csrf` cookie (same pattern as `app/layouts/admin.vue` logout).
  - Error surface: any API failure (409, 5xx) displays in a destructive banner above the table using the server's `statusMessage` / `message`.
  - On success: `refresh()` the list.

## Design compliance (SPEC.md §UI Design System)
- Dark mode (layout already enforces `class="dark"` on root).
- English only in UI chrome and labels.
- `font-mono` for IDs, ISO timestamps, IP hashes, action codes, numeric counts — per "monospace for ID/timestamp/amount columns".
- Rectangular 6px radius (shadcn `rounded-md` / `rounded`) everywhere.
- Status badges: rectangular `rounded` (not pills), outlined, uppercase monospace (CURRENT, action codes).
- Table rows dense (40px, `h-10`), borders between rows only, zebra striping OFF.
- Destructive button: red outline + red text on transparent — NOT red fill (spec §Buttons).
- No emoji, no gradients, no illustrations, no purple/indigo accents.
- Signature accent `#C72E49` reached via `text-primary` / `border-primary/50` only (no hardcoded colors).
- shadcn primitives only: `Button`, `Input`, `Table*`, plus `ConfirmDialog` wrapper around the Dialog primitive.
- Reused the `/admin` overview page's heading + refresh-button pattern (title + mono subtitle + top-right refresh).

## Acceptance Criteria Check
- [x] Both files created at canonical paths.
- [x] `definePageMeta({ layout: 'admin' })` on both.
- [x] Audit filter bar: adminEmail, action, targetType, since, until (datetime-local converted to ISO), page size — all present.
- [x] Audit table columns match spec (When, Admin, Action badge, Target linked, IP hash, Details collapse-row).
- [x] URL-synced params via `router.replace` + SSR first page via `useAsyncData`.
- [x] Sessions: no pagination, all spec columns including CURRENT badge.
- [x] Per-row Revoke disabled for current session; confirmation dialog with no reason field; `x-csrf-token` sent; refetch on success; 409 surfaced as error.
- [ ] `npx nuxi typecheck` EXIT=0 — NOT RUN (Bash denied). Code written defensively against the typed API contract (response shapes typed inline, narrow error union on catch). Orchestrator must run typecheck before merge.

## Security Check
- [x] All DB access goes through Drizzle — N/A (page-only task, no server code).
- [x] Every mutation endpoint is CSRF-protected — the `DELETE /api/admin/sessions/[id]` call includes `x-csrf-token` read from `rp_csrf` cookie; server-side CSRF middleware is the source of truth.
- [x] Every job endpoint calls `assertJobAccess` — N/A.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A (page-only); both endpoints we call are already admin-guarded per task spec.
- [x] All inputs Zod-validated — N/A client-side. Datetime-local coerced to ISO via `new Date().toISOString()` with NaN guard, so we never send invalid timestamp strings.
- [x] No PII in logs — no `console.log` calls. Error banner surfaces only the API-provided `statusMessage`, which is controlled server-side.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A (not touching session cookies; CSRF cookie `rp_csrf` is read-only client access by design — double-submit pattern).
- [x] Rate limits applied — N/A (no new endpoints; existing endpoints rate-limit themselves per SPEC §S.10).

## Files allowed vs touched
Allowed: `app/pages/admin/audit/index.vue` (NEW), `app/pages/admin/sessions/index.vue` (NEW). Both created. No shared utils, layouts, or other admin pages were modified.

## Follow-ups for orchestrator
1. Create branch: `git checkout job/phase2-nuxt/pages-admin && git checkout -b job/phase2-nuxt/pages-admin-misc`.
2. `cd app && npm install --ignore-scripts` if fresh worktree.
3. `cd app && npx nuxi typecheck` — expect EXIT=0.
4. Commit: `feat(pages-admin): /admin/audit + /admin/sessions with revoke` (no Co-Authored-By, per CLAUDE.md).
5. Squash-merge task → `job/phase2-nuxt/pages-admin` once reviewed.
