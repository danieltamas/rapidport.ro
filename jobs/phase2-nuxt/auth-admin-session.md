---
title: Admin session + middleware (auth-admin.ts, assert-admin-session.ts, middleware/admin-auth.ts)
priority: critical
status: todo
group: auth-admin
phase: 2
branch: job/phase2-nuxt/auth-admin-auth-admin-session
spec-ref: CODING.md §13.7 "Session Binding — Admin Sessions Are IP-Bound"; SPEC.md §S.4
---

## Description

Create three files that together implement the admin session lifecycle:
- `app/server/utils/auth-admin.ts` — `createAdminSession`, `getAdminSession`, `revokeAdminSession`.
- `app/server/utils/assert-admin-session.ts` — `assertAdminSession(event)` throwing 401/403 on any failure (IP change, allowlist miss, revoked, expired).
- `app/server/middleware/admin-auth.ts` — Nitro middleware guarding `/admin/*` (Vue pages) and `/api/admin/*` (API routes).

This task also extends `app/server/utils/env.ts` with the `ADMIN_EMAILS` env var.

## Why It Matters

Admin sessions are the sharpest-edged surface in the app — anyone with one can see every customer's data. IP binding, allowlist re-check on every request, and 8h TTL are non-negotiable defenses (CODING.md §13.7, SPEC §S.4).

## Acceptance Criteria

### File: `app/server/utils/auth-admin.ts` (NEW)

- [ ] `export type AdminSession = { sessionId: string; email: string; expiresAt: Date; ipHash: string };`

- [ ] `export async function createAdminSession(email: string, event: H3Event): Promise<{ token: string }>` — generates 32-byte random token, SHA-256 hashes it, inserts into `admin_sessions` (`email` lowercased, `tokenHash`, `ipHash` = SHA-256 of `getRequestIP(event, { xForwardedFor: true })`, `userAgent` truncated, `createdAt`, `expiresAt = now + 8h`). Sets cookie `admin_session` with the **plaintext token**. Flags: `httpOnly: true`, `secure: true`, `sameSite: 'lax'`, `path: '/'`, `maxAge: 8 * 3600`. Returns plaintext token.

- [ ] `export async function getAdminSession(event: H3Event): Promise<AdminSession | null>` — reads `admin_session` cookie, hashes, looks up. Returns null on: cookie missing, row missing, `revokedAt` set, `expiresAt` past. Does NOT check IP/allowlist — that's `assertAdminSession`'s job.

- [ ] `export async function revokeAdminSession(sessionId: string, event?: H3Event): Promise<void>` — sets `revokedAt = now`; deletes cookie if event provided.

- [ ] **Inline helper at top:** `function sha256Hex(v: string): string` using `createHash('sha256').update(v).digest('hex')`. Reused for token hash AND ip hash. No separate `utils/hash.ts` file yet — keep it inlined here; a later refactor can extract if needed.

### File: `app/server/utils/assert-admin-session.ts` (NEW)

- [ ] `export async function assertAdminSession(event: H3Event): Promise<AdminSession>` implementing CODING.md §13.7 reference verbatim in spirit:
  1. Read cookie `admin_session`. Missing → `throw createError({ statusCode: 401 })`.
  2. Load session via `getAdminSession` (hashes internally). Missing/revoked/expired → 401.
  3. Compute current `ipHash` from `getRequestIP(event, { xForwardedFor: true }) ?? ''`. Constant-time compare against stored `ipHash` via `timingSafeEqual` on equal-length buffers. Mismatch → revoke the session + throw 401 with statusMessage `'Session invalidated — IP changed.'` (English; user-facing admin banner pulls its own copy from i18n later).
  4. Re-check allowlist: `env.ADMIN_EMAILS.includes(row.email.toLowerCase())` must be true. Otherwise revoke + 403.
  5. Return the `AdminSession`.
- [ ] Import `env` from `./env`, `getAdminSession` + `revokeAdminSession` from `./auth-admin`.

### File: `app/server/middleware/admin-auth.ts` (NEW)

