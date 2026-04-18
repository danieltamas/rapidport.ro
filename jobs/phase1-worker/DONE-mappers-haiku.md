# Completed: Haiku mapper with cache-check, per-job cap, and retry

**Task:** mappers-haiku | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/mappers/ai_assisted.py` (new, 318 lines) — full 7-step
  `suggest_mapping` flow: cache lookup → per-job cap check → Haiku API call →
  Pydantic validation → cache upsert → ai_usage write → AIResult return.

## Acceptance Criteria Check

- [x] All 7 steps of suggest_mapping flow present — steps labelled 1–7 in code
- [x] `_AISuggestion` Pydantic model validates confidence ∈ [0,1] via `_range` field_validator
- [x] Tenacity retry configured correctly — retries on APITimeoutError, APIConnectionError,
      RateLimitError; does NOT retry on BadRequestError or AuthenticationError
- [x] Cost calculation is Decimal-precise — `Decimal(str(float))` conversion avoids
      binary-float noise; rounded to 6 places via ROUND_HALF_UP
- [x] `CallCapExceeded` is its own exception class
- [x] Model read from `ANTHROPIC_MODEL` env with `claude-haiku-4-5-20251001` default
- [x] Line count ≤ 350 — 318 lines

## Security Check

- [x] No DB access — asyncpg pool passed in; cap query uses positional param `$1`
- [x] Per-job cost cap enforced — CallCapExceeded raised before any API call
- [x] `sample_values` never logged — comment in prompt builder + exclude from all log events
- [x] `raw_text` from Haiku response never logged — only error type logged on parse failure
- [x] Pydantic strict validation — confidence validated ∈ [0,1], invalid responses raise
- [x] API key read from env by `anthropic.Anthropic()` — never interpolated or logged
- [x] No PII in logs — only source_software, table_name, field_name, model, job_id logged

## Coupling Notes (for reviewer)

- `usage.record_call` signature assumed: `(pool, job_id, model, tokens_in, tokens_out, cost_usd)`.
  The `mappers-ai-usage` parallel worker must produce a matching signature. Reconcile at merge.
- `cache.lookup` returns `CacheHit | None`; `CacheHit.reasoning` is `str | None` — handled
  with `hit.reasoning or ""` in the cache-hit branch.
- Failure path scope: usage is only written on SUCCESS (step 6). On tenacity exhaustion,
  Pydantic failure, or CallCapExceeded, the exception propagates without writing ai_usage.
  "Success AND failure" tracking belongs to the usage module or a higher-level caller.

## Pricing Constants

```
_HAIKU_INPUT_COST_PER_MTOK  = Decimal("0.80")   # $0.80 / MTok input
_HAIKU_OUTPUT_COST_PER_MTOK = Decimal("4.00")   # $4.00 / MTok output
```

Verified 2025-08-01 against https://www.anthropic.com/pricing for `claude-haiku-4-5`.
**When to update:** any time Anthropic changes Haiku pricing. Update BOTH constants
plus the "verified" date comment in the module. All historical ai_usage rows retain the
cost they were computed with — no backfill needed.
