# TESTING.md — Test Creation Guide

**Read this file before writing any test.** Tests that only cover happy paths are incomplete. Every test file must address both functional correctness AND the security/integrity concerns relevant to its module.

---

## Test Runners

### Nuxt (TypeScript)

```bash
cd app && npm test                         # all tests
cd app && npm test -- --filter schemas     # specific file
cd app && npm test -- --filter "Layer 2"   # all security blocks
cd app && npm test -- server/__tests__/    # specific directory
cd app && npm run test:watch               # watch mode
```

Framework: **Vitest** (Nuxt-native). Imports: `describe`, `it`/`test`, `expect`, `beforeEach`, `afterEach`, `vi`.

### Python Worker

```bash
cd worker && pytest                         # all tests
cd worker && pytest -k "Layer2"             # security blocks
cd worker && pytest tests/test_archive.py   # specific file
cd worker && pytest -m "not slow"           # skip slow tests
```

Framework: **pytest** with `pytest-asyncio` for async code.

### Layer 2 block naming — always use this exact string

So `--filter "Layer 2"` / `-k "Layer2"` works consistently:

```typescript
// TypeScript
describe('Layer 2: Security', () => { ... });
```

```python
# Python
class TestLayer2Security:
    ...
```

---

## Test File Location

### Nuxt (TypeScript)

Tests live next to the code they test, inside `__tests__/` directories:

```
app/server/
├── __tests__/              ← env validation, shared helpers, top-level modules
├── middleware/__tests__/   ← security-headers, csrf, rate-limit, admin-auth, audit
├── utils/__tests__/        ← assert-job-access, assert-admin-session, audit, stripe, smartbill, queue, auth-user, auth-admin, google-oauth, email, env
├── api/__tests__/          ← end-to-end Nitro handler tests (spec-like, use a test DB)
└── db/__tests__/           ← schema integrity, migration snapshot
```

Naming: `<module-name>.test.ts` — mirrors the source file name.

### Python Worker

```
worker/tests/
├── test_extractor.py
├── test_archive.py           ← zip bomb + path traversal
├── parsers/
│   ├── test_paradox.py
│   └── test_winmentor.py
├── canonical/
│   └── test_schemas.py
├── mappers/
│   ├── test_rule_based.py
│   └── test_ai_assisted.py   ← mock Haiku, mapping_cache behavior
├── generators/
│   ├── test_saga_xml.py
│   └── test_saga_dbf.py
└── test_consumer.py          ← pg-boss handler smoke
```

---

## The Two-Layer Rule

Every test file MUST have two layers:

### Layer 1: Functional Correctness

Does the code do what it's supposed to do?

- Valid inputs produce correct outputs
- Invalid inputs are rejected with the right error
- Edge cases and boundary conditions
- Default values applied correctly
- Error messages are meaningful

### Layer 2: Security & Integrity

Does the code resist misuse, leakage, and isolation failures?

Which security tests apply depends on the module type. See the module-specific sections below.

**A test file that only has Layer 1 is incomplete and must not be merged.**

---

## Module-Specific Test Requirements

### Zod Schemas

**Layer 1 — Functional:**

- Valid input accepted
- Missing required fields rejected
- Type mismatches rejected
- Default values applied
- Regex patterns match/reject correctly
- `.strict()` rejects unknown keys

**Layer 2 — Security:**

SQL injection payloads to test on every string field that reaches a query:

- `"'; DROP TABLE jobs;--"`
- `"1 OR 1=1"`
- `"Robert'); DROP TABLE--"`

XSS payloads to test on every field that could be rendered:

- `"<script>alert(1)</script>"`
- `'"><img onerror=alert(1)>'`
- `"javascript:alert(1)"`

Prototype pollution payloads (rejected by `.strict()`):

- `{ "__proto__": { "admin": true } }`
- `{ "constructor": {} }`

Unicode edge cases:

- Null byte: `"value\u0000extra"`
- RTL override: `"value\u202Eextra"`
- Zero-width char: `"value\u200Bextra"`

Oversized inputs — fields without `.max()` are unbounded:

```typescript
it('rejects oversized filename (10 KB+)', () => {
  const result = CreateJobSchema.safeParse({
    filename: 'A'.repeat(10_001),
    sourceSoftware: 'winmentor',
    targetSoftware: 'saga',
  });
  expect(result.success).toBe(false);
});
```

UUID fields reject non-UUID strings (prevents ID enumeration and injection):

