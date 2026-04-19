# Completed: Jobs extension + payments + stripe_events
**Task:** schema-jobs-payments.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/db/schema/jobs.ts` — extended Phase 1 minimal table with Phase 2 columns: `userId` (FK → users.id, nullable), `anonymousAccessToken` (notNull), `sourceSoftware`, `targetSoftware`, `uploadFilename`, `uploadSize` (bigint number mode), `discoveryResult` (jsonb), `mappingResult` (jsonb), `mappingProfileId` (FK declaration deferred — see note below), `billingEmail`, `expiresAt`. Added 3 indexes: `userId`, `anonymousAccessToken`, `expiresAt`. **All 10 Phase 1 columns preserved byte-for-byte.**
- `app/server/db/schema/payments.ts` — new table: `id`, `jobId` (FK → jobs.id), `stripePaymentIntentId` (unique), `stripeFeeAmount`, `smartbillInvoiceId`, `smartbillInvoiceUrl`, `amount`, `currency` (default `'ron'`), `status`, `refundedAmount` (default 0), `refundedAt`, `billingInfo` (jsonb), `createdAt`. Indexes on `jobId` and `status`.
- `app/server/db/schema/stripe_events.ts` — new table: `id` (text PK = Stripe event ID for idempotency dedup), `type`, `processedAt`. No extra indexes.

## Forward-reference deferred — orchestrator action required
- `mapping_profiles.ts` does not exist in this worktree (sibling worker `schema-profiles` runs in parallel). Per the task spec's fallback path, `jobs.mappingProfileId` is declared as a plain `uuid('mapping_profile_id')` **without** the `.references()` call. The import line for `mappingProfiles` and `AnyPgColumn` is left as a commented stub at the top of `jobs.ts` with an explicit "NOTE (orchestrator)" tag.
- **At group-merge time, the orchestrator must:**
  1. Uncomment the two `import` lines at the top of `app/server/db/schema/jobs.ts`.
  2. Replace the `mappingProfileId: uuid('mapping_profile_id'),` line with:
     `mappingProfileId: uuid('mapping_profile_id').references((): AnyPgColumn => mappingProfiles.id),`

## Acceptance Criteria Check
- [x] All Phase 2 columns added with correct types and nullability — see `jobs.ts` lines 27-39.
- [x] All 3 indexes added (`userId`, `anonymousAccessToken`, `expiresAt`) — `jobs.ts` lines 42-46.
- [x] All 10 Phase 1 columns preserved with identical names, types, defaults, and order at the head of the column list.
- [x] `payments` table created with all 13 columns, FK to jobs, unique constraint on `stripePaymentIntentId`, 2 indexes.
- [x] `stripe_events` table created with text PK + `type` + `processedAt`.
- [x] FK strategy for `mappingProfileId` followed: deferred via comment per spec because sibling file is absent in worktree.
- [x] Did not touch `app/server/db/schema.ts` (barrel), `app/drizzle/**`, `mapping_profiles.ts`, or any other existing schema sub-file.
- [x] Did not run `db:generate`, `db:migrate`, `db:push`, or any dev/preview server.
- [x] `cd app && npx nuxi typecheck` → exit 0.
- [x] `cd app && npm run build` → exit 0 (`✨ Build complete!`).

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — schema-only task, all definitions via `pgTable` + typed column helpers.
- [x] Every mutation endpoint is CSRF-protected — N/A, no endpoints touched.
- [x] Every job endpoint calls `assertJobAccess` — N/A, no endpoints touched.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A, no endpoints touched.
- [x] All inputs Zod-validated (body + query + params) — N/A, no endpoints touched.
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — N/A, no logging code; `billingEmail` is a column not a log emission.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A, no session code touched.
- [x] Rate limits applied where the task spec requires — N/A.
