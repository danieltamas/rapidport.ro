"""WinMentor-specific parser utilities.

Encoding detection: CP1250 vs CP852 heuristic (neither codec raises on arbitrary
bytes — we score Romanian diacritics + common bigrams and pick the higher score,
defaulting to CP1250 on a tie). UTF-8 is tried last, only when it decodes cleanly
and contains at least one diacritic.

Version detection: ``DECL.Ini`` is authoritative (contains ``VersionID=…``).
Table-presence heuristic is the fallback. Never raises.
"""

from __future__ import annotations

import re
from pathlib import Path

from pydantic import BaseModel

from migrator.utils.logger import get_logger

log = get_logger(__name__)


# ---------------------------------------------------------------------------
# Public model
# ---------------------------------------------------------------------------


class SourceVersion(BaseModel):
    """Detected WinMentor source version metadata."""

    version: str | None
    efactura_enabled: bool
    notes: str


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Romanian diacritics; +3 per occurrence when scoring an encoding candidate.
_ROMANIAN_CHARS: frozenset[str] = frozenset("ăĂâÂîÎșȘțȚ")

# Frequent Romanian bigrams; +1 per occurrence.
_ROMANIAN_BIGRAMS: tuple[str, ...] = ("re", "de", "ul", "ri", "ie", "or", "ar", "ur", "nr", "si")

# Read at most 256 KB for encoding detection — ``.DB`` files can be large.
_PROBE_BYTES: int = 256 * 1024

# Table stem substrings whose presence indicates eFactura support.
_EFACTURA_PATTERNS: tuple[str, ...] = ("EFACT",)

# Maps version label → required upper-case table stems (all must be present).
# Ordered newest-first so the first match wins.
_VERSION_SIGNATURES: dict[str, frozenset[str]] = {
    "8.x": frozenset({"NPART", "NGEST", "NREG", "EFACT"}),
    "7.x": frozenset({"NPART", "NGEST", "NREG"}),
    "6.x": frozenset({"NPART", "NGEST"}),
}

# Matches: VersionID=3226022,01 (possibly with surrounding whitespace)
_DECL_VERSION_RE: re.Pattern[str] = re.compile(r"(?im)^\s*VersionID\s*=\s*([^\r\n]+)")


# ---------------------------------------------------------------------------
# Encoding detection
# ---------------------------------------------------------------------------


def _score_encoding(raw: bytes, encoding: str) -> int:
    """Decode *raw* and score for Romanian text plausibility."""
    decoded = raw.decode(encoding, errors="replace")
    score = sum(decoded.count(ch) for ch in _ROMANIAN_CHARS) * 3
    score += sum(decoded.count(bg) for bg in _ROMANIAN_BIGRAMS)
    return score


def detect_encoding(db_path: Path, probe_field: str = "Denumire") -> str:
    """Return the best-fit character encoding for a WinMentor ``.DB`` file.

    Reads up to 256 KB, scores CP1250 and CP852 on Romanian diacritics and
    bigrams, then returns the winner.  UTF-8 is only returned if it decodes
    cleanly *and* contains diacritics.  ``probe_field`` is reserved for future
    field-level reads once the Paradox parser is available.

    Returns one of ``"cp1250"``, ``"cp852"``, ``"utf-8"``.
    """
    try:
        raw = db_path.read_bytes()[:_PROBE_BYTES]
    except OSError as exc:
        log.warning("encoding_detection_io_error", filename=db_path.name, error=str(exc))
        return "cp1250"

    cp1250_score = _score_encoding(raw, "cp1250")
    cp852_score = _score_encoding(raw, "cp852")

    # UTF-8 only if it decodes without errors AND contains diacritics.
    try:
        utf8_text = raw.decode("utf-8", errors="strict")
        if any(ch in utf8_text for ch in _ROMANIAN_CHARS):
            log.info(
                "encoding_detected",
                filename=db_path.name,
                encoding="utf-8",
                cp1250_score=cp1250_score,
                cp852_score=cp852_score,
            )
            return "utf-8"
    except UnicodeDecodeError:
        pass

    if cp852_score > cp1250_score:
        log.info(
            "encoding_fallback_used",
            filename=db_path.name,
            encoding="cp852",
            cp1250_score=cp1250_score,
            cp852_score=cp852_score,
        )
        return "cp852"

    # CP1250 on tie — Phase 0 confirmed it is the dominant WinMentor encoding.
    log.info(
        "encoding_detected",
        filename=db_path.name,
        encoding="cp1250",
        cp1250_score=cp1250_score,
        cp852_score=cp852_score,
    )
    return "cp1250"


# ---------------------------------------------------------------------------
# Version detection helpers
# ---------------------------------------------------------------------------


def _parse_decl_ini(path: Path) -> str | None:
    """Extract ``VersionID`` from a ``DECL.Ini`` file (decoded as CP1250).

    Uses a regex because Paradox .Ini files can omit the blank lines that
    ``configparser`` requires between sections.
    """
    try:
        content = path.read_bytes().decode("cp1250", errors="replace")
    except OSError:
        return None
    match = _DECL_VERSION_RE.search(content)
    return match.group(1).strip() if match else None


def _table_stems(root: Path) -> frozenset[str]:
    """Return upper-case stems of all ``.DB`` files under *root*."""
    try:
        return frozenset(p.stem.upper() for p in root.rglob("*.DB"))
    except OSError:
        return frozenset()


def _heuristic_version(stems: frozenset[str]) -> str | None:
    """Return the first version label whose required tables are all present."""
    for label, required in _VERSION_SIGNATURES.items():
        if required.issubset(stems):
            return label
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_version(extracted_root: Path) -> SourceVersion:
    """Infer the WinMentor version from the extracted archive structure.

    Detection order:
    1. ``DECL.Ini`` (root + one subdirectory level) — authoritative.
    2. ``.DB`` table-presence heuristic — fallback.

    Never raises. Returns ``SourceVersion(version=None, …)`` on any failure.
    """
    version: str | None = None
    efactura_enabled = False
    notes_parts: list[str] = []
    source = "unknown"

    # Gather DECL.Ini candidates (root + direct subdirectories).
    candidates: list[Path] = []
    try:
        if extracted_root.is_dir():
            candidates.append(extracted_root / "DECL.Ini")
            for child in extracted_root.iterdir():
                if child.is_dir():
                    candidates.append(child / "DECL.Ini")
    except OSError as exc:
        notes_parts.append(f"root scan error: {exc}")

    for candidate in candidates:
        if candidate.is_file():
            raw_version = _parse_decl_ini(candidate)
            if raw_version:
                version = raw_version
                source = "DECL.Ini"
                notes_parts.append(f"version from {candidate.name}")
                break

    # Collect table stems for heuristic version + efactura detection.
    stems = _table_stems(extracted_root)

    if version is None and stems:
        version = _heuristic_version(stems)
        if version:
            source = "table-heuristic"
            notes_parts.append(f"version guessed from {len(stems)} tables")

    efactura_enabled = any(pat in stem for stem in stems for pat in _EFACTURA_PATTERNS)
    if efactura_enabled:
        notes_parts.append("efactura tables detected")

    if version is not None:
        log.info(
            "version_detected",
            root=extracted_root.name,
            version=version,
            source=source,
            efactura=efactura_enabled,
            table_count=len(stems),
        )
    else:
        log.warning(
            "version_indeterminate",
            root=extracted_root.name,
            table_count=len(stems),
        )
        notes_parts.append("version indeterminate")

    return SourceVersion(
        version=version,
        efactura_enabled=efactura_enabled,
        notes="; ".join(notes_parts) if notes_parts else "ok",
    )
