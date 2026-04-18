"""AI-assisted field mapping via Claude Haiku.

Flow: cache-check → per-job cap → Haiku call → Pydantic validate → cache write
→ ai_usage write → AIResult return.

Retry: APITimeoutError, APIConnectionError, RateLimitError — 3 attempts,
exponential backoff 1–8 s. BadRequestError / AuthenticationError not retried.

Pricing verified 2025-08-01 (https://www.anthropic.com/pricing).
Update _HAIKU_*_COST_PER_MTOK + comment date when rates change.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

import anthropic
import asyncpg
from pydantic import BaseModel, field_validator
from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from migrator.mappers import cache as _cache
from migrator.mappers import usage as _usage
from migrator.utils.logger import get_logger

__all__ = ["AIResult", "CallCapExceeded", "suggest_mapping"]

_log = get_logger(__name__)

# Pricing — https://www.anthropic.com/pricing  (verified 2025-08-01)
# claude-haiku-4-5: $0.80 input / $4.00 output per million tokens
# Update this pair + "verified" date whenever rates change.
_HAIKU_INPUT_COST_PER_MTOK: Decimal = Decimal("0.80")
_HAIKU_OUTPUT_COST_PER_MTOK: Decimal = Decimal("4.00")

# SPEC §1 specifies haiku-4-5; env var allows snapshot pin without a code change.
_DEFAULT_MODEL = "claude-haiku-4-5-20251001"

# Parameterised cap query — no string interpolation.
_CAP_COUNT_SQL = "SELECT COUNT(*) FROM ai_usage WHERE job_id = $1"

# Canonical target fields enumerated in the prompt.
_VALID_TARGETS = (
    "partner.cif, partner.name, partner.source_id, partner.cnp, "
    "partner.email, partner.phone, "
    "partner.billing_address.street, partner.billing_address.city, "
    "partner.billing_address.county, "
    "article.name, article.source_id, article.cod_extern, "
    "article.unit, article.vat_rate, article.account_code, "
    "invoice.invoice_number, invoice.invoice_date, invoice.due_date, "
    "invoice.total_net, invoice.total_vat, invoice.total_gross, "
    "invoice.currency, invoice.exchange_rate, "
    "payment.payment_date, payment.amount, payment.method, "
    "payment.reference_number, "
    "gestiune.code, gestiune.name, "
    "chart_of_accounts.code, chart_of_accounts.name, "
    "UNMAPPABLE"
)


@dataclass(frozen=True, slots=True)
class AIResult:
    """Immutable result from a Haiku suggestion (live call or cache hit)."""

    target_field: str
    confidence: Decimal  # 0..1
    reasoning: str
    tokens_in: int
    tokens_out: int
    cost_usd: Decimal


class CallCapExceeded(Exception):
    """Raised when a job exceeds MAX_HAIKU_CALLS_PER_JOB."""


class _AISuggestion(BaseModel):
    """Validated JSON response from Haiku."""

    target_field: str
    confidence: float  # validated to [0, 1] before conversion to Decimal
    reasoning: str

    @field_validator("confidence")
    @classmethod
    def _range(cls, v: float) -> float:
        if v < 0.0 or v > 1.0:
            raise ValueError(f"confidence {v!r} is outside [0, 1]")
        return v


def _build_prompt(
    source_software: str,
    table_name: str,
    field_name: str,
    sample_values: list[str],
) -> str:
    """Build the XML-tagged structured prompt for Haiku."""
    # Truncate each sample to 200 chars; take at most 5; never log them.
    safe_samples = "\n".join(v[:200] for v in sample_values[:5])

    return f"""<task>
You map WinMentor (Romanian accounting software) field names to canonical \
target fields for a WinMentor\u2192SAGA migration.
</task>

<source>
  <software>{source_software}</software>
  <table>{table_name}</table>
  <field>{field_name}</field>
  <sample_values>{safe_samples}</sample_values>
</source>

<valid_targets>
  {_VALID_TARGETS}
</valid_targets>

