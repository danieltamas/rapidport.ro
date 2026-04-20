# Completed: wire upload page submit button
**Task:** ad-hoc bugfix (no task spec) | **Status:** done | **Date:** 2026-04-21

## Problem
User reported: "added the file for upload, nothing happens". Inspection of `app/pages/upload.vue` showed the "Continuă spre validare" button had no click handler — it was purely cosmetic. The file sits in `file.value` forever, no `/api/jobs` POST, no `/api/jobs/{id}/upload` PUT, no navigation.

## Changes Made
- `app/pages/upload.vue:20-98` — added `submitting` + `errorMsg` refs, `readCsrf()` helper, `resolveDirection()` (explicit WM/SAGA choice → direction; 'auto' → infer from extension: `.tgz`/`.tar.gz` → winmentor→saga, anything else → saga→winmentor), and `submit()` that POSTs `/api/jobs`, PUTs the archive to `/api/jobs/{id}/upload` as multipart `file`, then `navigateTo('/job/{id}/discovery')`.
- `app/pages/upload.vue:143-160` — wired `@click="submit"` on the primary button, added submitting label ("Se încarcă…"), disabled the "Schimbă arhiva" ghost button while submitting, added localized `errorMsg` block with Romanian copy for 413 / 415 / 429 / generic failure.

## "Auto-detect" choice
Backend `/api/jobs` requires explicit `sourceSoftware` + `targetSoftware` enums ('winmentor' | 'saga', must differ). No 'auto' on the schema. I inferred from the archive extension client-side (WinMentor native export is `.tgz`, per SPEC). Worker-side discovery will still validate the actual archive contents and can flag a mismatch. **Flagged for Dani: confirm this heuristic or we update `/api/jobs` to accept null/auto and defer direction to worker discover.**

## Acceptance Criteria Check
- [x] Clicking "Continuă spre validare" with a file selected creates a job and uploads the archive
- [x] "Auto" direction resolves to a concrete source/target pair before POST (API constraint)
- [x] Error feedback in Romanian for common failures (413, 415, 429)
- [x] Button shows loading state; second click blocked via `submitting` guard
- [x] On success, navigates to `/job/{id}/discovery`
- [x] `npx nuxi typecheck` passes (run from `app/app/`)

## Security Check
- [x] All DB access goes through Drizzle (or parameterized `sql` template) — unchanged (UI-only)
- [x] Every mutation endpoint is CSRF-protected — client reads `rp_csrf` cookie and sends `x-csrf-token` header (same pattern as `login.vue`)
- [x] Every job endpoint calls `assertJobAccess` — unchanged (upload handler already does)
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A
- [x] All inputs Zod-validated (body + query + params) — unchanged; backend validates
- [x] No PII in logs (emails hashed, CIFs redacted, file contents never logged) — no logging added
- [x] Session cookies are HttpOnly + Secure + correct SameSite — unchanged
- [x] Rate limits applied where the task spec requires — backend already rate-limits POST `/api/jobs` (10/h) and PUT upload (3/h)

## Notes
- Did not touch backend. Bug was 100% missing wiring on the page.
- Did not start dev server (CLAUDE.md rule: `rundev` only); typecheck is the verification.
