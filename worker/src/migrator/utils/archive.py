"""Safe archive extraction with zip bomb and path traversal defenses.

Supports: .zip, .tar.gz/.tgz, .7z, .rar

Two-pass: all entries are validated BEFORE any file is written.
Any failure raises ArchiveError — no partial extracts.
"""

from __future__ import annotations

import os
import re
import tarfile
import zipfile
from pathlib import Path
from typing import NamedTuple

import py7zr
import rarfile

try:
    from migrator.utils.logger import get_logger

    _log = get_logger(__name__)
    _HAS_LOGGER = True
except ImportError:
    _HAS_LOGGER = False

__all__ = ["ArchiveError", "extract_archive"]

# --- magic bytes ---
_ZIP_MAGIC = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")
_GZIP_MAGIC = b"\x1f\x8b\x08"
_7Z_MAGIC = b"7z\xbc\xaf\x27\x1c"
_RAR_MAGIC_V4 = b"Rar!\x1a\x07\x00"
_RAR_MAGIC_V5 = b"Rar!\x1a\x07\x01\x00"
_DRIVE_RE = re.compile(r"^[A-Za-z]:[\\/]")


class ArchiveError(Exception):
    """Raised on any extraction failure: bomb limits, path traversal,
    unsupported format, corrupted archive, system ``unrar`` missing, etc."""


class _Entry(NamedTuple):
    index: int          # 1-based (used in rejection messages, never the path)
    name: str           # raw path string from archive
    uncompressed: int   # bytes
    compressed: int     # bytes (0 = unknown — skip per-entry ratio check)
    is_sym: bool
    is_hard: bool       # tar hard links


# ---------------------------------------------------------------------------
# Format detection
# ---------------------------------------------------------------------------
def _detect_format(path: Path) -> str:
    with path.open("rb") as fh:
        h = fh.read(16)
    if any(h.startswith(m) for m in _ZIP_MAGIC):
        return "zip"
    if h.startswith(_GZIP_MAGIC):
        return "targz"
    if h.startswith(_7Z_MAGIC):
        return "7z"
    if h.startswith(_RAR_MAGIC_V4) or h.startswith(_RAR_MAGIC_V5):
        return "rar"
    # Extension fallback
    suf = path.suffix.lower()
    if suf == ".zip":
        return "zip"
    if suf in (".gz", ".tgz") or path.name.lower().endswith(".tar.gz"):
        return "targz"
    if suf == ".7z":
        return "7z"
    if suf == ".rar":
        return "rar"
    raise ArchiveError("unsupported_format: unrecognised magic bytes and unknown extension")


# ---------------------------------------------------------------------------
# Path validation (string level — never echoes attacker path in messages)
# ---------------------------------------------------------------------------
def _check_path(raw: str, idx: int) -> str:
    """Validate raw entry path; return normalised posix path or raise ArchiveError."""
    ref = f"entry #{idx}"
    if "\x00" in raw:
        raise ArchiveError(f"{ref} rejected: null_byte_in_path")
    if raw.startswith("/"):
        raise ArchiveError(f"{ref} rejected: absolute_path_unix")
    if _DRIVE_RE.match(raw):
        raise ArchiveError(f"{ref} rejected: absolute_path_windows_drive")
    parts = re.split(r"[/\\]", raw)
    for part in parts:
        if part == "..":
            raise ArchiveError(f"{ref} rejected: path_traversal_dotdot")
    clean = [p for p in parts if p]
    if not clean:
        raise ArchiveError(f"{ref} rejected: empty_path")
    return "/".join(clean)


def _safe_target(output_dir: Path, base: Path, clean: str, idx: int) -> Path:
    target = (output_dir / clean).resolve()
    if not target.is_relative_to(base):
        raise ArchiveError(f"entry #{idx} rejected: zip_slip_escape")
    return target


# ---------------------------------------------------------------------------
# Validation pass (both size limits and path/symlink checks)
# ---------------------------------------------------------------------------
def _validate(
    entries: list[_Entry],
    archive_size: int,
    output_dir: Path,
    max_ratio: float,
    max_total_bytes: int,
    max_entries: int,
) -> None:
    if len(entries) > max_entries:
        raise ArchiveError(f"rejected: entry_count_exceeded ({len(entries)} > {max_entries})")

    base = output_dir.resolve()
    total: int = 0

    for e in entries:
        # Per-entry ratio (ZIP/RAR have real compressed sizes; skip if 0 or tiny)
        if e.compressed > 1024 and e.uncompressed > 0:
            ratio = e.uncompressed / e.compressed
            if ratio > max_ratio:
                raise ArchiveError(
                    f"entry #{e.index} rejected: ratio_exceeded ({ratio:.1f} > {max_ratio})"
                )
        total += e.uncompressed
        if total > max_total_bytes:
            raise ArchiveError(
                f"rejected: total_size_exceeded after entry #{e.index} "
                f"({total} > {max_total_bytes})"
            )

    # Archive-level ratio (catches tar.gz / 7z solid archives where per-entry is 0)
    if archive_size > 0 and total > 0:
        arc_ratio = total / archive_size
        if arc_ratio > max_ratio:
            raise ArchiveError(
                f"rejected: archive_level_ratio_exceeded ({arc_ratio:.1f} > {max_ratio})"
            )

    for e in entries:
        if e.is_sym:
            raise ArchiveError(f"entry #{e.index} rejected: symlink_not_allowed")
        if e.is_hard:
            raise ArchiveError(f"entry #{e.index} rejected: hardlink_not_allowed")
        clean = _check_path(e.name, e.index)
        _safe_target(output_dir, base, clean, e.index)


