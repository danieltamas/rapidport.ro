// CSRF protection via double-submit cookie pattern.
// Spec: SPEC.md §S.2 "CSRF Protection"; CODING.md §1 "Request Lifecycle".
// Cookie `rp_csrf` (readable by JS) is mirrored into the `x-csrf-token` header by the client.
// Webhooks under /api/webhooks/ are exempt (provider-signed). Admin routes are NOT exempt.
import { Buffer } from 'node:buffer';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createError,
  defineEventHandler,
  getCookie,
  getHeader,
  getRequestURL,
  setCookie,
} from 'h3';

const COOKIE_NAME = 'rp_csrf';
const HEADER_NAME = 'x-csrf-token';
const ENFORCED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXEMPT_PATH_PREFIX = '/api/webhooks/';

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export default defineEventHandler((event) => {
  // Ensure a CSRF cookie exists on every request (idempotent for browsers that already have one).
  let cookieToken = getCookie(event, COOKIE_NAME);
  if (!cookieToken) {
    cookieToken = generateToken();
    setCookie(event, COOKIE_NAME, cookieToken, {
      secure: true,
      httpOnly: false,
      sameSite: 'strict',
      path: '/',
    });
  }

  const method = (event.method ?? 'GET').toUpperCase();
  if (!ENFORCED_METHODS.has(method)) return;

  const path = getRequestURL(event).pathname;
  if (path.startsWith(EXEMPT_PATH_PREFIX)) return;

  const headerToken = getHeader(event, HEADER_NAME);
  if (!cookieToken || !headerToken) {
    throw createError({ statusCode: 403, statusMessage: 'CSRF token missing' });
  }

  if (!constantTimeEqual(cookieToken, headerToken)) {
    throw createError({ statusCode: 403, statusMessage: 'CSRF token mismatch' });
  }
});
