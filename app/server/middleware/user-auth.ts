// User auth middleware — guards user-facing authenticated surfaces.
// Disjoint from admin auth (SPEC rule: user + admin auth never share code paths).
//
// Scope:
//   - /account/* (Vue pages)                 → page-level redirect to /login?next=<path>
//   - /api/me/*, /api/account/* (future)     → JSON 401
//
// Current behavior: if getUserSession returns null → redirect pages / 401 APIs.
// Auth-optional routes (/login, /upload, landing) are NOT listed here.
import { createError, defineEventHandler, getRequestURL, sendRedirect } from 'h3';
import { getUserSession } from '../utils/auth-user';

const PAGE_PREFIXES = ['/account'] as const;
const API_PREFIXES = ['/api/me/', '/api/account/'] as const;

function pageMatch(pathname: string): boolean {
  return PAGE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}
function apiMatch(pathname: string): boolean {
  return API_PREFIXES.some((p) => pathname.startsWith(p));
}

export default defineEventHandler(async (event) => {
  const pathname = getRequestURL(event).pathname;
  const isPage = pageMatch(pathname);
  const isApi = apiMatch(pathname);
  if (!isPage && !isApi) return;

  const session = await getUserSession(event);
  if (session) return;

  if (isPage) {
    const next = encodeURIComponent(pathname);
    return sendRedirect(event, `/login?next=${next}`, 303);
  }
  throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
});
