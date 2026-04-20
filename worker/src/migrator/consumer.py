"""pg-boss consumer — direct asyncpg polling, no Python pg-boss client.

See worker/PG_BOSS_NOTES.md for rationale. Polls pgboss.job with
SELECT … FOR UPDATE SKIP LOCKED to claim 'convert' (and 'discover') jobs.

Signal handling:
  SIGTERM / SIGINT  → request graceful shutdown (finish current job).
  Second SIGINT     → hard exit (sys.exit(1)).

Per-job timeout: 15 minutes (900 s) enforced by asyncio.wait_for.

Pipeline note:
  run_convert() now delegates to migrator.pipeline.run_pipeline() — the shared
  core that also powers cli.py. Consumer-specific concerns (pg-boss polling,
  SIGTERM/SIGINT, asyncio.wait_for timeout, retry policy, idempotency) stay here.
"""
from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import asyncpg
from pydantic import BaseModel

from migrator.pipeline import PipelineEnv, run_pipeline
from migrator.utils.db import apply_migrations, close_pool, create_pool
from migrator.utils.logger import configure_logger, get_logger

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MIGRATIONS_DIR = Path(__file__).parent.parent.parent.parent / "migrations"
_JOB_TIMEOUT_S: float = 900.0          # 15-min hard kill per SPEC
_POLL_IDLE_S: float = 2.0              # sleep between empty polls
_POLL_MAX_IDLE_S: float = 30.0         # exponential backoff ceiling
_POLL_BACKOFF_FACTOR: float = 1.5
_CONVERT_RETRY_LIMIT: int = 3
_DISCOVER_RETRY_LIMIT: int = 1
_RETRY_DELAY_S: int = 60               # seconds between retries

_DEQUEUE_SQL = """
UPDATE pgboss.job
SET    state = 'active',
       startedon = NOW()
WHERE  id = (
    SELECT id
    FROM   pgboss.job
    WHERE  name = ANY($1)
      AND  state = 'created'
      AND  startafter <= NOW()
    ORDER  BY priority DESC, createdon, id
    FOR    UPDATE SKIP LOCKED
    LIMIT  1
)
RETURNING id, name, data, retrycount, retrylimit
"""

_COMPLETE_SQL = """
UPDATE pgboss.job
SET state = 'completed', completedon = NOW()
WHERE id = $1
"""

_RETRY_SQL = """
UPDATE pgboss.job
SET    state = 'created',
       retrycount = retrycount + 1,
       startafter = NOW() + ($1 * INTERVAL '1 second')
WHERE  id = $2
"""

_FAIL_SQL = """
UPDATE pgboss.job
SET    state = 'failed',
       completedon = NOW(),
       output = $2
WHERE  id = $1
"""

# ---------------------------------------------------------------------------
# Payload models
# ---------------------------------------------------------------------------


class ConvertPayload(BaseModel):
    """pg-boss 'convert' job payload."""

    job_id: UUID
    input_path: str
    output_dir: str
    a1_articles: bool = False
    a1_warehouses: bool = False
    mapping_profile: str | None = None


class DiscoverPayload(BaseModel):
    """pg-boss 'discover' job payload (not yet implemented)."""

    job_id: UUID
    input_path: str


# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------


@dataclass
class _Env:
    """Consumer-level env: database_url + PipelineEnv for the pipeline."""

    database_url: str
    pipeline: PipelineEnv

    @property
    def worker_version(self) -> str:
        return self.pipeline.worker_version

    @property
    def canonical_schema_version(self) -> str:
        return self.pipeline.canonical_schema_version


def _load_env() -> _Env:
    missing = [k for k in ("DATABASE_URL",) if not os.environ.get(k, "").strip()]
    if missing:
        raise RuntimeError(f"Missing required env vars: {', '.join(missing)}")
    return _Env(
        database_url=os.environ["DATABASE_URL"].strip(),
        pipeline=PipelineEnv.from_env(),
    )


# ---------------------------------------------------------------------------
# DB helpers — progress + status updates against rapidport.jobs
# ---------------------------------------------------------------------------


async def _progress(
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    job_id: UUID,
    stage: str,
    pct: int,
) -> None:
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE jobs SET progress_stage=$1, progress_pct=$2 WHERE id=$3",
                stage,
                pct,
                job_id,
            )
    except Exception:
        log.warning("progress_update_failed", stage=stage)


