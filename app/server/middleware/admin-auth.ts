// Admin auth middleware — guards /admin/* (Vue pages) and /api/admin/* (API routes).
// Exempts the login flow (Google OAuth start + callback + admin login page).
// Spec: SPEC.md §S.4; CODING.md §13.7.
//
// Behavior:
//   - /admin/* (pages): on auth failure → 303 redirect to /admin/login (login UX).
//   - /api/admin/* (APIs): on auth failure → re-throw the 401/403 (JSON caller).
//
// Never logs IP, email, or session ID.
import { defineEventHandler, getRequestURL, sendRedirect } from 'h3';
import { assertAdminSession } from '../utils/assert-admin-session';

const EXEMPT_PREFIXES = ['/admin/login', '/api/auth/google/'] as const;
const API_PREFIX = '/api/admin/';

function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
}

// Page match covers both the bare /admin and all sub-paths /admin/jobs, /admin/users, etc.
// Previously this used `pathname.startsWith('/admin/')` which missed the bare /admin route,
// letting unauthenticated users land on the dashboard shell and see a 401 flash from the
// API instead of the login redirect.
function isAdminPage(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

export default defineEventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname;
  const isPage = isAdminPage(pathname);
  const isApi = pathname.startsWith(API_PREFIX);
  if (!isPage && !isApi) return;
  if (isExempt(pathname)) return;

  try {
    await assertAdminSession(event);
  } catch (err: unknown) {
    if (isPage) {
      // Page request: surface as login redirect instead of an error screen.
      return sendRedirect(event, '/admin/login', 303);
    }
    throw err;
  }
});