```typescript
it('rejects path traversal in job id', () => {
  const result = JobIdSchema.safeParse({ id: '../../../etc/passwd' });
  expect(result.success).toBe(false);
});

it('rejects SQL payload in job id', () => {
  const result = JobIdSchema.safeParse({ id: "'; DROP TABLE jobs;--" });
  expect(result.success).toBe(false);
});
```

Prototype pollution does not mutate `Object.prototype`:

```typescript
it('does not apply __proto__ pollution (strict rejects)', () => {
  const payload = JSON.parse('{"email":"a@b.ro","__proto__":{"admin":true}}');
  const result = CreateJobSchema.safeParse(payload);
  expect(result.success).toBe(false);
  expect((Object.prototype as any).admin).toBeUndefined();
});
```

Unicode edge cases handled:

```typescript
it('handles or rejects null byte in filename', () => {
  const result = CreateJobSchema.safeParse({
    filename: "file\u0000extra.zip",
    sourceSoftware: 'winmentor',
    targetSoftware: 'saga',
  });
  if (result.success) {
    expect(result.data.filename).not.toContain('\u0000');
  }
});
```

### Nitro Handlers

**Layer 1 — Functional:**

- Returns expected data structure
- Handles empty results
- Pagination works (`items`, `total`, `limit`, `offset`, `hasMore`)
- Throws `createError` with correct statusCode on failure

**Layer 2 — Security:**

- [ ] **CSRF rejection** — mutation without valid CSRF token returns 403:

  ```typescript
  it('rejects mutation without CSRF token', async () => {
    const event = makeMockEvent({ method: 'POST', csrfToken: null });
    await expect(createJobHandler(event)).rejects.toMatchObject({ statusCode: 403 });
  });
  ```

- [ ] **`assertJobAccess` rejection** — missing anonymous token + no session → 403:

  ```typescript
  it('rejects job access without token or session', async () => {
    const event = makeMockEvent({ cookies: {}, session: null });
    await expect(getJobHandler(event, { id: knownJobId })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects job access with wrong anonymous token', async () => {
    const event = makeMockEvent({
      cookies: { [`job_access_${knownJobId}`]: 'wrong-token' },
    });
    await expect(getJobHandler(event, { id: knownJobId })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('accepts job access with correct anonymous token', async () => {
    const event = makeMockEvent({
      cookies: { [`job_access_${knownJobId}`]: correctToken },
    });
    const result = await getJobHandler(event, { id: knownJobId });
    expect(result.job.id).toBe(knownJobId);
  });
  ```

- [ ] **Admin-only endpoint rejects non-admin sessions**:

  ```typescript
  it('rejects admin endpoint without admin session', async () => {
    const event = makeMockEvent({ adminSession: null });
    await expect(adminListJobsHandler(event)).rejects.toMatchObject({ statusCode: 401 });
  });
  ```

- [ ] **Admin IP binding** — session with mismatched IP is rejected:

  ```typescript
  it('rejects admin session when IP has changed', async () => {
    const event = makeMockEvent({
      adminCookie: 'session-id',
      ip: '192.168.1.99',  // session was bound to 192.168.1.1
    });
    await expect(adminListJobsHandler(event)).rejects.toMatchObject({ statusCode: 401 });
  });
  ```

- [ ] **Admin action writes to `admin_audit_log`** synchronously:

  ```typescript
  it('logs admin access to admin_audit_log', async () => {
    const event = makeMockEvent({ adminSession: validAdminSession });
    await adminGetJobHandler(event, { id: someJobId });
    const logs = await testDb.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, someJobId));
    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('job_viewed');
  });
  ```

- [ ] **Zod validation errors → 400** (never 500):

  ```typescript
  it('returns 400 on invalid body', async () => {
    const event = makeMockEvent({ body: { sourceSoftware: 'invalid' } });
    await expect(createJobHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });
  ```

- [ ] **Queries use parameterized values (Drizzle)** — verify no raw interpolation in handler:

  ```typescript
  // Usually not needed — Drizzle enforces this by construction.
  // Add a test only if the handler uses sql.raw() or sql template — verify params array.
  ```

- [ ] **Result does not leak PII** — check response body does not contain plaintext emails for other users, refund amounts for other jobs, admin-only fields:

  ```typescript
  it('does not leak user email in public job response', async () => {
    const event = makeMockEvent({ anonymousToken: correctToken });
    const result = await getJobHandler(event, { id: knownJobId });
    const json = JSON.stringify(result);
    expect(json).not.toContain('billingEmail');
    expect(json).not.toContain('stripeFeeAmount');
  });
  ```

