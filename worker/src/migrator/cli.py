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
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import asyncpg

from migrator.utils.db import apply_migrations, close_pool, create_pool
from migrator.utils.logger import configure_logger, get_logger

log = get_logger(__name__)

_MIGRATIONS_DIR = Path(__file__).parent.parent.parent.parent / "migrations"


@dataclass
class _Env:
    database_url: str
    worker_version: str
    canonical_schema_version: str
    max_haiku_calls: int


def _load_env() -> _Env:
    missing = [k for k in ("DATABASE_URL",) if not os.environ.get(k, "").strip()]
    if missing:
        raise RuntimeError(f"Missing required env vars: {', '.join(missing)}")
    schema_ver = os.environ.get("CANONICAL_SCHEMA_VERSION", "1.0").strip() or "1.0"
    return _Env(
        database_url=os.environ["DATABASE_URL"].strip(),
        worker_version=os.environ.get("WORKER_VERSION", "0.0.0").strip() or "0.0.0",
        canonical_schema_version=schema_ver,
        max_haiku_calls=int(os.environ.get("MAX_HAIKU_CALLS_PER_JOB", "500") or "500"),
    )


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


@dataclass
class _MapStats:
    rule_hits: int = 0
    cache_hits: int = 0
    haiku_hits: int = 0


async def _resolve_field(
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    table: str,
    field_name: str,
    samples: list[str],
    job_id: str,
    max_haiku: int,
    stats: _MapStats,
) -> str | None:
    from migrator.mappers import rule_based, ai_assisted

    hit = rule_based.map_field(table, field_name)
    if hit is not None:
        stats.rule_hits += 1
        return hit.target_field
    try:
        result = await ai_assisted.suggest_mapping(
            pool=pool, source_software="winmentor", table_name=table,
            field_name=field_name, sample_values=samples, job_id=job_id,
            max_calls_per_job=max_haiku,
        )
        if result.tokens_in == 0:
            stats.cache_hits += 1
        else:
            stats.haiku_hits += 1
        return None if result.target_field == "UNMAPPABLE" else result.target_field
    except Exception:
        log.warning("field_mapping_failed", table=table, field=field_name)
        return None


async def _parse_table(
    db_path: Path,
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    job_id: str,
    max_haiku: int,
    stats: _MapStats,
) -> tuple[list[dict[str, object]], dict[str, str]]:
    """Return (rows, field_map) for one .DB file."""
    from migrator.parsers.paradox import read_standard, ParadoxParseError
    from migrator.parsers.registry import lookup, ParserKind
    from migrator.parsers.winmentor import detect_encoding

    enc = detect_encoding(db_path)
    entry = lookup(db_path.name.upper())
    rows: list[dict[str, object]] = []
    try:
        if entry is None or entry.parser == ParserKind.STANDARD:
            rows = list(read_standard(db_path, encoding=enc))
        else:
            from migrator.parsers.paradox import read_fallback
            rows = list(read_fallback(db_path))
    except ParadoxParseError as exc:
        log.warning("table_parse_error", table=db_path.stem, error=str(exc))
        return [], {}
    if not rows:
        return [], {}

    field_map: dict[str, str] = {}
    for fn in rows[0]:
        samples = [str(r.get(fn, ""))[:200] for r in rows[:5] if r.get(fn) is not None]
        tgt = await _resolve_field(
            pool, db_path.stem.upper(), fn, samples, job_id, max_haiku, stats
        )
        if tgt:
            field_map[fn.upper()] = tgt
    return rows, field_map


def _remap(rows: list[dict[str, object]], fmap: dict[str, str]) -> list[dict[str, object]]:
    return [{fmap[k.upper()]: v for k, v in r.items() if k.upper() in fmap} for r in rows]


def _build_partners(rows: list[dict[str, object]]) -> list[object]:
    from migrator.canonical.partner import Partner
    out: list[object] = []
    for d in rows:
        sid = str(d.get("source_id") or "")
        if not sid:
            continue
        try:
            out.append(Partner(
                source_id=sid,
                name=str(d.get("name") or sid),
                cif=str(d.get("cif") or "") or None,
                partner_type="both",
            ))
        except Exception:
            log.warning("partner_build_failed")
    return out


def _build_articles(rows: list[dict[str, object]]) -> list[object]:
    from migrator.canonical.article import Article
    out: list[object] = []
    for d in rows:
        sid = str(d.get("source_id") or "")
        if not sid:
            continue
        try:
            out.append(Article(
                source_id=sid, name=str(d.get("name") or sid),
                article_type="product", is_stock=True,
                vat_rate=Decimal(str(d.get("vat_rate") or "19")),
            ))
        except Exception:
            log.warning("article_build_failed")
    return out


