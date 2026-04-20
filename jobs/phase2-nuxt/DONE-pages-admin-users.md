# Completed: pages-admin-users

**Task:** pages-admin-users | **Status:** done | **Date:** 2026-04-20

## Changes Made

- `app/pages/admin/users/index.vue` — new users list page. Filter bar (state, email search, sort, page size). Table (ID mono, Email, State badge, Created, Last login). URL-synced query params. SSR fetch via `useAsyncData` + `useRequestHeaders(['cookie'])`. Row click navigates to `/admin/users/[id]`. Pagination (Prev/Next) bound to `{total, page, pageSize}` from the API.
- `app/pages/admin/users/[id].vue` — new user detail page. Header with email + state badge + back-to-list link. Two-column main (Metadata card left, Actions card right). Four-card stats strip (jobsTotal, paymentsTotal, paymentsSucceeded, revenueBani formatted as RON). Recent jobs table (10 rows, ID links to `/admin/jobs/[id]`). Action dialogs:
  - **Grant syncs** — `POST /api/admin/users/[id]/grant-syncs` with `additional` (1..20) + `reason`. Disabled when deleted.
  - **Block** — `POST /api/admin/users/[id]/block` with reason. Disabled when blocked or deleted.
  - **Unblock** — `POST /api/admin/users/[id]/unblock` with reason. Disabled unless currently blocked.
  - **Delete (GDPR)** — `DELETE /api/admin/users/[id]` with reason + typed-confirm (`DELETE` enables the destructive button).

  All action calls include `x-csrf-token` read from the `rp_csrf` cookie. On success the user payload is refetched; on error the message is surfaced inline inside the dialog.

## Acceptance Criteria Check

- [x] `app/pages/admin/users/index.vue` uses `definePageMeta({ layout: 'admin' })` and SSR-fetches first page.
- [x] Filter bar: state select (all|active|blocked|deleted), `q` email substring, page size, sort (createdAt|lastLoginAt|email) + order toggle.
- [x] Table columns: ID mono 8, Email default font, State badge (ACTIVE/BLOCKED/DELETED), Created ISO short, Last login ISO short or `—`.
- [x] Row clickable → `/admin/users/[id]`.
- [x] State badges use success/warning/destructive colour mapping (emerald / amber / destructive).
- [x] Pagination + URL-synced params (router.replace with `flush: post`).
- [x] `app/pages/admin/users/[id].vue` header: email + state badge + back link.
- [x] Two-column responsive main (Metadata + Actions cards).
- [x] Stats strip: 4 cards (jobsTotal, paymentsTotal, paymentsSucceeded, revenueBani formatted as RON).
- [x] Recent jobs table (10 rows): ID mono link, status badge, source→target, createdAt.
- [x] Action buttons have the correct disabled states (grant disabled if deleted, block disabled if already blocked or deleted, unblock disabled if not blocked, delete disabled if already deleted).
- [x] Destructive delete requires typing `DELETE` and a reason.
- [x] All action requests include `x-csrf-token`. Refetches on success.
- [x] English-only copy, dark theme, mono for IDs/amounts/dates.
- [x] Uses only shadcn primitives already generated in `app/components/ui/` (Table, Input, Button, Dialog); no new components added.
- [x] No fabricated data.

## Security Check

- [x] No DB access (pages only).
- [x] Every mutation endpoint call includes `x-csrf-token` header.
- [x] Job endpoints not touched.
- [x] Admin endpoints are called — `assertAdminSession` is enforced server-side; this task only builds the UI.
- [x] Inputs validated client-side (additional 1..20, non-empty reasons, `DELETE` confirmation) before the mutation is sent; server-side Zod remains the source of truth.
- [x] No PII in logs (no logs emitted).
- [x] Session cookies untouched.
- [x] Rate limits are a server concern; UI respects the backend contract.

## Notes / Blockers

- **Bash was denied**, so I worked in salvage mode: no branch was created, no typecheck run, no commit made. Files were written directly to canonical paths inside the main repo at `/Users/danime/Sites/rapidport.ro/app/app/pages/admin/users/`.
- **Proposed commit message:** `feat(pages-admin): /admin/users list + detail with block/unblock/grant/delete actions`
- **Proposed branch:** `job/phase2-nuxt/pages-admin-users` off `job/phase2-nuxt/pages-admin`.
- The Badge primitive does not ship `success`/`warning` variants, so state badges use inline Tailwind classes (emerald for ACTIVE, amber for BLOCKED, destructive for DELETED), matching the existing pattern in `app/pages/admin/payments/index.vue`.
- Deletion uses the `Delete` destructive-outlined pattern per SPEC (red outline + red text, not a red fill).
