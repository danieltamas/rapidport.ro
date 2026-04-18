"""asyncpg connection pool + migration runner for the Rapidport worker.

Single source of truth for all DB access in the worker process.
Import ``create_pool`` at startup; pass the returned pool to every module
that needs DB access.  Call ``close_pool`` on graceful shutdown.

SSL note:
  Default is ssl="require" which matches DATABASE_URL ?sslmode=require.
  asyncpg honours the sslmode query parameter in the DSN when present,
  so the ssl= kwarg below acts as the secure fallback for DSNs that omit
  it (e.g. bare ``postgresql://localhost/rapidport`` in unit tests).

pgbouncer note:
  statement_cache_size is left at the asyncpg default (1024) because we
  target a direct Postgres connection (not pgbouncer).  If pgbouncer
  transaction-mode pooling is ever introduced, set statement_cache_size=0
  to prevent "prepared statement … already exists" errors.
"""
from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path

import asyncpg


# ---------------------------------------------------------------------------
# Pool lifecycle
# ---------------------------------------------------------------------------


async def create_pool(
    dsn: str | None = None,
    min_size: int = 2,
    max_size: int = 10,
) -> asyncpg.Pool[asyncpg.Record]:
    """Create and return an asyncpg connection pool.

    Args:
        dsn:      Full DSN string.  If *None* the value of the
                  ``DATABASE_URL`` environment variable is used.
        min_size: Minimum number of persistent connections.
        max_size: Maximum number of concurrent connections.

    Returns:
        An open :class:`asyncpg.Pool` ready for use.

    Raises:
        RuntimeError: If *dsn* is None and ``DATABASE_URL`` is not set.
        asyncpg.PostgresError: On connection failure.
    """
    resolved_dsn = dsn or os.environ.get("DATABASE_URL")
    if not resolved_dsn:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set and no dsn was provided."
        )

    # Use ssl="require" as the secure default.  If the DSN already encodes
    # sslmode=disable (e.g. a local test without TLS), asyncpg's own DSN
    # parser takes precedence over the ssl= kwarg, so this is safe.
    ssl: str | bool = "require"
    if _dsn_disables_ssl(resolved_dsn):
        ssl = False  # respect explicit opt-out (test environments only)

    pool: asyncpg.Pool[asyncpg.Record] | None = await asyncpg.create_pool(
        dsn=resolved_dsn,
        min_size=min_size,
        max_size=max_size,
        ssl=ssl,
        # statement_cache_size left at default (1024) — direct Postgres only.
        # Flip to 0 if pgbouncer transaction-mode pooling is introduced.
    )
    if pool is None:
        raise RuntimeError("asyncpg.create_pool returned None unexpectedly.")
    return pool


async def close_pool(pool: asyncpg.Pool[asyncpg.Record]) -> None:
    """Gracefully close every connection in *pool*.

    Waits up to 10 seconds for in-flight queries to complete before
    forcing a termination.
    """
    try:
        await asyncio.wait_for(pool.close(), timeout=10.0)
    except asyncio.TimeoutError:
        await pool.close()


# ---------------------------------------------------------------------------
# Migration runner
# ---------------------------------------------------------------------------


async def apply_migrations(
    pool: asyncpg.Pool[asyncpg.Record],
    migrations_dir: Path,
) -> list[str]:
    """Apply any unapplied ``NNN_*.sql`` migrations from *migrations_dir*.

    A lightweight ledger table ``_worker_migrations`` is created on the
    first call.  Each migration is applied inside its own transaction; on
    error the transaction is rolled back and the error is re-raised so the
    caller can decide whether to abort startup.

    Args:
        pool:           Open asyncpg pool.
        migrations_dir: Directory containing ``NNN_*.sql`` files.

    Returns:
        Sorted list of migration filenames that were applied in this call
        (empty list if everything was already up to date).
    """
    async with pool.acquire() as conn:
        conn: asyncpg.Connection[asyncpg.Record]

        # Ensure the ledger table exists.
        await conn.execute(_LEDGER_DDL)

        # Collect already-applied filenames.
        rows = await conn.fetch("SELECT filename FROM _worker_migrations")
        applied: set[str] = {str(row["filename"]) for row in rows}

        # Discover candidate files, sorted numerically by the NNN prefix.
        candidates = sorted(
            migrations_dir.glob("*.sql"),
            key=_migration_sort_key,
        )

        newly_applied: list[str] = []
        for path in candidates:
            filename = path.name
            if filename in applied:
                continue

            sql = path.read_text(encoding="utf-8")

            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute(
                    "INSERT INTO _worker_migrations (filename) VALUES ($1)",
                    filename,
                )

            newly_applied.append(filename)

    return newly_applied


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_LEDGER_DDL = """
CREATE TABLE IF NOT EXISTS _worker_migrations (
    filename    TEXT        PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""

_SSL_DISABLE_RE = re.compile(r"[?&]sslmode=disable", re.IGNORECASE)


def _dsn_disables_ssl(dsn: str) -> bool:
    """Return True only when the DSN explicitly opts out of SSL."""
    return bool(_SSL_DISABLE_RE.search(dsn))


def _migration_sort_key(path: Path) -> int:
    """Sort migration files by their numeric prefix (``NNN_``)."""
    match = re.match(r"^(\d+)", path.name)
    return int(match.group(1)) if match else 0
