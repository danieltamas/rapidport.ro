"""mapping_cache — asyncpg-backed read-through / write-through cache.

Called BEFORE any Haiku request (cache-first) and AFTER every Haiku success
(write-through). All SQL uses positional parameterised args — no interpolation.

Event names for structured logging:
    "cache_hit"    — lookup returned a row
    "cache_miss"   — lookup returned nothing
    "cache_upsert" — upsert completed
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import asyncpg

from migrator.utils.logger import get_logger

__all__ = ["CacheHit", "lookup", "upsert"]

_log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Public types
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CacheHit:
    """Immutable result returned by a successful cache lookup."""

    target_field: str
    confidence: Decimal  # Decimal preserves NUMERIC(4,3) exactness; no float
    reasoning: str | None
    hit_count: int  # post-increment value from the atomic UPDATE RETURNING


# ---------------------------------------------------------------------------
# SQL constants — parameterised, never interpolated
# ---------------------------------------------------------------------------

_LOOKUP_SQL = """
UPDATE mapping_cache
SET    hit_count = hit_count + 1
WHERE  source_software = $1
  AND  table_name      = $2
  AND  field_name      = $3
RETURNING target_field, confidence, reasoning, hit_count
"""

_UPSERT_SQL = """
INSERT INTO mapping_cache
    (source_software, table_name, field_name, target_field, confidence, reasoning)
VALUES
    ($1, $2, $3, $4, $5, $6)
ON CONFLICT (source_software, table_name, field_name)
DO UPDATE SET
    target_field = EXCLUDED.target_field,
    confidence   = EXCLUDED.confidence,
    reasoning    = EXCLUDED.reasoning
"""

# ---------------------------------------------------------------------------
# Public async API
# ---------------------------------------------------------------------------


async def lookup(
    pool: asyncpg.Pool,
    source_software: str,
    table_name: str,
    field_name: str,
) -> CacheHit | None:
    """Return the cached mapping if present, else None.

    Atomically increments hit_count via a single UPDATE … RETURNING so the
    read and the counter bump happen in one round-trip without a transaction.
    The returned ``hit_count`` reflects the post-increment value.

    Args:
        pool:            asyncpg connection pool.
        source_software: Software identifier, e.g. ``"winmentor"``.
        table_name:      Table name as normalised by caller (uppercase per
                         Phase 0 convention), e.g. ``"NPART"``.
        field_name:      Field name as normalised by caller, e.g.
                         ``"COD_PART"``.

    Returns:
        :class:`CacheHit` on cache hit, ``None`` on miss.
    """
    row: Any = await pool.fetchrow(
        _LOOKUP_SQL,
        source_software,
        table_name,
        field_name,
    )

    if row is None:
        _log.debug(
            "cache_miss",
            source_software=source_software,
            table_name=table_name,
            field_name=field_name,
        )
        return None

    hit = CacheHit(
        target_field=row["target_field"],
        confidence=Decimal(str(row["confidence"])),
        reasoning=row["reasoning"],
        hit_count=row["hit_count"],
    )
    _log.debug(
        "cache_hit",
        source_software=source_software,
        table_name=table_name,
        field_name=field_name,
        target_field=hit.target_field,
        confidence=str(hit.confidence),
        hit_count=hit.hit_count,
    )
    return hit


async def upsert(
    pool: asyncpg.Pool,
    source_software: str,
    table_name: str,
    field_name: str,
    target_field: str,
    confidence: Decimal,
    reasoning: str | None = None,
) -> None:
    """Write-through from a Haiku success.

    Uses ``ON CONFLICT … DO UPDATE`` so the row is created on first write and
    updated on every subsequent Haiku call.  ``hit_count`` is intentionally
    **not** reset on update — accumulated hit stats are preserved.

    Args:
        pool:            asyncpg connection pool.
        source_software: Software identifier, e.g. ``"winmentor"``.
        table_name:      Table name (normalised, uppercase).
        field_name:      Field name (normalised, uppercase).
        target_field:    Canonical target field name produced by Haiku.
        confidence:      Mapping confidence in [0, 1] as a :class:`Decimal`
                         to match the NUMERIC(4,3) column type.
        reasoning:       Optional free-text explanation from Haiku.
    """
    await pool.execute(
        _UPSERT_SQL,
        source_software,
        table_name,
        field_name,
        target_field,
        confidence,
        reasoning,
    )
    _log.debug(
        "cache_upsert",
        source_software=source_software,
        table_name=table_name,
        field_name=field_name,
        target_field=target_field,
        confidence=str(confidence),
    )
