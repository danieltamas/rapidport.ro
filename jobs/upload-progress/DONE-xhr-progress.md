# Completed: real upload progress bar on /upload via XHR
**Task:** ad-hoc UI task (no spec) | **Status:** done | **Date:** 2026-04-21

## Problem
`/upload` showed only a "Se încarcă…" button label once the user clicked submit. No bytes-progress indicator, which for 8 MB → 500 MB archives on mid-speed Romanian consumer uplinks means many seconds of silence — the user can't tell whether it's stuck or moving. The existing submit flow used `$fetch`, which wraps Fetch API and has no upload-progress event.

## Changes Made
- `app/pages/upload.vue`:
  - Added `progress` ref (`number | null`) tracking 0–100 during upload.
  - Added `xhrUpload(jobId, FormData, onProgress)` helper that PUTs the archive via `XMLHttpRequest` so `xhr.upload.onprogress` can report byte-level progress. Sets `x-csrf-token` manually (same `readCsrf()` cookie read used elsewhere); omits `Content-Type` so the browser generates the correct multipart boundary. Rejects with a typed `{ statusCode, errorCode }` shape by best-effort parsing our JSON error envelope (`data.error`) from the response body. Network/abort errors reject with `statusCode: 0`.
  - Moved the existing status→Romanian-copy mapping into a reusable `mapError()` function so both the `$fetch` (POST `/api/jobs`) and XHR (PUT upload) error paths feed one mapping table.
  - New template block below the file preview: 4px `bg-border` track with `bg-primary` fill, percentage inline-right in `font-mono tabular-nums`. Rendered via `role="progressbar"` + ARIA value attrs. SPEC §"UI Design System" — "Progress bars: 4px linear, --accent-primary fill, percentage inline-right in mono. No spinners except <2s ops".
  - File-preview subline swapped between three states: `gata de încărcare` (idle), `se încarcă…` (0 ≤ pct < 100), `încărcat · se procesează` (100, waiting for server 200).

## Acceptance Criteria Check
- [x] Real bytes-based upload progress visible during multipart PUT
- [x] Progress bar matches SPEC (4px, primary red fill, mono percentage right-aligned)
- [x] Accessible: `role="progressbar"`, `aria-valuenow/min/max`
- [x] Error mapping preserved (413/415/429/generic) and now also handles network failures (`statusCode: 0` → generic copy)
- [x] CSRF header still sent via `x-csrf-token` (double-submit pattern unchanged)
- [x] Cookies flow (`withCredentials = true`) so the anonymous-access-token cookie set by POST /api/jobs is sent on the follow-up PUT
- [x] `npx nuxi typecheck` passes

## Trade-offs / Not done
- **No resume / chunked upload.** If the connection drops at 80%, the whole PUT restarts. Adding tus or chunked multipart is out of scope for this task; revisit if real users report drops.
- **No speed / ETA readout.** We render percentage only. Network speed is noisy; an ETA based on a 1-second sliding window is a future polish.
- **XHR instead of Fetch + ReadableStream.** Request-body streaming via Fetch would be more modern, but Safari still lacks full duplex streaming support (as of 2026-04). XHR works in every browser we care about and is a ~30-line change.

## Security Check
- [x] All DB access goes through Drizzle — N/A (UI only)
- [x] Every mutation endpoint is CSRF-protected — `x-csrf-token` header sent via XHR, same double-submit pattern as `$fetch` path
- [x] Every job endpoint calls `assertJobAccess` — unchanged (upload handler still does)
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A
- [x] All inputs Zod-validated — unchanged on backend
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — no logging added
- [x] Session cookies HttpOnly + Secure + correct SameSite — `withCredentials = true` causes cookies to flow, browser still honours HttpOnly/Secure/SameSite
- [x] Rate limits applied where the task spec requires — unchanged (3/h/IP still enforced by `server/middleware/rate-limit.ts`)
