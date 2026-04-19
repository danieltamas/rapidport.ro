# Completed: Magic-link verify handler (GET /api/auth/verify)
**Task:** auth-magic-link-verify.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/api/auth/verify.get.ts` — new handler. Zod-validates `{ token, next }` query, SHA-256 hashes the token, looks up `magic_link_tokens`, returns Romanian `400` on missing/consumed/expired. Atomic `db.transaction`: conditional `UPDATE ... WHERE consumedAt IS NULL RETURNING` defeats the lookup→update race; then find-or-create user (lowercased email + `emailHash`) and set `lastLoginAt`. `createUserSession(userId, event)` issues the session cookie. Best-effort anonymous job claim parses `job_access_<uuid>` cookies from the raw `Cookie` header and `UPDATE jobs SET user_id WHERE id = $ AND user_id IS NULL` per candidate (opportunistic, wrapped in try/catch). Redirect target validated with `safeRedirectTarget` (must be leading `/`, not `//`, not `/\`) otherwise falls back to `/`. `sendRedirect(..., 303)`. Logs only `{event: 'magic_link_verified', userId, job_claimed_count}` — no email, no token.

## Acceptance Criteria Check
- [x] Zod query `{ token: z.string().min(32), next: z.string().optional() }` via `getValidatedQuery` — invalid → 400 (h3 throws).
- [x] SHA-256 token hash; lookup `magic_link_tokens` by `tokenHash`.
- [x] Missing row → 400 `Link invalid sau expirat`.
- [x] `consumedAt != null` → 400 `Link deja folosit`.
- [x] `expiresAt < now` → 400 `Link invalid sau expirat`.
- [x] Atomic transaction: conditional consume update returning rowcount — 0 rows → `Link deja folosit` (race closed).
- [x] Find-or-create user: lowercased email, `emailHash = sha256(email)`, `lastLoginAt = now()` on both branches.
- [x] `createUserSession(userId, event)` called after transaction commits.
- [x] Anonymous claim: parses `Cookie` header for `job_access_<uuid>`, updates `jobs` where `user_id IS NULL`, best-effort try/catch, count-only log.
- [x] Redirect: `next` required leading `/` and NOT `//` (open-redirect guard) and not `/\` (backslash-escape guard); else `/`. `sendRedirect(303)`.
- [x] Logs: only `event`, `userId` (UUID), `job_claimed_count` — no PII.

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — `sql\`${jobId}::uuid\`` used for the claim cast.
- [x] Every mutation endpoint is CSRF-protected — N/A, this is a GET; magic-link security comes from single-use + 15m TTL + SHA-256-hashed token DB lookup (not from session). CSRF is moot for login consumption.
- [x] Every job endpoint calls `assertJobAccess` — N/A (auth endpoint; creates the session that later endpoints will gate on).
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A.
- [x] All inputs Zod-validated — `getValidatedQuery(event, querySchema.parse)`.
- [x] No PII in logs — only `userId` UUID and a count; `email` and `token` never logged.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — set by `createUserSession` (HttpOnly, Secure, SameSite=Lax, 30d).
- [x] Rate limits applied where the task spec requires — not required for this verify handler; upstream `request` route enforces the rate limit per SPEC S.10.

## Verification
- `npx nuxi typecheck` — green (no diagnostics emitted).
- `npx nuxi build` — green; emits `.output/server/chunks/routes/api/auth/verify.get.mjs`.

## Notes
- Open-redirect guard on `next`: the spec said "same-origin and starts with /"; since the only reachable attacker vector via a server-side redirect is a `Location` that leaves the app, and `getValidatedQuery` gives us only the path, we enforce a strict leading `/` and reject `//` (protocol-relative) and `/\` (path-traversal via backslash). Any other string (including query/fragment) is preserved.
- Anonymous job claim runs AFTER `createUserSession` so the user has a session even if claim fails (degraded gracefully).
- Transaction boundary contains the consume + user upsert + lastLogin update; session creation is outside the transaction because `createUserSession` needs `event` and cookie setting is a post-commit effect by design.
