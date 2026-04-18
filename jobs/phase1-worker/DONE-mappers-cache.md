# Completed: mapping_cache asyncpg read-through / write-through

**Task:** mappers-cache | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/mappers/cache.py:1-170` — New module implementing the
  `mapping_cache` table read/write interface via asyncpg.
  - `CacheHit` dataclass: `frozen=True, slots=True`, `confidence` typed as
    `Decimal` (not `float`) to preserve `NUMERIC(4,3)` precision.
  - `lookup()`: single `UPDATE … RETURNING` round-trip that atomically
    increments `hit_count` and returns the row; returns `None` on miss.
    Wraps `asyncpg` row confidence value via `Decimal(str(...))` to avoid
    float precision loss from the wire.
  - `upsert()`: `INSERT … ON CONFLICT (source_software, table_name,
    field_name) DO UPDATE SET` — overwrites `target_field`, `confidence`,
    `reasoning` with latest Haiku output; does **not** reset `hit_count`.
  - Structured debug logging via `migrator.utils.logger` using event names
    `cache_hit`, `cache_miss`, `cache_upsert`. No sensitive values logged
    beyond `target_field` (canonical field names are not PII).

## Acceptance Criteria Check

- [x] Both async functions present with correct signatures — `lookup` and
      `upsert` match the spec exactly (pool, source_software, table_name,
      field_name, and upsert extras).
- [x] `CacheHit` dataclass is `frozen=True, slots=True`.
- [x] All SQL parameterised — `_LOOKUP_SQL` uses `$1/$2/$3`;
      `_UPSERT_SQL` uses `$1`–`$6`. Zero f-strings or `%s` in SQL strings.
- [x] `hit_count` increment is atomic — single `UPDATE … RETURNING`,
      no separate SELECT then UPDATE.
- [x] Upsert uses `ON CONFLICT (source_software, table_name, field_name)
      DO UPDATE SET` — confirmed in `_UPSERT_SQL`.
- [x] `hit_count` NOT reset on upsert — `DO UPDATE SET` only touches
      `target_field`, `confidence`, `reasoning`.
- [x] Line count: 170 lines (limit: 180).
- [x] `from __future__ import annotations` at top.
- [x] No forbidden imports: no canonical, parsers, other mappers, generators.
- [x] No new dependencies — only stdlib (`dataclasses`, `decimal`, `typing`),
      `asyncpg`, and the project's own `migrator.utils.logger`.

## Security Check

- [x] All DB access parameterised — no SQL injection surface. Both SQL
      string constants use `$N` placeholders exclusively; values are passed
      as positional arguments to `pool.fetchrow` / `pool.execute`.
- [x] No PII in logs — source_software, table_name, field_name, and
      target_field are structural metadata, not personal data.
- [x] No mutation endpoint (Python module, not an API handler — CSRF
      not applicable).
- [x] No job endpoint — not applicable.
- [x] No admin endpoint — not applicable.
- [x] No Zod (Python module) — Zod not applicable; asyncpg handles
      type coercion from Postgres; `Decimal(str(...))` guards confidence.
- [x] No file content ever read or logged.
- [x] Session cookies — not applicable.
- [x] Rate limits — not applicable (internal module, not exposed via HTTP).

## Notes

- **Decimal vs float**: `confidence` stored as `NUMERIC(4,3)` in Postgres.
  asyncpg returns `Decimal` natively for `NUMERIC` columns, but we wrap
  with `Decimal(str(row["confidence"]))` defensively to ensure exactness
  regardless of driver version behaviour.
- **Case sensitivity**: table_name and field_name stored as provided by
  caller. CLAUDE.md Phase 0 convention is uppercase; normalisation is
  the caller's responsibility.
- **Logging level**: debug only — these are high-frequency inner-loop
  calls and info-level would flood production logs.