async def _mark_rp_running(pool: asyncpg.Pool, job_id: UUID) -> None:  # type: ignore[type-arg]
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE jobs SET status='running', progress_stage='started' WHERE id=$1",
                job_id,
            )
    except Exception:
        log.warning("mark_running_failed", job_id=str(job_id))


async def _mark_rp_succeeded(pool: asyncpg.Pool, job_id: UUID) -> None:  # type: ignore[type-arg]
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE jobs SET status='succeeded', progress_pct=100,"
                " progress_stage='done' WHERE id=$1",
                job_id,
            )
    except Exception:
        log.warning("mark_succeeded_failed", job_id=str(job_id))


async def _mark_rp_failed(
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    job_id: UUID,
    reason: str,
) -> None:
    try:
        async with pool.acquire() as conn:
            try:
                await conn.execute(
                    "UPDATE jobs SET status='failed', progress_stage='failed',"
                    " failure_reason=$1 WHERE id=$2",
                    reason[:500],
                    job_id,
                )
            except asyncpg.UndefinedColumnError:
                await conn.execute(
                    "UPDATE jobs SET status='failed',"
                    " progress_stage='failed' WHERE id=$1",
                    job_id,
                )
    except Exception:
        log.warning("mark_failed_update_failed", job_id=str(job_id))


async def _check_rp_status(
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    job_id: UUID,
) -> str | None:
    """Return jobs.status for the given rapidport job_id, or None if not found."""
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow("SELECT status FROM jobs WHERE id=$1", job_id)
            return str(row["status"]) if row else None
    except Exception:
        log.warning("rp_status_check_failed", job_id=str(job_id))
        return None




# ---------------------------------------------------------------------------
# Core pipeline — 'convert' job
# ---------------------------------------------------------------------------


