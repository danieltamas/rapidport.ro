# Completed: pages-admin-jobs — /admin/jobs list + detail
**Task:** pages-admin-jobs | **Status:** done | **Date:** 2026-04-20

## Branch / salvage
Bash was denied in this worker session, so branch creation could not be executed. Files were written at their canonical paths in the main checkout (salvage path). The orchestrator must check out `job/phase2-nuxt/pages-admin`, create `job/phase2-nuxt/pages-admin-jobs`, and commit the two new files with:

    feat(pages-admin): /admin/jobs list + detail with actions

Salvage paths:
- `/Users/danime/Sites/rapidport.ro/app/app/pages/admin/jobs/index.vue` (NEW)
- `/Users/danime/Sites/rapidport.ro/app/app/pages/admin/jobs/[id].vue` (NEW)
- `/Users/danime/Sites/rapidport.ro/app/jobs/phase2-nuxt/DONE-pages-admin-jobs.md` (NEW, this file)

## Changes Made
- `app/pages/admin/jobs/index.vue:1` — admin jobs list page. `definePageMeta({ layout: 'admin' })`. Filter bar (status select, debounced search input bound to `q`, per-page select 50/100). URL query params sync via `router.replace` (push-state style, but using replace to avoid polluting history on every keystroke after debounce). SSR-fetched first page via `useAsyncData` with `watch: [apiQuery]` and cookie-forward header (`useRequestHeaders(['cookie'])` on server). shadcn `Table` with columns ID (mono, 8-char, linked to detail), Status (uppercase mono `Badge`), Stage, Src→Tgt, Upload size, Billing email, Created (ISO truncated). Status badge variant mapping: `succeeded`/`paid`/`mapped`/`reviewing` → default (primary), `failed` → destructive, others → secondary (muted). Empty state "No jobs match your filters." Pagination (Prev/Next + "page X of Y · N total").
- `app/pages/admin/jobs/[id].vue:1` — admin job detail page. Header with back-link, Job # (mono 8-char short id), status badge. Two-column main area (single column < md): left card with metadata key/value grid (id, status, stage, progress %, source, target, upload filename, upload size, billing email, delta syncs used/allowed, expires at, created, updated, all with mono values); right "Actions" card with six buttons (Refund, Extend syncs, Resend download, Force state, Re-run, Delete). Delete is `variant="destructive"`; the rest are `variant="outline"` for non-destructive actions. Each action opens a shadcn `Dialog` with the appropriate form. CSRF: every mutation includes `x-csrf-token` header read from the `rp_csrf` cookie (same helper as `app/layouts/admin.vue`). Server errors surface inline in the dialog (`actionError`); `force-state` surfaces the server's `warnings[]` in a yellow panel. On success the dialog closes and the detail refetches; on delete success the user is navigated to `/admin/jobs`. Disable rules client-side: Refund disabled when no `succeeded` payment; Resend disabled when job status ≠ `succeeded`; Re-run disabled when `uploadDiskFilename` is null; Delete disabled when any `succeeded` payment exists (server also enforces). Below the columns: Payments table (id, intent id, amount in RON, status badge, refundedAmount in RON, created) and Audit log table (when, action, actor, details — JSON stringified).

## Acceptance Criteria Check
- [x] `app/pages/admin/jobs/index.vue` uses admin layout and renders list from `/api/admin/jobs`.
- [x] Filter bar with status select, debounced search (300 ms), per-page select (50/100).
- [x] Table columns match spec (ID mono-short-link, Status mono uppercase badge, Stage, Source→Target, Upload size, Billing email, Created ISO).
- [x] Status badge variants: success/primary for `succeeded`/`paid`/`mapped`/`reviewing`, destructive for `failed`, muted for `created`/`expired`.
- [x] Empty state "No jobs match your filters."
- [x] Pagination Prev/Next + "page X of Y · N total" with URL sync.
- [x] SSR first page via `useAsyncData` + cookie-forward header pattern.
- [x] Loading + error states inline.
- [x] `app/pages/admin/jobs/[id].vue` uses admin layout; header with back-to-list link and status badge.
- [x] Two-column responsive layout (single column under md). Left = metadata key/value; right = Actions card.
- [x] Refund dialog with amount input (default = remaining refundable RON) + reason textarea; disabled if no succeeded payment.
- [x] Extend syncs dialog with `additional` (1..20) + reason.
- [x] Resend download confirm dialog with optional reason; disabled if status ≠ `succeeded`.
- [x] Force state dialog with read-only `from` + `to` select over allowed statuses + reason textarea; shows server warnings array.
- [x] Re-run confirm with reason; disabled when `uploadDiskFilename` is null.
- [x] Delete destructive button + reason textarea; disabled client-side when a `succeeded` payment exists (server also enforces).
- [x] All action calls include `x-csrf-token`; refetch on success; inline error in dialog on failure.
- [x] Payments table (id, intent id, amount RON, status, refundedAmount RON, createdAt) with empty state.
- [x] Audit log table below (up to last 50 from the API response).
- [x] Dark mode default (inherited from admin layout); no redundant `class="dark"` on pages.
- [x] Admin copy in English only; no emoji in chrome; no fabricated data.
- [x] Uses only `~/components/ui/{button,input,badge,card,table,dialog}` — no Mantine, no new deps.

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — N/A, client-side only, all data via existing admin endpoints.
- [x] Every mutation endpoint is CSRF-protected — every client POST/DELETE in this page sets `x-csrf-token`; server enforces in `middleware/csrf.ts`.
- [x] Every job endpoint calls `assertJobAccess` — N/A (admin endpoints, guarded by `middleware/admin-auth.ts`).
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — handled server-side (confirmed in `app/server/api/admin/jobs/index.get.ts` and `[id].get.ts`).
- [x] All inputs Zod-validated — N/A client; server validates bodies + params.
- [x] No PII in logs — client does not log; no `console.log` of emails, CIFs, or file contents.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — unchanged; client only reads `rp_csrf` (JS-readable by design).
- [x] Rate limits applied where the task spec requires — N/A in the UI; enforced server-side on action endpoints.

## Validation
Typecheck not run — Bash is denied in this worker session (required for `npx nuxi typecheck`). The orchestrator must run `cd app && npx nuxi typecheck` after merging the task branch.

## Notes for orchestrator
- The page uses `v-model` + `reka-ui`-backed `Dialog` with a single `openDialog` ref (union of action names) so only one dialog is open at a time; `<Dialog :open="...">` with `@update:open` close on outside-click.
- The `deleteBlocked` guard mirrors the server's `paid_job_must_refund_first` check; the server still enforces, the UI just prevents the click.
- The `force-state` select offers all canonical statuses and relies on the server's 422 response to reject illegal transitions (per task spec "easiest: show all 5 transitions and let server reject" — I actually show all 7 canonical statuses visible in the project so admin has the full palette; server rejects the invalid ones and the `warnings[]` panel surfaces the reason).
- No new deps installed; no shared layouts/components/utils modified.
