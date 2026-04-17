# CODING.md — Engineering Best Practices

**Read this file before writing any code.** Every agent, every task, every PR.

---

## 1. Request Lifecycle (Nitro)

Every Nitro request flows through the same pipeline. Understand the order — it dictates where each concern lives.

```
Client → Caddy (HTTPS, request size cap)
  │
  ├─ Nitro global middleware (runs in order defined)
  │    1. security-headers.ts    ← HSTS, CSP, X-Frame, Referrer-Policy, Permissions-Policy
  │    2. csrf.ts                ← CSRF token verify on mutations (exempt: /api/webhooks/*)
  │    3. rate-limit.ts          ← sliding window per SPEC §S.10
  │    4. admin-auth.ts          ← /admin/* + /api/admin/* — assertAdminSession + IP bind
  │    5. audit.ts               ← per-request audit hooks (user-facing events)
  │
  ├─ Route handler (server/api/...)
  │    ├─ Zod validation: readValidatedBody / getValidatedQuery / getValidatedRouterParams
  │    ├─ Access check: assertJobAccess (for /api/jobs/[id]/*)
  │    ├─ Access check: assertAdminSession is already enforced in middleware for /api/admin/*
  │    │   but handlers still call logAdminAction(session, action, target) inline
  │    ├─ ► BUSINESS LOGIC ◄
  │    ├─ Audit log write (fire-and-forget via audit.ts helper)
  │    └─ Response (JSON — never raw HTML except OAuth + legal pages)
  │
  └─ Nitro error handler
       ├─ createError() → structured JSON with statusCode + statusMessage
       └─ Unknown error → 500 generic "Eroare internă" + full stack logged server-side only
```

**Where each concern lives:**
- Security headers: `app/server/middleware/security-headers.ts`
- CSRF: `app/server/middleware/csrf.ts` + `nuxt-csurf` or double-submit cookie
- Rate limiting: `app/server/middleware/rate-limit.ts` (backed by `rate_limits` table)
- Admin auth + IP binding: `app/server/middleware/admin-auth.ts` + `app/server/utils/assert-admin-session.ts`
- Audit log: `app/server/middleware/audit.ts` + `app/server/utils/audit.ts`
- Job ownership: `app/server/utils/assert-job-access.ts`
- Env validation (Zod at boot): `app/server/utils/env.ts`
- Stripe: `app/server/utils/stripe.ts`
- SmartBill: `app/server/utils/smartbill.ts`
- Queue (pg-boss): `app/server/utils/queue.ts`
- Email (Resend): `app/server/utils/email.ts`
- Google OAuth: `app/server/utils/google-oauth.ts`

Handlers should focus ONLY on business logic. Everything else is handled by the pipeline.

---

## 2. Error Handling

### Golden rule: never let an error reach the user as a stack trace.

### Failure Tiers

Not all errors are equal. Classify before handling:

| Tier | Examples | Pattern |
|------|----------|---------|
| **Critical** | Auth failure, DB connection lost, missing env var | `throw` — stops execution, Nitro handler logs + returns 500 |
| **Important** | Expected 4xx (not found, forbidden, invalid input, payment declined) | `throw createError({ statusCode, statusMessage })` — logged as `warn`, user sees message |
| **External API** | Stripe 5xx, SmartBill 5xx, Anthropic 5xx | Catch, log, retry with backoff, throw `createError({ statusCode: 502 })` if retries exhausted |
| **Best-effort** | Audit log write, usage tracking, email send | `.catch(err => event.context.logger.error(...))` — logged, execution continues |

**Handlers throw `createError`** — the Nitro error handler formats the response:

```typescript
import { createError } from 'h3';

// GOOD — expected 4xx with Romanian user message
throw createError({
  statusCode: 404,
  statusMessage: 'Dosarul nu a fost găsit.',
  data: { code: 'job_not_found' },
});

throw createError({
  statusCode: 403,
  statusMessage: 'Acces interzis.',
  data: { code: 'forbidden' },
});

throw createError({
  statusCode: 400,
  statusMessage: 'Fișierul trebuie să fie .zip, .7z sau .rar.',
  data: { code: 'invalid_file_type' },
});

// Never return error objects like { error: 'x', message: 'y' } from handlers.
// Throw instead — the router formats the response.
```

**Never** use bare `try/catch` that swallows errors silently. If you catch, either re-throw or log:

```typescript
// GOOD — catch, log, re-throw as createError
try {
  await stripe.paymentIntents.create(...);
} catch (err) {
  event.context.logger.error({ err, context: 'stripe' }, 'Stripe payment intent failed');
  throw createError({ statusCode: 502, statusMessage: 'Eroare la procesatorul de plăți.' });
}

// BAD — silent swallow
try {
  await stripe.paymentIntents.create(...);
} catch {}
```

The **only** acceptable silent catch is for best-effort async operations (audit logs, metrics):

```typescript
void db.insert(auditLog).values(entry).catch((err) => {
  logger.error({ err }, 'Audit log write failed');
});
```

### Process-level safety nets

Configured in `app/server/plugins/process-handlers.ts`:

```typescript
process.on('unhandledRejection', (reason) => logger.error({ reason }, 'unhandledRejection'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException');
  process.exit(1);  // crash on uncaught — container restarts
});
```

---

## 3. Input Validation (Zod)

**All Nitro handlers validate input via `readValidatedBody`, `getValidatedQuery`, `getValidatedRouterParams`.**

### How it works:

1. Define a Zod schema co-located with the handler (or in `app/server/schemas/` if reused)
2. Use H3's validated helpers — they throw H3 validation errors (400) automatically on failure
3. Handlers receive **already-validated** input — no manual re-checks

### Rules:

