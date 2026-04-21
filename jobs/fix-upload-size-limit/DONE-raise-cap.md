# Completed: raise nuxt-security requestSizeLimiter cap on upload route
**Task:** ad-hoc bugfix (no task spec) | **Status:** done | **Date:** 2026-04-21

## Problem
Dani uploaded an 8.1 MB WinMentor archive and got "Arhiva depășește 500 MB" back. The archive is well under the 500 MB cap.

## Root cause
`nuxt-security` registers a `requestSizeLimiter` middleware with defaults:
- `maxRequestSizeInBytes`: 2,000,000 (2 MB)
- `maxUploadFileRequestInBytes`: 8,000,000 (8 MB)

An 8.1 MB multipart body exceeds the 8 MB file-upload default, so `nuxt-security` rejects with HTTP 413 **before** `app/server/api/jobs/[id]/upload.put.ts` runs — the handler's own 500 MB Content-Length check never fires. The client maps 413 → "Arhiva depășește 500 MB". Copy is misleading given the real cause, but the underlying 413 is produced upstream.

Confirmed via nuxt-security docs (Context7: `/baroshem/nuxt-security`).

## Changes Made
- `app/nuxt.config.ts:156-176` — added a top-level `routeRules` block (separate from the existing `nitro.routeRules['/api/**']` for CORS) that sets `security.requestSizeLimiter.maxRequestSizeInBytes` + `.maxUploadFileRequestInBytes` to 500 MB (`524_288_000`) for `/api/jobs/**/upload`. Global defaults stay strict — only this single route path is relaxed. Defence in depth preserved: `upload.put.ts` still does its own Content-Length + post-multipart size checks with the same 500 MB cap.

## Acceptance Criteria Check
- [x] 8.1 MB .tgz upload no longer fails at the security middleware layer
- [x] The in-handler 500 MB cap in `upload.put.ts` is unchanged, so oversize files still return a handler-authored 413 with `data: {error: 'payload_too_large'}`
- [x] No other endpoint has its body limit relaxed (verified: `routeRules` key is specific to `/api/jobs/**/upload`)
- [x] `npx nuxi typecheck` passes from `app/app/`

## Not fixed in this commit
- **No upload progress bar.** `$fetch` / `fetch` don't expose upload progress events. Adding one requires switching to XMLHttpRequest (or fetch + ReadableStream request streaming, which Safari still doesn't fully support). That's a larger UI change and belongs in its own task — proposed in Dani-facing chat.
- **Error copy.** "Arhiva depășește 500 MB" is no longer literally accurate for nuxt-security 413s, but with this fix that path should be unreachable for files under 500 MB. Left as-is; revisit if it resurfaces.

## Security Check
- [x] All DB access goes through Drizzle — N/A, config-only change
- [x] Every mutation endpoint is CSRF-protected — unchanged; CSRF middleware still enforces
- [x] Every job endpoint calls `assertJobAccess` — unchanged
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A
- [x] All inputs Zod-validated — unchanged
- [x] No PII in logs — unchanged
- [x] Session cookies are HttpOnly + Secure + correct SameSite — unchanged
- [x] Rate limits applied where the task spec requires — unchanged; `/api/jobs/*/upload` still rate-limited at 3/h/IP in our own middleware
- [x] Scope creep check: only `/api/jobs/**/upload` is relaxed, other routes stay at the 2 MB / 8 MB nuxt-security defaults
