# Completed: GET /api/admin/payments — admin list with filters + audit
**Task:** api-admin-payments.md | **Status:** done | **Date:** 2026-04-20

## Changes Made
- `app/server/api/admin/payments/index.get.ts` (NEW, single file) — Nitro GET handler.
  - Defensive `getAdminSession(event)` + 401 if null (upstream middleware already asserts; matches `api/admin/logout.post.ts` pattern).
  - Zod-validated query: `status` (6-value enum), `q` (1–200 chars, trimmed), `refunded` (`yes`/`no`/`partial`), `page` (1–1000, default 1), `pageSize` (1–100, default 50), `sort` (`createdAt`/`amount`/`status`, default `createdAt`), `order` (`asc`/`desc`, default `desc`). `page`/`pageSize` use `z.coerce.number().int()` since query strings arrive as strings.
  - Audit row written before query: `action='payments_list_viewed'`, `details={ filters }`, SHA-256 IP hash, UA truncated at 500 chars; wrapped in `try/catch` — audit failures must not mask admin reads.
  - Drizzle query with `leftJoin(jobs, eq(jobs.id, payments.jobId))` to surface `billingEmail` per row.
  - Filters:
    - `status` → `eq(payments.status, filters.status)`.
    - `q` → `ilike(payments.stripePaymentIntentId, '%q%') OR jobId::text ILIKE 'q%'` (Stripe PI substring or jobId prefix, both parameterized via Drizzle `sql` template).
    - `refunded='yes'` → `refundedAmount > 0`; `no` → `= 0`; `partial` → `> 0 AND refundedAmount < amount`.
  - Whitelisted sort via `SORT_COLUMNS` map (literal lookup, never user-supplied identifier); `asc`/`desc` applied via Drizzle helpers.
  - Separate `count(*)::int` query for `total`, reusing the same `leftJoin` + `whereExpr` so filtered total matches filtered rows. `total` defaults to 0 if no rows returned.
  - Response shape matches task spec exactly: `{ rows: [...], page, pageSize, total }`. Row fields: `id, jobId, stripePaymentIntentId, amount, currency, status, refundedAmount, refundedAt, smartbillInvoiceId, createdAt, billingEmail`.

## Acceptance Criteria Check
- [x] `GET /api/admin/payments` at `app/server/api/admin/payments/index.get.ts` — single file
- [x] `getAdminSession(event)` + 401 when null
- [x] Audit row `payments_list_viewed` with `{ filters }`, ip+UA, best-effort (swallowed)
- [x] Zod validation of `status`, `q`, `refunded`, `page`, `pageSize`, `sort`, `order` with exact enums and bounds
- [x] Drizzle query with JOIN onto `jobs` for `billingEmail`
- [x] Whitelisted ORDER BY column (literal map lookup)
- [x] Response shape `{ rows, page, pageSize, total }` with separate count query
- [x] `npx nuxi typecheck` → EXIT=0

## Security Check
- [x] All DB access goes through Drizzle (select/insert; `sql` template only for `jobId::text ILIKE` and `count(*)::int` — both parameterized, no string interpolation)
- [x] Every mutation endpoint is CSRF-protected — N/A (GET, no mutation; only admin_audit_log insert runs server-side under admin middleware)
- [x] Every job endpoint calls `assertJobAccess` — N/A (admin endpoint, not a job endpoint)
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — `admin-auth.ts` middleware runs `assertAdminSession` on every `/api/admin/*`; handler additionally calls `getAdminSession` defensively and writes audit row
- [x] All inputs Zod-validated (body + query + params) — query Zod-parsed via `getValidatedQuery`; no body, no router params
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — handler does not `console.log`; `admin_audit_log` stores `adminEmail` (by design, per schema spec) + filter values (non-PII — status/sort/refunded/page/pageSize/order, plus optional search term `q` which is operator-supplied, not extracted from customer data)
- [x] Session cookies are HttpOnly + Secure + correct SameSite — enforced in `auth-admin.ts` (not touched by this task)
- [x] Rate limits applied where the task spec requires — task spec did not enumerate a rate limit; relying on existing admin-scope rate-limit middleware (`app/server/middleware/rate-limit.ts`) and admin allowlist gate

## Out of Scope (Not Touched)
- Refund action (POST) — explicitly deferred to `api-admin-jobs-actions` wave.
- No shared utils / schema / middleware modifications.
- No changes outside `app/server/api/admin/payments/index.get.ts` and this DONE report.
