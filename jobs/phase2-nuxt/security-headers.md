---
title: Security headers middleware (app/server/middleware/security-headers.ts)
priority: critical
status: todo
group: security-baseline
phase: 2
branch: job/phase2-nuxt/security-baseline-security-headers
spec-ref: SPEC.md §S.1 "Transport & Headers", CODING.md §1 "Request Lifecycle"
---

## Description

Create `app/server/middleware/security-headers.ts` — a Nitro global middleware that sets every response header required by SPEC §S.1. Applied to every response from the Nuxt app, no route exceptions.

## Why It Matters

These headers are the browser's defense against XSS, clickjacking, MIME sniffing, referrer leakage, and feature abuse (camera/mic/geolocation/payment). They must be set on every response — one missing header on one route breaks the guarantee.

## Acceptance Criteria

### File: `app/server/middleware/security-headers.ts`

- [ ] Default export uses `defineEventHandler` — Nuxt/Nitro middleware convention.
- [ ] Sets the following response headers on every request (use `setResponseHeader(event, name, value)`):
  - `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")`
  - `Content-Security-Policy`: built from the directives below; **no `unsafe-inline`, no `unsafe-eval`**. Emit as a single `;`-joined string.
- [ ] CSP directives (minimum viable set — later tasks may extend via a composable, not by editing this file):
  - `default-src 'self'`
  - `script-src 'self' https://js.stripe.com https://accounts.google.com`
  - `style-src 'self'` (Tailwind v4 emits no inline styles at build; if SSR requires a nonce later, add via a follow-up task — do NOT add `'unsafe-inline'`)
  - `img-src 'self' data: blob:`
  - `font-src 'self' data:`
  - `connect-src 'self' https://api.stripe.com https://accounts.google.com`
  - `frame-src https://js.stripe.com https://accounts.google.com`
  - `frame-ancestors 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`
  - `object-src 'none'`
- [ ] File lives at `app/server/middleware/security-headers.ts` — Nitro auto-loads middleware from `server/middleware/`.
- [ ] Filename starts with `01-` if ordering is needed relative to other middleware; CHECK FIRST: if other middleware already exist in `app/server/middleware/` (they shouldn't yet in this branch), coordinate. Otherwise use the plain name `security-headers.ts` and let execution order emerge alphabetically.
- [ ] Short comment at top: file purpose + SPEC reference. No JSDoc.
- [ ] No `process.env` access in this file — env is handled in `app/server/utils/env.ts`.

### Verification

- [ ] `cd app && npx nuxi typecheck` passes (exit 0).
- [ ] `cd app && npm run build` passes.
- [ ] `grep -E "unsafe-inline|unsafe-eval" app/server/middleware/security-headers.ts` returns **no matches**.

### Out of scope

- CSP nonce generation for inline SSR styles — flag as a follow-up in DONE Notes if Nuxt/Tailwind emit any inline style in `npm run build` output.
- Test harness for response headers — `ci-security-tests` group owns that.
- CORS headers — already handled in `nuxt.config.ts` `nitro.routeRules['/api/**']`.

## Files to Create

- `app/server/middleware/security-headers.ts`

## Files to Touch

None.

## Notes

- **English-only identifiers and comments.**
- **Do NOT add `unsafe-inline` or `unsafe-eval` under any circumstance.** If you believe a specific page needs inline script, STOP and report — SPEC forbids it and we will solve with nonces, not allowlisting.
- Webhook endpoints get the same headers — they're fine; headers are not the CSRF exemption path (that's `security-csrf`).
- Keep the file under 80 lines.

## Worker Rules

- **Branch:** `job/phase2-nuxt/security-baseline-security-headers` (pre-created). Verify with `git branch --show-current`.
- **Files you may edit:** ONLY `app/server/middleware/security-headers.ts` and this task's `DONE-security-headers.md` report.
- **Files you MUST NOT edit:** `app/server/middleware/csrf.ts`, `app/server/middleware/rate-limit.ts`, `app/server/db/**`, `nuxt.config.ts`, `package.json`, any page or API handler, any other task's branch or DONE report.
- **Permission denials:** stop and report in the DONE file. Do NOT try alternate paths.
- **Commit granularity:** 1-2 commits. Conventional Commits with scope `sec`.
- **DONE report:** write `jobs/phase2-nuxt/DONE-security-headers.md` before you exit (see CLAUDE.md Step 3 template).
- **No dev/preview server.** Verification is typecheck + build only.