async def run_convert(
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    payload: ConvertPayload,
    env: _Env,
) -> None:
    """Execute the full WinMentor → SAGA pipeline for one convert job.

    Delegates canonical building to pipeline.run_pipeline(). Consumer-specific
    concerns (pg-boss polling, SIGTERM/SIGINT, asyncio.wait_for timeout,
    retry policy, idempotency) remain here and are NOT in pipeline.py.
    """
    from migrator.generators.orchestrator import CanonicalData, MappingProfile, generate_saga_output
    from migrator.mappers import usage as usage_mod
    from migrator.parsers.winmentor import detect_version
    from migrator.reports.conversion_report_json import ReportInput as JsonRI
    from migrator.reports.conversion_report_json import ReportIssue as JsonIssue
    from migrator.reports.conversion_report_json import write_report_json
    from migrator.reports.conversion_report_pdf import AiUsage, EntitySummary
    from migrator.reports.conversion_report_pdf import ReportInput as PdfRI
    from migrator.reports.conversion_report_pdf import ReportIssue as PdfIssue
    from migrator.reports.conversion_report_pdf import write_report_pdf
    from migrator.utils.archive import ArchiveError, bundle_output, extract_archive

    job_id = payload.job_id
    input_path = Path(payload.input_path).resolve()
    output_dir = Path(payload.output_dir).resolve()
    started_at = datetime.now(UTC)

    await _progress(pool, job_id, "extracting", 0)

    tmp_obj: tempfile.TemporaryDirectory[str] | None = None
    extract_dir: Path

    if input_path.is_dir():
        extract_dir = input_path
    else:
        tmp_obj = tempfile.TemporaryDirectory(prefix="rapidport_")
        extract_dir = Path(tmp_obj.name)
        try:
            extract_archive(input_path, extract_dir)
        except ArchiveError as exc:
            raise RuntimeError(f"archive_extraction_failed: {type(exc).__name__}") from exc

    try:
        await _progress(pool, job_id, "extracting", 10)
        src_ver = detect_version(extract_dir).version
        await _progress(pool, job_id, "parsing", 10)

        profile = MappingProfile(
            article_cod_extern_enabled=not payload.a1_articles,
            warehouse_code_enabled=not payload.a1_warehouses,
        )
        own_cif = os.environ.get("OWN_CIF", "")

        result = await run_pipeline(
            pool=pool,
            job_id=job_id,
            extracted_dir=extract_dir,
            profile=profile,
            env=env.pipeline,
            own_cif=own_cif,
        )
        await _progress(pool, job_id, "mapping", 70)

        output_dir.mkdir(parents=True, exist_ok=True)
        await _progress(pool, job_id, "generating", 70)
        canonical = CanonicalData(
            partners=result.partners,
            articles=result.articles,
            invoices=result.invoices,
            payments=result.payments,
            chart_of_accounts=result.chart_of_accounts,
            own_cif=own_cif,
        )
        gen_stats = generate_saga_output(canonical, output_dir, profile)
        await _progress(pool, job_id, "generating", 90)

        completed_at = datetime.now(UTC)
        await _progress(pool, job_id, "reporting", 90)

        all_reasons = result.invoice_reasons + result.payment_reasons
        json_issues = [
            JsonIssue(severity="warning", category="generation", message=e)
            for e in gen_stats.errors + all_reasons
        ]
        await write_report_json(pool, output_dir, JsonRI(
            job_id=job_id,
            worker_version=env.worker_version,
            canonical_schema_version=env.canonical_schema_version,
            source_software="winmentor",
            source_version=src_ver,
            target_software="saga",
            target_version="C 3.0",
            mapping_profile_name=payload.mapping_profile,
            generation_stats=gen_stats,
            issues=json_issues,
            rule_hits=result.rule_hits,
            cache_hits=result.cache_hits,
            haiku_hits=result.haiku_hits,
            warnings=[],
        ))

        haiku_calls = await usage_mod.count_for_job(pool, job_id)
        t_in, t_out = await usage_mod.total_tokens_for_job(pool, job_id)
        cost = float(await usage_mod.total_cost_for_job(pool, job_id))

        pdf_issues = [
            PdfIssue(entity="generation", source_id="", severity="warning", message=e)
            for e in gen_stats.errors
        ]
        write_report_pdf(output_dir, PdfRI(
            worker_version=env.worker_version,
            canonical_schema_version=env.canonical_schema_version,
            source_software="winmentor",
            source_version_detected=src_ver or "unknown",
            target_software="saga",
            target_version="C 3.0",
            started_at=started_at,
            completed_at=completed_at,
            ai_usage=AiUsage(
                haiku_calls=haiku_calls, tokens_in=t_in, tokens_out=t_out, cost_usd=cost
            ),
            summary={
                "partners": EntitySummary(
                    total=len(result.partners), converted=len(result.partners),
                    skipped=0, errors=0),
                "articles": EntitySummary(
                    total=len(result.articles), converted=len(result.articles),
                    skipped=0, errors=0),
                "invoices": EntitySummary(
                    total=len(result.invoices), converted=len(result.invoices),
                    skipped=len(result.invoice_reasons), errors=0),
                "payments": EntitySummary(
                    total=len(result.payments), converted=len(result.payments),
                    skipped=len(result.payment_reasons), errors=0),
            },
            issues=pdf_issues,
        ))

        # Bundle the output directory into a sibling output.zip so the Nuxt
        # download handler (api/jobs/[id]/download) can stream a single file.
        # Atomic rename inside bundle_output guarantees no half-written file is
        # observed. Bundle BEFORE marking succeeded so the SSE 'done' event
        # implies the zip is ready to download.
        try:
            bundle_output(output_dir)
        except ArchiveError as exc:
            # Bundling failure is fatal: the user paid for a downloadable bundle.
            # Mark failed so the customer is notified rather than landing on a
            # 'succeeded' job that returns 501 on download.
            raise RuntimeError(f"bundle_failed: {exc}") from exc

        await _mark_rp_succeeded(pool, job_id)
        await _progress(pool, job_id, "done", 100)
        log.info(
            "job_completed",
            rapidport_job_id=str(job_id),
            partners=len(result.partners),
            articles=len(result.articles),
            invoices=len(result.invoices),
            payments=len(result.payments),
        )

    finally:
        if tmp_obj is not None:
            tmp_obj.cleanup()


# ---------------------------------------------------------------------------
# pg-boss retry logic
# ---------------------------------------------------------------------------


