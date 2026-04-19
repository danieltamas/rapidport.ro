---
title: Jobs extension + payments + stripe_events
priority: critical
status: todo
group: schema
phase: 2
branch: job/phase2-nuxt/schema-schema-jobs-payments
spec-ref: SPEC.md §2.1 — `jobs` (extended), `payments`, `stripe_events`
---

## Description

Extend the existing `app/server/db/schema/jobs.ts` with every Phase 2 column (SPEC §2.1 `jobs` table) and add two new sub-files: `payments.ts` + `stripe_events.ts`. **You do NOT touch the barrel `app/server/db/schema.ts`, and you do NOT run `db:generate` — the orchestrator handles both at group-merge time.**

## Why It Matters

Every API route (`api-jobs-*`) and the Stripe webhook depend on these columns. The Phase 1 worker used a minimal `jobs` table; Phase 2 fills in user linkage, mapping profiles, billing, upload metadata, expiry, and the two payment-related tables.

## Acceptance Criteria

### File: `app/server/db/schema/jobs.ts` (EXTEND — keep existing columns)

Current columns (DO NOT REMOVE OR RENAME): `id`, `status`, `progressStage`, `progressPct`, `workerVersion`, `canonicalSchemaVersion`, `deltaSyncsUsed`, `deltaSyncsAllowed`, `createdAt`, `updatedAt`.

- [ ] Add the following columns after existing ones, style-matched (`text`, `uuid`, `jsonb`, `bigint`, `timestamp` with `withTimezone: true`):
  - `userId: uuid('user_id').references(() => users.id)` — nullable (anonymous jobs).
  - `anonymousAccessToken: text('anonymous_access_token').notNull()` — issued on job creation.
  - `sourceSoftware: text('source_software').notNull()` — e.g. `'winmentor'`.
  - `targetSoftware: text('target_software').notNull()` — e.g. `'saga'`.
  - `uploadFilename: text('upload_filename')`
  - `uploadSize: bigint('upload_size', { mode: 'number' })`
  - `discoveryResult: jsonb('discovery_result')`
  - `mappingResult: jsonb('mapping_result')`
  - `mappingProfileId: uuid('mapping_profile_id').references(() => mappingProfiles.id)` — cross-sub-file FK; **see "Import strategy" below.**
  - `billingEmail: text('billing_email')`
  - `expiresAt: timestamp('expires_at', { withTimezone: true })` — 30-day auto-delete per SPEC.
- [ ] Add indexes:
  - `index().on(t.userId)`
  - `index().on(t.anonymousAccessToken)`
  - `index().on(t.expiresAt)` (for cleanup cron)
- [ ] **Import strategy for the mappingProfileId FK:** `schema-profiles` runs IN PARALLEL with this task and will create `app/server/db/schema/mapping_profiles.ts`. To avoid a merge conflict and an import-from-a-file-that-may-not-exist-yet: use a **forward-reference pattern**:
  ```ts
  import type { } from './mapping_profiles'; // type-only, forward ref
  ```
  …and for the actual `references()` call, use Drizzle's **deferred reference function**:
  ```ts
  mappingProfileId: uuid('mapping_profile_id').references((): AnyPgColumn => mappingProfiles.id),
  ```
  Import `mappingProfiles` at runtime via:
  ```ts
  import { mappingProfiles } from './mapping_profiles';
  import type { AnyPgColumn } from 'drizzle-orm/pg-core';
  ```
  **If your typecheck fails because `mapping_profiles.ts` does not exist in your worktree** (because `schema-profiles` worker hasn't committed yet): add the FK declaration as a COMMENT and document the need in your DONE report — the orchestrator will uncomment and wire it up at group-merge time. Do NOT create `mapping_profiles.ts` yourself — that's `schema-profiles`' file.

### File: `app/server/db/schema/payments.ts` (NEW)

- [ ] Table `payments`:
  - `id: uuid('id').primaryKey().defaultRandom()`
  - `jobId: uuid('job_id').notNull().references(() => jobs.id)` — import from `./jobs`
  - `stripePaymentIntentId: text('stripe_payment_intent_id').unique()`
  - `stripeFeeAmount: integer('stripe_fee_amount')` — RON cents, for net calc
  - `smartbillInvoiceId: text('smartbill_invoice_id')`
  - `smartbillInvoiceUrl: text('smartbill_invoice_url')`
  - `amount: integer('amount').notNull()` — RON cents
  - `currency: text('currency').default('ron').notNull()`
  - `status: text('status').notNull()` — pending | succeeded | refunded | partially_refunded | failed
  - `refundedAmount: integer('refunded_amount').default(0).notNull()`
  - `refundedAt: timestamp('refunded_at', { withTimezone: true })`
  - `billingInfo: jsonb('billing_info')` — PJ/PF form data (company or person)
  - `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`
- [ ] Index: `index().on(t.jobId)`, `index().on(t.status)`.

### File: `app/server/db/schema/stripe_events.ts` (NEW)

- [ ] Table `stripeEvents`:
  - `id: text('id').primaryKey()` — Stripe event ID, used for idempotency dedup
  - `type: text('type').notNull()`
  - `processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull()`
- [ ] No indexes beyond PK.

### Files you MAY NOT edit

- `app/server/db/schema.ts` (barrel) — orchestrator adds the 2 new export lines
- `app/drizzle/**` (no migration generation)
- `app/server/db/schema/mapping_profiles.ts` — **other worker's file**
- `app/server/db/schema/users.ts`, `sessions.ts`, `magic_link_tokens.ts`, `mapping_cache.ts`, `ai_usage.ts`, or any other existing schema sub-file.
- Any middleware, handler, page, util, package.json.

### Verification (worker runs)

- [ ] `cd app && npx nuxi typecheck` → exit 0
- [ ] `cd app && npm run build` → exit 0

## Files to Create

- `app/server/db/schema/payments.ts`
- `app/server/db/schema/stripe_events.ts`

## Files to Touch

- `app/server/db/schema/jobs.ts` — extend only; preserve existing columns/exports.

## Notes

- Read `app/server/db/schema/jobs.ts`, `users.ts`, `sessions.ts` first as style references.
- **English-only identifiers and comments.**
- No new npm dependencies — `drizzle-orm/pg-core` already provides everything.
- Do NOT delete, rename, or reorder existing `jobs.ts` columns — handlers in downstream groups depend on the current shape.

## Worker Rules

- **Branch:** `job/phase2-nuxt/schema-schema-jobs-payments` (pre-created). Verify.
- **Commits:** 2-3 commits, scope `db`. **NEVER Co-Authored-By.**
- **DONE report:** `jobs/phase2-nuxt/DONE-schema-jobs-payments.md`.
- **Permission denials:** stop and report.
- **No `db:generate`, `db:migrate`, or dev/preview server.**
