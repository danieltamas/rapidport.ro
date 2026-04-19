# SECURITY_REVIEWER.md — Security Audit Playbook

**Read this file before performing any security review.** This is the living checklist for auditing the rapidport.ro codebase. Update it when new attack surfaces, patterns, or best practices are discovered.

**Last audit:** _none yet — pre-Phase-1_
**Open findings:** 0

---

## How to Run a Security Audit

1. Read this file top to bottom
2. Read SPEC §"SECURITY — Baseline Requirements" (sections S.1 through S.13) — it's the law
3. Perform every check in every section below
4. For each finding: create `audit/audit-log-[YYYY-MM-DD]-[description].md`
5. Update the "Open Findings Tracker" section at the bottom of this file
6. Update `CODING.md` if the finding reveals a missing best practice
7. Update this file if the finding reveals a missing check

---

## 1. SQL Injection (Drizzle)

### What to check

- [ ] **Every DB access goes through Drizzle** — `db.select()`, `db.insert()`, `db.update()`, `db.delete()`
- [ ] **Raw SQL only via `sql` template tag with parameters** — `sql\`SELECT ... WHERE x = ${value}\``
- [ ] **No `sql.raw()`** unless the string is 100% developer-constructed with no user input
- [ ] **Dynamic `ORDER BY` / column selection** uses a `Map`/whitelist, never raw user input
- [ ] **LIKE/ILIKE patterns** escape `%` and `_` if user-supplied
- [ ] **Batch inserts** use Drizzle's `values([...])` form, not string concatenation

### How to scan

```bash
# Find raw SQL usage
grep -rn "sql.raw\|sql\`" app/server/ --include='*.ts'

# Find direct template literals in queries (red flag — look for ${ inside sql template)
grep -rn "sql\`" app/server/ --include='*.ts' | grep -v '\${'  # sql templates without params are safe
grep -rn "\\.execute(" app/server/ --include='*.ts'

# Find potential ORDER BY injection
grep -rn "orderBy" app/server/ --include='*.ts'
```

### Known patterns that are safe

- Drizzle builders (`eq`, `and`, `or`, `ilike`, `gte`, `lte`, `inArray`) — all parameterized
- `sql\`... ${value} ...\`` — Drizzle parameterizes `${}` values inside the `sql` tag
- Column selection from a whitelist `Map`

### Known patterns that are NOT safe

- `sql.raw(\`SELECT * FROM jobs WHERE id = '${jobId}'\`)` — string interpolation into raw SQL
- `orderBy(sql.raw(requestBody.sortBy))` — user-controlled column name
- `ilike(jobs.email, \`%${userInput}%\`)` without escaping `%` and `_` in `userInput` (may not be exploit, but can cause accidental full-table scans)

---

## 2. Cross-Site Scripting (XSS)

### What to check

