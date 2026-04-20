# TODO — admin user-detail: surface payments (paid invoices) list

**Filed:** 2026-04-20 | **Reporter:** Dani (screenshot on admin user-detail showing only 4 stat cards + a "Recent jobs" table, no payments visible)

## Gap

`/admin/users/[id]` today shows:
- Metadata card (id, email, created, last login, blocked, deleted)
- Actions card (grant / block / unblock / delete)
- Stats strip: Jobs Total · Payments Total · Payments Succeeded · Revenue
- Recent Jobs table

It does **NOT** show the list of individual payments / invoices. Admin has to cross-reference by navigating to `/admin/payments` and filtering by the user's email or a linked job. That's clunky — the detail view should have a "Payments" section right there.

## Proposed fix

Add a **"Payments"** section below "Recent jobs" with the same shape as `/admin/payments` rows:

| Column | Source |
|---|---|
| Stripe Intent (mono 14) | `payments.stripe_payment_intent_id` |
| Job (mono 8, link to `/admin/jobs/[id]`) | `payments.job_id` |
| Amount (RON, formatted) | `payments.amount / 100` |
| Status (badge) | `payments.status` |
| Refunded (`-` or amount) | `payments.refunded_amount` |
| Invoice (link) | `payments.smartbill_invoice_id` + `smartbill_invoice_url` |
| Created (ISO short) | `payments.created_at` |

Limit to last 20, ordered by `createdAt desc`. Add "View all" link → `/admin/payments?q=<userId>` (the payments list already supports job-id substring — we'd need to extend it to also match via `jobs.user_id`; noted as sub-todo below).

## Where to wire

Server — `app/server/api/admin/users/[id].get.ts`:
- Add a 6th parallel query to the existing `Promise.all`:
  ```ts
  db.select({...}).from(payments)
    .innerJoin(jobs, eq(jobs.id, payments.jobId))
    .where(eq(jobs.userId, id))
    .orderBy(desc(payments.createdAt))
    .limit(20)
  ```
- Add `recentPayments` to the returned object.

Client — `app/pages/admin/users/[id].vue`:
- Add a "Payments" table block mirroring `/admin/payments/index.vue`'s row layout.
- Empty state: "No payments recorded."

## Sub-todo

`/admin/payments` search (`q`) currently matches `stripe_payment_intent_id` substring + `job_id::text` prefix. If we want "all payments for a user" to work from the View-all link:
- Option A: extend `q` to also match by `jobs.user_id::text` via the leftJoin already present.
- Option B: add a new query param `userId` to the list endpoint + a hidden link from the user-detail page.

B is cleaner (explicit, no wildcard behaviour), but A is more discoverable.

## Estimate

~30 lines server, ~40 lines client. Single-agent is fine; no schema changes, no plan needed (pure read additions).
