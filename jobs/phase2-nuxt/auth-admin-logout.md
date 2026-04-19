---
title: Admin logout handler (POST /api/admin/logout)
priority: high
status: todo
group: auth-admin
phase: 2
branch: job/phase2-nuxt/auth-admin-auth-admin-logout
spec-ref: SPEC.md §S.4
---

## Description

Create `app/server/api/admin/logout.post.ts` — revokes the current admin session, clears the cookie, writes an audit row.

## Acceptance Criteria

### File: `app/server/api/admin/logout.post.ts` (NEW)

- [ ] Because `/api/admin/*` is guarded by `middleware/admin-auth.ts`, this handler runs AFTER `assertAdminSession` succeeds. But belt-and-braces: call `getAdminSession(event)` defensively. If null (shouldn't happen via middleware path) → 401.
- [ ] Call `revokeAdminSession(session.sessionId, event)` from `~/server/utils/auth-admin` (revokes + clears cookie).
- [ ] Write `admin_audit_log` row `action: 'admin_logout'` with the session's email + IP hash + user-agent (truncated 500).
- [ ] Response: `{ ok: true }`.
- [ ] **CSRF is enforced upstream** by `middleware/csrf.ts` (POST on non-webhook path) — nothing extra here.
- [ ] **No tokens in logs.**

### Files you MAY NOT edit

- Any util, middleware, schema, `package.json`, sibling handlers.

## Notes

- **English-only.**
- Reuse `sha256Hex` pattern for IP hash — either inline (3 lines) or just call `createHash('sha256').update(ip ?? '').digest('hex')` once. Don't import from `auth-admin.ts` (helper is private there).
- Keep under 50 lines.
- **NEVER Co-Authored-By.**

## Worker Rules

- **Branch:** `job/phase2-nuxt/auth-admin-auth-admin-logout`. Verify.
- **Commits:** 1-2, scope `auth`.
- **DONE report:** `jobs/phase2-nuxt/DONE-auth-admin-logout.md`.
- **Verification:** typecheck + build green.
- **No dev/preview, no db: scripts.**
