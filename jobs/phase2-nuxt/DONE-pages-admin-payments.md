# Completed: Admin payments list page

**Task:** pages-admin-payments.md | **Status:** done | **Date:** 2026-04-20

## Mode
Worker (salvage mode — Bash denied, no branch created, no commit).

## Changes Made
- `app/pages/admin/payments/index.vue` (NEW) — SSR-fetched admin payments list at `/admin/payments`:
  - `definePageMeta({ layout: 'admin' })` + `useHead({ title, robots: noindex })`
  - Filter bar: `status` select (all + 8 Stripe states), `q` search (Stripe intent id or job id prefix) with Apply button / Enter-to-submit, `refunded` select (`all|no|partial|yes`), page-size select (25/50/100). All selects reset `page` to 1.
  - Server fetch via `useAsyncData` with `$fetch` → `GET /api/admin/payments` and SSR cookie-forward (`useRequestHeaders(['cookie'])` when `import.meta.server`). Re-fetches on any filter/sort/page change (`watch: [queryParams]`).
  - URL sync: `router.replace({ query })` on `queryParams` change, initial values hydrated from `route.query`.
  - Table columns: ID (mono 8), Stripe Intent (mono 14), Job (mono 8, link to `/admin/jobs/[jobId]`), Amount (formatted as `X.XX RON` from bani), Status (uppercase mono badge — `succeeded`=emerald, `failed|canceled`=destructive, else muted), Refunded (`—` when 0 else `X.XX RON`), Invoice (anchor to `cloud.smartbill.ro/ro/invoice/{id}` if present else `—`), Billing email, Created (ISO short `YYYY-MM-DD HH:MM:SSZ`).
  - Empty state: "No payments match your filters."; loading fallback inline.
  - Pagination: Prev/Next `Button variant="secondary"` + "page X of Y · N total" footer (mono).
  - Error banner styled consistent with `app/pages/admin/index.vue`.
  - English-only UI copy, dark theme, shadcn primitives (`Table*`, `Input`, `Button`), mono for IDs/amounts/timestamps.
  - No refund mutation performed on this page — job-id cells link to `/admin/jobs/[jobId]` where sibling worker implements the refund action.

## Files Allowed & Touched
- Created: `app/pages/admin/payments/index.vue` (only file)
- Created: `jobs/phase2-nuxt/DONE-pages-admin-payments.md` (this file)

## Acceptance Criteria Check
- [x] New admin page at `/admin/payments` using admin layout and noindex head
- [x] Status / q / refunded / page-size filters, URL-synced, reset to page 1 on change
- [x] SSR-fetched first page with cookie-forward
- [x] Table columns, formatting and status variants per spec
- [x] Links to `/admin/jobs/[jobId]` (no inline refund action)
- [x] Pagination with prev/next + "page X of Y · total"
- [x] Empty state, loading, error states present
- [x] English-only copy, mono IDs/amounts, no fabricated data
- [x] Only allowed file modified (`app/pages/admin/payments/index.vue`)

## Security Check
- [x] All DB access goes through Drizzle — N/A (page-only; server endpoint out of scope)
- [x] Every mutation endpoint is CSRF-protected — N/A (page makes only a GET; no mutations)
- [x] Every job endpoint calls `assertJobAccess` — N/A (admin endpoint)
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — enforced by `/api/admin/payments` handler (out of scope for this task; this page only consumes it)
- [x] All inputs Zod-validated — N/A on the client page; the consumed API validates query params
- [x] No PII in logs — page does not log; rows render email/ids only in the authenticated admin UI
- [x] Session cookies are HttpOnly + Secure + correct SameSite — cookie-forward on SSR only, no cookie creation here
- [x] Rate limits applied where the task spec requires — N/A (client page); governed by server endpoint

## Validation
- Bash was denied in this worker session, so `npx nuxi typecheck` could not be executed. The file uses only pre-existing primitives and public Nuxt 3 composables (`useAsyncData`, `$fetch`, `useRequestHeaders`, `useRoute`, `useRouter`, `useHead`, `definePageMeta`), no new imports outside `~/components/ui/*` barrels verified to exist. No TypeScript-only surface was touched beyond an inline `PaymentRow` / `PaymentsResponse` type that mirrors the API contract in the task brief.

## Blockers
- **Bash denied** → no branch created, no commit recorded, no typecheck run. Dani/orchestrator must: (1) create branch `job/phase2-nuxt/pages-admin-payments` off `job/phase2-nuxt/pages-admin`, (2) stage + commit the two files with message `feat(pages-admin): /admin/payments list with filters + pagination`, (3) run `npx nuxi typecheck` to confirm EXIT=0 before merging.

## Intended Commit
```
feat(pages-admin): /admin/payments list with filters + pagination
```

## Canonical Paths
- `/Users/danime/Sites/rapidport.ro/app/app/pages/admin/payments/index.vue`
- `/Users/danime/Sites/rapidport.ro/app/jobs/phase2-nuxt/DONE-pages-admin-payments.md`
