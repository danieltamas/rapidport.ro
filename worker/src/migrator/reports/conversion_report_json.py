"""JSON conversion report writer for SPEC §1.7.

Writes report.json to the job output directory.  The report is the
single artefact consumed by both the admin dashboard and the
accountant-facing status page to display conversion results.

Migration-lock warning is mandatory — see docs/questions-for-dani.md
Phase 0 resolution.  The exact text is hardcoded; do not alter it
without a SPEC change.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

import asyncpg

from migrator.generators.orchestrator import GenerationStats
from migrator.mappers import usage as usage_helpers
from migrator.utils.logger import get_logger

__all__ = [
    "ReportInput",
    "ReportIssue",
    "write_report_json",
]

log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Migration-lock warning — Phase 0 resolution, do not alter
# ---------------------------------------------------------------------------
_MIGRATION_LOCK_WARNING: str = (
    "single-use — do not re-import these files into SAGA more than once;"
    " the mapping CSVs are only valid for one import run"
)


# ---------------------------------------------------------------------------
# Public dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class ReportIssue:
    """A single diagnostic issue surfaced during conversion."""

    severity: str  # "warning" | "error"
    category: str  # "mapping" | "validation" | "generation" | "parse"
    message: str


@dataclass(frozen=True, slots=True)
class ReportInput:
    """All inputs required to produce report.json."""

    job_id: UUID
    worker_version: str            # env: WORKER_VERSION
    canonical_schema_version: str  # env: CANONICAL_SCHEMA_VERSION
    source_software: str           # "winmentor"
    source_version: str | None     # detected from parsers/winmentor.py
    target_software: str           # "saga"
    target_version: str            # "C 3.0"
    mapping_profile_name: str | None
    generation_stats: GenerationStats
    issues: list[ReportIssue]
    # Mapping pipeline counters — injected by the pipeline coordinator
    rule_hits: int
    cache_hits: int
    haiku_hits: int
    # Free-text informational notes (A1/A2 toggle, currency heuristics, etc.)
    warnings: list[str]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _relative_str(path: Path, output_dir_resolved: Path) -> str:
    """Convert a path to a string relative to output_dir, or absolute on error."""
    try:
        return str(path.relative_to(output_dir_resolved))
    except ValueError:
        return str(path)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def write_report_json(
    pool: asyncpg.Pool,
    output_dir: Path,
    data: ReportInput,
) -> Path:
    """Write report.json to output_dir and return the file path.

    Fetches AI usage totals from the DB (three queries via usage helpers),
    assembles the canonical JSON structure from SPEC §1.7, and writes UTF-8.

    Args:
        pool:       asyncpg connection pool.
        output_dir: Directory where report.json is written.  Created if absent.
        data:       All conversion metadata.

    Returns:
        Absolute path to the written report.json.

    Raises:
        OSError: If output_dir cannot be created or the file cannot be written.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    output_dir_resolved = output_dir.resolve()

    # -- Fetch AI usage from DB -------------------------------------------------
    total_calls: int = await usage_helpers.count_for_job(pool, data.job_id)
    cost_usd: Decimal = await usage_helpers.total_cost_for_job(pool, data.job_id)
    tokens_in, tokens_out = await usage_helpers.total_tokens_for_job(pool, data.job_id)

    # -- Build files_written list (relative paths) ------------------------------
    files_written: list[str] = [
        _relative_str(p, output_dir_resolved)
        for p in data.generation_stats.files_written
    ]

    # -- Assemble issues + warnings (preserve insertion order) ------------------
    issues_list: list[dict[str, str]] = [
        {
            "severity": issue.severity,
            "category": issue.category,
            "message": issue.message,
        }
        for issue in data.issues
    ]

    # -- Build report dict (key order = SPEC §1.7 canonical order) --------------
    report: dict[str, object] = {
        "rapidport": {
            "worker_version": data.worker_version,
            "canonical_schema_version": data.canonical_schema_version,
            "generated_at": datetime.now(UTC).isoformat(),
            "job_id": str(data.job_id),
            "warning": _MIGRATION_LOCK_WARNING,
        },
        "source": {
            "software": data.source_software,
            "version": data.source_version,
        },
        "target": {
            "software": data.target_software,
            "version": data.target_version,
        },
        "mapping": {
            "profile_name": data.mapping_profile_name,
            "rule_hits": data.rule_hits,
            "cache_hits": data.cache_hits,
            "haiku_hits": data.haiku_hits,
        },
        "ai_usage": {
            "total_calls": total_calls,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": str(cost_usd),
        },
        "entities": {
            "partners": data.generation_stats.partner_count,
            "articles": data.generation_stats.article_count,
            "invoices": data.generation_stats.invoice_count,
            "payments": data.generation_stats.payment_count,
            "chart_of_accounts_emitted": data.generation_stats.chart_of_accounts_emitted,
        },
        "files_written": files_written,
        "issues": issues_list,
        "warnings": data.warnings,
    }

    # -- Serialise + write -------------------------------------------------------
    json_text: str = json.dumps(report, indent=2, ensure_ascii=False, sort_keys=False, default=str)
    output_path: Path = output_dir / "report.json"
    output_path.write_text(json_text, encoding="utf-8")

    byte_size: int = len(json_text.encode("utf-8"))
    log.info(
        "report_json_written",
        file_path=str(output_path),
        byte_size=byte_size,
    )

    return output_path
