"""Orchestrator for SAGA XML output generation.

Top-level dispatcher: canonical data + output directory → invokes every
sub-generator, collects stats for report.json (SPEC §1.7).

Run order: Terți → Articole → Articole Contabile → Invoices → Payments.
Per-entity failures append to GenerationStats.errors (don't abort the run).
Path-traversal defense on every returned path. Post-dispatch collision check.
"""
from __future__ import annotations

import traceback
from dataclasses import dataclass
from pathlib import Path

from migrator.canonical.article import Article
from migrator.canonical.journal import Invoice, Payment
from migrator.canonical.partner import Partner
from migrator.canonical.support import ChartOfAccountsEntry
from migrator.generators.saga_xml_articole_contabile import (
    generate_articole_contabile_xml,
)
from migrator.generators.saga_xml_invoices import generate_invoice_xml
from migrator.generators.saga_xml_payments import generate_payment_xml
from migrator.generators.saga_xml_terti_articole import (
    generate_articole_xml,
    generate_terti_xml,
)
from migrator.utils.logger import get_logger

log = get_logger(__name__)

__all__ = [
    "CanonicalData",
    "GenerationStats",
    "MappingProfile",
    "generate_saga_output",
]


# ---------------------------------------------------------------------------
# Public dataclasses
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class MappingProfile:
    """Per-job toggle flags surfaced via validation-phase UI.

    See docs/adr-001-code-mapping.md 'Phase 2 UI Impact'.
    """

    article_cod_extern_enabled: bool = True
    """A2 default: populate SAGA ARTICOLE.COD from WinMentor CodExtern.
    False = A1 blank (SAGA auto-assigns)."""

    warehouse_code_enabled: bool = True
    """Generalised A2 pattern for warehouse codes."""


@dataclass(frozen=True, slots=True)
class CanonicalData:
    """All canonical entities for a single migration job."""

    partners: list[Partner]
    articles: list[Article]
    invoices: list[Invoice]
    payments: list[Payment]
    chart_of_accounts: list[ChartOfAccountsEntry]
    own_cif: str


@dataclass(frozen=True, slots=True)
class GenerationStats:
    """Summary stats for report.json (SPEC §1.7)."""

    files_written: list[Path]
    partner_count: int
    article_count: int
    invoice_count: int
    payment_count: int
    chart_of_accounts_emitted: int
    """Analytical-only accounts actually emitted (skips base chart accounts)."""
    errors: list[str]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _redacted_exc() -> str:
    """Return a one-line exception type + redaction marker safe for error logs.

    Never includes the exception message — it could contain PII or file data.
    """
    lines = traceback.format_exc(limit=0).strip().splitlines()
    exc_type = lines[-1].split(":")[0] if lines else "UnknownError"
    return f"{exc_type}: [REDACTED]"


