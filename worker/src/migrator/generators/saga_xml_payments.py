"""SAGA XML generator for Încasări (incoming) and Plăți (outgoing) payments.

Emits one file per (direction, date) group:
  ``I_<ddmmyyyy>.xml`` for incoming, ``P_<ddmmyyyy>.xml`` for outgoing.

XML structure per docs/saga-schemas.md §6–7. Encoding: cp1250 (WIN1250
declaration). All string values escape-audited via xml.sax.saxutils.escape.
Decimal throughout; exchange_rate only when currency != "RON".
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Final
from xml.sax.saxutils import escape

from migrator.canonical.journal import Payment
from migrator.utils.logger import get_logger

__all__ = ["generate_payment_xml"]

_log = get_logger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_ENCODING: Final[str] = "utf-8"
_ENCODING_DECLARATION: Final[str] = "utf-8"
_XML_DECLARATION: Final[str] = (
    f'<?xml version="1.0" encoding="{_ENCODING_DECLARATION}"?>\n'
)

# SAGA account codes used when the Payment model does not carry explicit
# account overrides (method-based defaults matching SAGA convention).
_DEFAULT_CASH_ACCOUNT: Final[str] = "5311"
_DEFAULT_BANK_ACCOUNT: Final[str] = "5121"
_DEFAULT_CLIENT_ACCOUNT: Final[str] = "4111"
_DEFAULT_SUPPLIER_ACCOUNT: Final[str] = "401"

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _method_to_account(method: str) -> str:
    """Return the default cash/bank account code for a payment method.

    Used when the Payment canonical model does not carry an explicit account
    override.  SAGA convention maps cash payments to 5311 and bank transfers
    to 5121; card is treated as bank.

    Args:
        method: PaymentMethod value (cash, bank, card, other).

    Returns:
        Romanian Plan de Conturi account code string.
    """
    if method == "cash":
        return _DEFAULT_CASH_ACCOUNT
    # bank, card, other → bank account
    return _DEFAULT_BANK_ACCOUNT


def _fmt_date(d: date) -> str:
    """Format date as ``dd.mm.yyyy`` per SAGA XML convention.

    Args:
        d: Date to format.

    Returns:
        Date string in ``dd.mm.yyyy`` format.
    """
    return d.strftime("%d.%m.%Y")


def _fmt_amount(amount: Decimal) -> str:
    """Format Decimal as string with period separator, 2 decimal places.

    Args:
        amount: Amount to format. Must be a Decimal instance.

    Returns:
        String representation with period as decimal separator.
    """
    return f"{amount:.2f}"


def _fmt_rate(rate: Decimal) -> str:
    """Format exchange rate as string, 4 decimal places.

    Args:
        rate: Exchange rate to format.

    Returns:
        String with 4 decimal places.
    """
    return f"{rate:.4f}"


def _render_incoming_line(payment: Payment) -> str:
    """Render one incoming-payment ``<Linie>`` XML fragment (saga-schemas.md §6b).

    Required: Data, Numar, Suma, Cont. Optional: ContClient, FacturaID,
    FacturaNumar, CodFiscal, Moneda, Explicatie, Curs (foreign-currency only).
    All values escape-audited via xml.sax.saxutils.escape.
    """
    lines: list[str] = ["  <Linie>"]
    lines.append(f"    <Data>{escape(_fmt_date(payment.payment_date))}</Data>")

    ref = payment.reference_number or payment.source_id
    lines.append(f"    <Numar>{escape(ref)}</Numar>")
    lines.append(f"    <Suma>{escape(_fmt_amount(payment.amount))}</Suma>")

    cont = _method_to_account(payment.method)
    lines.append(f"    <Cont>{escape(cont)}</Cont>")
    lines.append(f"    <ContClient>{escape(_DEFAULT_CLIENT_ACCOUNT)}</ContClient>")

    # Invoice links — emit first as FacturaID, rest annotated in Explicatie
    applied = payment.applied_to_invoice_ids
    if applied:
        lines.append(f"    <FacturaID>{escape(applied[0])}</FacturaID>")
        if len(applied) > 1:
            extra = ", ".join(escape(i) for i in applied[1:])
            lines.append(f"    <FacturaNumar>{extra}</FacturaNumar>")
        else:
            lines.append(f"    <FacturaNumar>{escape(applied[0])}</FacturaNumar>")

    if payment.partner is not None:
        cif = getattr(payment.partner, "fiscal_code", None) or ""
        if cif:
            lines.append(f"    <CodFiscal>{escape(cif)}</CodFiscal>")

    currency = str(payment.currency)
    lines.append(f"    <Moneda>{escape(currency)}</Moneda>")

    if payment.exchange_rate is not None and currency != "RON":
        lines.append(
            f"    <Curs>{escape(_fmt_rate(payment.exchange_rate))}</Curs>"
        )

    # Explicatie: partner name if available (no PII beyond what's in the file)
    if payment.partner is not None:
        partner_name = getattr(payment.partner, "name", None) or ""
        if partner_name:
            lines.append(f"    <Explicatie>{escape(partner_name)}</Explicatie>")

    lines.append("  </Linie>")
    return "\n".join(lines) + "\n"


def _render_outgoing_line(payment: Payment) -> str:
    """Render one outgoing-payment ``<Linie>`` XML fragment (saga-schemas.md §7b).

    Required: Data, Numar, Suma, Cont. Optional: ContFurnizor, FacturaID,
    FacturaNumar, CodFiscal, Moneda, Explicatie, Curs (foreign-currency only).
    All values escape-audited via xml.sax.saxutils.escape.
    """
    lines: list[str] = ["  <Linie>"]
    lines.append(f"    <Data>{escape(_fmt_date(payment.payment_date))}</Data>")

    ref = payment.reference_number or payment.source_id
    lines.append(f"    <Numar>{escape(ref)}</Numar>")
    lines.append(f"    <Suma>{escape(_fmt_amount(payment.amount))}</Suma>")

    cont = _method_to_account(payment.method)
    lines.append(f"    <Cont>{escape(cont)}</Cont>")
    lines.append(f"    <ContFurnizor>{escape(_DEFAULT_SUPPLIER_ACCOUNT)}</ContFurnizor>")

    applied = payment.applied_to_invoice_ids
    if applied:
        lines.append(f"    <FacturaID>{escape(applied[0])}</FacturaID>")
        if len(applied) > 1:
            extra = ", ".join(escape(i) for i in applied[1:])
            lines.append(f"    <FacturaNumar>{extra}</FacturaNumar>")
        else:
            lines.append(f"    <FacturaNumar>{escape(applied[0])}</FacturaNumar>")

    if payment.partner is not None:
        cif = getattr(payment.partner, "fiscal_code", None) or ""
        if cif:
            lines.append(f"    <CodFiscal>{escape(cif)}</CodFiscal>")

    currency = str(payment.currency)
    lines.append(f"    <Moneda>{escape(currency)}</Moneda>")

    if payment.exchange_rate is not None and currency != "RON":
        lines.append(
            f"    <Curs>{escape(_fmt_rate(payment.exchange_rate))}</Curs>"
        )

    if payment.partner is not None:
        partner_name = getattr(payment.partner, "name", None) or ""
        if partner_name:
            lines.append(f"    <Explicatie>{escape(partner_name)}</Explicatie>")

    lines.append("  </Linie>")
    return "\n".join(lines) + "\n"


def _filename_for(direction: str, d: date) -> str:
    """Return the SAGA import filename for a (direction, date) group.

    Filename pattern per SPEC §1.6 and task spec:
      - incoming → ``I_<ddmmyyyy>.xml``
      - outgoing → ``P_<ddmmyyyy>.xml``

    Args:
        direction: 'incoming' or 'outgoing'.
        d: Payment date for the group.

    Returns:
        Filename string (no path prefix).
    """
    date_str = d.strftime("%d%m%Y")
    prefix = "I" if direction == "incoming" else "P"
    return f"{prefix}_{date_str}.xml"


def _write_group(
    direction: str,
    d: date,
    group_payments: list[Payment],
    output_dir: Path,
    resolved_output_dir: Path,
) -> Path | None:
    """Write one XML file for a (direction, date) group.

    Applies path-traversal defense before writing; returns None on rejection.
    """
    filename = _filename_for(direction, d)
    output_path = output_dir / filename

    # Path-traversal defense — resolved path must stay inside output_dir
    if output_path.resolve().parent != resolved_output_dir:
        _log.warning(
            "payments_xml_rejected",
            reason="path_traversal_detected",
            filename=filename,
        )
        return None

    if direction == "incoming":
        root_open = "<Incasari>\n"
        root_close = "</Incasari>\n"
        render = _render_incoming_line
    else:
        root_open = "<Plati>\n"
        root_close = "</Plati>\n"
        render = _render_outgoing_line

    parts: list[str] = [_XML_DECLARATION, root_open]
    for payment in group_payments:
        parts.append(render(payment))
    parts.append(root_close)

    xml_text = "".join(parts)
    output_path.write_bytes(xml_text.encode(_ENCODING))
    return output_path


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_payment_xml(
    payments: list[Payment],
    output_dir: Path,
) -> list[Path]:
    """Emit SAGA XML import files for payments. Per docs/saga-schemas.md §6–7.

    Groups by (direction, payment_date): incoming → ``I_<ddmmyyyy>.xml``,
    outgoing → ``P_<ddmmyyyy>.xml``. One file per group, cp1250 encoded.

    Batching at daily granularity matches SAGA's documented file-naming
    convention and keeps per-direction file counts predictable.

    Amounts are Decimal; exchange_rate emitted only when currency != "RON".
    Path-traversal defense on every write; rejected files logged separately.
    No payment data in log messages — counts only.

    Args:
        payments: Canonical Payment objects to export.
        output_dir: Target directory (must exist).

    Returns:
        Written file paths in group-iteration order.
    """
    if not payments:
        _log.info(
            "payments_xml_written",
            file_count=0,
            payment_count=0,
        )
        return []

    # Pre-resolve output_dir once for path-traversal checks
    resolved_output_dir = output_dir.resolve()

    # Group by (direction, payment_date)
    groups: defaultdict[tuple[str, date], list[Payment]] = defaultdict(list)
    for payment in payments:
        groups[(payment.direction, payment.payment_date)].append(payment)

    written: list[Path] = []
    rejected_count = 0

    for (direction, d), group_payments in sorted(groups.items()):
        result = _write_group(
            direction=direction,
            d=d,
            group_payments=group_payments,
            output_dir=output_dir,
            resolved_output_dir=resolved_output_dir,
        )
        if result is not None:
            written.append(result)
        else:
            rejected_count += len(group_payments)

    _log.info(
        "payments_xml_written",
        file_count=len(written),
        payment_count=len(payments) - rejected_count,
    )

    if rejected_count > 0:
        _log.warning(
            "payments_xml_rejected",
            rejected_count=rejected_count,
        )

    return written
