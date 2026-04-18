"""Structured JSON logging for the migrator worker.

Provides a configured structlog setup with ISO 8601 UTC timestamps, JSON output,
and PII-safe helper functions for masking sensitive data before it reaches logs.

Log event naming convention — use snake_case verb_or_noun events:
    log.info("parsing_started", table="NPART")
    log.info("mapping_completed", hits=120, misses=3)
    log.error("saga_rejected", reason="invalid_cif", file="IESIRI-2024-01.xml")

Never log: raw emails, CIFs, passwords, API keys, file CONTENTS, row data.
Do log: hashed email prefixes (via hash_email), redacted CIFs (RO*****),
        truncated filenames, record counts, durations, status codes.
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Optional

import structlog

__all__ = [
    "configure_logger",
    "get_logger",
    "hash_email",
    "redact_cif",
    "redact_secret",
]

# Pattern for Romanian CIF/CUI: optional "RO" prefix followed by digits
_CIF_PATTERN: re.Pattern[str] = re.compile(r"^(RO)?\d+$", re.IGNORECASE)


def configure_logger(level: str = "info") -> None:
    """Configure structlog for JSON output with ISO 8601 UTC timestamps.

    Call once at worker startup (from consumer.py or cli.py).
    The log level should be read from the LOG_LEVEL env var by the caller.

    Args:
        level: Log level string (debug, info, warning, error, critical).
    """
    log_level: int = getattr(logging, level.upper(), logging.INFO)

    logging.basicConfig(
        format="%(message)s",
        level=log_level,
        force=True,
    )

    structlog.configure(
        processors=[
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a bound structlog logger keyed by module name.

    Usage:
        log = get_logger(__name__)
        log.info("parsing_started", table="NPART", rows=5000)

    Args:
        name: Module name, typically ``__name__``.

    Returns:
        A bound structlog logger instance.
    """
    return structlog.get_logger(name)  # type: ignore[return-value]


def hash_email(email: Optional[str]) -> str:
    """Return the first 8 hex chars of the SHA-256 hash of a lowercased email.

    Provides a stable, short identifier for log correlation without exposing
    the raw email address.

    Args:
        email: Email address to hash. Empty/None returns ``""``.

    Returns:
        8-character hex prefix, or ``""`` if input is empty or None.
    """
    if not email or not email.strip():
        return ""
    normalised = email.lower().strip()
    return hashlib.sha256(normalised.encode()).hexdigest()[:8]


def redact_cif(cif: Optional[str]) -> str:
    """Redact a Romanian CIF/CUI to ``"RO*****"``.

    Matches any value that starts with ``RO`` (case-insensitive) or consists
    entirely of digits — regardless of length.

    Args:
        cif: CIF/CUI string to redact. Empty/None returns ``""``.

    Returns:
        ``"RO*****"`` if the input looks like a Romanian CIF, ``""`` otherwise.
    """
    if not cif or not cif.strip():
        return ""
    if _CIF_PATTERN.match(cif.strip()):
        return "RO*****"
    return ""


def redact_secret(value: Optional[str], keep_prefix: int = 4) -> str:
    """Show the first ``keep_prefix`` chars of a secret followed by ``…[REDACTED]``.

    Use for API keys, passwords, tokens, and other sensitive credentials.

    Args:
        value: Secret string to redact. Empty/None returns ``""``.
        keep_prefix: Number of leading characters to preserve (default 4).

    Returns:
        ``"<prefix>…[REDACTED]"`` or ``""`` if input is empty or None.

    Example:
        >>> redact_secret("sk-ant-api-...abc", keep_prefix=4)
        'sk-a…[REDACTED]'
    """
    if not value:
        return ""
    prefix = value[:keep_prefix]
    return f"{prefix}\u2026[REDACTED]"
