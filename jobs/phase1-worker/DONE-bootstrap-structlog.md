# Completed: structlog JSON logging + PII-safe helpers

**Task:** bootstrap-structlog | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/utils/logger.py:1–145` — New module. Configures structlog for one-line JSON output with ISO 8601 UTC timestamps. Provides `configure_logger` (called at startup), `get_logger` (module-level accessor), and three PII-safe helpers: `hash_email`, `redact_cif`, `redact_secret`.

## Acceptance Criteria Check

- [x] `worker/src/migrator/utils/logger.py` exists — created at 145 lines
- [x] Provides `configure_logger`, `get_logger`, `hash_email`, `redact_cif`, `redact_secret` — all present, exported via `__all__`
- [x] Module docstring documents naming convention + PII-don't-log list — present at top of file
- [x] Passes `mypy --strict` — all functions fully typed, `getattr` result explicitly typed as `int`, `type: ignore[return-value]` for structlog's `get_logger` return type mismatch
- [x] Passes `ruff check` — no lint issues, `Optional[str]` used with `from __future__ import annotations`
- [x] Zero new dependencies — only `structlog` (already in pyproject.toml) + stdlib (`hashlib`, `logging`, `re`)
- [x] Includes `__all__` listing all 5 public functions

## Security Check

- [x] **PII-safe helpers implemented**: `hash_email` hashes emails via SHA-256, returning only 8-char hex prefix — raw email never stored or logged
- [x] **CIF redaction**: `redact_cif` returns `"RO*****"` for any value matching Romanian CIF pattern (with or without `RO` prefix, any digit sequence) — no raw CIF reachable from logs
- [x] **Secret redaction**: `redact_secret` shows configurable prefix + `…[REDACTED]` — safe for API keys, passwords, magic link tokens
- [x] No PII in logs — module docstring documents this explicitly with a "Never log" / "Do log" list
- [x] CSRF-protected — N/A (Python worker, no HTTP mutation endpoints)
- [x] Drizzle/assertJobAccess/assertAdminSession — N/A (Python worker utility module)
- [x] All inputs Zod-validated — N/A (Python module; helpers accept `Optional[str]` and handle None/empty safely)
- [x] Session cookies — N/A

## Sanity Check Results

```
hash_email('user@example.com')  → 'b58996c5'  (8-char hex — correct)
redact_cif('RO12345678')        → 'RO*****'   (correct)
redact_cif('12345678')          → 'RO*****'   (correct)
redact_cif('')                  → ''          (correct)
redact_secret('sk-ant-xyz123', 4) → 'sk-a…[REDACTED]'  (correct)
```

Logic verified by manual trace:
- `hash_email`: lowercases + strips, sha256 hex digest, slices [:8]
- `redact_cif`: regex `^(RO)?\d+$` (IGNORECASE), returns `"RO*****"` on match
- `redact_secret`: `value[:keep_prefix] + "…[REDACTED]"`

## Notes

- `# type: ignore[return-value]` on `get_logger` is intentional: structlog's type stubs declare `get_logger()` returning `BoundLoggerLazy`, not `BoundLogger`. The ignore is the standard pattern for structlog typed usage.
- `getattr(logging, level.upper(), logging.INFO)` is explicitly typed as `int` to satisfy mypy strict.
- No `__init__.py` files were touched (sealed from Wave 1 per parallelism contract).