async def _fail_or_retry(
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    pgboss_id: UUID,
    retrycount: int,
    retrylimit: int,
    reason: str,
) -> bool:
    """Mark a pgboss job failed or schedule a retry. Returns True if retried."""
    output_json = json.dumps({"error": reason, "pii_redacted": True})
    if retrycount < retrylimit:
        async with pool.acquire() as conn:
            await conn.execute(_RETRY_SQL, _RETRY_DELAY_S, pgboss_id)
        log.info(
            "job_failed",
            pgboss_job_id=str(pgboss_id),
            retry_next=True,
            retrycount=retrycount + 1,
            retrylimit=retrylimit,
        )
        return True
    else:
        async with pool.acquire() as conn:
            await conn.execute(_FAIL_SQL, pgboss_id, output_json)
        log.info(
            "job_failed",
            pgboss_job_id=str(pgboss_id),
            retry_next=False,
            retrycount=retrycount,
            retrylimit=retrylimit,
        )
        return False


# ---------------------------------------------------------------------------
# Job dispatch
# ---------------------------------------------------------------------------


async def _handle_job(
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    env: _Env,
    pgboss_id: UUID,
    name: str,
    data: object,
    retrycount: int,
    retrylimit: int,
) -> None:
    """Dispatch a single dequeued job. Handles timeouts, idempotency, retries."""
    log.info("job_started", pgboss_job_id=str(pgboss_id), job_type=name)

    if name == "convert":
        try:
            payload = ConvertPayload.model_validate(data)
        except Exception as validation_exc:
            exc_name = type(validation_exc).__name__
            log.error(
                "job_failed",
                pgboss_job_id=str(pgboss_id),
                job_type=name,
                reason="invalid_payload",
                retry_next=False,
            )
            await _fail_or_retry(
                pool,
                pgboss_id,
                retrylimit,  # set retrycount=retrylimit to skip retry on bad payload
                retrylimit,
                f"invalid_payload: {exc_name}",
            )
            return

        # Idempotency: skip if already succeeded.
        rp_status = await _check_rp_status(pool, payload.job_id)
        if rp_status == "succeeded":
            log.info(
                "job_completed",
                pgboss_job_id=str(pgboss_id),
                rapidport_job_id=str(payload.job_id),
                reason="already_succeeded",
            )
            async with pool.acquire() as conn:
                await conn.execute(_COMPLETE_SQL, pgboss_id)
            return

        await _mark_rp_running(pool, payload.job_id)
        t_start = asyncio.get_running_loop().time()
        try:
            await asyncio.wait_for(run_convert(pool, payload, env), timeout=_JOB_TIMEOUT_S)
        except asyncio.TimeoutError:
            elapsed = asyncio.get_running_loop().time() - t_start
            log.error(
                "job_timed_out",
                pgboss_job_id=str(pgboss_id),
                rapidport_job_id=str(payload.job_id),
                elapsed_seconds=int(elapsed),
            )
            await _mark_rp_failed(pool, payload.job_id, "timeout after 15 minutes")
            # Timeout is a data/infra problem — no retry benefit; exhaust limit.
            await _fail_or_retry(pool, pgboss_id, retrylimit, retrylimit, "timeout")
        except Exception as exc:
            log.error(
                "job_failed",
                pgboss_job_id=str(pgboss_id),
                rapidport_job_id=str(payload.job_id),
                reason=type(exc).__name__,
                retry_next=retrycount < retrylimit,
            )
            await _mark_rp_failed(pool, payload.job_id, type(exc).__name__)
            await _fail_or_retry(pool, pgboss_id, retrycount, retrylimit, type(exc).__name__)
        else:
            async with pool.acquire() as conn:
                await conn.execute(_COMPLETE_SQL, pgboss_id)

    elif name == "discover":
        # 'discover' is accepted but not yet implemented.
        log.warning(
            "discover_not_implemented",
            pgboss_job_id=str(pgboss_id),
            reason="feature_not_yet_implemented",
        )
        # TODO: implement discover pipeline (extract archive, registry scan, write inventory JSON)
        await _fail_or_retry(
            pool,
            pgboss_id,
            retrylimit,  # exhaust limit immediately — no retry for not-implemented
            retrylimit,
            "discover_not_implemented",
        )

    else:
        log.warning(
            "job_failed",
            pgboss_job_id=str(pgboss_id),
            job_type=name,
            reason="unknown_job_type",
            retry_next=False,
        )
        await _fail_or_retry(pool, pgboss_id, retrylimit, retrylimit, f"unknown_job_type:{name}")