### Middleware

**Layer 1 — Functional:**

- Passes when conditions are met
- Blocks when conditions are not met
- Returns correct error codes and messages

**Layer 2 — Security:**

- [ ] **CSRF middleware: mutation without token → 403**:

  ```typescript
  it('rejects POST without X-CSRF-Token header', async () => {
    const event = makeMockEvent({ method: 'POST', cookies: { 'csrf-token': 'abc' }, headers: {} });
    await expect(csrfMiddleware(event)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects mismatched CSRF token vs cookie', async () => {
    const event = makeMockEvent({
      method: 'POST',
      cookies: { 'csrf-token': 'abc' },
      headers: { 'x-csrf-token': 'xyz' },
    });
    await expect(csrfMiddleware(event)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('accepts webhook route without CSRF', async () => {
    const event = makeMockEvent({ method: 'POST', path: '/api/webhooks/stripe' });
    await expect(csrfMiddleware(event)).resolves.toBeUndefined();
  });
  ```

- [ ] **Admin-auth middleware: no cookie → 401**:

  ```typescript
  it('rejects /admin without admin_session cookie', async () => {
    const event = makeMockEvent({ path: '/admin', cookies: {} });
    await expect(adminAuthMiddleware(event)).rejects.toMatchObject({ statusCode: 401 });
  });
  ```

- [ ] **Rate limiter: fails closed for auth paths when store is down**:

  ```typescript
  it('denies /api/auth/magic-link when rate store unavailable', async () => {
    const event = makeMockEvent({ path: '/api/auth/magic-link', method: 'POST' });
    vi.spyOn(rateStore, 'check').mockRejectedValue(new Error('DB down'));
    await expect(rateLimitMiddleware(event)).rejects.toMatchObject({ statusCode: 503 });
  });
  ```

- [ ] **Rate limiter: may fail open for non-auth paths** (document the decision):

  ```typescript
  it('allows GET /api/health when rate store unavailable', async () => {
    const event = makeMockEvent({ path: '/api/health', method: 'GET' });
    vi.spyOn(rateStore, 'check').mockRejectedValue(new Error('DB down'));
    await expect(rateLimitMiddleware(event)).resolves.toBeUndefined();
  });
  ```

- [ ] **Audit middleware: sensitive keys stripped from `details`**:

  ```typescript
  it('strips password and token from audit details', () => {
    const sanitized = sanitizeAuditDetails({
      action: 'magic_link_requested',
      email: 'a@b.ro',
      token: 'secret-token',
      password: 'x',
    });
    expect(sanitized).not.toHaveProperty('token');
    expect(sanitized).not.toHaveProperty('password');
    expect(sanitized).toHaveProperty('action');
  });
  ```

- [ ] **Audit middleware: email hashed before persistence**:

  ```typescript
  it('hashes email before writing to audit_log', () => {
    const sanitized = sanitizeAuditDetails({ email: 'user@example.com' });
    expect(sanitized.email).toBeUndefined();
    expect(sanitized.emailHashed).toMatch(/^[a-f0-9]{8}$/);
  });
  ```

### Stripe Webhook

**Layer 1 — Functional:**

- `payment_intent.succeeded` marks job PAID + publishes pg-boss convert + calls SmartBill
- Other event types logged but ignored
- Idempotent re-processing

**Layer 2 — Security:**

- [ ] **Unsigned payload rejected**:

  ```typescript
  it('rejects webhook without stripe-signature header', async () => {
    const event = makeMockEvent({ body: rawBody, headers: {} });
    await expect(stripeWebhookHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });
  ```

- [ ] **Forged signature rejected** (signed with wrong secret):

  ```typescript
  it('rejects webhook signed with wrong secret', async () => {
    const forgedSig = stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: 'wrong-secret',
    });
    const event = makeMockEvent({ body: rawBody, headers: { 'stripe-signature': forgedSig } });
    await expect(stripeWebhookHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });
  ```

- [ ] **Replay rejected** (event older than 5 min):

  ```typescript
  it('rejects replayed webhook event older than 5 minutes', async () => {
    const old = makeStripeEvent({ created: Date.now() / 1000 - 600 });
    await expect(stripeWebhookHandler(old)).rejects.toMatchObject({ statusCode: 400 });
  });
  ```