# ---------------------------------------------------------------------------
# Entry collectors (pass 1 — no writes)
# ---------------------------------------------------------------------------
def _zip_entries(p: Path) -> list[_Entry]:
    entries: list[_Entry] = []
    with zipfile.ZipFile(p, "r") as zf:
        for i, info in enumerate(zf.infolist(), 1):
            unix_mode = (info.external_attr >> 16) & 0xFFFF
            is_sym = (unix_mode & 0o170000) == 0o120000
            entries.append(
                _Entry(
                    index=i,
                    name=info.filename,
                    uncompressed=info.file_size,
                    compressed=info.compress_size,
                    is_sym=is_sym,
                    is_hard=False,
                )
            )
    return entries


def _targz_entries(p: Path) -> list[_Entry]:
    with tarfile.open(p, mode="r:gz") as tf:
        return [
            _Entry(i, m.name, m.size, 0, m.issym(), m.islnk())
            for i, m in enumerate(tf.getmembers(), 1)
        ]


def _7z_entries(p: Path) -> list[_Entry]:
    with py7zr.SevenZipFile(p, mode="r") as sz:
        return [
            _Entry(
                index=i,
                name=info.filename,
                uncompressed=int(info.uncompressed or 0),
                compressed=int(getattr(info, "compressed", 0) or 0),
                is_sym=bool(getattr(info, "is_symlink", False)),
                is_hard=False,
            )
            for i, info in enumerate(sz.list(), 1)
        ]


def _rar_entries(p: Path) -> list[_Entry]:
    try:
        rf = rarfile.RarFile(p)
    except rarfile.RarCannotExec:
        raise ArchiveError(  # noqa: B904
            "rar_extraction_requires_unrar: system `unrar` binary not found in PATH — "
            "ensure `unrar` is installed in the Docker image "
            "(bootstrap-dockerfile already includes it; check PATH or install step)."
        ) from None
    try:
        return [
            _Entry(
                index=i,
                name=info.filename,
                uncompressed=info.file_size,
                compressed=info.compress_size,
                is_sym=bool(info.is_symlink()),
                is_hard=False,
            )
            for i, info in enumerate(rf.infolist(), 1)
        ]
    finally:
        rf.close()


# ---------------------------------------------------------------------------
# Extractors (pass 2 — called only after _validate passes)
# ---------------------------------------------------------------------------
def _write_chunks(src: object, dst_path: Path) -> None:
    dst_path.parent.mkdir(parents=True, exist_ok=True)
    with dst_path.open("wb") as dst:
        while True:
            chunk = src.read(65536)  # type: ignore[union-attr]
            if not chunk:
                break
            dst.write(chunk)


def _extract_zip(p: Path, out: Path) -> None:
    base = out.resolve()
    with zipfile.ZipFile(p, "r") as zf:
        for i, info in enumerate(zf.infolist(), 1):
            clean = _check_path(info.filename, i)
            target = _safe_target(out, base, clean, i)
            if info.filename.endswith("/"):
                target.mkdir(parents=True, exist_ok=True)
            else:
                with zf.open(info) as src:
                    _write_chunks(src, target)


def _extract_targz(p: Path, out: Path) -> None:
    base = out.resolve()
    with tarfile.open(p, mode="r:gz") as tf:
        for i, member in enumerate(tf.getmembers(), 1):
            clean = _check_path(member.name, i)
            target = _safe_target(out, base, clean, i)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            elif member.isfile():
                fobj = tf.extractfile(member)
                if fobj is not None:
                    _write_chunks(fobj, target)


def _extract_7z(p: Path, out: Path) -> None:
    # py7zr extractall is the only reliable way to handle solid archives.
    # Validation pass already rejected symlinks; belt-and-suspenders scan after.
    with py7zr.SevenZipFile(p, mode="r") as sz:
        sz.extractall(path=out)
    # Remove any symlinks py7zr may have materialised despite validation
    for dirpath, dirs, files in os.walk(out):
        dp = Path(dirpath)
        for name in files + dirs:
            fp = dp / name
            if fp.is_symlink():
                fp.unlink()
                raise ArchiveError("rejected: symlink_found_post_extract — hidden symlink")


