# Completed: CSRF middleware (app/server/middleware/csrf.ts)
**Task:** security-csrf.md | **Status:** done | **Date:** 2026-04-19

## Changes Made
- `app/server/middleware/csrf.ts:1-62` — created Nitro middleware implementing the double-submit-cookie CSRF pattern. Sets `rp_csrf` cookie on every request when missing (32-byte hex token from `node:crypto.randomBytes`, `Secure`, `SameSite=Strict`, `httpOnly: false` so the browser can mirror it into `x-csrf-token`). On `POST/PUT/PATCH/DELETE`, reads cookie + `x-csrf-token` header, rejects with `403 CSRF token missing` if either is absent, then compares with `crypto.timingSafeEqual` over equal-length `Buffer`s — different length short-circuits to false; mismatch → `403 CSRF token mismatch`. `GET/HEAD/OPTIONS` pass through. Path matched via `getRequestURL(event).pathname`. Only exemption: paths starting with `/api/webhooks/` (Stripe + SmartBill verify provider signatures).

## Acceptance Criteria Check
- [x] Default export via `defineEventHandler`.
- [x] `rp_csrf` cookie generated when absent (`Secure`, `httpOnly: false`, `SameSite=Strict`, `path: '/'`).
- [x] Enforces methods `POST, PUT, PATCH, DELETE` via `ENFORCED_METHODS` set.
- [x] Reads `rp_csrf` cookie + `x-csrf-token` header (case-insensitive via `getHeader`).
- [x] Missing cookie or header → `createError({ statusCode: 403, statusMessage: 'CSRF token missing' })`.
- [x] Constant-time comparison via `crypto.timingSafeEqual` on equal-length `Buffer`s; different length returns false without calling `timingSafeEqual` (which would throw on length mismatch).
- [x] Mismatch → `createError({ statusCode: 403, statusMessage: 'CSRF token mismatch' })`.
- [x] Exempt path prefix only `/api/webhooks/`. Admin routes are NOT exempt — verified by inspection: only `EXEMPT_PATH_PREFIX` is checked.
- [x] Path read via `getRequestURL(event).pathname`.
- [x] `GET/HEAD/OPTIONS` pass through but still trigger cookie-set if missing — order of checks ensures cookie set before method gate.
- [x] Top-of-file comment with purpose + SPEC reference (lines 1-4).
- [x] No `process.env` access.
- [x] File is 62 lines (under 90-line cap).
- [x] `cd app && npm run build` — exit 0 (server + client + nitro all built; verified before commit).
- [x] `cd app && npx nuxi typecheck` — only failures are in `server/middleware/rate-limit.ts` (sibling worker file, forbidden to touch). `csrf.ts` itself compiles cleanly.

### Manual reasoning summary
- **Enforced methods (4):** `POST`, `PUT`, `PATCH`, `DELETE`.
- **Exempt path prefix (1):** `/api/webhooks/` only.
- **Admin routes:** NOT exempt — `/api/admin/*` mutations go through the full CSRF check, satisfying SPEC §S.2.

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — N/A, no DB access in this middleware.
- [x] Every mutation endpoint is CSRF-protected — this middleware *is* the protection; it runs globally so every mutation handler is covered without per-handler opt-in.
- [x] Every job endpoint calls `assertJobAccess` — N/A, middleware runs before handlers.
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A; middleware does not exempt admin paths so admin endpoints get CSRF on top of their auth checks.
- [x] All inputs Zod-validated — N/A, no body parsing in this middleware (only headers/cookies, both length-bounded).
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — middleware emits no logs at all; only HTTP errors with generic statusMessage.
- [x] Session cookies are HttpOnly + Secure + correct SameSite — `rp_csrf` is intentionally `httpOnly: false` (must be JS-readable to mirror into header per double-submit pattern), but is `Secure` + `SameSite=Strict`. This is NOT a session cookie.
- [x] Rate limits applied where the task spec requires — N/A; rate-limit is a sibling middleware (`rate-limit.ts`) owned by another worker.

## Notes
- **Out of scope (per spec):** client-side composable to mirror `rp_csrf` cookie value into the `x-csrf-token` header on fetch. Will be added in the Phase 2 `pages-*` group or as `app/composables/useCsrf.ts`. Until then, mutation requests from the SPA must be wired manually to read `document.cookie` for `rp_csrf`.
- **Out of scope (per spec):** automated CSRF rejection test — handled by `ci-security-tests` group.
- **Typecheck note:** the global `npx nuxi typecheck` returns exit 1 due to two errors in `server/middleware/rate-limit.ts` (lines 112 and 131), which is a sibling worker's file and forbidden to touch per task spec. Errors are unrelated to `csrf.ts`. After all three security-baseline workers merge, the orchestrator will see a clean typecheck.
- **Crypto choice:** used `randomBytes(32).toString('hex')` (256 bits of entropy, 64-char hex token) over `randomUUID()` for stronger entropy and to keep tokens opaque (UUIDs reveal version/variant bits).
- **Buffer length check:** we short-circuit to `false` *before* calling `timingSafeEqual` (which throws on length mismatch). This is itself a tiny timing signal (length-mismatch is faster than equal-length compare), but length is not secret — both tokens are known to be 64 hex chars in normal operation.
- **Worktree note:** initial Write calls were misrouted to the parent checkout at `/Users/danime/Sites/rapidport.ro/app/`; cleaned up and re-written into the correct worktree path before commit. The build/typecheck verifications above were run from the parent app directory before cleanup, against an identical file (same content). The committed file in the worktree matches byte-for-byte.
