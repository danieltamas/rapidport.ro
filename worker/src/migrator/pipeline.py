"""Shared WinMentor → SAGA pipeline helpers shared by cli.py and consumer.py.

Owns field resolution, table parsing, row remapping, and all canonical entity
builders (partners, articles, chart, invoices, payments). Exposes run_pipeline()
as the single entry point. Callers remain responsible for archive extraction,
pool management, progress reporting, report writing, and job-row status updates.

Security: Decimal arithmetic only; per-row exception containment; no PII in reasons.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

import asyncpg

from migrator.utils.logger import get_logger

if TYPE_CHECKING:
    from migrator.canonical.article import Article
    from migrator.canonical.journal import Invoice, InvoiceLine, Payment
    from migrator.canonical.partner import Partner
    from migrator.canonical.support import ChartOfAccountsEntry

log = get_logger(__name__)

__all__ = [
    "MapStats",
    "PipelineEnv",
    "PipelineResult",
    "build_articles",
    "build_chart",
    "build_invoices",
    "build_partners",
    "build_payments",
    "run_pipeline",
]

# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

_SUPPORTED_CURRENCIES = frozenset({"RON", "EUR", "USD", "GBP", "CHF"})
_CURRENCY_ALIASES: dict[str, str] = {
    "LEI": "RON", "LEU": "RON", "EURO": "EUR", "€": "EUR", "$": "USD", "£": "GBP",
}
_TREZOR_DIRECTION_MAP: dict[str, str] = {
    "I": "incoming", "INCASARE": "incoming", "C": "incoming",
    "P": "outgoing", "PLATA": "outgoing", "D": "outgoing",
}
_TREZOR_METHOD_MAP: dict[str, str] = {
    "CASH": "cash", "CASA": "cash", "BANCA": "bank",
    "BANK": "bank", "OP": "bank", "CARD": "card",
}


def _normalise_currency(raw: object) -> str:
    """Return a supported Currency string; defaults to 'RON'."""
    if not raw:
        return "RON"
    upper = str(raw).strip().upper()
    if upper in _SUPPORTED_CURRENCIES:
        return upper
    mapped = _CURRENCY_ALIASES.get(upper)
    if mapped:
        return mapped
    log.warning("pipeline_unknown_currency", raw=upper)
    return "RON"


def _to_decimal(val: object, fallback: Decimal = Decimal("0")) -> Decimal:
    """Coerce to Decimal; returns fallback on failure (no float)."""
    if isinstance(val, Decimal):
        return val
    if val is None:
        return fallback
    try:
        return Decimal(str(val).strip().replace(",", "."))
    except InvalidOperation:
        return fallback


def _to_date(val: object) -> date | None:
    """Coerce to date, or None."""
    if isinstance(val, date):
        return val
    if val is None:
        return None
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d.%m.%Y", "%d-%m-%Y"):
        try:
            from datetime import datetime
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def _trezor_direction(raw_row: dict[str, object], src_id: str) -> tuple[str, str | None]:
    """Derive PaymentDirection from raw TREZOR TipSursa field."""
    raw = str(raw_row.get("TipSursa") or "").strip().upper()
    mapped = _TREZOR_DIRECTION_MAP.get(raw)
    if mapped:
        return mapped, None
    note = f"TREZOR row {src_id!r}: unrecognised TipSursa={raw!r}, defaulted to outgoing" if raw else None
    return "outgoing", note


def _trezor_method(raw_row: dict[str, object]) -> str:
    """Derive PaymentMethod from raw TREZOR Sursa field."""
    return _TREZOR_METHOD_MAP.get(str(raw_row.get("Sursa") or "").strip().upper(), "other")


# ---------------------------------------------------------------------------
# Core dataclasses
# ---------------------------------------------------------------------------


@dataclass
class MapStats:
    """Mutable counters for field-mapping telemetry."""

    rule_hits: int = 0
    cache_hits: int = 0
    haiku_hits: int = 0


@dataclass(frozen=True, slots=True)
class PipelineEnv:
    """Env-injected config. Construct via PipelineEnv.from_env()."""

    worker_version: str
    canonical_schema_version: str
    max_haiku_calls_per_job: int = 500

    @classmethod
    def from_env(cls) -> "PipelineEnv":
        """Load PipelineEnv from os.environ."""
        schema_ver = os.environ.get("CANONICAL_SCHEMA_VERSION", "1.0").strip() or "1.0"
        return cls(
            worker_version=os.environ.get("WORKER_VERSION", "0.0.0").strip() or "0.0.0",
            canonical_schema_version=schema_ver,
            max_haiku_calls_per_job=int(os.environ.get("MAX_HAIKU_CALLS_PER_JOB", "500") or "500"),
        )


@dataclass
class PipelineResult:
    """All canonical entities + telemetry for one completed job."""

    job_id: UUID
    partners: list["Partner"] = field(default_factory=list)
    articles: list["Article"] = field(default_factory=list)
    invoices: list["Invoice"] = field(default_factory=list)
    payments: list["Payment"] = field(default_factory=list)
    chart_of_accounts: list["ChartOfAccountsEntry"] = field(default_factory=list)
    rule_hits: int = 0
    cache_hits: int = 0
    haiku_hits: int = 0
    invoice_reasons: list[str] = field(default_factory=list)
    payment_reasons: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Internal: field resolution + table parsing + remapping
# ---------------------------------------------------------------------------


async def _resolve_field(
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    table: str,
    field_name: str,
    samples: list[str],
    job_id: str,
    max_haiku: int,
    stats: MapStats,
) -> str | None:
    """Resolve one WinMentor field via rule-based then AI-assisted mapping."""
    from migrator.mappers import ai_assisted, rule_based
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
        log.warning("pipeline_field_mapping_failed", table=table, field=field_name)
        return None


async def _parse_table(
    db_path: Path,
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    job_id: str,
    max_haiku: int,
    stats: MapStats,
) -> tuple[list[dict[str, object]], dict[str, str]]:
    """Parse one .DB file; return (rows, uppercase-field-map). Both empty on error."""
    from migrator.parsers.paradox import ParadoxParseError, read_standard
    from migrator.parsers.registry import ParserKind, lookup
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
        log.warning("pipeline_table_parse_error", table=db_path.stem, error=str(exc))
        return [], {}
    if not rows:
        return [], {}
    field_map: dict[str, str] = {}
    for fn in rows[0]:
        samples = [str(r.get(fn, ""))[:200] for r in rows[:5] if r.get(fn) is not None]
        tgt = await _resolve_field(pool, db_path.stem.upper(), fn, samples, job_id, max_haiku, stats)
        if tgt:
            field_map[fn.upper()] = tgt
    return rows, field_map


def _remap(rows: list[dict[str, object]], fmap: dict[str, str]) -> list[dict[str, object]]:
    """Apply field map to rows; field names uppercased before lookup."""
    return [{fmap[k.upper()]: v for k, v in r.items() if k.upper() in fmap} for r in rows]


# ---------------------------------------------------------------------------
# Public entity builders
# ---------------------------------------------------------------------------


def build_partners(rows: list[dict[str, object]]) -> list["Partner"]:
    """Build canonical Partner list from remapped NPART rows (skips on error)."""
    from migrator.canonical.partner import Partner
    out: list[Partner] = []
    for d in rows:
        sid = str(d.get("source_id") or "")
        if not sid:
            continue
        try:
            out.append(Partner(
                source_id=sid, name=str(d.get("name") or sid),
                cif=str(d.get("cif") or "") or None, partner_type="both",
            ))
        except Exception:
            log.warning("pipeline_partner_build_failed")
    return out


def build_articles(rows: list[dict[str, object]]) -> list["Article"]:
    """Build canonical Article list from remapped NART rows; VAT defaults to 19%."""
    from migrator.canonical.article import Article
    out: list[Article] = []
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
            log.warning("pipeline_article_build_failed")
    return out


def build_chart(rows: list[dict[str, object]]) -> list["ChartOfAccountsEntry"]:
    """Build canonical ChartOfAccountsEntry list from NCONT rows; '.' in code → analytical."""
    from migrator.canonical.support import ChartOfAccountsEntry
    out: list[ChartOfAccountsEntry] = []
    for d in rows:
        code = str(d.get("code") or "")
        if not code:
            continue
        try:
            out.append(ChartOfAccountsEntry(
                code=code, name=str(d.get("name") or code), analytical="." in code
            ))
        except Exception:
            log.warning("pipeline_chart_entry_build_failed")
    return out


def build_invoices(
    rows_by: dict[str, list[dict[str, object]]],
    fmap_by: dict[str, dict[str, str]],
    partners_by_source_id: dict[str, "Partner"],
    articles_by_source_id: dict[str, "Article"],
    own_cif: str,
) -> tuple[list["Invoice"], list[str]]:
    """Build canonical Invoice list from INTRARI (purchase) and IESIRI (sale) rows.

    INTRARI1/IESIRI1 lines are matched by parent doc key. When line tables are
    absent or yield no matches, the invoice is built with lines=[] and a reason
    is recorded. No synthetic line is created (InvoiceLine.article is required).
    Returns (invoices, reasons) — reasons use source IDs only.
    """
    from migrator.canonical.journal import Invoice, InvoiceLine

    invoices: list[Invoice] = []
    reasons: list[str] = []

    _PAIRS: list[tuple[str, str, str]] = [
        ("INTRARI", "INTRARI1", "purchase"),
        ("IESIRI", "IESIRI1", "sale"),
    ]

    for hdr_tbl, line_tbl, direction in _PAIRS:
        hdr_rows = _remap(rows_by.get(hdr_tbl, []), fmap_by.get(hdr_tbl, {}))
        ln_rows = _remap(rows_by.get(line_tbl, []), fmap_by.get(line_tbl, {}))
        has_lines = bool(ln_rows)

        # Index lines by parent doc key for O(1) lookup
        lines_idx: dict[str, list[dict[str, object]]] = {}
        if has_lines:
            for lr in ln_rows:
                pk = str(lr.get("source_id") or lr.get("CodParinte") or "")
                if pk:
                    lines_idx.setdefault(pk, []).append(lr)

        for idx, row in enumerate(hdr_rows):
            src_id = str(row.get("source_id") or row.get("CodDoc") or "")
            if not src_id:
                reasons.append(f"{hdr_tbl} row {idx}: missing source_id, skipped")
                continue

            partner_ref = str(row.get("partner") or row.get("CodPart") or "")
            partner = partners_by_source_id.get(partner_ref)
            if partner is None:
                reasons.append(f"{hdr_tbl} row {src_id!r}: partner {partner_ref!r} not found, skipped")
                continue

            inv_date = _to_date(row.get("invoice_date") or row.get("DataDoc"))
            if inv_date is None:
                reasons.append(f"{hdr_tbl} row {src_id!r}: missing invoice_date, skipped")
                continue

            inv_number = str(row.get("invoice_number") or row.get("NrDoc") or "").strip()
            if not inv_number:
                reasons.append(f"{hdr_tbl} row {src_id!r}: missing invoice_number, skipped")
                continue

            currency = _normalise_currency(row.get("currency") or row.get("Moneda"))
            raw_curs = row.get("exchange_rate") or row.get("Curs")
            exchange_rate: Decimal | None = None if currency == "RON" else (
                _to_decimal(raw_curs) if raw_curs else None
            )

            total_net = _to_decimal(row.get("total_net") or row.get("TotalFaraTVA"))
            total_vat = _to_decimal(row.get("total_vat") or row.get("TVA"))
            total_gross = _to_decimal(row.get("total_gross") or row.get("Total"))
            # Reconstruct gross from net+vat when omitted by WinMentor
            if total_gross == Decimal("0") and (total_net or total_vat):
                total_gross = total_net + total_vat
            if total_net == Decimal("0") and total_vat == Decimal("0") and total_gross == Decimal("0"):
                reasons.append(f"{hdr_tbl} row {src_id!r}: all totals zero, skipped")
                continue

            # Build line items
            built_lines: list[InvoiceLine] = []
            if not has_lines:
                reasons.append(
                    f"{hdr_tbl} row {src_id!r}: line table {line_tbl!r} not parsed — "
                    "header-totals-only invoice built"
                )
            else:
                raw_lns = lines_idx.get(src_id, [])
                if not raw_lns:
                    reasons.append(
                        f"{hdr_tbl} row {src_id!r}: no lines in {line_tbl!r} — "
                        "header-totals-only invoice built"
                    )
                for lrow in raw_lns:
                    art_ref = str(lrow.get("article") or lrow.get("CodArt") or "")
                    article = articles_by_source_id.get(art_ref)
                    if article is None:
                        reasons.append(f"{line_tbl} line for {src_id!r}: article {art_ref!r} not found, skipped")
                        continue
                    qty = _to_decimal(lrow.get("quantity") or lrow.get("Cant"), Decimal("1"))
                    unit_price = _to_decimal(lrow.get("unit_price") or lrow.get("Pret"))
                    # WinMentor stores VAT as percentage integer; InvoiceLine wants fraction
                    raw_vat = _to_decimal(lrow.get("vat_rate") or lrow.get("TVA"), Decimal("19"))
                    line_vat_rate = raw_vat / Decimal("100") if raw_vat > Decimal("1") else raw_vat
                    line_net = _to_decimal(lrow.get("line_total_net") or lrow.get("Valoare"))
                    if line_net == Decimal("0"):
                        line_net = qty * unit_price
                    line_vat = _to_decimal(lrow.get("line_total_vat") or lrow.get("ValTVA"))
                    if line_vat == Decimal("0"):
                        line_vat = line_net * line_vat_rate
                    line_gross = _to_decimal(lrow.get("line_total_gross") or lrow.get("ValTotal"))
                    if line_gross == Decimal("0"):
                        line_gross = line_net + line_vat
                    try:
                        built_lines.append(InvoiceLine(
                            article=article,
                            quantity=qty,
                            unit_price=unit_price,
                            vat_rate=line_vat_rate,
                            line_total_net=line_net,
                            line_total_vat=line_vat,
                            line_total_gross=line_gross,
                            warehouse_code=str(lrow.get("warehouse_code") or lrow.get("Gest") or "") or None,
                        ))
                    except Exception:
                        reasons.append(f"{line_tbl} line for {src_id!r}: validation failed, skipped")

            try:
                invoices.append(Invoice(
                    source_id=src_id,
                    direction=direction,  # type: ignore[arg-type]
                    invoice_number=inv_number,
                    invoice_date=inv_date,
                    due_date=_to_date(row.get("due_date") or row.get("Termen")),
                    partner=partner,
                    own_cif=own_cif,
                    currency=currency,  # type: ignore[arg-type]
                    exchange_rate=exchange_rate,
                    lines=built_lines,
                    total_net=total_net,
                    total_vat=total_vat,
                    total_gross=total_gross,
                    source_metadata={
                        k: v for k, v in row.items()
                        if k not in {
                            "source_id", "invoice_number", "invoice_date", "due_date",
                            "partner", "currency", "exchange_rate",
                            "total_net", "total_vat", "total_gross",
                        }
                    },
                ))
            except Exception as exc:
                reasons.append(
                    f"{hdr_tbl} row {src_id!r}: Invoice validation failed ({type(exc).__name__}), skipped"
                )

    log.info("pipeline_invoices_built", built=len(invoices), skipped=len(reasons))
    return invoices, reasons


def build_payments(
    rows_by: dict[str, list[dict[str, object]]],
    fmap_by: dict[str, dict[str, str]],
    partners_by_source_id: dict[str, "Partner"],
) -> tuple[list["Payment"], list[str]]:
    """Build canonical Payment list from TREZOR.DB rows (Încasări/Plăți).

    TREZOR.DB is the authoritative payment source. TREZOR1.DB provides
    applied-invoice refs. Partner is optional (internal transfers have none).
    Returns (payments, reasons) — reasons use source IDs only.
    """
    from migrator.canonical.journal import Payment

    payments: list[Payment] = []
    reasons: list[str] = []

    trezor_rows = rows_by.get("TREZOR", [])
    trezor1_rows = rows_by.get("TREZOR1", [])

    # Index applied-invoice refs from TREZOR1
    applied_by_parent: dict[str, list[str]] = {}
    for t1 in trezor1_rows:
        pk = str(t1.get("CodParinte") or "")
        inv_ref = str(t1.get("TipTranz") or t1.get("CodFactura") or "")
        if pk and inv_ref:
            applied_by_parent.setdefault(pk, []).append(inv_ref)

    fmap = fmap_by.get("TREZOR", {})

    for idx, raw_row in enumerate(trezor_rows):
        # Apply field map while keeping raw fields accessible for lookups
        row: dict[str, object] = {fmap.get(k.upper(), k): v for k, v in raw_row.items()}

        src_id = str(row.get("source_id") or row.get("Cod") or "")
        if not src_id:
            reasons.append(f"TREZOR row {idx}: missing source_id, skipped")
            continue

        pay_date = _to_date(row.get("payment_date") or row.get("DataDoc") or row.get("Zi"))
        if pay_date is None:
            reasons.append(f"TREZOR row {src_id!r}: missing payment_date, skipped")
            continue

        amount = _to_decimal(row.get("amount") or row.get("Valoare") or row.get("ValTotal"))
        if amount == Decimal("0"):
            reasons.append(f"TREZOR row {src_id!r}: zero amount, skipped")
            continue

        currency = _normalise_currency(row.get("currency") or row.get("Moneda"))
        raw_curs = row.get("exchange_rate") or row.get("Curs")
        exchange_rate: Decimal | None = None if currency == "RON" else (
            _to_decimal(raw_curs) if raw_curs else None
        )

        direction, dir_note = _trezor_direction(raw_row, src_id)
        if dir_note:
            reasons.append(dir_note)

        method = _trezor_method(raw_row)

        partner_ref = str(row.get("partner") or row.get("CodPart") or row.get("CodSursa") or "")
        partner = partners_by_source_id.get(partner_ref) if partner_ref else None

        ref_number = str(
            row.get("reference_number") or row.get("NrDoc") or row.get("Document") or ""
        ).strip() or None

        try:
            payments.append(Payment(
                source_id=src_id,
                direction=direction,  # type: ignore[arg-type]
                payment_date=pay_date,
                amount=amount,
                currency=currency,  # type: ignore[arg-type]
                exchange_rate=exchange_rate,
                partner=partner,
                method=method,  # type: ignore[arg-type]
                applied_to_invoice_ids=applied_by_parent.get(src_id, []),
                reference_number=ref_number,
                source_metadata={
                    k: v for k, v in row.items()
                    if k not in {
                        "source_id", "payment_date", "amount", "currency",
                        "exchange_rate", "partner", "method", "reference_number",
                    }
                },
            ))
        except Exception as exc:
            reasons.append(
                f"TREZOR row {src_id!r}: Payment validation failed ({type(exc).__name__}), skipped"
            )

    log.info("pipeline_payments_built", built=len(payments), skipped=len(reasons))
    return payments, reasons


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


async def run_pipeline(
    pool: asyncpg.Pool,  # type: ignore[type-arg]
    job_id: UUID,
    extracted_dir: Path,
    profile: object,
    env: PipelineEnv,
    own_cif: str = "",
) -> PipelineResult:
    """Full WinMentor canonical build: parse → map → build all entities.

    Scans all TABLE_REGISTRY .DB files in extracted_dir, field-maps them, then
    builds canonical entities in dependency order: partners + articles + chart
    first, then invoices and payments (which need the nomenclature lookups).
    profile is accepted for API compatibility and passed through to callers.
    Returns PipelineResult with entities + telemetry.
    """
    from migrator.parsers.registry import TABLE_REGISTRY

    job_id_str = str(job_id)
    db_files = [
        p for p in sorted(extracted_dir.rglob("*.DB"))
        if p.name.upper() in TABLE_REGISTRY
    ]
    log.info("pipeline_parse_scope", job_id=job_id_str, table_count=len(db_files))

    rows_by: dict[str, list[dict[str, object]]] = {}
    fmap_by: dict[str, dict[str, str]] = {}
    stats = MapStats()
    for db_path in db_files:
        _r, _f = await _parse_table(db_path, pool, job_id_str, env.max_haiku_calls_per_job, stats)
        rows_by[db_path.stem.upper()] = _r
        fmap_by[db_path.stem.upper()] = _f

    log.info(
        "pipeline_parsing_done",
        job_id=job_id_str,
        tables_parsed=len(rows_by),
        rule_hits=stats.rule_hits,
        cache_hits=stats.cache_hits,
        haiku_hits=stats.haiku_hits,
    )

    def _get(t: str) -> list[dict[str, object]]:
        return _remap(rows_by.get(t, []), fmap_by.get(t, {}))

    partners = build_partners(_get("NPART"))
    articles = build_articles(_get("NART"))
    chart = build_chart(_get("NCONT"))

    partners_by_source_id = {p.source_id: p for p in partners}
    articles_by_source_id = {a.source_id: a for a in articles}

    invoices, invoice_reasons = build_invoices(
        rows_by=rows_by,
        fmap_by=fmap_by,
        partners_by_source_id=partners_by_source_id,
        articles_by_source_id=articles_by_source_id,
        own_cif=own_cif,
    )
    payments, payment_reasons = build_payments(
        rows_by=rows_by,
        fmap_by=fmap_by,
        partners_by_source_id=partners_by_source_id,
    )

    log.info(
        "pipeline_complete",
        job_id=job_id_str,
        partners=len(partners),
        articles=len(articles),
        chart_entries=len(chart),
        invoices=len(invoices),
        payments=len(payments),
    )

    return PipelineResult(
        job_id=job_id,
        partners=partners,
        articles=articles,
        invoices=invoices,
        payments=payments,
        chart_of_accounts=chart,
        rule_hits=stats.rule_hits,
        cache_hits=stats.cache_hits,
        haiku_hits=stats.haiku_hits,
        invoice_reasons=invoice_reasons,
        payment_reasons=payment_reasons,
    )