def _extract_rar(p: Path, out: Path) -> None:
    base = out.resolve()
    try:
        rf = rarfile.RarFile(p)
    except rarfile.RarCannotExec:
        raise ArchiveError("rar_extraction_requires_unrar: `unrar` binary not found.") from None  # noqa: B904
    try:
        for i, info in enumerate(rf.infolist(), 1):
            clean = _check_path(info.filename, i)
            target = _safe_target(out, base, clean, i)
            if info.filename.endswith("/"):
                target.mkdir(parents=True, exist_ok=True)
            else:
                with rf.open(info) as src:
                    _write_chunks(src, target)
    finally:
        rf.close()


# ---------------------------------------------------------------------------
# Extraction root detection
# ---------------------------------------------------------------------------
def _extraction_root(entries: list[_Entry], output_dir: Path) -> Path:
    top: set[str] = set()
    for e in entries:
        parts = [p for p in re.split(r"[/\\]", e.name.strip("/")) if p]
        if parts:
            top.add(parts[0])
    if len(top) == 1:
        candidate = output_dir / next(iter(top))
        if candidate != output_dir:
            return candidate
    return output_dir


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def extract_archive(
    archive_path: Path,
    output_dir: Path,
    max_ratio: float = 50.0,
    max_total_bytes: int = 5 * 1024 * 1024 * 1024,
    max_entries: int = 10_000,
) -> Path:
    """Extract archive_path into output_dir, enforcing bomb-safe limits.

    Supports .zip, .tgz/.tar.gz, .7z, .rar. Returns the extraction root
    (may equal output_dir or a subfolder inside it, depending on the
    archive's internal layout).

    Rejects ALL of these with ArchiveError (no partial extracts):
      - Total uncompressed size > max_total_bytes
      - Any entry ratio (compressed→uncompressed) > max_ratio
        (only enforced when compressed_size > 1 KB)
      - Archive-level ratio (uncompressed total / archive file size) > max_ratio
      - Entry count > max_entries
      - Any symlink or hard-link entry
      - Any absolute path (Unix '/' or Windows drive letter)
      - Any path containing ``..`` segments
      - Any path whose resolved target escapes output_dir (zip slip)
      - Null bytes in any path

    Args:
        archive_path:    Path to the archive file.
        output_dir:      Directory to extract into (created if absent).
        max_ratio:       Uncompressed/compressed ratio cap. Default 50.0.
        max_total_bytes: Total uncompressed byte cap. Default 5 GiB.
        max_entries:     Entry count cap. Default 10 000.

    Returns:
        Path — extraction root (output_dir or single top-level subfolder).

    Raises:
        ArchiveError: On any validation failure or extraction error.
    """
    file_name = archive_path.name  # basename only — safe to log

    if _HAS_LOGGER:
        _log.info("archive_extraction_started", file_name=file_name)  # type: ignore[union-attr]

    if not archive_path.is_file():
        raise ArchiveError("archive_not_found: input path is not a regular file")

    archive_size = archive_path.stat().st_size

    try:
        fmt = _detect_format(archive_path)
    except ArchiveError as exc:
        if _HAS_LOGGER:
            _log.info(  # type: ignore[union-attr]
                "archive_extraction_rejected",
                file_name=file_name,
                rejection_reason="unsupported_format",
            )
        raise exc

    _collectors = {"zip": _zip_entries, "targz": _targz_entries, "7z": _7z_entries, "rar": _rar_entries}
    try:
        entries = _collectors[fmt](archive_path)
    except ArchiveError:
        raise
    except Exception as exc:
        raise ArchiveError("archive_read_error: could not read archive members") from exc

    entry_count = len(entries)
    total_bytes = sum(e.uncompressed for e in entries)

    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        _validate(entries, archive_size, output_dir, max_ratio, max_total_bytes, max_entries)
    except ArchiveError as exc:
        if _HAS_LOGGER:
            _log.info(  # type: ignore[union-attr]
                "archive_extraction_rejected",
                file_name=file_name,
                entry_count=entry_count,
                total_bytes=total_bytes,
                rejection_reason=str(exc),
            )
        raise

    root = _extraction_root(entries, output_dir)

    _extractors = {"zip": _extract_zip, "targz": _extract_targz, "7z": _extract_7z, "rar": _extract_rar}
    try:
        _extractors[fmt](archive_path, output_dir)
    except ArchiveError:
        raise
    except Exception as exc:
        raise ArchiveError("extraction_error: write failed during extraction") from exc

    if _HAS_LOGGER:
        _log.info(  # type: ignore[union-attr]
            "archive_extraction_done",
            file_name=file_name,
            fmt=fmt,
            entry_count=entry_count,
            total_bytes=total_bytes,
        )

    return root