- [ ] **Duplicate event ID deduped** — second processing is a no-op:

  ```typescript
  it('is idempotent on duplicate event id', async () => {
    await stripeWebhookHandler(firstDelivery);
    await stripeWebhookHandler(secondDelivery);  // same event id
    const paidRows = await testDb.select().from(jobs).where(eq(jobs.id, jobId));
    expect(paidRows[0].status).toBe('paid');
    const events = await testDb.select().from(stripeEvents).where(eq(stripeEvents.id, eventId));
    expect(events).toHaveLength(1);
  });
  ```

### Auth — Magic Link

**Layer 1 — Functional:**

- Token round-trip (generate → email → consume)
- Hash stored, not plaintext
- Session created on consumption

**Layer 2 — Security:**

- [ ] **Token single-use** — second consumption rejected:

  ```typescript
  it('rejects reused magic link token', async () => {
    const token = await requestMagicLink('user@example.com');
    await consumeMagicLink(token);
    await expect(consumeMagicLink(token)).rejects.toMatchObject({ statusCode: 400 });
  });
  ```

- [ ] **Expired token rejected**:

  ```typescript
  it('rejects token after 15-minute expiry', async () => {
    const token = await requestMagicLink('user@example.com');
    vi.advanceTimersByTime(16 * 60 * 1000);
    await expect(consumeMagicLink(token)).rejects.toMatchObject({ statusCode: 400 });
  });
  ```

- [ ] **Token stored hashed, not plaintext**:

  ```typescript
  it('persists SHA-256 hash of token, not plaintext', async () => {
    const token = await requestMagicLink('user@example.com');
    const [row] = await testDb.select().from(magicLinkTokens);
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
  ```

- [ ] **Session cookie flags** — HttpOnly, Secure, SameSite=Lax:

  ```typescript
  it('sets session cookie with correct flags', async () => {
    const event = makeMockEvent();
    await consumeMagicLink(token, event);
    const cookie = event.node.res.getHeader('set-cookie') as string;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
  ```

- [ ] **Rate limited**:

  ```typescript
  it('rejects 6th magic link request in an hour', async () => {
    for (let i = 0; i < 5; i++) await requestMagicLink('user@example.com');
    await expect(requestMagicLink('user@example.com')).rejects.toMatchObject({ statusCode: 429 });
  });
  ```

### Auth — Admin (Google OAuth)

**Layer 1 — Functional:**

- OAuth start issues state + code_verifier, stores in `admin_oauth_state`
- Callback validates state + code, exchanges for tokens, creates `admin_sessions` row
- Session cookie flags correct (HttpOnly, Secure, SameSite=Strict, 8h)

**Layer 2 — Security:**

- [ ] **State mismatch rejected**:

  ```typescript
  it('rejects callback with unknown state', async () => {
    const event = makeMockEvent({ query: { state: 'unknown', code: 'x' } });
    await expect(oauthCallbackHandler(event)).rejects.toMatchObject({ statusCode: 400 });
  });
  ```

- [ ] **PKCE verifier enforced** — missing/invalid code_verifier rejected
- [ ] **Email not in allowlist → 403 + admin_audit_log entry**:

  ```typescript
  it('rejects and logs non-allowlist email', async () => {
    vi.spyOn(google, 'exchangeCode').mockResolvedValue({
      email: 'random@example.com',
      email_verified: true,
    });
    const event = makeMockEvent({ query: { state: validState, code: 'x' } });
    await expect(oauthCallbackHandler(event)).rejects.toMatchObject({ statusCode: 403 });

    const logs = await testDb.select().from(adminAuditLog).where(eq(adminAuditLog.action, 'admin_login_denied'));
    expect(logs[0].adminEmail).toBe('random@example.com');
  });
  ```

- [ ] **Google email_verified required**:

  ```typescript
  it('rejects unverified Google email even if in allowlist', async () => {
    vi.spyOn(google, 'exchangeCode').mockResolvedValue({
      email: allowedEmail,
      email_verified: false,
    });
    await expect(oauthCallbackHandler(event)).rejects.toMatchObject({ statusCode: 403 });
  });
  ```

