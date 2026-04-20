# Completed: admin user-detail payments list

**Task:** `jobs/phase2-nuxt/TODO-admin-user-detail-payments.md` | **Status:** done | **Date:** 2026-04-20

## Changes Made

- `app/server/api/admin/users/[id].get.ts` — added `RECENT_PAYMENTS_LIMIT = 20` const; added a 6th parallel query to the existing `Promise.all` that inner-joins `payments` with `jobs` on `jobs.user_id = id`, ordered `payments.created_at DESC`, limited to 20. Response now includes a `recentPayments` array of `{id, jobId, stripePaymentIntentId, amount, currency, status, refundedAmount, refundedAt, smartbillInvoiceId, smartbillInvoiceUrl, createdAt}`.
- `app/server/api/admin/payments/index.get.ts` — extended `querySchema` with optional `userId: z.string().uuid()`. When present, adds `eq(jobs.userId, filters.userId)` to the WHERE predicate. Uses the `leftJoin(jobs)` already on the query — `jobs.user_id` is NOT NULL so the leftJoin narrows to a de-facto inner join for this filter, which is the desired behaviour.
- `app/pages/admin/users/[id].vue` — added `PaymentRow` type, `paymentStatusBadgeClass`, `formatAmount`, `formatRefund`, `smartbillUrl` helpers. Added a new "Payments" section below "Recent jobs" with 7 columns: Stripe Intent (mono, 14 chars), Job (link to `/admin/jobs/[id]`), Amount (right-aligned, mono, RON formatted), Status (badge), Refunded (right-aligned), Invoice (link — prefers `smartbill_invoice_url` when stored, falls back to the SmartBill deep-link helper), Created (mono date). Header includes a "View all →" link to `/admin/payments?userId=<userId>` when there's at least one payment. Empty state: "No payments recorded."
- `app/pages/admin/payments/index.vue` — reads `userId` from `route.query`, includes it in `queryParams` (so URL stays in sync + the `useAsyncData` key re-fires), and renders a small "user: <uuid> ✕" pill above the existing filter bar when the filter is active. The pill links back to the user-detail page and has a clear button that zeroes the ref + resets to page 1. The filter is URL-only, not a control in the filter bar — keeps the existing UI uncluttered.
- `docs/ARCHITECTURE.md` — one-line updates for both endpoints to reflect the new field and the new query param.

## Acceptance Criteria Check

- [x] Admin user-detail shows a Payments table below "Recent jobs" — matches the column layout of `/admin/payments/index.vue` (Stripe Intent, Job, Amount, Status, Refunded, Invoice, Created)
- [x] Limit 20, ordered `createdAt DESC`
- [x] Empty state: "No payments recorded."
- [x] "View all →" link → `/admin/payments?userId=<userId>`
- [x] `/admin/payments?userId=<uuid>` filters the list to that user's payments only
- [x] Active-user pill with a clear (`✕`) button on `/admin/payments` when `userId` is set
- [x] Pill's user-id chip links back to `/admin/users/<uuid>`

## Security Check

- [x] All DB access goes through Drizzle (the new query uses `db.select().from().innerJoin().where().orderBy().limit()`; the filter in the list endpoint is `eq(jobs.userId, filters.userId)` — no raw SQL, no interpolation)
- [x] Every mutation endpoint is CSRF-protected — **N/A, this task is read-only**
- [x] Every job endpoint calls `assertJobAccess` — **N/A, no job endpoints touched**
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — yes, both `users/[id].get.ts` and `payments/index.get.ts` already did, and still do. The new data is covered by the existing `auditRead(..., 'user_viewed', { targetType:'user', targetId:id })` and `auditRead(..., 'payments_list_viewed', { filters })`. The `filters` object now includes `userId` when set, so the audit row captures which user's payments were viewed.
- [x] All inputs Zod-validated — `userId` on the payments list is `z.string().uuid()`; the user-detail params are already UUID-validated upstream
- [x] No PII in logs — unchanged; we log hashed audit only, no raw amounts/emails
- [x] Session cookies are HttpOnly + Secure + correct SameSite — unchanged
- [x] Rate limits applied where the task spec requires — **N/A, admin reads aren't rate-limited** (only public-surface + mutation endpoints are, per SPEC §S.10)

## Notes

- Chose option B from the TODO's sub-todo: explicit `userId` query param rather than extending `q` to also match user IDs. Keeps the existing search semantics (substring on Stripe intent + prefix on jobId) clean and makes the filter discoverable via URL only — the user-detail "View all" link is the explicit entry point.
- `recentPaymentRows` uses `innerJoin` (not `leftJoin` like the two stat queries). For the stat counts, the left→outer behaviour is defensive ("count even if the join went weird"); for the displayed rows, we only want payments that map to a real job, so inner is correct.
- Prefers `smartbillInvoiceUrl` when stored (stable link from the invoice row), falls back to the SmartBill deep-link helper pattern used on the payments list. Matches the list page's behaviour.
- No schema changes. No new migrations. No new dependencies.
