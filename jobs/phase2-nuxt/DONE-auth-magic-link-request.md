# Completed: Magic-link request handler (POST /api/auth/magic-link)
**Task:** auth-magic-link-request.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/api/auth/magic-link.post.ts:1-108` — new Nitro handler. Zod-validates email, enforces fail-closed 5/hour/email rate limit via count query on `magic_link_tokens`, issues a 32-byte random token (SHA-256 hashed and persisted, plaintext emailed), 15-minute TTL, records `ipAddress` from `getRequestIP(xForwardedFor: true)`, sends Romanian Resend email with verify link, always returns `{ ok: true }` to avoid enumeration.

## Acceptance Criteria Check
- [x] Zod body schema `{ email }` — `readValidatedBody(event, BodySchema.parse)`, email normalized (trim + lowercase).
- [x] Fail-closed rate limit (5/hour/email) — count query wrapped in try/catch; rate hit → 429; DB error → 503 with `Retry-After: 5` (CODING.md §13.6).
- [x] 32-byte random token + SHA-256 hash — `randomBytes(32).toString('hex')` + `createHash('sha256')`.
- [x] Insert row with `email`, `tokenHash`, `expiresAt = now() + 15min`, `ipAddress` — via Drizzle `db.insert(magicLinkTokens)`.
- [x] Verification URL `${env.APP_URL}/api/auth/verify?token=<plaintext>` — plaintext only, hash never leaves the server.
- [x] Resend email — Romanian subject `Autentifică-te pe Rapidport`, HTML + plain-text bodies contain the link, token NOT in subject.
- [x] Response `{ ok: true }` even on email failure — `sendEmail` result logged without PII; handler does not throw on delivery error.
- [x] No PII in logs — only `magic_link_issued` events with a `delivery` flag; email/token/hash never logged. `sendEmail` util already scrubs recipients.
- [x] Top-of-file comment documents route + rate-limit policy.
- [x] File under 130 lines (108 including email-body helpers kept inline as required).
- [x] No forbidden files touched (env.ts, email.ts, auth-*.ts, middleware, schema, package.json all untouched).

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — select count via Drizzle `sql` tagged for `count(*)::int`, insert via Drizzle.
- [x] Every mutation endpoint is CSRF-protected — CSRF is enforced by global middleware per CLAUDE.md; handler does not bypass.
- [x] Every job endpoint calls `assertJobAccess` — N/A (auth route, no `jobId`).
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A (user route).
- [x] All inputs Zod-validated (body + query + params) — body schema, no query/params used.
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — emails, tokens, hashes never logged; only abstract event names.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A (no session is set here; cookies are issued on `/api/auth/verify`).
- [x] Rate limits applied where the task spec requires — 5/hour per email, fail-closed.

## Verification
- `cd app && npx nuxi typecheck` → exit 0.
- `cd app && npm run build` → exit 0; `.output/server/chunks/routes/api/auth/magic-link.post.mjs` present.