- [ ] **IP change invalidates session**:

  ```typescript
  it('revokes session on IP change', async () => {
    const { sessionId } = await createAdminSession({ email: allowedEmail, ip: '1.1.1.1' });
    const event = makeMockEvent({ adminCookie: sessionId, ip: '2.2.2.2' });
    await expect(assertAdminSession(event)).rejects.toMatchObject({ statusCode: 401 });
    const [row] = await testDb.select().from(adminSessions).where(eq(adminSessions.id, sessionId));
    expect(row.revokedAt).not.toBeNull();
  });
  ```

- [ ] **`admin_oauth_state` rows expire after 10 min**:

  ```typescript
  it('rejects callback after 10-minute state expiry', async () => {
    const state = await startOauth();
    vi.advanceTimersByTime(11 * 60 * 1000);
    await expect(oauthCallbackHandler(mockEventWith(state))).rejects.toMatchObject({ statusCode: 400 });
  });
  ```

### Drizzle Schema

**Layer 1 — Functional:**

- Every table defined has the columns the code queries
- Foreign keys reference real tables
- Unique constraints match `.unique()` in schema

**Layer 2 — Security/Integrity:**

- [ ] **Migration snapshot matches schema.ts** — drift means `npm run drizzle:generate` wasn't run:

  ```typescript
  it('generated SQL is in sync with schema.ts', () => {
    // Run drizzle-kit check and assert no diff
    const { status, stdout } = execSync('npx drizzle-kit check');
    expect(status).toBe(0);
    expect(stdout).not.toContain('changes');
  });
  ```

- [ ] **Every user-facing table has `createdAt`** with `withTimezone: true` (no naive timestamps)

### Queue — pg-boss

**Layer 1 — Functional:**

- Publish → consume round-trip (Nuxt publishes, Python worker consumes)
- Payload shape matches TypeScript type ↔ Pydantic model
- Progress updates written to `jobs.progressStage` / `jobs.progressPct`

**Layer 2 — Security:**

- [ ] **Idempotency key** prevents duplicate runs:

  ```typescript
  it('does not double-run on duplicate publish with same key', async () => {
    await boss.send('convert', payload, { singletonKey: `job_${jobId}_convert` });
    await boss.send('convert', payload, { singletonKey: `job_${jobId}_convert` });
    const jobs = await boss.fetch('convert', 10);
    expect(jobs.length).toBeLessThanOrEqual(1);
  });
  ```

- [ ] **Payload validated** by Pydantic in worker — malformed publish rejected without side effects

### Python Worker — Archive / Extractor

**Layer 1 — Functional:**

- Extracts valid ZIP/7z/RAR
- Detects WinMentor version from extracted structure
- Respects CP852/CP1250 in filenames

**Layer 2 — Security:**

- [ ] **Zip bomb rejected** (compression ratio > 50×):

  ```python
  def test_rejects_high_compression_ratio(tmp_path):
      bomb = make_zip_with_ratio(tmp_path / "bomb.zip", ratio=100)
      with pytest.raises(ArchiveError, match="compression_ratio"):
          validate_archive_safe(bomb)
  ```

- [ ] **Uncompressed total > 5 GB rejected**
- [ ] **Entry count > 10k rejected**
- [ ] **Symlink entries rejected**:

  ```python
  def test_rejects_symlink_in_zip(tmp_path):
      archive = make_zip_with_symlink(tmp_path / "sym.zip")
      with pytest.raises(ArchiveError, match="symlink"):
          validate_archive_safe(archive)
  ```

- [ ] **Absolute path entry rejected**:

  ```python
  def test_rejects_absolute_path_entry(tmp_path):
      archive = make_zip_with_entry(tmp_path / "abs.zip", "/etc/passwd")
      with pytest.raises(ArchiveError, match="unsafe_entry"):
          validate_archive_safe(archive)
  ```

- [ ] **`..` path traversal rejected**:

  ```python
  def test_rejects_dot_dot_entry(tmp_path):
      archive = make_zip_with_entry(tmp_path / "dd.zip", "../../../etc/passwd")
      with pytest.raises(ArchiveError):
          validate_archive_safe(archive)
  ```

- [ ] **`validate_path` refuses outside-job-root access**:

  ```python
  def test_validate_path_rejects_outside_job_root(tmp_path):
      job_root = tmp_path / "job"
      job_root.mkdir()
      with pytest.raises(ArchiveError):
          validate_path(Path("/etc/passwd"), job_root)
  ```

### Python Worker — Parsers

**Layer 1 — Functional:**

- Standard `.DB` parsing via `pypxlib`
- Fallback parser on non-standard tables (BUGET1.DB as test fixture)
- CP852 and CP1250 decoding with Romanian diacritics (ă, â, î, ș, ț)

