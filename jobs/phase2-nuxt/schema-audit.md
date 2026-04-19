---
title: Audit log schema (audit_log, admin_audit_log)
priority: critical
status: todo
group: schema
phase: 2
branch: job/phase2-nuxt/schema-schema-audit
spec-ref: SPEC.md §S.12 — Two separate audit logs; §2.1 schema
---

## Description

Add two append-only audit tables as new sub-files. Both are strictly append-only — there is no UPDATE or DELETE path anywhere in Phase 2 except the GDPR purge, which uses a null-set (anonymize) pattern, not row deletion. **Do NOT touch the barrel `app/server/db/schema.ts`, and do NOT run `db:generate` — orchestrator handles both at group-merge.**

## Why It Matters

- `audit_log` — user-facing actions (2-year retention, anonymized on GDPR deletion).
- `admin_audit_log` — every admin action. Separate because it's NEVER purged; SPEC §S.12 is explicit about this.

## Acceptance Criteria

### File: `app/server/db/schema/audit_log.ts` (NEW)

- [ ] Table `auditLog`, table name `audit_log`:
  - `id: uuid('id').primaryKey().defaultRandom()`
  - `userId: uuid('user_id')` — nullable, no FK (GDPR purge anonymizes to null instead of deleting rows).
  - `jobId: uuid('job_id').references(() => jobs.id)` — nullable, import `jobs` from `./jobs`.
  - `event: text('event').notNull()` — e.g. `'job_created'`, `'payment_succeeded'`, `'magic_link_issued'`.
  - `details: jsonb('details')` — event-specific payload; NEVER contains raw PII (hash emails, redact CIFs).
  - `ipHash: text('ip_hash')` — SHA-256 hex of remote IP.
  - `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`
- [ ] Index: `index().on(t.userId)`, `index().on(t.jobId)`, `index().on(t.event)`, `index().on(t.createdAt)`.
- [ ] Header comment: "Append-only. Anonymized on GDPR deletion (userId set to null). Retention: 2 years."

### File: `app/server/db/schema/admin_audit_log.ts` (NEW)

- [ ] Table `adminAuditLog`, table name `admin_audit_log`:
  - `id: uuid('id').primaryKey().defaultRandom()`
  - `adminEmail: text('admin_email').notNull()` — the Google-verified admin performing the action.
  - `action: text('action').notNull()` — e.g. `'refund_issued'`, `'job_viewed'`, `'user_deleted'`.
  - `targetType: text('target_type')` — `'job' | 'user' | 'payment' | 'profile' | ...` (free-form text; validation is at the handler).
  - `targetId: text('target_id')` — stringified ID of the target; free-form to allow non-UUID targets.
  - `details: jsonb('details')`
  - `ipHash: text('ip_hash')`
  - `userAgent: text('user_agent')`
  - `createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()`
- [ ] Index: `index().on(t.adminEmail)`, `index().on(t.action)`, `index().on(t.createdAt)`.
- [ ] Header comment: "Append-only. NEVER purged — kept for security forensics and regulator trail."

### Files you MAY NOT edit

- `app/server/db/schema.ts` (barrel)
- `app/drizzle/**`
- `app/server/db/schema/jobs.ts` (read-only — you only import from it) or any other existing sub-file
- Any middleware, handler, page, util, package.json

### Verification (worker runs)

- [ ] `cd app && npx nuxi typecheck` → exit 0
- [ ] `cd app && npm run build` → exit 0

## Files to Create

- `app/server/db/schema/audit_log.ts`
- `app/server/db/schema/admin_audit_log.ts`

## Notes

- Style guide: `app/server/db/schema/users.ts` + `sessions.ts`.
- **English-only identifiers and comments.**
- No UPDATE or DELETE SQL path anywhere — these tables are append-only at the app layer; schema does not need to enforce this, but your header comments should make the invariant explicit.
- Keep each file under 40 lines.

## Worker Rules

- **Branch:** `job/phase2-nuxt/schema-schema-audit`. Verify.
- **Commits:** 1-2 commits, scope `db`. **NEVER Co-Authored-By.**
- **DONE report:** `jobs/phase2-nuxt/DONE-schema-audit.md`.
- **Permission denials:** stop and report.
- **No `db:generate`, `db:migrate`, or dev/preview server.**
