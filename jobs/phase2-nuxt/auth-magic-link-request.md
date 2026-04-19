---
title: Magic-link request handler (POST /api/auth/magic-link)
priority: critical
status: todo
group: auth-user
phase: 2
branch: job/phase2-nuxt/auth-user-auth-magic-link-request
spec-ref: SPEC.md §S.3; CODING.md §13.5, §13.6
---

## Description

Create `app/server/api/auth/magic-link.post.ts` — issues a magic link email. Rate-limited 5/hour per email (fails closed). Token plaintext emailed; SHA-256 hash stored in `magic_link_tokens`. 15-minute TTL.

## Acceptance Criteria

### File: `app/server/api/auth/magic-link.post.ts` (NEW)

- [ ] Zod body schema: `{ email: z.string().email().toLowerCase().trim() }` — validated via `readValidatedBody`.
- [ ] **Rate limit (fail-closed):** before any DB work, count `magic_link_tokens` rows where `email = $1` AND `createdAt > now() - interval '1 hour'`. If ≥ 5 → throw `createError({ statusCode: 429, statusMessage: 'Too Many Requests' })`. Wrap the count in try/catch; on DB error also 429/503 (fail-closed per CODING.md §13.6) — use 503 with `Retry-After: 5`.
- [ ] Generate 32-byte random token (`randomBytes(32).toString('hex')`), SHA-256 hash.
- [ ] Insert row into `magic_link_tokens`: `email`, `tokenHash`, `expiresAt = now() + 15 min`, `ipAddress = getRequestIP(event, { xForwardedFor: true })`.
- [ ] Build verification URL: `${env.APP_URL}/api/auth/verify?token=${plaintextToken}` (plaintext only, never the hash).
- [ ] Send email via `sendEmail()` from `~/server/utils/email` — subject in Romanian: `'Autentifică-te pe Rapidport'`. HTML body contains the link; do NOT put the token in the subject. Plain-text body also contains the link. Romanian copy.
- [ ] Response: `{ ok: true }` — always, even if email fails (don't leak enumeration). Log the failure cause without PII.
- [ ] **No PII in logs.** Never log the email. Never log the token or hash. If you must log, log `event: 'magic_link_issued'` with nothing else.
- [ ] Top-of-file comment with route + rate limit note.

### Files you MAY NOT edit

- `app/server/utils/env.ts` — orchestrator already extended with RESEND_API_KEY + EMAIL_FROM. Do not re-edit.
- `app/server/utils/email.ts`, `auth-user.ts`, `auth-admin.ts`, `anonymous-token.ts`, `assert-job-access.ts`, `assert-admin-session.ts`, `google-oauth.ts` — read-only.
- Any middleware, any DB schema file, `package.json`, `nuxt.config.ts`, sibling API handlers.

## Notes

- **English-only identifiers + code comments.** Email COPY is Romanian (user-facing).
- `magicLinkTokens` import from `~/server/db/schema` or `../../../db/schema`.
- Keep under 130 lines. Pull email HTML into a helper function at the bottom of the same file — don't create a separate template file (that's `email-templates` task's territory).
- **NEVER Co-Authored-By trailer.**

## Worker Rules

- **Branch:** `job/phase2-nuxt/auth-user-auth-magic-link-request` (pre-created from group/main). Verify.
- **Commits:** 1-2, scope `auth`.
- **DONE report:** `jobs/phase2-nuxt/DONE-auth-magic-link-request.md`.
- **Verification:** `cd app && npx nuxi typecheck` exit 0 + `cd app && npm run build` exit 0.
- **No dev/preview, no db: scripts.**