<instructions>
Respond with JSON ONLY (no surrounding prose). Schema:
{{
  "target_field": "<one of valid_targets>",
  "confidence": <float 0..1>,
  "reasoning": "<one sentence Romanian or English>"
}}
Return target_field = "UNMAPPABLE" with confidence 1.0 if the field is not \
mappable (e.g. internal join key, unused column).
</instructions>"""


def _retryable_exceptions() -> tuple[type[Exception], ...]:
    """Return the exception types that should trigger a retry."""
    return (
        anthropic.APITimeoutError,
        anthropic.APIConnectionError,
        anthropic.RateLimitError,
    )


@retry(
    retry=retry_if_exception_type(_retryable_exceptions()),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    reraise=True,
)
async def _call_haiku(
    client: anthropic.AsyncAnthropic,
    model: str,
    prompt: str,
) -> anthropic.types.Message:
    """Call the Haiku API with retry on transient errors.

    BadRequestError and AuthenticationError are NOT in the retry set —
    they indicate caller bugs that should surface immediately.
    """
    return await client.messages.create(
        model=model,
        max_tokens=256,
        messages=[{"role": "user", "content": prompt}],
    )


def _compute_cost(tokens_in: int, tokens_out: int) -> Decimal:
    """Return the USD cost rounded to 6 decimal places."""
    cost = (Decimal(tokens_in) / Decimal(1_000_000)) * _HAIKU_INPUT_COST_PER_MTOK + (
        Decimal(tokens_out) / Decimal(1_000_000)
    ) * _HAIKU_OUTPUT_COST_PER_MTOK
    return cost.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


async def suggest_mapping(
    pool: asyncpg.Pool,
    source_software: str,
    table_name: str,
    field_name: str,
    sample_values: list[str],
    job_id: str,
    max_calls_per_job: int = 500,
) -> AIResult:
    """Suggest a target canonical field for the given source field.

    Flow:
      1. Check cache — if hit, return AIResult synthesised from cache
         (tokens_in=0, tokens_out=0, cost_usd=Decimal(0)).
      2. Check per-job call count in ai_usage; raise CallCapExceeded if
         count >= max_calls_per_job.
      3. Call Anthropic Haiku with structured XML prompt.
      4. Validate JSON response with _AISuggestion Pydantic model.
      5. Write cache via migrator.mappers.cache.upsert().
      6. Write ai_usage row via migrator.mappers.usage.record_call().
      7. Return AIResult.

    Args:
        pool: asyncpg connection pool.
        source_software: Software identifier, e.g. ``"winmentor"``.
        table_name: Table name (normalised, uppercase).
        field_name: Field name (normalised, uppercase).
        sample_values: Up to 5 representative values. NEVER logged (possible PII).
        job_id: Owning job UUID for per-job cap tracking.
        max_calls_per_job: Hard cap on Haiku calls per job (default 500).

    Raises:
        CallCapExceeded: Job has reached the call cap.
        anthropic.BadRequestError / AuthenticationError: Propagated immediately.
        anthropic.APIError: Raised after 3 retries on transient errors.
        pydantic.ValidationError: Haiku returned malformed JSON.
    """
    # ------------------------------------------------------------------ 1
    hit = await _cache.lookup(pool, source_software, table_name, field_name)
    if hit is not None:
        _log.info(
            "haiku_cache_hit",
            source_software=source_software,
            table_name=table_name,
            field_name=field_name,
            target_field=hit.target_field,
            confidence=str(hit.confidence),
        )
        return AIResult(
            target_field=hit.target_field,
            confidence=hit.confidence,
            reasoning=hit.reasoning or "",
            tokens_in=0,
            tokens_out=0,
            cost_usd=Decimal(0),
        )

    # ------------------------------------------------------------------ 2
    call_count: int = await pool.fetchval(_CAP_COUNT_SQL, job_id)  # type: ignore[assignment]
    if call_count >= max_calls_per_job:
        _log.warning(
            "haiku_cap_exceeded",
            job_id=job_id,
            call_count=call_count,
            max_calls_per_job=max_calls_per_job,
            field_name=field_name,
        )
        raise CallCapExceeded(
            f"Job {job_id!r} has reached the Haiku call cap "
            f"({call_count}/{max_calls_per_job})"
        )

    # ------------------------------------------------------------------ 3
    model = os.environ.get("ANTHROPIC_MODEL", _DEFAULT_MODEL)
    prompt = _build_prompt(source_software, table_name, field_name, sample_values)
    client = anthropic.AsyncAnthropic()  # reads ANTHROPIC_API_KEY from env

    _log.info(
        "haiku_called",
        source_software=source_software,
        table_name=table_name,
        field_name=field_name,
        model=model,
        job_id=job_id,
    )

    message = await _call_haiku(client, model, prompt)

    tokens_in: int = message.usage.input_tokens
    tokens_out: int = message.usage.output_tokens
    raw_text: str = message.content[0].text  # type: ignore[union-attr]

    # ------------------------------------------------------------------ 4
    try:
        parsed: dict[str, Any] = json.loads(raw_text)
        suggestion = _AISuggestion.model_validate(parsed)
    except Exception as exc:
        _log.error(
            "haiku_response_invalid",
            source_software=source_software,
            table_name=table_name,
            field_name=field_name,
            error=str(exc),
            # raw_text intentionally omitted — may contain data
        )
        raise

    confidence = Decimal(str(suggestion.confidence))
    cost = _compute_cost(tokens_in, tokens_out)

    # ------------------------------------------------------------------ 5
    await _cache.upsert(
        pool,
        source_software,
        table_name,
        field_name,
        suggestion.target_field,
        confidence,
        suggestion.reasoning,
    )

    # ------------------------------------------------------------------ 6
    await _usage.record_call(
        pool=pool,
        job_id=job_id,
        model=model,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost_usd=cost,
    )

    # ------------------------------------------------------------------ 7
    return AIResult(
        target_field=suggestion.target_field,
        confidence=confidence,
        reasoning=suggestion.reasoning,
        tokens_in=tokens_in,
        tokens_out=tokens_out,
        cost_usd=cost,
    )