def _accept_paths(
    paths: list[Path],
    entity: str,
    resolved_output_dir: Path,
    files_written: list[Path],
    errors: list[str],
) -> None:
    """Resolve each path, check for traversal, and append to files_written."""
    for p in paths:
        try:
            resolved = p.resolve()
            resolved.relative_to(resolved_output_dir)
            files_written.append(resolved)
        except ValueError:
            errors.append(f"[{entity}] path traversal detected: {p!r}")
            log.warning(
                "saga_generation_entity_failed",
                entity=entity,
                reason="path_traversal",
            )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def generate_saga_output(
    data: CanonicalData,
    output_dir: Path,
    profile: MappingProfile | None = None,
) -> GenerationStats:
    """Dispatch to each sub-generator and collect stats.

    Args:
        data:       Canonical entities for the job.
        output_dir: Directory where SAGA XML files will be written.
                    Created (mkdir parents=True, exist_ok=True) if absent.
        profile:    Optional per-job toggle flags. Defaults to
                    ``MappingProfile()`` (all A2 defaults enabled).

    Returns:
        GenerationStats with paths of every file written and any per-entity
        error messages.

    Raises:
        OSError:       If *output_dir* cannot be created or is not writable.
        RuntimeError:  If two sub-generators return the same output path
                       (filename collision — indicates a generator bug).
    """
    if profile is None:
        profile = MappingProfile()

    try:
        output_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        log.error(
            "saga_generation_fatal",
            reason="output_dir_not_writable",
            path=str(output_dir),
        )
        raise

    resolved_output_dir = output_dir.resolve()

    log.info(
        "saga_generation_started",
        partner_count=len(data.partners),
        article_count=len(data.articles),
        invoice_count=len(data.invoices),
        payment_count=len(data.payments),
        chart_of_accounts_count=len(data.chart_of_accounts),
    )

    files_written: list[Path] = []
    errors: list[str] = []
    chart_of_accounts_emitted: int = 0

    # ------------------------------------------------------------------
    # Entity 1: Terți (partners)
    # ------------------------------------------------------------------
    entity = "terti"
    try:
        paths = generate_terti_xml(
            partners=data.partners,
            output_dir=output_dir,
            profile=profile,
        )
        _accept_paths(paths, entity, resolved_output_dir, files_written, errors)
        log.info("saga_generation_entity_done", entity=entity, files=len(paths))
    except Exception:
        errors.append(f"[{entity}] {_redacted_exc()}")
        log.error("saga_generation_entity_failed", entity=entity)

    # ------------------------------------------------------------------
    # Entity 2: Articole (articles)
    # ------------------------------------------------------------------
    entity = "articole"
    try:
        paths = generate_articole_xml(
            articles=data.articles,
            output_dir=output_dir,
            profile=profile,
        )
        _accept_paths(paths, entity, resolved_output_dir, files_written, errors)
        log.info("saga_generation_entity_done", entity=entity, files=len(paths))
    except Exception:
        errors.append(f"[{entity}] {_redacted_exc()}")
        log.error("saga_generation_entity_failed", entity=entity)

    # ------------------------------------------------------------------
    # Entity 3: Articole Contabile (chart of accounts — analytical only)
    # ------------------------------------------------------------------
    entity = "articole_contabile"
    try:
        contabile_paths, chart_of_accounts_emitted = generate_articole_contabile_xml(
            chart_of_accounts=data.chart_of_accounts,
            output_dir=output_dir,
        )
        _accept_paths(contabile_paths, entity, resolved_output_dir, files_written, errors)
        log.info(
            "saga_generation_entity_done",
            entity=entity,
            files=len(contabile_paths),
            emitted=chart_of_accounts_emitted,
        )
    except Exception:
        errors.append(f"[{entity}] {_redacted_exc()}")
        log.error("saga_generation_entity_failed", entity=entity)

    # ------------------------------------------------------------------
    # Entity 4: Invoices (one file per invoice — per-item error isolation)
    # ------------------------------------------------------------------
    entity = "invoices"
    invoice_file_count = 0
    for invoice in data.invoices:
        try:
            invoice_path = generate_invoice_xml(
                invoice=invoice,
                output_dir=output_dir,
                own_cif=data.own_cif,
            )
            before = len(files_written)
            _accept_paths([invoice_path], entity, resolved_output_dir, files_written, errors)
            invoice_file_count += len(files_written) - before
        except Exception:
            errors.append(f"[{entity}:item] {_redacted_exc()}")
            log.error("saga_generation_entity_failed", entity=entity + "_item")
    log.info("saga_generation_entity_done", entity=entity, files=invoice_file_count)

    # ------------------------------------------------------------------
    # Entity 5: Payments (one file per direction/date group)
    # ------------------------------------------------------------------
    entity = "payments"
    try:
        paths = generate_payment_xml(
            payments=data.payments,
            output_dir=output_dir,
        )
        _accept_paths(paths, entity, resolved_output_dir, files_written, errors)
        log.info("saga_generation_entity_done", entity=entity, files=len(paths))
    except Exception:
        errors.append(f"[{entity}] {_redacted_exc()}")
        log.error("saga_generation_entity_failed", entity=entity)

    # ------------------------------------------------------------------
    # Post-dispatch: filename collision check (hard raise — generator bug)
    # ------------------------------------------------------------------
    if len(files_written) != len(set(files_written)):
        seen: set[Path] = set()
        duplicates: list[Path] = []
        for p in files_written:
            if p in seen:
                duplicates.append(p)
            seen.add(p)
        raise RuntimeError(
            "Filename collision — generator bug. "
            f"Duplicate paths: {[str(d) for d in duplicates]}"
        )

    stats = GenerationStats(
        files_written=files_written,
        partner_count=len(data.partners),
        article_count=len(data.articles),
        invoice_count=len(data.invoices),
        payment_count=len(data.payments),
        chart_of_accounts_emitted=chart_of_accounts_emitted,
        errors=errors,
    )

    log.info(
        "saga_generation_completed",
        files_written=len(files_written),
        errors=len(errors),
    )

    return stats