# ---------------------------------------------------------------------------
# Main consumer loop
# ---------------------------------------------------------------------------


async def run_consumer() -> None:
    """Main consumer loop. Runs forever until SIGTERM/SIGINT."""
    env = _load_env()
    configure_logger(os.environ.get("LOG_LEVEL", "info"))

    # Graceful shutdown event — set by signal handlers.
    shutdown_event: asyncio.Event = asyncio.Event()
    _second_signal_time: list[float] = []  # mutable container for closure

    loop = asyncio.get_running_loop()

    def _request_shutdown(signum: int, _frame: object) -> None:
        sig_name = signal.Signals(signum).name
        now = loop.time()
        if _second_signal_time and (now - _second_signal_time[0]) < 5.0:
            log.warning("consumer_shutdown_complete", reason="second_signal_hard_exit")
            sys.exit(1)
        _second_signal_time.append(now)
        log.info("consumer_shutdown_requested", signal=sig_name)
        loop.call_soon_threadsafe(shutdown_event.set)

    # Register SIGTERM / SIGINT (Unix only; skipped on Windows).
    if sys.platform != "win32":
        signal.signal(signal.SIGTERM, _request_shutdown)
        signal.signal(signal.SIGINT, _request_shutdown)

    pool: asyncpg.Pool[asyncpg.Record] = await create_pool(env.database_url)
    try:
        await apply_migrations(pool, _MIGRATIONS_DIR)

        log.info("consumer_started", worker_version=env.worker_version)

        idle_sleep = _POLL_IDLE_S  # reset to base after each job; backs off on empty polls

        while not shutdown_event.is_set():
            log.debug("consumer_polling")

            try:
                row: asyncpg.Record | None = None
                async with pool.acquire() as conn:
                    row = await conn.fetchrow(
                        _DEQUEUE_SQL,
                        ["convert", "discover"],
                    )
            except Exception as exc:
                log.error(
                    "consumer_poll_error",
                    reason=type(exc).__name__,
                )
                await asyncio.sleep(5.0)
                continue

            if row is None:
                # No jobs available — back off exponentially up to ceiling.
                await asyncio.sleep(idle_sleep)
                idle_sleep = min(idle_sleep * _POLL_BACKOFF_FACTOR, _POLL_MAX_IDLE_S)
                continue

            # Reset backoff — we found work.
            idle_sleep = _POLL_IDLE_S

            pgboss_id: UUID = row["id"]
            name: str = row["name"]
            raw_data: object = row["data"]
            retrycount: int = int(row["retrycount"] or 0)

            # Use pg-boss queue default retry limit if retrylimit column present,
            # otherwise fall back to our hardcoded defaults.
            raw_rl = row["retrylimit"]
            if raw_rl is not None:
                retrylimit = int(raw_rl)
            elif name == "discover":
                retrylimit = _DISCOVER_RETRY_LIMIT
            else:
                retrylimit = _CONVERT_RETRY_LIMIT

            # Decode JSON data field if it comes back as a string.
            if isinstance(raw_data, str):
                try:
                    data: object = json.loads(raw_data)
                except json.JSONDecodeError:
                    data = {}
            else:
                data = raw_data

            log.info(
                "job_dequeued",
                pgboss_job_id=str(pgboss_id),
                job_type=name,
                retrycount=retrycount,
            )

            await _handle_job(pool, env, pgboss_id, name, data, retrycount, retrylimit)

            # Immediately poll again after handling a job.
            # If shutdown was requested during the job, the loop condition exits cleanly.

    finally:
        await close_pool(pool)
        log.info("consumer_shutdown_complete")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    """Sync entry point for ``python -m migrator.consumer``.

    Calls asyncio.run(run_consumer()) with top-level error handling and
    structured logging initialisation.
    """
    # Configure minimal logging before pool is ready (startup errors need output).
    configure_logger(os.environ.get("LOG_LEVEL", "info"))
    try:
        asyncio.run(run_consumer())
    except KeyboardInterrupt:
        # Caught here only if the signal handler did not set shutdown_event fast
        # enough (race on very fast ^C before the loop starts).
        sys.exit(0)
    except Exception as exc:
        log.error("consumer_fatal_error", reason=type(exc).__name__)
        sys.exit(2)


if __name__ == "__main__":
    main()
