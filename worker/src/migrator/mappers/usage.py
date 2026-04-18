from __future__ import annotations

from decimal import Decimal
from uuid import UUID

import asyncpg


async def record_call(
    pool: asyncpg.Pool,
    job_id: UUID,
    model: str,
    tokens_in: int,
    tokens_out: int,
    cost_usd: Decimal,
) -> None:
    """Insert one row into ai_usage.

    Caller invokes after every Haiku call, success or failure.
    Failures pass tokens_in=0, tokens_out=0, cost_usd=Decimal(0).
    DB fills id and created_at automatically.
    """
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO ai_usage (job_id, model, tokens_in, tokens_out, cost_usd)"
            " VALUES ($1, $2, $3, $4, $5)",
            job_id,
            model,
            tokens_in,
            tokens_out,
            cost_usd,
        )


async def count_for_job(pool: asyncpg.Pool, job_id: UUID) -> int:
    """Return COUNT(*) for the job. Used by ai_assisted.py for the per-job cap."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT COUNT(*) AS cnt FROM ai_usage WHERE job_id = $1",
            job_id,
        )
    return int(row["cnt"]) if row else 0


async def total_cost_for_job(pool: asyncpg.Pool, job_id: UUID) -> Decimal:
    """Return SUM(cost_usd) for the job.

    Uses COALESCE so an empty result set returns zero rather than None.
    Suitable for inclusion in report.json.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT COALESCE(SUM(cost_usd), 0) AS total FROM ai_usage WHERE job_id = $1",
            job_id,
        )
    return Decimal(row["total"]) if row else Decimal(0)


async def total_tokens_for_job(
    pool: asyncpg.Pool, job_id: UUID
) -> tuple[int, int]:
    """Return (SUM(tokens_in), SUM(tokens_out)) for the job.

    Uses COALESCE on both columns so an empty result set returns (0, 0)
    rather than (None, None). Suitable for inclusion in report.json.
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT"
            " COALESCE(SUM(tokens_in), 0) AS tin,"
            " COALESCE(SUM(tokens_out), 0) AS tout"
            " FROM ai_usage WHERE job_id = $1",
            job_id,
        )
    if row is None:
        return (0, 0)
    return (int(row["tin"]), int(row["tout"]))
