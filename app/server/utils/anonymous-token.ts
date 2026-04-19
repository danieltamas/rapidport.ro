// Anonymous per-job access token: issue + verify path-scoped capability cookie.
// Spec: SPEC.md §S.3 "Anonymous mode"; CODING.md §13.5 (token hashing), §13.8 (consumer context).
import { Buffer } from 'node:buffer';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { H3Event } from 'h3';
import { getCookie, getHeader, setCookie } from 'h3';

const COOKIE_PREFIX = 'job_access_';
const HEADER_NAME = 'x-job-token';
const MAX_AGE_SECONDS = 30 * 24 * 3600;

function cookieName(jobId: string): string {
  return `${COOKIE_PREFIX}${jobId}`;
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function generateAnonymousToken(): string {
  return randomBytes(32).toString('hex');
}

export function setAnonymousTokenCookie(event: H3Event, jobId: string, token: string): void {
  setCookie(event, cookieName(jobId), token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: `/job/${jobId}`,
    maxAge: MAX_AGE_SECONDS,
  });
}

export function verifyAnonymousToken(event: H3Event, jobId: string, jobToken: string): boolean {
  if (!jobToken) return false;
  const presented = getCookie(event, cookieName(jobId)) ?? getHeader(event, HEADER_NAME);
  if (!presented) return false;
  return constantTimeEqual(presented, jobToken);
}