def _build_chart(rows: list[dict[str, object]]) -> list[object]:
    from migrator.canonical.support import ChartOfAccountsEntry
    out: list[object] = []
    for d in rows:
        code = str(d.get("code") or "")
        if not code:
            continue
        try:
            out.append(ChartOfAccountsEntry(
                code=code, name=str(d.get("name") or code), analytical="." in code
            ))
        except Exception:
            log.warning("chart_entry_build_failed")
    return out


async def _run_convert(args: argparse.Namespace) -> None:  # noqa: C901
    from migrator.parsers.registry import TABLE_REGISTRY
    from migrator.parsers.winmentor import detect_version
    from migrator.generators.orchestrator import CanonicalData, MappingProfile, generate_saga_output
    from migrator.reports.conversion_report_json import (
        ReportInput as JsonRI, ReportIssue as JsonIssue, write_report_json,
    )
    from migrator.reports.conversion_report_pdf import (
        ReportInput as PdfRI, AiUsage, EntitySummary, ReportIssue as PdfIssue,
        write_report_pdf,
    )
    from migrator.canonical.partner import Partner
    from migrator.canonical.article import Article
    from migrator.canonical.support import ChartOfAccountsEntry
    from migrator.mappers import usage as usage_mod

    env = _load_env()
    configure_logger(os.environ.get("LOG_LEVEL", "info"))

    input_path = Path(args.input).resolve()
    output_dir = Path(args.output).resolve()
    job_id: str = args.job_id

    if not input_path.exists():
        print(f"error: input not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    started_at = datetime.now(UTC)
    pool: asyncpg.Pool = await create_pool(env.database_url)  # type: ignore[type-arg]

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
                # archive.py not yet merged — flag and abort
                raise RuntimeError("migrator.utils.archive not available at merge time")

        try:
            await _progress(pool, job_id, "extracting", 10)
            src_ver = detect_version(extract_dir).version

            # Collect in-scope .DB files
            db_files = [
                p for p in sorted(extract_dir.rglob("*.DB"))
                if p.name.upper() in TABLE_REGISTRY
            ]
            log.info("parse_scope", table_count=len(db_files))
            await _progress(pool, job_id, "parsing", 10)

            rows_by: dict[str, list[dict[str, object]]] = {}
            fmap_by: dict[str, dict[str, str]] = {}
            stats = _MapStats()
            for db_path in db_files:
                _r, _f = await _parse_table(db_path, pool, job_id, env.max_haiku_calls, stats)
                rows_by[db_path.stem.upper()] = _r
                fmap_by[db_path.stem.upper()] = _f

            await _progress(pool, job_id, "mapping", 40)
            profile = MappingProfile(
                article_cod_extern_enabled=not getattr(args, "a1_articles", False),
                warehouse_code_enabled=not getattr(args, "a1_warehouses", False),
            )
            own_cif = os.environ.get("OWN_CIF", "")

            def _get(t: str) -> list[dict[str, object]]:
                return _remap(rows_by.get(t, []), fmap_by.get(t, {}))

            partners: list[Partner] = [
                p for p in _build_partners(_get("NPART")) if isinstance(p, Partner)
            ]
            articles: list[Article] = [
                a for a in _build_articles(_get("NART")) if isinstance(a, Article)
            ]
            chart: list[ChartOfAccountsEntry] = [
                e for e in _build_chart(_get("NCONT")) if isinstance(e, ChartOfAccountsEntry)
            ]
            await _progress(pool, job_id, "mapping", 70)

            canonical = CanonicalData(
                partners=partners, articles=articles, invoices=[], payments=[],
                chart_of_accounts=chart, own_cif=own_cif,
            )
            await _progress(pool, job_id, "generating", 70)
            output_dir.mkdir(parents=True, exist_ok=True)
            gen_stats = generate_saga_output(canonical, output_dir, profile)
            await _progress(pool, job_id, "generating", 90)

            if args.save_profile:
                log.warning("save_profile_noop", profile_name=args.save_profile)

            completed_at = datetime.now(UTC)
            await _progress(pool, job_id, "reporting", 90)

            json_issues = [
                JsonIssue(severity="warning", category="generation", message=e)
                for e in gen_stats.errors
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
                rule_hits=stats.rule_hits,
                cache_hits=stats.cache_hits,
                haiku_hits=stats.haiku_hits,
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
                        total=len(partners), converted=len(partners), skipped=0, errors=0),
                    "articles": EntitySummary(
                        total=len(articles), converted=len(articles), skipped=0, errors=0),
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
                     partners=len(partners), articles=len(articles))

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