- [ ] Default-export `defineEventHandler`. On every request:
  - Read `getRequestURL(event).pathname`.
  - If path starts with `/admin/` OR `/api/admin/` (but NOT `/admin/login` or `/api/auth/google/*` — those are the login flow): call `await assertAdminSession(event)` — failures surface as 401/403 (no fallthrough).
  - Otherwise pass through.
- [ ] Exempt prefixes (list constant at top): `['/admin/login', '/api/auth/google/']`.
- [ ] Do NOT log IP, email, or session ID. On denial, `assertAdminSession` already throws with appropriate status; middleware just re-throws.

### File: `app/server/utils/env.ts` (EXTEND)

- [ ] Add `ADMIN_EMAILS` to the Zod schema:
  ```ts
  ADMIN_EMAILS: z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))
    .pipe(z.array(z.string().email()).min(1))
    .default('')  // keep default '' so dev boot doesn't fail; the Zod .min(1) ensures prod fails if unset+empty
  ```
  Wait — `.min(1)` + `.default('')` conflict because `''` splits to `[]` which fails the `.min(1)` — that would HARD-FAIL at boot (desired in prod, painful in dev). **Use `.default('dev-noop@example.test')` instead** so dev boot succeeds with a non-working placeholder and prod forces the operator to set a real value. Document this in the env.ts comment.
- [ ] Append `# ADMIN_EMAILS=admin@example.com,admin2@example.com` to `.env.example`.
- [ ] Preserve every existing export. No other env var changes.

### Verification (worker runs)

- [ ] `cd app && npx nuxi typecheck` → exit 0
- [ ] `cd app && npm run build` → exit 0
- [ ] `grep -En "\\.email.*console|console.*\\.email|log.*ADMIN_EMAILS" app/server/utils/auth-admin.ts app/server/utils/assert-admin-session.ts app/server/middleware/admin-auth.ts app/server/utils/env.ts` → no matches.

### Out of scope

- Google OAuth start/callback handlers — separate tasks (`auth-google-start`, `auth-google-callback`) in the `auth-admin` group.
- Admin logout endpoint — separate task (`auth-admin-logout`).
- The `logAdminAction` helper (audit log writer) — comes with `api-admin-*` tasks; not needed for session assertion itself.
- Tests — `ci-security-tests`.

## Files to Create

- `app/server/utils/auth-admin.ts`
- `app/server/utils/assert-admin-session.ts`
- `app/server/middleware/admin-auth.ts`

## Files to Touch

- `app/server/utils/env.ts` — add `ADMIN_EMAILS` only.
- `.env.example` — append one comment + var line.

## Files you MAY NOT edit

- `app/server/utils/auth-user.ts` (sibling worker — user sessions).
- `app/server/utils/anonymous-token.ts` (sibling worker).
- `app/server/utils/assert-job-access.ts` — next sub-wave owns this.
- `app/server/db/**`, `app/server/plugins/**`, `nuxt.config.ts`, `package.json`.
- Existing middleware: `csrf.ts`, `rate-limit.ts`, `security-headers.ts`.

## Notes

- **English-only identifiers and comments.** User-facing admin copy is English too (admin dashboard is English per SPEC).
- Keep each file under 120 lines.
- Cookie name `admin_session` MUST be distinct from user cookie `session` (separate auth paths).
- **Never log the admin email or token hash.** If you must log a denial, log the cause (`ip_changed`, `expired`, `not_allowlisted`) and nothing else.
- Do NOT add a dependency on `jsonwebtoken` or similar — sessions are opaque random tokens, not JWTs.

## Worker Rules

- **Branch:** `job/phase2-nuxt/auth-admin-auth-admin-session` (pre-created from `job/phase2-nuxt/auth-admin` from `main`). Verify.
- **Commits:** 3 commits (utils → middleware → DONE; or utils+middleware in one if compact), all scope `auth`. **NEVER Co-Authored-By.**
- **DONE report:** `jobs/phase2-nuxt/DONE-auth-admin-session.md`.
- **Permission denials:** stop and report.
- **No dev/preview server.**
