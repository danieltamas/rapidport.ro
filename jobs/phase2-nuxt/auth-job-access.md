---
title: Job access check (app/server/utils/assert-job-access.ts)
priority: critical
status: todo
group: auth-user
phase: 2
branch: job/phase2-nuxt/auth-user-auth-job-access
spec-ref: CODING.md §13.8 "Job Access — Three-Way Ownership Check"
---

## Description

Create `app/server/utils/assert-job-access.ts` — the single gate for `/api/jobs/[id]/*` routes. Verifies caller has one of three valid access paths to the job, returns the job row on success, throws 404/403 on failure.

This is a composer: A1's three utilities (auth-user, auth-admin, anonymous-token) are already on main, and this file wires them together.

## Why It Matters

Every job endpoint calls `assertJobAccess(jobId, event)` FIRST. If this check is wrong, every job endpoint is wrong. The three-way check per CODING.md §13.8 must be implemented exactly — no shortcuts, no added paths.

## Acceptance Criteria

### File: `app/server/utils/assert-job-access.ts` (NEW)

Export one function:

```ts
export async function assertJobAccess(jobId: string, event: H3Event): Promise<typeof jobs.$inferSelect>
```

Implement the three-way check per CODING.md §13.8:

- [ ] **Step 0 — Fetch the job.** Load the row via Drizzle: `db.select().from(jobs).where(eq(jobs.id, jobId))`. If no row → `throw createError({ statusCode: 404 })`. Do this FIRST so admin access still 404s for a missing job ID (no probing).

- [ ] **Step 1 — Admin session.** Call `getAdminSession(event)` from `./auth-admin` (never-throws, returns null if not admin). If admin session present: **log the access**. For now we don't yet have `logAdminAction` (comes with api-admin-*), so in this task write the audit row DIRECTLY via Drizzle into `admin_audit_log`:
  ```ts
  await db.insert(adminAuditLog).values({
    adminEmail: admin.email,
    action: 'job_access',
    targetType: 'job',
    targetId: jobId,
    ipHash: /* re-use computation from auth-admin.ts logic; inline a small sha256Hex helper if needed */,
    userAgent: getHeader(event, 'user-agent')?.slice(0, 500),
  });
  ```
  Then return the job. Do NOT let a failure to write the audit row prevent access — wrap in try/catch and log a console.warn with event name only (no PII).

- [ ] **Step 2 — User session.** Call `getUserSession(event)` from `./auth-user`. If a session is present AND `job.userId === user.userId` → return the job. Otherwise fall through.

- [ ] **Step 3 — Anonymous token.** Call `verifyAnonymousToken(event, jobId, job.anonymousAccessToken)` from `./anonymous-token`. If `true` → return the job.

- [ ] **Default deny.** No path matched → `throw createError({ statusCode: 403 })`.

- [ ] Types: return type is the Drizzle select type for `jobs`. Do NOT expose `anonymousAccessToken` to callers via the return value — actually, callers need the full row for downstream queries, so DO return it but document in a comment "callers must not serialize anonymousAccessToken into public responses; api-jobs-get strips it."

### Audit inlining

- [ ] Inline `sha256Hex(v: string)` helper (3 lines via `createHash`). Don't import from `auth-admin.ts` — that helper is file-local there. Having a second copy here is fine; a later refactor can extract to `utils/hash.ts`.

### Verification (worker runs)

- [ ] `cd app && npx nuxi typecheck` → exit 0
- [ ] `cd app && npm run build` → exit 0
- [ ] `grep -En "console.*\\.email|log.*token|log.*payload" app/server/utils/assert-job-access.ts` → no matches
- [ ] Three paths visible in the code: `getAdminSession` → `getUserSession` → `verifyAnonymousToken`, in that order.

### Out of scope

- `logAdminAction` formal helper — future task owns it; the inline insert here is the stopgap.
- Handler integration — `api-jobs-*` tasks call this util; they're separate tasks.
- Tests — `ci-security-tests`.

## Files to Create

- `app/server/utils/assert-job-access.ts`

## Files you MAY NOT edit

- `app/server/utils/auth-user.ts`, `auth-admin.ts`, `assert-admin-session.ts`, `anonymous-token.ts`, `env.ts` — all merged on main; read-only.
- Any middleware, any API handler, any page, `app/server/db/**`, `package.json`, `nuxt.config.ts`.

## Notes

- **English-only identifiers and comments.**
- Keep the file under 90 lines.
- `jobs` + `adminAuditLog` come from the schema barrel `~/server/db/schema` or `../db/schema`.
- `db` comes from `../db/client`.
- H3 imports: `H3Event`, `getHeader`, `createError` — from `h3`.
- Use `eq` from `drizzle-orm` for WHERE clauses.

## Worker Rules

- **Branch:** `job/phase2-nuxt/auth-user-auth-job-access` (orchestrator pre-creates it before spawning you from `main`). Verify with `git branch --show-current`. If missing, create from `main`.
- **Commits:** 1-2 commits, scope `auth`. **NEVER Co-Authored-By.**
- **DONE report:** `jobs/phase2-nuxt/DONE-auth-job-access.md`.
- **Permission denials:** stop and report.
- **No dev/preview server, no db: scripts.**
