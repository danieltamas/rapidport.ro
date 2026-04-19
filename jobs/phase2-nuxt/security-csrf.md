---
title: CSRF middleware (app/server/middleware/csrf.ts)
priority: critical
status: todo
group: security-baseline
phase: 2
branch: job/phase2-nuxt/security-baseline-security-csrf
spec-ref: SPEC.md §S.2 "CSRF Protection", CODING.md §1 "Request Lifecycle"
---

## Description

Create `app/server/middleware/csrf.ts` — a Nitro middleware that enforces CSRF on every state-changing request (POST, PUT, PATCH, DELETE). Uses the double-submit-cookie pattern (no external `nuxt-csurf` dependency — we control the code).

## Why It Matters

CSRF is the #1 regression point. A mutation endpoint without CSRF verification is a silent takeover vector. This middleware enforces the check at the framework boundary, so individual handlers cannot forget.

## Acceptance Criteria

### File: `app/server/middleware/csrf.ts`

- [ ] Default export via `defineEventHandler`.
- [ ] On every request, ensure a CSRF cookie exists (`rp_csrf`):
  - If `rp_csrf` cookie is absent, generate a new token (`crypto.randomUUID()` or 32 random hex bytes via `crypto.getRandomValues`) and set it via `setCookie(event, 'rp_csrf', token, { secure: true, httpOnly: false, sameSite: 'strict', path: '/' })`. **`httpOnly: false`** is correct — the client needs to read it to mirror into the header.
- [ ] If `request.method` is one of `POST`, `PUT`, `PATCH`, `DELETE`:
  - Read the `rp_csrf` cookie value.
  - Read the `x-csrf-token` request header (case-insensitive).
  - If either is missing → throw `createError({ statusCode: 403, statusMessage: 'CSRF token missing' })`.
  - Compare with constant-time equality (use `crypto.timingSafeEqual` on equal-length `Buffer.from(..., 'utf8')`). Different-length = 403.
  - Mismatch → throw `createError({ statusCode: 403, statusMessage: 'CSRF token mismatch' })`.
- [ ] **Exempt paths** (CSRF bypassed):
  - Requests whose URL path starts with `/api/webhooks/` — webhooks verify via provider signature (Stripe, SmartBill).
  - No other exemptions. Admin routes ARE enforced (SPEC §S.2).
- [ ] Use `getRequestURL(event).pathname` to read the path. Do NOT match on host.
- [ ] **GET/HEAD/OPTIONS** requests pass through without verification (but still get the cookie set if missing).
- [ ] Short comment at top: file purpose + SPEC reference.
- [ ] No `process.env` access.

### Verification

- [ ] `cd app && npx nuxi typecheck` passes.
- [ ] `cd app && npm run build` passes.
- [ ] Manual reasoning in DONE: list the 4 methods enforced + the 1 exempt path prefix. Confirm admin routes are NOT exempt.

### Out of scope

- Client-side helper to mirror the cookie into `x-csrf-token` — lives with the Vue app composable (Phase 2 `pages-*` tasks or a helper under `app/composables/`); flag in DONE Notes.
- Automated CSRF rejection test — `ci-security-tests` group.

## Files to Create

- `app/server/middleware/csrf.ts`

## Files to Touch

None.

## Notes

- **Constant-time comparison is non-negotiable.** Do not use `===` or `Buffer.compare` for token equality — use `crypto.timingSafeEqual` on equal-length buffers.
- Use `node:crypto` — Nitro runs on Node 22, so native Web Crypto or Node crypto are both fine. Prefer `node:crypto` for `timingSafeEqual`.
- Keep the file under 90 lines.
- **English-only identifiers and comments.**

## Worker Rules

- **Branch:** `job/phase2-nuxt/security-baseline-security-csrf` (pre-created). Verify with `git branch --show-current`.
- **Files you may edit:** ONLY `app/server/middleware/csrf.ts` and this task's `DONE-security-csrf.md`.
- **Files you MUST NOT edit:** `app/server/middleware/security-headers.ts`, `app/server/middleware/rate-limit.ts`, `app/server/db/**`, `nuxt.config.ts`, `package.json`.
- **Permission denials:** stop and report. Do NOT try alternate paths.
- **Commit granularity:** 1-2 commits. Conventional Commits with scope `sec`.
- **DONE report:** `jobs/phase2-nuxt/DONE-security-csrf.md`.
- **No dev/preview server.**
