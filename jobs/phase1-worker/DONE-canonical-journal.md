# Completed: Canonical Journal Models

**Task:** canonical-journal | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/canonical/journal.py:1-301` — 4 Pydantic v2 models
  (`InvoiceLine`, `Invoice`, `Payment`, `JournalEntry`) + 4 Literal type
  aliases (`Currency`, `InvoiceDirection`, `PaymentDirection`, `PaymentMethod`).
  All models are `frozen=True`, `str_strip_whitespace=True`, `extra="forbid"`.

## Acceptance Criteria Check

- [x] 4 models defined: `InvoiceLine`, `Invoice`, `Payment`, `JournalEntry`
- [x] 4 Literal type aliases: `Currency`, `InvoiceDirection`, `PaymentDirection`,
      `PaymentMethod`
- [x] Pydantic `@model_validator(mode="after")` on `Invoice`: validates
      `total_net + total_vat == total_gross` within `Decimal("0.01")` tolerance
      (covers Romanian 2-decimal line-item rounding accumulation)
- [x] Pydantic `@model_validator(mode="after")` on `Invoice` and `Payment`:
      `exchange_rate` required iff `currency != "RON"`; `exchange_rate` must be
      `None` when `currency == "RON"` (bidirectional guard)
- [x] Forward refs for `Partner` and `Article` via `TYPE_CHECKING` + string
      annotations — file parses safely before partner.py / article.py land at
      merge time
- [x] `source_metadata: dict[str, object]` on every model — no source data
      silently dropped
- [x] `Decimal` throughout — no `float` anywhere
- [x] `from __future__ import annotations` at top of file
- [x] `ConfigDict(frozen=True, str_strip_whitespace=True, extra="forbid")` on
      all 4 models
- [x] `model_rebuild()` calls at module bottom wrapped in `try/except` for
      deferred resolution safety
- [x] Line count: 301 (max 450)
- [x] No runtime imports from other canonical files
- [x] No imports from `migrator.parsers.*`
- [x] No new dependencies added

## Validator Rules Chosen

**`Invoice._validate_totals`:** tolerance is `Decimal("0.01")` — one cent in
RON/EUR. Romanian accounting rounds to 2 decimals per line; aggregating N lines
can accumulate up to `N * 0.005` rounding error. A flat 0.01 cap is safe for
invoices with reasonable line counts (SAGA's own import tolerance is the same).

**`Invoice._validate_exchange_rate` / `Payment._validate_exchange_rate`:**
bidirectional guard — rejects both "currency != RON and exchange_rate is None"
AND "currency == RON and exchange_rate is not None". The second guard prevents
generators from accidentally emitting a spurious exchange rate for RON invoices,
which would trigger a SAGA import warning.

## Currency Set

`Currency = Literal["RON", "EUR", "USD", "GBP", "CHF"]`

RON/EUR/USD are v1 priorities per `docs/questions-for-dani.md`. GBP and CHF
added because WinMentor supports them natively and the Literal is trivially
extensible without a schema migration.

## Forward-Ref Subtleties

- `from __future__ import annotations` makes ALL annotations strings at parse
  time, so `article: "Article"` and `partner: "Partner"` are equivalent to
  `article: Article` and `partner: Partner` under this import — the quotes are
  kept for clarity and to signal intentional forward reference.
- `model_rebuild()` is wrapped in `try/except Exception` (broad catch) because
  at worktree merge time the interpreter session may not have `partner.py` /
  `article.py` on its import path yet. Pydantic v2 will automatically call
  `model_rebuild()` the first time a model is instantiated, so this is safe.
- `Payment.partner` is typed `"Partner | None" = None`. Pydantic v2 handles
  optional forward refs correctly; the `None` default means the field is not
  required on construction.

## Security Check

- [x] No DB access (pure Pydantic schema — no ORM, no SQL)
- [x] No mutation endpoints (pure data model)
- [x] No job endpoints
- [x] No admin endpoints
- [x] No external inputs (Zod N/A — Python Pydantic used for Python models)
- [x] No PII in logs (no logging code in this file)
- [x] No session cookies
- [x] No rate limits needed (no HTTP handlers)
