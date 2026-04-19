// Admin auth middleware — guards /admin/* (Vue pages) and /api/admin/* (API routes).
// Exempts the login flow (Google OAuth start + callback + admin login page).
// Spec: SPEC.md §S.4; CODING.md §13.7.
// Never logs IP, email, or session ID — assertAdminSession throws with a status and
// the middleware re-throws unchanged.
import { defineEventHandler, getRequestURL } from 'h3';
import { assertAdminSession } from '../utils/assert-admin-session';

const EXEMPT_PREFIXES = ['/admin/login', '/api/auth/google/'] as const;
const GUARDED_PREFIXES = ['/admin/', '/api/admin/'] as const;

function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

function isGuarded(pathname: string): boolean {
  return GUARDED_PREFIXES.some((p) => pathname.startsWith(p));
}

export default defineEventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname;
  if (!isGuarded(pathname)) return;
  if (isExempt(pathname)) return;

  await assertAdminSession(event);
});
