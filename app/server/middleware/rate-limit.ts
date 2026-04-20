// Sliding-window rate limiter backed by the `rate_limits` Postgres table.
// Spec: SPEC.md §S.10 "Rate Limiting"; CODING.md §1 "Request Lifecycle".
// Fail-closed for auth-sensitive routes (DB error -> 503), fail-open elsewhere
// (availability > strictness for non-auth). Magic-link `body.email` keying is
// handled inside the magic-link handler itself, not here, because middleware
// runs before body validation. The catch-all 300/min GET and 60/min mutation
// limits are out of scope for this task.
import { createError, defineEventHandler, getRequestIP, getRequestURL, setHeader } from 'h3';
import { sql } from 'drizzle-orm';
import { db } from '../db/client';

type RouteRule = {
  method: string;
  pathPrefix: string;
  match: 'exact' | 'suffix';
  suffix?: string;
  limit: number;
  windowSec: number;
  keyBy: 'ip';
  failClosed?: boolean;
};

// Hardcoded route rules. The magic-link `body.email` rule is intentionally
// omitted here and lives in the handler instead (see file header).
const ROUTES: readonly RouteRule[] = [
  { method: 'POST', pathPrefix: '/api/jobs', match: 'exact', limit: 10, windowSec: 3600, keyBy: 'ip' },
  { method: 'PUT', pathPrefix: '/api/jobs/', match: 'suffix', suffix: '/upload', limit: 3, windowSec: 3600, keyBy: 'ip' },
  { method: 'GET', pathPrefix: '/admin/login', match: 'exact', limit: 10, windowSec: 3600, keyBy: 'ip', failClosed: true },
  { method: 'POST', pathPrefix: '/api/anaf/lookup', match: 'exact', limit: 30, windowSec: 3600, keyBy: 'ip' },
];

function findRule(method: string, path: string): RouteRule | undefined {
  for (const rule of ROUTES) {
    if (rule.method !== method) continue;
    if (rule.match === 'exact' && path === rule.pathPrefix) return rule;
    if (rule.match === 'suffix' && rule.suffix && path.startsWith(rule.pathPrefix) && path.endsWith(rule.suffix)) return rule;
  }
  return undefined;
}

export default defineEventHandler(async (event) => {
  const method = (event.method ?? 'GET').toUpperCase();
  const path = getRequestURL(event).pathname;

  const rule = findRule(method, path);
  if (!rule) return;

  // Resolve identity. Only `ip` is supported in middleware today.
  const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown';
  const key = `${rule.method}:${rule.pathPrefix}:${ip}`;
  const windowSec = rule.windowSec;
  const limit = rule.limit;

  try {
    // Sliding window: count entries inserted within the last windowSec seconds,
    // and on the same query return the oldest entry's age (used to compute
    // Retry-After when the bucket is full). Both queries use parameterized SQL
    // via Drizzle's `sql` template — never string-interpolated.
    const rows = await db.execute<{
      used: string | number;
      oldest_at: Date | null;
    }>(sql`
      select
        count(*)::bigint as used,
        min(window_start) as oldest_at
      from rate_limits
      where key = ${key}
        and window_start > now() - make_interval(secs => ${windowSec})
    `);

    // drizzle-orm/node-postgres returns a pg Result-like object with `.rows`.
    const row = (rows as unknown as { rows: Array<{ used: string | number; oldest_at: Date | null }> }).rows[0];
    const used = Number(row?.used ?? 0);

    if (used >= limit) {
      const oldestAt = row?.oldest_at ? new Date(row.oldest_at) : null;
      let retryAfter = windowSec;
      if (oldestAt) {
        const expiresAtMs = oldestAt.getTime() + windowSec * 1000;
        retryAfter = Math.max(1, Math.ceil((expiresAtMs - Date.now()) / 1000));
      }
      setHeader(event, 'Retry-After', retryAfter);
      throw createError({
        statusCode: 429,
        statusMessage: 'Too Many Requests',
        data: { error: 'rate_limited', retryAfter },
      });
    }

    await db.execute(sql`
      insert into rate_limits (key, window_start, count)
      values (${key}, now(), 1)
    `);
  } catch (err: unknown) {
    // Re-throw the 429 we just constructed.
    if (err && typeof err === 'object' && 'statusCode' in err && (err as { statusCode?: number }).statusCode === 429) {
      throw err;
    }

    if (rule.failClosed) {
      setHeader(event, 'Retry-After', 5);
      throw createError({
        statusCode: 503,
        statusMessage: 'Service Unavailable',
        data: { error: 'rate_limited', retryAfter: 5 },
      });
    }

    // Fail-open for non-auth rules: log and pass through. Never log PII — `key`
    // contains the client IP, so log only the rule identifier.
    console.warn(
      `[rate-limit] db error for rule ${rule.method} ${rule.pathPrefix} — failing open: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
});