- **Every mutation endpoint** validates its body with a Zod schema
- **Every handler that reads URL/query params** validates them (prevents invalid UUIDs, path traversal, enumeration)
- **Use `.uuid()` on all ID fields** — prevents injection and ensures format
- **Use `.regex()` with custom Romanian error messages** for domain formats (CIF, IBAN, case number)
- **Use `.default()` for optional fields** with sensible defaults
- **Use `.enum()` for restricted values** (job states, payment statuses, mapping tiers)
- **Cap string lengths** with `.max()` to prevent oversized payloads
- **Reject unknown keys** with `.strict()` on body schemas to catch prototype pollution + enumeration

```typescript
// app/server/api/jobs/index.post.ts
import { z } from 'zod';

const CreateJobBodySchema = z.object({
  sourceSoftware: z.enum(['winmentor']),
  targetSoftware: z.enum(['saga']),
  billingEmail: z.string().email().max(200).optional(),
}).strict();

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, CreateJobBodySchema.parse);
  // body is typed + validated — use directly
});
```

### File upload validation

```typescript
// Max size enforced at TWO layers:
// 1. Caddy: request_body max_size 500M
// 2. Nitro: { maxBytes: 500 * 1024 * 1024 } on the route

// Filename:
// - Stripped to basename (no paths)
// - Stored as {uuid}.{ext} server-side
// - Magic byte check — verify file header matches extension
// - Allowed: .zip, .7z, .rar

import { fileTypeFromBuffer } from 'file-type';

const buffer = await readMultipartFormData(event);
const detected = await fileTypeFromBuffer(buffer);
if (!detected || !['zip', '7z', 'rar'].includes(detected.ext)) {
  throw createError({ statusCode: 400, statusMessage: 'Tip de fișier invalid.' });
}
```

---

## 4. Logging

**Use Nitro's built-in logger** (`event.context.logger` or a module-level pino instance). Never `console.log`.

### Levels and when to use them:

| Level | When |
|-------|------|
| `fatal` | Process is about to crash |
| `error` | Unexpected failure, needs investigation |
| `warn` | Expected failure (bad input, auth denied, 4xx thrown) |
| `info` | Successful operations, request lifecycle, queue publishes |
| `debug` | Development-only detail |

### How to log:

```typescript
// ALWAYS structured, NEVER string interpolation:
logger.info({ jobId, userId: session?.userId, stage: 'upload_complete' }, 'Job upload complete');
logger.error({ err, jobId }, 'Conversion failed');

// NOT: logger.info(`Job ${jobId} completed`);
```

### What to log:

- Every request (via Nitro's built-in request logger) with path, method, status, duration, user/admin/anonymous identity marker
- Every mutation outcome (success + failure) — with the entity ID, event type, duration
- Auth failures — with IP hash, attempted route
- External API calls — Stripe, SmartBill, Anthropic, Resend — with duration and status
- Queue publish/consume — job ID, job type, payload size (not payload content)
- Admin actions — ALWAYS via `logAdminAction`, which writes to `admin_audit_log` synchronously (not best-effort)

### What NEVER to log:

- Passwords, magic link tokens, session IDs, OAuth access/refresh tokens, CSRF tokens
- API keys (Stripe, SmartBill, Anthropic, Google, Resend)
- File contents (uploaded ZIPs, extracted .DB files, converted SAGA files)
- Full request/response bodies (log metadata only)
- **Plaintext emails.** Always hash: `sha256(email).slice(0, 8)`
- **Plaintext CIFs.** Always redact: `RO*****` (preserve prefix, blank digits)
- Personal accountant data beyond the hashed identifier

### Production vs Development:

- **Dev**: pino-pretty via `pino-pretty` module, `debug` level
- **Prod**: JSON output to stdout (Docker logging driver → journald → optional forward to BetterStack/Axiom), `info` level

---

## 5. Types and Shared Modules

### Shared types in `app/server/types/`:

```typescript
// app/server/types/session.ts
export interface UserSession {
  userId: string;
  email: string;
  emailHashed: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface AdminSession {
  sessionId: string;
  email: string;        // Google-verified, allowlisted
  expiresAt: Date;
  ipHash: string;       // bound
}

// app/server/types/queue.ts
export interface ConvertJobPayload {
  jobId: string;
  inputPath: string;     // /data/jobs/{id}/upload
  outputPath: string;    // /data/jobs/{id}/output
  mappingProfileId?: string;
}

export interface DiscoverJobPayload {
  jobId: string;
  inputPath: string;
}
```

**Every Nitro handler** that needs the session imports `UserSession` / `AdminSession` from `types/session.ts` — no local definitions.

**Every queue publish/consume** uses the shared payload type. The Python worker mirrors these in `worker/src/migrator/queue_types.py` as Pydantic models. **Divergence is a bug.**

---

## 6. Database (Drizzle)

### Drizzle schema is the source of truth

`app/server/db/schema.ts` defines every table, column, index, relation. Changes flow:

1. Edit `schema.ts`
2. `npm run drizzle:generate` → produces `app/drizzle/NNNN_*.sql`
3. Review the generated SQL
4. `npm run db:migrate` to apply locally
5. Commit both `schema.ts` diff and the generated SQL file

### Parameterized queries — always:

```typescript
// GOOD — Drizzle generates parameterized SQL
await db.select().from(jobs).where(eq(jobs.id, jobId));

// GOOD — raw sql template with parameters when Drizzle can't express it
import { sql } from 'drizzle-orm';
const result = await db.execute(
  sql`SELECT COUNT(*) FROM jobs WHERE created_at > ${cutoff} AND status = ${status}`
);

// BAD — string interpolation in SQL
await db.execute(sql.raw(`SELECT * FROM jobs WHERE id = '${jobId}'`));
```

### Scoping — every user-touching query is ownership-verified

For user-facing endpoints: `assertJobAccess(jobId, event)` runs FIRST, returns the job row. Subsequent queries use that job.

For cross-job queries (admin only): `assertAdminSession(event)` runs in middleware, then the handler calls `logAdminAction` before querying. No bypasses.

```typescript
// GOOD — ownership verified before access
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().uuid() }).parse);
  const job = await assertJobAccess(id, event);  // throws 403 / 404 on failure
  return { job };
});

// BAD — direct lookup without ownership check
export default defineEventHandler(async (event) => {
  const id = event.context.params!.id;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  return { job };  // anyone with a guessable ID could read this
});
```

### Connection pooling

- Single Postgres pool (Drizzle's default) — max 20 connections for Nuxt
- Python worker has its own pool via `asyncpg` — max 10 connections
- Never create pools inside request handlers

### Transactions — use the Drizzle `transaction` pattern

When a handler performs multiple writes that must succeed or fail together:

```typescript
import { db } from '../db/client';

const result = await db.transaction(async (tx) => {
  const [job] = await tx
    .insert(jobs)
    .values({ ... })
    .returning();

  await tx.insert(auditLog).values({
    jobId: job.id,
    event: 'job_created',
    details: { ... },
  });

  return job;
});
```

**When to use transactions:**
- Stripe webhook handler: mark job PAID + publish pg-boss job + record stripe_fee must be atomic (or at least: idempotent via `stripe_events` dedup)
- Admin refund: Stripe refund + SmartBill storno + payment status update
- GDPR deletion: null user references across multiple tables

**When NOT to use transactions:**
- Single-query operations (the query is already atomic)
- Read-only queries
- Fire-and-forget operations (audit logs, metrics) — those tolerate eventual consistency

### Dynamic WHERE clauses — use Drizzle builders with whitelists

```typescript
// GOOD — explicit column map, safe filter building
import { and, eq, gte, lte, ilike } from 'drizzle-orm';

const conditions = [];
if (filters.status) conditions.push(eq(jobs.status, filters.status));
if (filters.from)   conditions.push(gte(jobs.createdAt, filters.from));
if (filters.to)     conditions.push(lte(jobs.createdAt, filters.to));
if (filters.email)  conditions.push(ilike(users.email, `%${filters.email}%`));

const rows = await db
  .select()
  .from(jobs)
  .leftJoin(users, eq(users.id, jobs.userId))
  .where(and(...conditions))
  .limit(limit)
  .offset(offset);

// BAD — interpolating column names from user input
const col = request.body.sortBy;  // user-controlled!
await db.execute(sql.raw(`SELECT * FROM jobs ORDER BY ${col}`));
```

### Schema-aligned tests

Tests against mocked DB hide column name drift. Every test file that touches a table MUST assert the Drizzle schema has the columns the test queries. See TESTING.md.

### setInterval safety — max 2^31-1 ms (~24.8 days)

JavaScript `setInterval` uses a 32-bit signed integer for the delay. Values > 2,147,483,647 ms overflow and fire immediately in an infinite loop.

```typescript
// WRONG — 30 days > 2^31-1 ms → fires every ~1ms
setInterval(fn, 30 * 24 * 60 * 60 * 1000);

// RIGHT — cap at 24 days, or use pg-boss schedule() instead
const MAX_INTERVAL = 24 * 24 * 60 * 60 * 1000;
setInterval(fn, Math.min(desiredMs, MAX_INTERVAL));
```

For periodic tasks spanning more than 24 days (file cleanup cron, reconciliation), use `pg-boss schedule()` — it handles the cron-like scheduling natively.

---

## 7. Response Shapes

All Nitro handlers return one of three shapes. Consistency lets clients parse responses predictably.

### Entity response (single item)

```typescript
return {
  job: {
    id: row.id,
    status: row.status,
    progressStage: row.progressStage,
    progressPct: row.progressPct,
    createdAt: row.createdAt,
  },
};
```

### List response (paginated)

```typescript
return {
  items: rows.map(r => ({ ... })),
  total,
  limit,
  offset,
  hasMore: offset + rows.length < total,
};
```

**Pagination contract:**
- Default `limit: 50` (admin lists) or `20` (user lists). Max `100`.
- `offset` is 0-based
- `hasMore` tells the client whether to offer "show more"
- `total` is the unfiltered count for the current query

### Action response (mutation)

```typescript
return {
  success: true,
  message: 'Plata a fost confirmată.',
  jobId: job.id,
};
```

---

## 8. External API Patterns

### Retry with backoff

For external APIs (Stripe, SmartBill, Anthropic, Resend), use this pattern — or `tenacity` in Python:

```typescript
import { setTimeout as sleep } from 'node:timers/promises';

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 2,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(30_000),
      });
      // Client errors (4xx) are not retryable — return immediately
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      // Server errors (5xx) — retry with backoff
      if (attempt < maxRetries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      return response;
    } catch (err) {
      if (attempt < maxRetries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw new Error('Unreachable');
}
```

### Error classification

| Type | Examples | Action |
|------|----------|--------|
| **Retryable** | 502, 503, 504, network timeout, ECONNRESET | Retry with backoff (max 2 retries) |
| **Permanent** | 400, 401, 403, 404, 422 | Throw `createError` immediately |
| **Rate-limited** | 429 | Respect `Retry-After` header, then retry once |
| **Signed** | Stripe webhook signature invalid | 400, never retry (attacker or config bug) |

### Timeouts

- External API calls: 30 seconds max (`AbortSignal.timeout(30_000)`)
- DB queries: rely on pool settings (`statement_timeout` in pg)
- pg-boss: handlers have a per-job timeout declared on `subscribe` — 15 minutes for `convert`
- SSE progress endpoint: no timeout on server; client handles reconnect

---

## 9. Naming Conventions

| What | Convention | Example |
|------|-----------|---------|
| Variables, functions | camelCase | `assertJobAccess`, `jobId` |
| Types, interfaces | PascalCase | `UserSession`, `ConvertJobPayload` |
| Files (TS) | kebab-case | `assert-job-access.ts`, `stripe.ts` |
| Files (Python) | snake_case | `paradox.py`, `rule_based.py` |
| DB columns | snake_case | `anonymous_access_token`, `stripe_fee_amount` |
| DB tables | snake_case | `magic_link_tokens`, `admin_audit_log` |
| Env vars | SCREAMING_SNAKE | `STRIPE_SECRET_KEY`, `ADMIN_EMAILS` |
| pg-boss job names | kebab-case | `convert`, `discover`, `cleanup-files` |
| CSS theme tokens | --kebab-case | `--bg-primary`, `--accent-primary` |

### Language:

- **All code in English** — variables, functions, types, files, comments
- **Romanian ONLY in user-facing string literals** — user UI, user emails, accountant-facing error messages
- **English for admin UI** — admin dashboard is for Dani; English is more precise for operational tooling
- **No Romanian in identifiers** — never `dosar`, `contabil`, `factura` in code

---

## 10. Code Organization

### File structure:

```
app/                                ← Nuxt 3 root
├── nuxt.config.ts
├── package.json
├── theme/
│   └── index.ts                    ← Design tokens (colors, typography, spacing)
├── components/
│   └── primitives/                 ← Only layer allowed to import @mantine/core
│       ├── Button.vue
│       ├── Input.vue
│       ├── Card.vue
│       ├── Table.vue
│       ├── Badge.vue
│       └── Alert.vue
├── pages/
│   ├── index.vue                   ← Landing (Romanian)
│   ├── upload.vue
│   ├── job/[id]/
│   │   ├── status.vue              ← Mobile-friendly
│   │   ├── discovery.vue
│   │   ├── mapping.vue             ← Desktop-only banner
│   │   ├── pay.vue
│   │   └── result.vue
│   ├── profiles/index.vue
│   ├── account/security.vue
│   ├── auth/
│   │   ├── login.vue
│   │   └── verify.vue
│   ├── legal/
│   │   ├── terms.vue
│   │   ├── privacy.vue
│   │   ├── dpa.vue
│   │   └── refund.vue
│   └── admin/
│       ├── index.vue               ← Dashboard (English)
│       ├── login.vue
│       ├── jobs/
│       │   ├── index.vue
│       │   └── [id].vue
│       ├── payments.vue
│       ├── users/
│       │   ├── index.vue
│       │   └── [id].vue
│       ├── ai.vue
│       ├── profiles.vue
│       ├── audit.vue
│       ├── errors.vue
│       └── settings.vue
├── server/
│   ├── api/
│   │   ├── jobs/                   ← User-facing job endpoints
│   │   ├── auth/                   ← Magic link + Google OAuth
│   │   ├── me/                     ← GDPR endpoints
│   │   ├── admin/                  ← Admin-only mutations + reads
│   │   └── webhooks/
│   │       ├── stripe.post.ts
│   │       └── smartbill.post.ts
│   ├── middleware/
│   │   ├── security-headers.ts     ← HSTS, CSP, X-Frame, Referrer-Policy, Permissions-Policy
│   │   ├── csrf.ts                 ← CSRF verify (exempt webhooks)
│   │   ├── rate-limit.ts
│   │   ├── admin-auth.ts           ← /admin/* + /api/admin/* guard
│   │   └── audit.ts                ← request-scoped audit helpers
│   ├── db/
│   │   ├── schema.ts               ← Drizzle schema (source of truth)
│   │   └── client.ts               ← pool + db instance
│   ├── utils/
│   │   ├── queue.ts                ← pg-boss publisher
│   │   ├── stripe.ts               ← Stripe client + helpers
│   │   ├── smartbill.ts            ← SmartBill client + helpers
│   │   ├── google-oauth.ts
│   │   ├── auth-user.ts            ← magic link + user session
│   │   ├── auth-admin.ts           ← admin session + IP binding
│   │   ├── assert-job-access.ts
│   │   ├── assert-admin-session.ts
│   │   ├── audit.ts                ← logAudit + logAdminAction
│   │   ├── env.ts                  ← Zod-validated env at boot
│   │   └── email.ts                ← Resend client
│   ├── schemas/                    ← Shared Zod schemas (if reused across routes)
│   ├── types/                      ← Shared TypeScript types (session, queue payloads)
│   └── plugins/
│       └── process-handlers.ts     ← unhandledRejection, uncaughtException
├── drizzle/                        ← Generated migration SQL (committed)
└── locales/
    ├── ro.json
    └── en.json

worker/                             ← Python worker
├── pyproject.toml
├── Dockerfile
├── src/migrator/
│   ├── __init__.py
│   ├── cli.py                      ← standalone CLI for manual runs
│   ├── consumer.py                 ← pg-boss subscriber (production entrypoint)
│   ├── queue_types.py              ← Pydantic models mirroring app/server/types/queue.ts
│   ├── extractor.py                ← archive extraction + file discovery
│   ├── parsers/
│   │   ├── paradox.py              ← pypxlib-based parser
│   │   ├── winmentor.py            ← WinMentor-specific logic
│   │   └── registry.py             ← TABLE_REGISTRY (NPART, NART, etc.)
│   ├── canonical/                  ← Pydantic canonical schema
│   ├── mappers/
│   │   ├── rule_based.py           ← deterministic ~80% coverage
│   │   └── ai_assisted.py          ← Haiku fallback + mapping_cache
│   ├── generators/
│   │   ├── saga_xml.py
│   │   └── saga_dbf.py
│   ├── reports/
│   │   └── conversion_report.py    ← report.json + report.pdf
│   └── utils/
│       ├── archive.py              ← zip bomb protection, path validation
│       └── version.py              ← worker_version, canonical_schema_version
├── tests/
└── samples/                        ← gitignored
```

### Import order (TypeScript):

1. Node built-ins (`node:path`, `node:crypto`)
2. External packages (`zod`, `drizzle-orm`, `stripe`)
3. Internal modules (`../db/client`, `../types/session`)

### Import order (Python):

1. Standard library (`pathlib`, `zipfile`, `json`)
2. Third-party (`pydantic`, `pypxlib`, `anthropic`)
3. Local (`from migrator.parsers import paradox`)

### Adding a new Nitro API endpoint:

1. Place the handler under the correct `app/server/api/...` subtree
2. Define a Zod schema inline (or in `app/server/schemas/` if shared)
3. Validate via `readValidatedBody` / `getValidatedQuery` / `getValidatedRouterParams`
4. For `/api/jobs/[id]/*`: call `assertJobAccess(id, event)` FIRST
5. For `/api/admin/*`: middleware already enforces `assertAdminSession`; handler calls `logAdminAction(session, action, target)` before or after the business logic
6. Write Layer 1 + Layer 2 tests (see TESTING.md)
7. Update `docs/ARCHITECTURE.md` route table

---

## 11. Resource Management

### Shutdown cleanup (Nuxt)

Nitro handles most cleanup automatically. Add custom hooks for:

- Close pg-boss subscriber loop (flush in-flight publishes)
- Close Drizzle pool (`await pool.end()`)
- Close Redis / cache clients if added later

```typescript
// app/server/plugins/shutdown.ts
import { pool } from '../db/client';
import { boss } from '../utils/queue';

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hookOnce('close', async () => {
    await boss.stop();
    await pool.end();
  });
});
```

### Shutdown cleanup (Python worker)

```python
# worker/src/migrator/consumer.py
import signal

def handle_shutdown(sig, frame):
    logger.info("Shutdown signal received")
    # pg-boss finishes current job, stops polling
    loop.call_soon_threadsafe(stop_event.set)

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)
```

### Memory bounds

- Nuxt body size: 500 MB (upload endpoint only, otherwise 1 MB)
- Worker memory: 1 GB hard cap (Docker `mem_limit`)
- Worker CPU: 1 core (Docker `cpus`)
- Worker per-job timeout: 15 minutes hard kill
- Paradox parsing: stream records, never load entire .DB into memory
- pg-boss batch size: 5 per poll (worker processes one at a time)

---

## 12. Security Checklist (per endpoint or module)

Before marking any handler/module as done:

- [ ] Inputs validated via Zod schema (body + query + params)
- [ ] Mutation endpoints enforce CSRF (not in exempt list unless webhook)
- [ ] Job endpoints call `assertJobAccess(jobId, event)` FIRST
- [ ] Admin endpoints call `assertAdminSession(event)` + `logAdminAction`
- [ ] All DB access via Drizzle or parameterized `sql` template
- [ ] No string interpolation in SQL
- [ ] No PII in logs (emails hashed, CIFs redacted, file contents never)
- [ ] Session cookies: HttpOnly + Secure + correct SameSite
- [ ] Errors thrown as `createError`, Romanian messages for users
- [ ] Rate limits applied per SPEC §S.10 where the endpoint is listed
- [ ] Stripe webhook: signature verified, replay rejected (>5 min), dedup via `stripe_events`
- [ ] Python worker: path validation + zip bomb limits + non-root execution
- [ ] Theme discipline: no hardcoded colors outside `app/theme/`, no direct `@mantine/core` outside `app/components/primitives/`

---

## 13. Security — Hardened Patterns

**Read `SECURITY_REVIEWER.md` for the full audit playbook. These are the rules derived from security audits.**

### 13.1 Environment Variables — Fail Hard

Required env vars MUST throw on startup if missing. Never use fallback defaults for secrets. Validate via Zod in `app/server/utils/env.ts` — imported at boot.

```typescript
// app/server/utils/env.ts
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
  SMARTBILL_USERNAME: z.string(),
  SMARTBILL_TOKEN: z.string(),
  ANTHROPIC_API_KEY: z.string().startsWith('sk-'),
  RESEND_API_KEY: z.string().startsWith('re_'),
  GOOGLE_OAUTH_CLIENT_ID: z.string(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string(),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().url(),
  ADMIN_EMAILS: z.string().min(1).transform(s => s.split(',').map(e => e.trim().toLowerCase())),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  EMAIL_HASH_SALT: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
});

export const env = EnvSchema.parse(process.env);
```

Any missing env → process fails to boot. No silent defaults.

### 13.2 CSRF — Mandatory on Every Mutation

Every POST/PUT/PATCH/DELETE endpoint MUST verify CSRF. Webhooks (`/api/webhooks/*`) are exempted — they verify via provider signature.

```typescript
// app/server/middleware/csrf.ts — runs before handlers
import { env } from '../utils/env';

export default defineEventHandler(async (event) => {
  const method = getMethod(event);
  if (method === 'GET' || method === 'HEAD') return;

  const url = getRequestURL(event);
  if (url.pathname.startsWith('/api/webhooks/')) return;  // exempt

  const token = getHeader(event, 'x-csrf-token');
  const cookie = getCookie(event, 'csrf-token');
  if (!token || !cookie || !timingSafeEqual(Buffer.from(token), Buffer.from(cookie))) {
    throw createError({ statusCode: 403, statusMessage: 'CSRF invalid.' });
  }
});
```

Admin routes also require CSRF — no exceptions.

### 13.3 HTML Escaping — For Any Server-Rendered HTML

Vue escapes by default. But for OAuth pages, legal pages, or emails, always escape interpolated values:

```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// NEVER use v-html with user-controlled content. Ever.
```

### 13.4 SQL Identifiers — Never Interpolate User Input

Drizzle handles this correctly by default. Only risk: `sql.raw()` or dynamic column names from the client. Whitelist with a `Map`:

```typescript
const ALLOWED_SORT_COLUMNS = new Map<string, typeof jobs.createdAt>([
  ['createdAt', jobs.createdAt],
  ['status', jobs.status],
  ['amount', jobs.uploadSize],
]);

const col = ALLOWED_SORT_COLUMNS.get(requestedSort);
if (!col) throw createError({ statusCode: 400, statusMessage: 'Coloană invalidă.' });

await db.select().from(jobs).orderBy(col);
```

Never accept `ORDER BY ${userInput}` via string interpolation.

### 13.5 Token Storage — Hash, Don't Store Plaintext

```typescript
import { createHash } from 'node:crypto';

// GOOD — magic link tokens stored hashed
const token = crypto.randomBytes(32).toString('hex');
const tokenHash = createHash('sha256').update(token).digest('hex');
await db.insert(magicLinkTokens).values({ userId, tokenHash, expiresAt });
// Send `token` via email. Only the hash lives in DB.

// GOOD — anonymous job access tokens also hashed (or kept constant-time-compared)
// Admin OAuth refresh tokens: we don't store them — Google is the source of truth
```

User session IDs are opaque random strings stored in `sessions.id` — no secret material is serialized there.

### 13.6 Rate Limiting — Fail Closed for Security Paths

Auth failure rate limiter (magic link requests, admin login attempts) MUST fail closed if the backing store is unavailable:

```typescript
if (!rateLimitStoreAvailable) {
  // Deny for security-critical paths
  throw createError({ statusCode: 503, statusMessage: 'Serviciu temporar indisponibil.' });
}
```

Other limits (GET traffic) MAY fail open.

Limits per SPEC §S.10:

| Endpoint | Limit | Key |
|---|---|---|
| `POST /api/jobs` | 10/hour | IP |
| `PUT /api/jobs/[id]/upload` | 3/hour | IP |
| `POST /api/auth/magic-link` | 5/hour | email |
| `GET /admin/login` | 10/hour | IP |
| Other GETs | 300/min | IP |
| Other mutations | 60/min | session or IP |

### 13.7 Session Binding — Admin Sessions Are IP-Bound

```typescript
// app/server/utils/assert-admin-session.ts
import { env } from './env';
import { ipHash } from './hash';

export async function assertAdminSession(event: H3Event): Promise<AdminSession> {
  const sessionId = getCookie(event, 'admin_session');
  if (!sessionId) throw createError({ statusCode: 401 });

  const [row] = await db.select().from(adminSessions).where(eq(adminSessions.id, sessionId));
  if (!row || row.revokedAt || row.expiresAt < new Date()) {
    throw createError({ statusCode: 401 });
  }

  // IP binding — any change forces re-auth
  const currentIpHash = ipHash(getRequestIP(event, { xForwardedFor: true }) ?? '');
  if (!timingSafeEqual(Buffer.from(row.ipHash), Buffer.from(currentIpHash))) {
    await db.update(adminSessions).set({ revokedAt: new Date() }).where(eq(adminSessions.id, sessionId));
    throw createError({ statusCode: 401, statusMessage: 'Sesiune invalidată — IP schimbat.' });
  }

  // Allowlist check — email must still be in ADMIN_EMAILS
  if (!env.ADMIN_EMAILS.includes(row.email.toLowerCase())) {
    await db.update(adminSessions).set({ revokedAt: new Date() }).where(eq(adminSessions.id, sessionId));
    throw createError({ statusCode: 403 });
  }

  return { sessionId: row.id, email: row.email, expiresAt: row.expiresAt, ipHash: row.ipHash };
}
```

### 13.8 Job Access — Three-Way Ownership Check

```typescript
// app/server/utils/assert-job-access.ts
export async function assertJobAccess(jobId: string, event: H3Event) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
  if (!job) throw createError({ statusCode: 404 });

  // 1. Admin session — access + log
  const admin = await getAdminSession(event);  // returns null if not admin
  if (admin) {
    await logAdminAction(admin, 'job_access', jobId);
    return job;
  }

  // 2. User session — must own the job
  const user = await getUserSession(event);
  if (user && job.userId === user.userId) return job;

  // 3. Anonymous access token — constant-time compare
  const cookieToken = getCookie(event, `job_access_${jobId}`);
  const headerToken = getHeader(event, 'x-job-token');
  const provided = cookieToken ?? headerToken;
  if (provided && timingSafeEqual(Buffer.from(provided), Buffer.from(job.anonymousAccessToken))) {
    return job;
  }

  throw createError({ statusCode: 403 });
}
```

### 13.9 Bcrypt Rounds

Not used for user passwords (we use magic link). If reintroduced later, minimum 12 rounds.

### 13.10 Security Headers

`app/server/middleware/security-headers.ts` sets:

- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")`
- `Content-Security-Policy` — strict, no `unsafe-inline`, no `unsafe-eval`. Allow `js.stripe.com`, `accounts.google.com`, SmartBill origin if needed.

### 13.11 Audit Trail Integrity

Two separate audit logs — see SPEC §S.12:

**`audit_log`** (user actions): job lifecycle, auth events, payments, data access, profile share. 2-year retention. Anonymized on user deletion.

**`admin_audit_log`** (admin actions): admin login attempts (success + failure), every customer data view, every mutation. IP hash, user agent, timestamp. **Retained indefinitely. Never purged. Never editable.**

Every admin handler MUST call:

```typescript
await logAdminAction(session, 'refund_issued', jobId, { amount, reason });
```

`logAdminAction` writes synchronously (not fire-and-forget) so the action never happens without the log.

### 13.12 GDPR

- Only PII collected: email (hashed for lookups via `EMAIL_HASH_SALT`).
- File contents never indexed or logged.
- Auto-deletion: job folders after 30 days. Mapping profiles retained without company data.
- `DELETE /api/me` → purges user data, 24-hour SLA.
- `GET /api/me/export` → JSON dump.
- DPA at `/legal/dpa`. Privacy at `/legal/privacy`. Refund at `/legal/refund`.

---

## 14. Testing

**Read `TESTING.md` before writing any test.** It defines the Two-Layer Rule: every test file must cover both functional correctness AND security/integrity for its module type.

Quick summary (see `TESTING.md` for full details and code examples):

- **Zod schemas:** valid/invalid inputs + SQL injection payloads + XSS payloads + oversized inputs + prototype pollution + unicode edge cases
- **Nitro handlers:** correct results + CSRF rejection + `assertJobAccess` rejection (no token / wrong token) + admin allowlist rejection + Zod validation errors + audit log written + no PII leakage
- **Middleware:** correct pass/block behavior + bypass attempts + rate limit fail-closed for auth paths
- **Stripe webhook:** signature verify + replay rejection (>5 min) + dedup (duplicate event ID) + idempotent side effects
- **Drizzle schema:** generated SQL matches schema.ts (snapshot test)
- **Python worker:** parser correctness + zip bomb rejection + path traversal rejection + encoding (CP852/CP1250) edge cases + ReDoS resistance on regex extractors
- **AI mapping:** cache hit path + cache miss path + malformed Haiku response rejected + cost tracking recorded in `ai_usage`
- **Auth:** magic link single-use + expiry + hashed storage + session cookie flags + admin IP binding + admin allowlist enforcement + OAuth state/PKCE verification

A test file that only covers happy paths is incomplete and must not be merged.

### Schema-aligned tests — verify queries match Drizzle schema

```typescript
import { jobs } from '../db/schema';

it('query references existing Drizzle columns', () => {
  // If someone renames jobs.progressStage → jobs.progress_stage, this breaks
  expect(jobs.progressStage).toBeDefined();
  expect(jobs.progressPct).toBeDefined();
});
```

### Response shape tests — verify API → frontend contract

```typescript
it('GET /api/admin/jobs returns { items, total, limit, offset, hasMore }', async () => {
  const result = await listJobsHandler(mockEvent);
  expect(result).toHaveProperty('items');
  expect(result).toHaveProperty('total');
  expect(result).toHaveProperty('hasMore');
  expect(result).not.toHaveProperty('jobs');  // wrong key — frontend reads .items
});
```

---

## 15. Dependencies

- **No new dependencies** without explicit task approval
- **No ORMs other than Drizzle** — raw `pg` pool + Drizzle only
- **Zod** for all input validation (Nitro bodies/query/params, env, queue payloads)
- **Pino** (Nitro default) for all logging
- **pg-boss** for queue — no Redis, no BullMQ
- **Mantine v7+** for UI primitives (via `app/components/primitives/`)
- **nuxt-auth-utils** for Google OAuth flow
- **nuxt-csurf** or custom double-submit for CSRF (whichever the task selects — decide once, don't mix)
- **Resend** for email
- **Stripe SDK** for payments
- **SmartBill** — custom REST client (no official SDK)
- Python worker:
  - **pypxlib** for Paradox (+ custom fallback parser for non-standard files)
  - **pydantic v2** for schemas
  - **anthropic** for Haiku
  - **tenacity** for retries
  - **structlog** for logging
  - **asyncpg** for Postgres access inside the worker

---

## 16. Security Audits

- **Playbook:** `SECURITY_REVIEWER.md` — the full checklist for auditing the codebase
- **Audit logs:** `audit/audit-log-[YYYY-MM-DD]-[description].md` — one per audit
- **Cadence:** Monthly full audit, per-change targeted audit (see `SECURITY_REVIEWER.md` for triggers)
- **Rule:** When a vulnerability is found, write the audit log FIRST, then update this file with the prevention rule

---

## 17. Python Worker

The Rapidport Python worker runs as a standalone service in Docker. It subscribes to pg-boss, reads from a shared `/data/jobs/` volume, parses WinMentor Paradox files, maps fields to the canonical schema (rules + Haiku fallback), generates SAGA-compatible files, and writes a conversion report.

### 17.1 Project Structure

```
worker/
├── pyproject.toml
├── Dockerfile
├── src/migrator/
│   ├── __init__.py
│   ├── cli.py                ← standalone CLI for manual runs + local dev
│   ├── consumer.py           ← pg-boss subscriber (production entrypoint)
│   ├── queue_types.py        ← Pydantic models matching app/server/types/queue.ts
│   ├── extractor.py          ← archive extraction + file discovery
│   ├── parsers/
│   │   ├── paradox.py        ← pypxlib-based parser
│   │   ├── winmentor.py      ← WinMentor-specific logic (CP852, version detect)
│   │   └── registry.py       ← TABLE_REGISTRY
│   ├── canonical/            ← Pydantic canonical schema (Partner, Article, JournalEntry, etc.)
│   ├── mappers/
│   │   ├── rule_based.py     ← deterministic ~80% coverage
│   │   └── ai_assisted.py    ← Haiku fallback + mapping_cache
│   ├── generators/
│   │   ├── saga_xml.py
│   │   └── saga_dbf.py
│   ├── reports/
│   │   └── conversion_report.py  ← report.json + report.pdf
│   └── utils/
│       ├── archive.py        ← zip bomb protection, path validation
│       ├── version.py        ← worker_version + canonical_schema_version
│       ├── db.py             ← asyncpg pool
│       └── log.py            ← structlog setup
└── tests/
```

### 17.2 pyproject.toml — Essentials

```toml
[project]
name = "rapidport-migrator"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "pypxlib>=0.5",
    "pydantic>=2.7",
    "anthropic>=0.30",
    "tenacity>=9.0",
    "structlog>=24.0",
    "asyncpg>=0.29",
    "pg-boss-py>=0.1",   # or the equivalent consumer library selected in Phase 1
    "reportlab>=4.0",     # for report.pdf
]

[project.optional-dependencies]
dev = ["pytest>=8.0", "pytest-asyncio>=0.23", "ruff>=0.6", "mypy>=1.10"]
```

### 17.3 Error Handling

```python
# Specific exception types per module
class ArchiveError(Exception): ...
class ParadoxParseError(Exception): ...
class MappingError(Exception): ...
class GenerationError(Exception): ...

# Top-level consumer catches and marks job failed with reason
async def handle_convert_job(job: Job) -> None:
    job_id = job.data["job_id"]
    try:
        await run_conversion(job_id)
    except (ArchiveError, ParadoxParseError, MappingError, GenerationError) as e:
        logger.warning("job_failed", job_id=job_id, reason=str(e), exc_type=type(e).__name__)
        await mark_job_failed(job_id, reason=str(e))
    except Exception as e:
        logger.error("job_crashed", job_id=job_id, exc_info=True)
        await mark_job_failed(job_id, reason="internal_error")
        raise  # let pg-boss retry per policy
```

**Rules:**
- Never bare `except:` — always specific types or `Exception as e` with logging
- `.unwrap()`-equivalent patterns (`assert`, `dict[key]`, `list.pop()` without guards) forbidden in production paths
- Use `raise ... from err` to preserve cause chains

### 17.4 Logging (structlog)

```python
import structlog

logger = structlog.get_logger()

logger.info(
    "conversion_started",
    job_id=job_id,
    source_software="winmentor",
    source_version=detected_version,
)
```

**Rules:**
- JSON output to stdout (captured by Docker logging driver)
- Never log file paths containing customer names — log `/data/jobs/{uuid}/...` only
- Never log PII (email, CIF in clear) — hash emails, redact CIFs
- Never log token counts that could leak AI prompt content — metadata only

### 17.5 Path Validation — Security Critical

Every file operation validates the path is within the job directory:

```python
from pathlib import Path

def validate_path(requested: Path, job_root: Path) -> Path:
    resolved = requested.resolve(strict=False)
    job_resolved = job_root.resolve()
    if not resolved.is_relative_to(job_resolved):
        raise ArchiveError(f"Path outside job directory: {requested}")
    return resolved
```

**Call `validate_path` before:**
- Reading any file inside the job directory
- Writing any output file
- Extracting archive members
- Any operation that touches the filesystem based on parsed data

### 17.6 Zip Bomb Protection

Per SPEC §S.6:

```python
import zipfile
from pathlib import Path

MAX_RATIO = 50          # compressed → uncompressed
MAX_TOTAL_SIZE = 5 * 1024**3  # 5 GB
MAX_ENTRIES = 10_000

def validate_archive_safe(archive: Path) -> None:
    with zipfile.ZipFile(archive) as zf:
        if len(zf.namelist()) > MAX_ENTRIES:
            raise ArchiveError("too_many_entries")
        total_uncompressed = 0
        total_compressed = archive.stat().st_size
        for info in zf.infolist():
            if info.filename.startswith('/') or '..' in Path(info.filename).parts:
                raise ArchiveError(f"unsafe_entry:{info.filename}")
            if info.create_system == 3 and (info.external_attr >> 16) & 0xF000 == 0xA000:
                raise ArchiveError("symlink_forbidden")
            total_uncompressed += info.file_size
            if total_uncompressed > MAX_TOTAL_SIZE:
                raise ArchiveError("archive_too_large")
        if total_compressed and total_uncompressed / total_compressed > MAX_RATIO:
            raise ArchiveError("compression_ratio_suspicious")
```

7z and rar need similar per-library checks — see `worker/src/migrator/utils/archive.py`.

### 17.7 Paradox Parser Details

- Standard `.DB` + `.MB` via `pypxlib`
- Non-standard tables: custom binary fallback (proven on BUGET1.DB)
  - Bytes 0–1: record size
  - Bytes 2–3: header size
  - Field names: null-terminated strings in header
  - Field types: (type + size) pairs
  - Data section starts at `header_size` offset
- Encodings: **CP852** primary, **CP1250** fallback — detect by trying decode of known nomenclature fields

### 17.8 Haiku Mapping

- Invoked ONLY when rule-based mapper returns unknown
- Prompt template per SPEC §1.5
- Results stored in `mapping_cache` keyed by `(source_software, table_name, field_name)`
- Every call writes to `ai_usage`: `(job_id, model, tokens_in, tokens_out, cost_usd)`
- Retry via `tenacity`: max 2 retries, exponential backoff, only on 5xx/timeout
- Structured response parse: reject if JSON malformed, reject if `confidence` outside [0,1]

### 17.9 Worker Sandboxing

Per SPEC §S.9:

```dockerfile
# worker/Dockerfile
FROM python:3.12-slim
RUN useradd -m -u 1000 worker
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir -e .
COPY src/ src/
USER worker
CMD ["python", "-m", "migrator.consumer"]
```

docker-compose adds:
- `mem_limit: 1g`
- `cpus: 1.0`
- `networks` with egress only to `postgres` service + Anthropic API via the reverse proxy egress rule
- No `/data/jobs/` write access outside the mounted volume

### 17.10 Typing (mypy strict)

```toml
# pyproject.toml
[tool.mypy]
strict = true
python_version = "3.12"
```

Every public function has type hints. Pydantic models on every boundary.

### 17.11 Security Checklist (Python Worker)

Before marking any worker task as done:

- [ ] All file paths validated via `validate_path()` before access
- [ ] Zip bomb limits enforced (ratio, total size, entries, no symlinks, no absolute paths)
- [ ] No bare `except:` — specific exception types only
- [ ] No `.unwrap()`-equivalent patterns in production paths
- [ ] Haiku calls tracked in `ai_usage` table with accurate token counts
- [ ] `mapping_cache` populated on successful Haiku response — no unbounded repeat calls
- [ ] No file contents logged (only paths, sizes, counts, stages)
- [ ] Non-root execution (`USER worker` in Dockerfile)
- [ ] Memory/CPU/time limits in docker-compose
- [ ] Pydantic validation on pg-boss payload + Haiku response
- [ ] CP852 + CP1250 encoding handled (tests include Romanian diacritics from both)