**Layer 2 — Security:**

- [ ] **Malformed header bytes handled** — no infinite loop, no unbounded allocation:

  ```python
  def test_fallback_parser_rejects_truncated_header():
      with pytest.raises(ParadoxParseError):
          parse_paradox_fallback(b"\x00\x01")  # truncated
  ```

- [ ] **Oversized record size rejected** (header claims 100 GB record):

  ```python
  def test_fallback_parser_rejects_oversized_record_size():
      malicious = make_header_with_record_size(2**31)
      with pytest.raises(ParadoxParseError):
          parse_paradox_fallback(malicious)
  ```

- [ ] **ReDoS resistance on any regex field extractor**:

  ```python
  def test_extract_cif_no_redos():
      start = time.perf_counter()
      extract_cif("a" * 50_000 + "!")
      elapsed = time.perf_counter() - start
      assert elapsed < 0.5
  ```

### Python Worker — Mappers (AI-assisted)

**Layer 1 — Functional:**

- Rule-based covers expected fields (NPART.CodFis → Partner.cif, etc.)
- Haiku invoked only on unmapped fields
- Result cached in `mapping_cache`

**Layer 2 — Security:**

- [ ] **Malformed Haiku response rejected**:

  ```python
  async def test_rejects_malformed_haiku_json(monkeypatch):
      monkeypatch.setattr(anthropic_client, "messages_create", lambda **kw: "not json")
      with pytest.raises(MappingError):
          await map_field_with_haiku("NPART", "CodFis", ["123"])
  ```

- [ ] **Confidence out-of-range rejected**:

  ```python
  async def test_rejects_out_of_range_confidence(monkeypatch):
      monkeypatch.setattr(anthropic_client, "messages_create",
                          lambda **kw: '{"target":"cif","confidence":1.5,"reasoning":"x"}')
      with pytest.raises(MappingError):
          await map_field_with_haiku("NPART", "CodFis", ["123"])
  ```

- [ ] **`ai_usage` row written on success AND failure**:

  ```python
  async def test_ai_usage_recorded_on_failure(monkeypatch, test_db):
      monkeypatch.setattr(anthropic_client, "messages_create", lambda **kw: raise_api_error())
      with pytest.raises(MappingError):
          await map_field_with_haiku("NPART", "CodFis", ["123"])
      rows = await test_db.fetch("SELECT * FROM ai_usage")
      assert len(rows) == 1
  ```

- [ ] **Per-job cap enforced** — max Haiku calls / job (prevents cost runaway):

  ```python
  async def test_haiku_per_job_cap():
      for _ in range(MAX_HAIKU_CALLS_PER_JOB):
          await map_field_with_haiku(...)
      with pytest.raises(MappingError, match="haiku_cap"):
          await map_field_with_haiku(...)
  ```

- [ ] **Field names length-capped before prompt injection**:

  ```python
  def test_field_name_truncated_in_prompt():
      prompt = build_mapping_prompt("T", "F" * 10_000, ["s"])
      assert len(prompt) < 5_000
  ```

### Python Worker — Generators

**Layer 1 — Functional:**

- Round-trip: canonical schema → SAGA XML/DBF → parseable output
- Every SAGA entity type (Terți, Articole, Articole Contabile, Intrări, Ieșiri, Încasări, Plăți)
- Filename format: `F_<cif>_<nr>_<data>.xml`, `I_<data>.xml`, `P_<data>.xml`

**Layer 2 — Security/Integrity:**

- [ ] **Generated XML escapes special chars** — `<`, `>`, `&`, `"`, `'` in partner names, descriptions
- [ ] **No data loss** — every canonical field either maps to SAGA or flagged in the conversion report's `issues` list
- [ ] **Version metadata embedded** — `worker_version` + `canonical_schema_version` in report

### Report Generator

**Layer 1 — Functional:**

- `report.json` structure matches SPEC §1.7 (worker_version, summary counts, issues)
- `report.pdf` renders Romanian text correctly (diacritics via embedded font)
- AI usage totals match `ai_usage` row sums

**Layer 2 — Security:**

- [ ] **No PII in report.json** — partner/article names may appear in `issues` with source_id only; no email/phone/address in report
- [ ] **Path refs are relative to job root** — `report.json` does not expose server filesystem paths

---

## Mock Event Helper (Nitro)

