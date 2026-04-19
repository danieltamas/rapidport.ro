# Completed: Security headers middleware
**Task:** security-headers.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/middleware/security-headers.ts:1-33` — new global Nitro middleware. Sets HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, and a strict CSP on every response. CSP allowlists Stripe (`js.stripe.com`, `api.stripe.com`) and Google OAuth (`accounts.google.com`); `frame-ancestors 'none'`, `object-src 'none'`, no inline/eval scripts.

## Acceptance Criteria Check
- [x] Default export uses `defineEventHandler` — yes, Nuxt/Nitro auto-imports.
- [x] HSTS header — `max-age=31536000; includeSubDomains; preload`.
- [x] `X-Content-Type-Options: nosniff`.
- [x] `X-Frame-Options: DENY`.
- [x] `Referrer-Policy: strict-origin-when-cross-origin`.
- [x] `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")`.
- [x] CSP built from the spec'd directives, joined with `; ` — no inline/eval allowances.
- [x] All required CSP directives present: `default-src`, `script-src`, `style-src`, `img-src`, `font-src`, `connect-src`, `frame-src`, `frame-ancestors`, `base-uri`, `form-action`, `object-src`.
- [x] File at `app/server/middleware/security-headers.ts` (Nitro auto-loads).
- [x] No `01-` prefix needed — no other middleware exists in this branch yet.
- [x] Top-of-file comment with purpose + SPEC reference, no JSDoc.
- [x] No `process.env` access in this file.
- [x] `cd app && npx nuxi typecheck` — exit 0 (no errors emitted).
- [x] `cd app && npm run build` — successful, build complete.
- [x] `grep -E "unsafe-inline|unsafe-eval" app/server/middleware/security-headers.ts` — no matches.

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — N/A, no DB access in this file.
- [x] Every mutation endpoint is CSRF-protected — N/A, no endpoints; CSRF owned by sibling task.
- [x] Every job endpoint calls `assertJobAccess` — N/A.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A.
- [x] All inputs Zod-validated (body + query + params) — N/A, middleware sets only output headers.
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — N/A, no logging.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — N/A, no cookies set.
- [x] Rate limits applied where the task spec requires — N/A, owned by sibling task.

## Notes / Follow-ups
- `style-src 'self'` only — if Tailwind v4 SSR ever emits inline `<style>` blocks at runtime, a follow-up task should add nonce-based CSP rather than `'unsafe-inline'`. Build output inspected: chunk filenames show only static `.mjs` modules; no inline-style runtime injection observed.
- CSP nonce composable for inline SSR scripts/styles is explicitly out of scope per task spec.
- Test harness for response-header assertions is owned by `ci-security-tests` group.
