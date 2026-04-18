"""Command-line interface for the migrator worker.

Two subcommands:
  convert   Full WinMentor → SAGA pipeline (needs DB + archive).
  inspect   Dry-run: print table inventory, no DB writes.

Exit codes: 0 = success, 1 = user error, 2 = pipeline failure.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import tempfile
import traceback
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import asyncpg

from migrator.pipeline import PipelineEnv, run_pipeline
from migrator.utils.db import apply_migrations, close_pool, create_pool
from migrator.utils.logger import configure_logger, get_logger

log = get_logger(__name__)

_MIGRATIONS_DIR = Path(__file__).parent.parent.parent.parent / "migrations"


def _load_env() -> tuple[str, PipelineEnv]:
    """Load DATABASE_URL and PipelineEnv from environment."""
    missing = [k for k in ("DATABASE_URL",) if not os.environ.get(k, "").strip()]
    if missing:
        raise RuntimeError(f"Missing required env vars: {', '.join(missing)}")
    return os.environ["DATABASE_URL"].strip(), PipelineEnv.from_env()


async def _progress(
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    job_id: str,
    stage: str,
    pct: int,
) -> None:
    ts = datetime.now(UTC).isoformat(timespec="seconds")
    print(f"[{ts}] stage={stage} pct={pct}", file=sys.stderr)
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE jobs SET progress_stage=$1, progress_pct=$2 WHERE id=$3",
                stage, pct, UUID(job_id),
            )
    except Exception:
        log.warning("progress_update_failed", stage=stage)


async def _mark_failed(
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    job_id: str,
    reason: str,
) -> None:
    try:
        async with pool.acquire() as conn:
            try:
                await conn.execute(
                    "UPDATE jobs SET status='failed', progress_stage='failed',"
                    " failure_reason=$1 WHERE id=$2",
                    reason[:500], UUID(job_id),
                )
            except asyncpg.UndefinedColumnError:
                await conn.execute(
                    "UPDATE jobs SET status='failed',"
                    " progress_stage='failed' WHERE id=$1",
                    UUID(job_id),
                )
    except Exception:
        log.warning("mark_failed_update_failed", job_id=job_id)


async def _run_convert(args: argparse.Namespace) -> None:  # noqa: C901
    from migrator.generators.orchestrator import CanonicalData, MappingProfile, generate_saga_output
    from migrator.mappers import usage as usage_mod
    from migrator.parsers.winmentor import detect_version
    from migrator.reports.conversion_report_json import (
        ReportInput as JsonRI, ReportIssue as JsonIssue, write_report_json,
    )
    from migrator.reports.conversion_report_pdf import (
        ReportInput as PdfRI, AiUsage, EntitySummary, ReportIssue as PdfIssue,
        write_report_pdf,
    )

    database_url, env = _load_env()
    configure_logger(os.environ.get("LOG_LEVEL", "info"))

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output).resolve()
    job_id: str = args.job_id

    if not input_path.exists():
        print(f"error: input not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    started_at = datetime.now(UTC)
    pool: asyncpg.Pool = await create_pool(database_url)  # type: ignore[type-arg]

    try:
        await apply_migrations(pool, _MIGRATIONS_DIR)
        await _progress(pool, job_id, "extracting", 0)

        tmp_obj: tempfile.TemporaryDirectory[str] | None = None
        extract_dir: Path

        if input_path.is_dir():
            extract_dir = input_path
        else:
            tmp_obj = tempfile.TemporaryDirectory(prefix="rapidport_")
            extract_dir = Path(tmp_obj.name)
            try:
                from migrator.utils.archive import extract_archive  # type: ignore[import-not-found]
                extract_archive(input_path, extract_dir)
            except ImportError:
                raise RuntimeError("migrator.utils.archive not available at merge time")

        try:
            await _progress(pool, job_id, "extracting", 10)
            src_ver = detect_version(extract_dir).version
            await _progress(pool, job_id, "parsing", 10)

            profile = MappingProfile(
                article_cod_extern_enabled=not getattr(args, "a1_articles", False),
                warehouse_code_enabled=not getattr(args, "a1_warehouses", False),
            )
            own_cif = os.environ.get("OWN_CIF", "")

            result = await run_pipeline(
                pool=pool,
                job_id=UUID(job_id),
                extracted_dir=extract_dir,
                profile=profile,
                env=env,
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

            if args.save_profile:
                log.warning("save_profile_noop", profile_name=args.save_profile)

            completed_at = datetime.now(UTC)
            await _progress(pool, job_id, "reporting", 90)

            all_reasons = result.invoice_reasons + result.payment_reasons
            json_issues = [
                JsonIssue(severity="warning", category="generation", message=e)
                for e in gen_stats.errors + all_reasons
            ]
            await write_report_json(pool, output_dir, JsonRI(
                job_id=UUID(job_id),
                worker_version=env.worker_version,
                canonical_schema_version=env.canonical_schema_version,
                source_software="winmentor",
                source_version=src_ver,
                target_software="saga",
                target_version="C 3.0",
                mapping_profile_name=getattr(args, "mapping_profile", None),
                generation_stats=gen_stats,
                issues=json_issues,
                rule_hits=result.rule_hits,
                cache_hits=result.cache_hits,
                haiku_hits=result.haiku_hits,
                warnings=[],
            ))

            uid = UUID(job_id)
            haiku_calls = await usage_mod.count_for_job(pool, uid)
            t_in, t_out = await usage_mod.total_tokens_for_job(pool, uid)
            cost = float(await usage_mod.total_cost_for_job(pool, uid))

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
                ai_usage=AiUsage(haiku_calls=haiku_calls, tokens_in=t_in,
                                  tokens_out=t_out, cost_usd=cost),
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

            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE jobs SET status='succeeded', progress_pct=100,"
                    " progress_stage='done' WHERE id=$1",
                    UUID(job_id),
                )
            await _progress(pool, job_id, "done", 100)
            log.info("convert_succeeded", job_id=job_id,
                     partners=len(result.partners), articles=len(result.articles),
                     invoices=len(result.invoices), payments=len(result.payments))

        finally:
            if tmp_obj is not None:
                tmp_obj.cleanup()

    except Exception as exc:
        await _mark_failed(pool, job_id, type(exc).__name__)
        log.error("convert_failed", job_id=job_id, exc_type=type(exc).__name__)
        raise
    finally:
        await close_pool(pool)


def _run_inspect(args: argparse.Namespace) -> None:
    from migrator.parsers.registry import TABLE_REGISTRY, Classification
    from migrator.parsers.winmentor import detect_version

    configure_logger("warning")
    input_path = Path(args.path).resolve()
    if not input_path.exists():
        print(f"error: path not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    extract_dir = input_path
    tmp_dir: str | None = None

    if input_path.is_file():
        tmp_dir = tempfile.mkdtemp(prefix="rapidport_inspect_")
        extract_dir = Path(tmp_dir)

    try:
        if tmp_dir is not None:
            try:
                from migrator.utils.archive import extract_archive  # type: ignore[import-not-found]
                extract_archive(input_path, extract_dir)
            except ImportError:
                sys.exit(1)
        ver = detect_version(extract_dir)
        efactura = "eFactura-ready" if ver.efactura_enabled else "no eFactura"
        print(f"WinMentor archive: {input_path}")
        print(f"Version detected:  {ver.version or 'unknown'} ({efactura})")
        print()

        all_db = sorted(extract_dir.rglob("*.DB"))
        in_scope = [(p, p.name.upper()) for p in all_db if p.name.upper() in TABLE_REGISTRY]
        out_count = len(all_db) - len(in_scope)

        core = [(p, f) for p, f in in_scope
                if TABLE_REGISTRY[f].classification == Classification.CORE_NOMENCLATURE]
        txn = [(p, f) for p, f in in_scope
               if TABLE_REGISTRY[f].classification == Classification.TRANSACTIONAL]

        print(f"Phase 1 in-scope ({len(core)} CORE_NOMENCLATURE + {len(txn)} TRANSACTIONAL):")
        for _, filename in in_scope:
            entry = TABLE_REGISTRY[filename]
            print(f"  {filename:<18} {entry.classification.upper():<22} {entry.purpose}")
        print()
        print(f"Out of scope: {out_count} tables classified as LOOKUP/CONFIG/CACHE — skipped")
    finally:
        if tmp_dir is not None:
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="migrator", description="WinMentor → SAGA migration tool")
    sub = parser.add_subparsers(dest="command", required=True)

    conv = sub.add_parser("convert", help="Run full conversion pipeline")
    conv.add_argument("--input", required=True, help="Archive or extracted directory")
    conv.add_argument("--output", required=True, help="Output directory for SAGA files")
    conv.add_argument("--target", default="saga", choices=["saga"])
    conv.add_argument("--mapping-profile", default="auto", dest="mapping_profile")
    conv.add_argument("--save-profile", dest="save_profile", default=None, metavar="NAME")
    conv.add_argument("--a1-articles", dest="a1_articles", action="store_true", default=False)
    conv.add_argument("--a1-warehouses", dest="a1_warehouses", action="store_true", default=False)
    conv.add_argument("--job-id", required=True, dest="job_id")

    ins = sub.add_parser("inspect", help="Dry-run: print table inventory")
    ins.add_argument("path", help="Archive or extracted directory")

    return parser


def main() -> None:
    """Entry point for the ``migrator`` CLI command."""
    parser = _build_parser()
    args = parser.parse_args()
    if args.command == "convert":
        try:
            asyncio.run(_run_convert(args))
        except SystemExit:
            raise
        except Exception:
            traceback.print_exc(file=sys.stderr)
            sys.exit(2)
    elif args.command == "inspect":
        try:
            _run_inspect(args)
        except SystemExit:
            raise
        except Exception:
            traceback.print_exc(file=sys.stderr)
            sys.exit(2)


if __name__ == "__main__":
    main()