Every Nitro handler test needs a mock H3 event. Use a shared factory at `app/server/__tests__/helpers.ts`:

```typescript
import type { H3Event } from 'h3';
import { vi } from 'vitest';

interface MockEventOpts {
  method?: string;
  path?: string;
  body?: unknown;
  query?: Record<string, string>;
  params?: Record<string, string>;
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  ip?: string;
  userSession?: UserSession | null;
  adminSession?: AdminSession | null;
  csrfToken?: string | null;
}

export function makeMockEvent(opts: MockEventOpts = {}): H3Event {
  const cookies = opts.cookies ?? {};
  const headers = { ...(opts.headers ?? {}) };
  if (opts.csrfToken !== null) {
    cookies['csrf-token'] ??= opts.csrfToken ?? 'test-token';
    headers['x-csrf-token'] ??= opts.csrfToken ?? 'test-token';
  }

  return {
    node: {
      req: {
        method: opts.method ?? 'GET',
        url: opts.path ?? '/',
        headers,
        socket: { remoteAddress: opts.ip ?? '127.0.0.1' },
      },
      res: {
        getHeader: vi.fn(),
        setHeader: vi.fn(),
      },
    },
    context: {
      params: opts.params ?? {},
      userSession: opts.userSession ?? null,
      adminSession: opts.adminSession ?? null,
    },
    _cookies: cookies,
    _body: opts.body,
    _query: opts.query ?? {},
  } as unknown as H3Event;
}
```

Use a real Postgres (test DB) via Testcontainers for integration tests that hit Drizzle — don't mock Drizzle; mocking hides column drift.

---

## Mock Pytest Fixtures (Python)

```python
# worker/tests/conftest.py
import pytest
import asyncio
from pathlib import Path
from migrator.utils.db import create_test_pool

@pytest.fixture
async def test_db():
    pool = await create_test_pool()
    await pool.execute("BEGIN")
    yield pool
    await pool.execute("ROLLBACK")
    await pool.close()

@pytest.fixture
def job_root(tmp_path):
    root = tmp_path / "job"
    root.mkdir()
    (root / "upload").mkdir()
    (root / "output").mkdir()
    return root

@pytest.fixture
def mock_anthropic(monkeypatch):
    calls = []
    def fake_create(**kwargs):
        calls.append(kwargs)
        return '{"target":"cif","confidence":0.9,"reasoning":"test"}'
    monkeypatch.setattr("migrator.mappers.ai_assisted.anthropic_create", fake_create)
    return calls
```

---

## What Makes a Test Mergeable

A test file is ready for review when:

1. **Layer 1 complete** — all functional behaviors covered
2. **Layer 2 complete** — all applicable security checks from the module-specific section above
3. **No `console.log` / `print()`** in tests — use `expect()` / `assert` assertions
4. **No `.only` or `.skip`** left in committed tests
5. **Tests are deterministic** — no time-dependent failures (use `vi.useFakeTimers()` / `freezegun`), no reliance on external services
6. **Mock boundaries are clean** — mock external dependencies (Stripe, SmartBill, Anthropic, Resend), never the module under test
7. **DB tests use real Postgres** (test DB via Testcontainers or per-test transaction rollback) — mocking Drizzle hides column drift
8. **Secrets never appear in test fixtures** — use placeholder values (`sk_test_...`, `whsec_...`) that clearly aren't real

---

## Checklist for Reviewers

When reviewing a test file, verify:

- [ ] Both Layer 1 and Layer 2 are present
- [ ] Security tests match the module type (see sections above)
- [ ] SQL injection + XSS + prototype pollution payloads tested for every Zod schema string field that reaches a query or template
- [ ] CSRF rejection tested for every mutation handler
- [ ] `assertJobAccess` rejection tested for job endpoints (no token → 403, wrong token → 403, admin bypass → 200 + audit log)
- [ ] Admin allowlist rejection tested (non-allowed email → 403 + `admin_audit_log` entry)
- [ ] Stripe webhook: unsigned + replayed + duplicate-id tested
- [ ] Worker: zip bomb + path traversal + symlink + `..` + CP852/CP1250 edge cases tested
- [ ] `admin_audit_log` write verified for admin handlers
- [ ] No PII / encrypted field leakage in responses
- [ ] Error paths tested (not just happy paths)
- [ ] No false-positive tests (tests that pass for the wrong reason — a test that never invokes the code under test is worse than no test)