- [ ] **No `v-html` in Vue components** with user-controlled content
- [ ] **OAuth pages** (admin login, callback error) escape `state`, `error`, `error_description`
- [ ] **Email templates** escape every interpolated value (user names, job IDs, error reasons)
- [ ] **Admin pages rendering user data** rely on Vue's default escaping — no `{{{ value }}}` syntax
- [ ] **Status page** (and any page rendering the job's filename back) escapes the filename — it's user-provided
- [ ] **Error messages** never reflect raw user input

### Required escaping function (for non-Vue contexts)

```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

### How to scan

```bash
# v-html usage (should be zero with user content)
grep -rn "v-html" app/ --include='*.vue'

# Server-rendered HTML (OAuth pages, emails)
grep -rn "text/html\|setHeader.*content-type.*html" app/server/ --include='*.ts'

# Template literal HTML construction (often a leak vector)
grep -rn '<.*\${' app/server/ --include='*.ts'
```

---

## 3. CSRF Protection

### What to check

- [ ] **`csrf.ts` middleware runs for every non-GET/HEAD request** except `/api/webhooks/*`
- [ ] **Webhook exempt list contains ONLY `/api/webhooks/*`** — not any other path
- [ ] **Admin routes are CSRF-protected** (no per-route opt-out)
- [ ] **CSRF token** is issued via `Set-Cookie` with `SameSite=Strict`, `Secure=true`, `HttpOnly=false` (client needs to read it)
- [ ] **Server validates `X-CSRF-Token` header against the cookie** via `timingSafeEqual`
- [ ] **Missing or mismatched token → 403 with `CSRF invalid`** — never 500, never silent pass

### How to scan

```bash
# Find the CSRF middleware
cat app/server/middleware/csrf.ts

# Find every mutation route
grep -rn "export default defineEventHandler" app/server/api/ --include='*.post.ts' --include='*.put.ts' --include='*.patch.ts' --include='*.delete.ts'

# Verify none bypass CSRF (should be none)
grep -rn "skipCsrf\|csrf.*false" app/server/ --include='*.ts'
```

### Red flags

- Any route adding `/api/<something>` to the CSRF exempt list other than `/api/webhooks/*`
- Middleware that returns early without validating CSRF for POST/PUT/PATCH/DELETE
- Cookies with `HttpOnly=true` for CSRF token (client can't read → token never sent → all mutations fail → tempting to disable)

---

## 4. Authentication & Authorization

### User Auth (Magic Link + Anonymous Token)

- [ ] **Magic link tokens generated with `crypto.randomBytes(32)`** — 256 bits of entropy
- [ ] **Stored as SHA-256 hash** in `magic_link_tokens.tokenHash` — plaintext never persisted
- [ ] **Single-use** — `usedAt` timestamped on first consumption, subsequent uses rejected
- [ ] **15-minute expiry** enforced on read
- [ ] **Rate limited** — `POST /api/auth/magic-link` = 5/hour per email
- [ ] **Session cookies**: HttpOnly=true, Secure=true, SameSite=Lax, Max-Age=30d, sliding
- [ ] **Session stored in `sessions` table** (not JWT) — enables revocation
- [ ] **Anonymous job access token** = 128+ bits entropy, stored on `jobs.anonymousAccessToken`, compared via `timingSafeEqual`
- [ ] **Anonymous token cookie** scoped to `/job/{id}/*`, HttpOnly, Secure, SameSite=Strict

### Admin Auth (Google OAuth)

- [ ] **Completely separate from user auth** — `admin_sessions` table, `admin_session` cookie, `admin-auth.ts` middleware
- [ ] **OAuth flow uses PKCE** — `code_verifier` stored in `admin_oauth_state`, expires in 10 min
- [ ] **State parameter** generated cryptographically, validated on callback
- [ ] **Email allowlist enforcement** — `ADMIN_EMAILS` env var, lowercase comparison, non-allowed → log to `admin_audit_log` + 403
- [ ] **Session TTL 8 hours** — no silent refresh, Google reauth required to extend
- [ ] **IP binding** — session stores `ipHash`, every request validates current IP matches, mismatch → revoke + 401
- [ ] **Admin session cookie**: HttpOnly=true, Secure=true, SameSite=Strict, Max-Age=8h
- [ ] **`assertAdminSession` is the ONLY way to authorize admin routes** — no direct cookie reads in handlers

### Job Ownership

- [ ] **`assertJobAccess(jobId, event)` runs BEFORE any other logic** in every `/api/jobs/[id]/*` handler
- [ ] **Three-way check** in order: admin session → user session owns job → anonymous token `timingSafeEqual`
- [ ] **Admin access is logged** to `admin_audit_log` with action `job_access` — every read, not just mutations
- [ ] **404 returned when job doesn't exist** (not 403 — avoid enumeration)
- [ ] **403 returned when job exists but caller not authorized**

### How to scan

```bash
# Find every /api/jobs/[id]/* handler
find app/server/api/jobs -type f -name '*.ts'

# Verify each one calls assertJobAccess
grep -L "assertJobAccess" app/server/api/jobs/\[id\]/**/*.ts   # files missing the call (should be empty)

# Find admin routes
find app/server/api/admin -type f -name '*.ts'

# Verify admin-auth middleware covers them
grep -rn "admin-auth\|assertAdminSession" app/server/middleware/ app/server/api/admin/ --include='*.ts'

# Find logAdminAction calls — every admin mutation + data view must have one
grep -rn "logAdminAction" app/server/api/admin/ --include='*.ts'
```

### Red flags

- Any `/api/jobs/[id]/*` handler that queries `jobs` directly via `db.select()` without calling `assertJobAccess` first
- Any admin handler that doesn't call `logAdminAction`
- Admin middleware that trusts a cookie without DB lookup
- OAuth callback that skips PKCE code_verifier check
- Allowlist check using `==` instead of case-insensitive comparison

---

## 5. Multi-User Data Isolation

Rapidport is NOT multi-tenant in the firm sense, but every job is owned (by a user, or by an anonymous cookie holder). Isolation rules:

- [ ] **Every job query is ownership-verified** via `assertJobAccess`
- [ ] **No cross-user queries** in user-facing endpoints — those belong in `/api/admin/*`
- [ ] **Admin cross-job queries exist only under `/api/admin/*`** and are guarded by `assertAdminSession`
- [ ] **Pagination on admin lists** — no unbounded `SELECT *`
- [ ] **GDPR deletion does not leak** — `/api/me` DELETE handler actually purges; verify test covers reading the user's data after deletion returns empty/anonymized

### How to scan

```bash
# Find user-facing queries on jobs
grep -rn "from(jobs)" app/server/api/jobs/ --include='*.ts'

# Each should be preceded by assertJobAccess — review manually
```

---

## 6. Secrets & Credential Management

### What to check

- [ ] **No hardcoded secrets** in source code (API keys, webhook secrets, OAuth secrets, session/CSRF secrets)
- [ ] **Env validated at boot via Zod** in `app/server/utils/env.ts` — missing env → process exits
- [ ] **`.env` is gitignored** — never committed
- [ ] **`.env.example` contains placeholders only** — `STRIPE_SECRET_KEY=sk_test_...` with no real value
- [ ] **`gitleaks` pre-commit hook** enforced — scan finds zero secrets in history
- [ ] **Logging never includes**: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SMARTBILL_API_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY, GOOGLE_OAUTH_CLIENT_SECRET, SESSION_SECRET, CSRF_SECRET, EMAIL_HASH_SALT, magic link tokens, session IDs
- [ ] **Error messages** don't leak env variable names or values to users

### How to scan

```bash
# Find potential hardcoded secrets
grep -rnE "(sk_live|whsec|re_[a-zA-Z0-9]|sk-ant|pk_live)" app/ worker/ --include='*.ts' --include='*.py'

# Check .gitignore
grep -E '^\.env$|^\.env\.' .gitignore

# Run gitleaks
gitleaks detect --source . --no-git

# Find logging of potentially sensitive data
grep -rnE "log\.(info|warn|error|debug)" app/server/ --include='*.ts' | grep -iE "token|secret|key|password"
```

---

## 7. File Handling & Zip Bomb Protection (Python Worker)

### What to check

- [ ] **Archive extraction validates** every entry (no symlinks, no absolute paths, no `..` components)
- [ ] **Compressed-to-uncompressed ratio** rejected above 50×
- [ ] **Total uncompressed size** capped at 5 GB
- [ ] **Entry count** capped at 10,000
- [ ] **Extracted paths resolve** within `/data/jobs/{id}/upload/` — `Path.resolve().is_relative_to(job_root)`
- [ ] **Magic byte check** on upload (Nuxt side) — verify file header matches extension
- [ ] **Max upload size 500 MB** enforced at Caddy AND Nitro
- [ ] **Worker reads only from `/data/jobs/`** — no other filesystem access
- [ ] **Worker writes only to `/data/jobs/{id}/output/`**

### How to scan

```bash
# Find archive extraction
grep -rn "zipfile\|7z\|rar\|ZipFile" worker/src/ --include='*.py'

# Find path operations in the worker
grep -rn "Path\|resolve\|is_relative_to" worker/src/ --include='*.py'

# Verify zip bomb limits are applied
grep -rn "MAX_RATIO\|MAX_TOTAL_SIZE\|MAX_ENTRIES" worker/src/ --include='*.py'
```

### Red flags

- `zf.extractall(dest)` without pre-extraction validation
- Path operations without `is_relative_to` check
- Missing 7z/rar limits — the same protections needed for ZIP apply (pass-through to `py7zr` / `rarfile` has its own semantics)

---

## 8. Worker Sandboxing

### What to check

- [ ] **Dockerfile uses non-root user** (`USER worker` or similar) — `docker inspect` shows `User: 1000`
- [ ] **docker-compose sets `mem_limit: 1g`**
- [ ] **docker-compose sets `cpus: 1.0`**
- [ ] **pg-boss handler has 15-minute timeout** on `convert` job
- [ ] **Network isolation** — worker container can reach only Postgres (internal) + Anthropic API (via allowed egress)
- [ ] **No sudo or privileged capabilities** in Dockerfile or compose
- [ ] **Logs go to stdout** — no log file written inside container

### How to scan

```bash
# Worker Dockerfile
cat worker/Dockerfile | grep -E "USER|RUN useradd"

# Compose limits
grep -rnE "mem_limit|cpus|networks" infra/ --include='*.yml'

# pg-boss timeout
grep -rn "subscribe\|teamSize\|batchSize" worker/src/migrator/ --include='*.py'
```

---

## 9. CORS & Security Headers

### What to check

- [ ] **CORS origin** in production restricted to `https://rapidport.ro` (and any declared admin subdomain)
- [ ] **CORS origin** in development may be `true` — acceptable only in dev
- [ ] **`Credentials: true`** set for same-origin auth flows
- [ ] **HSTS** — `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- [ ] **X-Content-Type-Options: nosniff**
- [ ] **X-Frame-Options: DENY** (or CSP `frame-ancestors 'none'`)
- [ ] **Referrer-Policy: strict-origin-when-cross-origin**
- [ ] **Permissions-Policy** denies camera/microphone/geolocation; payment allowed only for Stripe origin
- [ ] **CSP** set on HTML pages — no `unsafe-inline`, no `unsafe-eval`. Allow `js.stripe.com`, `accounts.google.com`, SmartBill origin if needed.

### How to scan

```bash
# Find security header middleware
cat app/server/middleware/security-headers.ts

# Automated test
grep -rn "Strict-Transport-Security\|X-Frame-Options\|Content-Security-Policy" app/server/ --include='*.ts'
```

---

## 10. Rate Limiting & Abuse Prevention

### What to check per SPEC §S.10

- [ ] **`POST /api/jobs`**: 10/hour per IP
- [ ] **`PUT /api/jobs/[id]/upload`**: 3/hour per IP
- [ ] **`POST /api/auth/magic-link`**: 5/hour per email
- [ ] **`GET /admin/login`**: 10/hour per IP
- [ ] **Webhooks**: unlimited (signature-verified)
- [ ] **Other GETs**: 300/min per IP
- [ ] **Other mutations**: 60/min per session or IP

### Behavior

- [ ] **Sliding window** implemented in `rate_limits` table
- [ ] **Response on violation**: 429 + `Retry-After` header
- [ ] **Auth paths fail closed** — if `rate_limits` table is unreachable, reject auth requests
- [ ] **Non-auth paths may fail open** — acceptable for read-heavy traffic

### How to scan

```bash
cat app/server/middleware/rate-limit.ts
grep -rn "checkRateLimit\|rateLimit" app/server/ --include='*.ts'
```

---

## 11. Stripe Webhook Security

### What to check

- [ ] **`POST /api/webhooks/stripe` exempted from CSRF**
- [ ] **Signature verification** via `stripe.webhooks.constructEvent` — raw body read via `readRawBody(event)`
- [ ] **Events older than 5 minutes rejected** — prevents replay
- [ ] **Dedup by event ID** in `stripe_events` table — INSERT with unique constraint; if conflict → ignore
- [ ] **Only `payment_intent.succeeded` triggers business logic** — other events logged but ignored
- [ ] **Side effects are idempotent** — re-processing the same event ID changes nothing

### How to scan

```bash
cat app/server/api/webhooks/stripe.post.ts
grep -rn "constructEvent\|stripe_events" app/server/ --include='*.ts'
```

---

## 12. Google OAuth (Admin) Security

### What to check

- [ ] **State parameter** generated via `crypto.randomBytes` and validated on callback — mismatch → 400
- [ ] **PKCE code_verifier** stored in `admin_oauth_state` (hashed or in-memory), used on callback
- [ ] **`admin_oauth_state` rows expire** after 10 min via cleanup cron
- [ ] **`redirect_uri` validated** against `GOOGLE_OAUTH_REDIRECT_URI` env
- [ ] **Email allowlist enforced** server-side against `ADMIN_EMAILS` — case-insensitive, trimmed
- [ ] **Non-allowed email logged** to `admin_audit_log` with `action: 'admin_login_denied'`
- [ ] **Only Google-verified emails** accepted — `email_verified: true` check

### How to scan

```bash
cat app/server/api/auth/google/start.get.ts
cat app/server/api/auth/google/callback.get.ts
grep -rn "ADMIN_EMAILS" app/server/ --include='*.ts'
```

---

## 13. Input Validation (Zod)

### What to check

- [ ] **Every Nitro mutation handler** validates body via `readValidatedBody(event, schema.parse)`
- [ ] **Every Nitro handler reading query/params** uses `getValidatedQuery` / `getValidatedRouterParams`
- [ ] **ID fields use `.uuid()` validation** — prevents enumeration / injection
- [ ] **Enum fields use `.enum()`** for restricted values (job status, payment status, source_software)
- [ ] **Body schemas use `.strict()`** to reject unknown keys — prevents prototype pollution surface
- [ ] **String fields have `.max()`** — no unbounded inputs
- [ ] **Regex patterns include Romanian error messages** for domain formats (CIF, IBAN, case number)

### How to scan

```bash
# Find handlers not using validated helpers (red flag)
grep -rn "readBody\b" app/server/api/ --include='*.ts'  # should use readValidatedBody
grep -rn "getQuery\b" app/server/api/ --include='*.ts'  # should use getValidatedQuery
grep -rn "event.context.params" app/server/api/ --include='*.ts'  # should use getValidatedRouterParams

# Verify .strict() usage on body schemas (prevents prototype pollution + enumeration)
grep -rn "z.object" app/server/ --include='*.ts' | grep -v strict
```

---

## 14. Error Handling & Information Leakage

### What to check

- [ ] **Nitro handlers throw `createError({ statusCode, statusMessage })`** — no raw `{ error, message }` objects returned
- [ ] **Production error handler** returns generic "Eroare internă" for 5xx — no stack traces
- [ ] **4xx messages are Romanian for user routes, English for admin routes**
- [ ] **Database errors are caught and re-thrown as `createError`** — never exposed raw
- [ ] **External API errors wrapped** — Stripe/SmartBill/Anthropic failures never leak raw response bodies to users
- [ ] **404 handler** returns minimal info (method + URL acceptable; no DB state)

### How to scan

```bash
# Find handlers returning error objects (should throw instead)
grep -rn "return.*{.*error:" app/server/api/ --include='*.ts'

# Find bare try/catch (silent swallow — possibly acceptable for audit logs only)
grep -rnE "catch\s*(\(\s*\)|{)" app/server/ --include='*.ts'
```

---

## 15. Property/Type Safety

### What to check

- [ ] **Session types consistent** — `UserSession` uses `.userId`, `AdminSession` uses `.sessionId` / `.email`
- [ ] **Handlers consistently read session via `getUserSession(event)` / `getAdminSession(event)`** — no direct cookie parsing in handler bodies
- [ ] **`as any` casts minimized** — every `as any` in server code is a review flag
- [ ] **Queue payload types match between TypeScript and Python** — `app/server/types/queue.ts` mirrors `worker/src/migrator/queue_types.py`

### How to scan

```bash
grep -rn "as any" app/server/ --include='*.ts'

# Compare queue payload shapes
diff <(grep -E "^(export interface|export type)" app/server/types/queue.ts) <(grep -E "^class" worker/src/migrator/queue_types.py)
```

---

## 16. Admin Audit Log Integrity

### What to check

- [ ] **`admin_audit_log` has no DELETE endpoint** — truly append-only
- [ ] **No UPDATE path** on `admin_audit_log` rows in any migration or query
- [ ] **Every admin handler calls `logAdminAction`** — writes synchronously (not fire-and-forget)
- [ ] **Row contains**: `adminEmail`, `action`, `targetType`, `targetId`, `details` (sanitized, no PII), `ipHash`, `userAgent`, `createdAt`
- [ ] **`action` values are from a known set** — fixed vocabulary (`refund_issued`, `job_viewed`, `user_deleted`, `admin_login_denied`, etc.)
- [ ] **Log retention**: indefinite — confirmed in file cleanup cron that it skips `admin_audit_log`

### How to scan

```bash
# Find any DELETE or UPDATE against admin_audit_log
grep -rn "admin_audit_log\|adminAuditLog" app/server/ --include='*.ts' | grep -iE "update|delete"

# Every admin handler should call logAdminAction
find app/server/api/admin -type f -name '*.ts' | xargs grep -L "logAdminAction"
```

---

## 17. AI Mapping (Haiku)

### What to check

- [ ] **`mapping_cache` lookup happens BEFORE every Haiku call** — reduces cost + latency
- [ ] **Haiku responses validated** — JSON parse + `z`/Pydantic schema check; malformed → mark field as `unknown`, do not retry with same prompt
- [ ] **`ai_usage` row written per call** — even for failures (tokens may still be billable)
- [ ] **Max Haiku calls per job capped** — prevents runaway cost on malformed archives (e.g., 500 calls/job)
- [ ] **Confidence ≥ 0.7 required to apply mapping** — below → leave as `unknown`, surface to mapping review UI
- [ ] **No prompt injection from field names** — field names are formatted into the prompt; must be length-capped + escaped

### How to scan

```bash
grep -rn "mapping_cache\|ai_usage" worker/src/ --include='*.py'
grep -rn "anthropic\|Haiku" worker/src/migrator/mappers/ --include='*.py'
```

---

## 18. GDPR Compliance

### What to check

- [ ] **File auto-deletion after 30 days** — pg-boss cron verified operational; deletes `/data/jobs/{id}/` for expired jobs; sets `jobs.status = 'expired'`
- [ ] **Mapping profiles retained without company data** — cleanup preserves `mapping_profiles.mappings` but not source snapshots
- [ ] **`DELETE /api/me`** — purges user's PII from `users`, anonymizes `jobs.userId` to null, null `sessions`, deletes `magic_link_tokens`, retains `audit_log` entries with hash-only references
- [ ] **`GET /api/me/export`** — JSON dump covers all user data
- [ ] **DPA, Privacy, Refund** pages present at `/legal/dpa`, `/legal/privacy`, `/legal/refund`
- [ ] **Logs never contain PII** — emails hashed, CIFs redacted, file contents never logged
- [ ] **Email hash salt** (`EMAIL_HASH_SALT`) is rotatable without losing lookup ability — document the rotation plan

---

## Open Findings Tracker

| ID | Severity | Summary | File | Status | Audit Log |
| --- | --- | --- | --- | --- | --- |
| _no open findings — pre-Phase-1 codebase_ | | | | | |

---

## Audit Log Directory

All audit reports are stored in `audit/`:

| File | Date | Scope |
| --- | --- | --- |
| _none yet_ | | |

---

## When to Update This File

- After every security audit
- When a new attack surface is added (new endpoint, new external integration, new file handling)
- When a vulnerability is fixed (update status to FIXED, add fix date)
- When a new best practice is discovered
- When dependencies are upgraded (check for new CVEs)

## Audit Cadence

| Trigger | Scope |
| --- | --- |
| Every new Nitro endpoint | §1, §3, §4, §5, §10, §13, §14 |
| Every new admin endpoint | §4, §10, §13, §14, §16 |
| Every new external integration (Stripe variant, SmartBill, Anthropic, Resend) | §6, §11, §12, §17 |
| Every Drizzle migration | §1, §5 |
| Every worker change | §7, §8, §17 |
| Every auth/session change | §3, §4, §12 |
| Monthly | Full audit (all sections) |
| After any security incident | Full audit + incident-specific deep dive |
| Before each production deploy | §S.13 of SPEC.md (security gate) |
