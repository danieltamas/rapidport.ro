# Completed: Archive Extractor — Zip Bomb + Path Traversal Defense

**Task:** cli-queue-archive-extractor | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/utils/archive.py:1-426` — New module implementing safe archive extraction with two-pass validation and bomb-safe limits for zip/tar.gz/7z/rar formats.

## Acceptance Criteria Check

- [x] `extract_archive` and `ArchiveError` exported via `__all__`
- [x] Magic-byte format detection (not file extension) — extension fallback only when magic is ambiguous
- [x] Two-pass validation: full entry scan with all checks BEFORE any file write
- [x] All 4 formats supported: zip (`zipfile`), tar.gz (`tarfile`), 7z (`py7zr`), rar (`rarfile`)
- [x] Symlinks rejected (pass 1) — all formats; 7z also has post-extract belt-and-suspenders scan
- [x] Hard links rejected (tar.gz only — `member.islnk()`)
- [x] Absolute paths rejected — Unix leading `/` and Windows drive letters (`^[A-Za-z]:[\\/]`)
- [x] Path traversal `..` rejected — splits on both `/` and `\` to catch Windows paths on POSIX
- [x] Drive letter paths rejected — `_DRIVE_RE = re.compile(r"^[A-Za-z]:[\\/]")`
- [x] Null bytes in path rejected
- [x] Zip slip rejected — `(output_dir / clean).resolve().is_relative_to(base)` check, `base` captured once before extraction
- [x] Size cap: total uncompressed bytes > `max_total_bytes` (default 5 GiB) → rejected
- [x] Ratio cap (per-entry): uncompressed/compressed > `max_ratio` (default 50.0), enforced only when `compressed_size > 1 KB` to avoid false positives on small metadata files
- [x] Ratio cap (archive-level): total uncompressed / archive file size > `max_ratio` — catches tar.gz and 7z solid archives where per-entry compressed size is 0
- [x] Entry count cap: > `max_entries` (default 10 000) → rejected
- [x] Partial-extract prevention — on any `_validate()` failure, no files have been written
- [x] PII-safe logging: `file_name=archive_path.name` (basename only), entry_count, total_bytes, rejection_reason — never entry contents
- [x] Rejection messages never echo attacker-controlled path verbatim — messages use `entry #N` index and reason code

## Security Check

- [x] All DB access: N/A (no DB in this module)
- [x] CSRF: N/A (no HTTP endpoints)
- [x] Job access: N/A
- [x] Admin audit: N/A
- [x] Zod validation: N/A (Python module)
- [x] No PII in logs — basename only, never full paths, never entry contents, never archive data
- [x] Session cookies: N/A

## Security Defense Breakdown

### 1. Zip Bomb — Per-Entry Ratio (ZIP and RAR)
```python
if e.compressed > 1024 and e.uncompressed > 0:
    ratio = e.uncompressed / e.compressed
    if ratio > max_ratio:
        raise ArchiveError(...)
```
Only enforced when `compressed_size > 1 KB` to avoid false positives on tiny metadata entries (e.g. a 10-byte comment stored uncompressed has a ratio of 1.0, but a 2-byte compressed → 512 KB uncompressed entry would be a bomb). Default threshold: 50x.

### 2. Zip Bomb — Archive-Level Ratio (all formats)
```python
arc_ratio = total / archive_size
if arc_ratio > max_ratio:
    raise ArchiveError(...)
```
This is the primary bomb check for tar.gz and 7z solid archives, where per-entry `compressed_size` is 0 or meaningless. For ZIP/RAR it's a secondary check that catches archives where many individual entries have acceptable ratios but the aggregate is suspicious.

### 3. Zip Bomb — Total Byte Cap
Accumulated total uncompressed bytes is checked per-entry during the first pass. Fails at the first entry that pushes total past `max_total_bytes`.

### 4. Entry Count Cap
Checked first in `_validate()` — a million-entry archive is rejected before any per-entry processing.

### 5. Symlink Rejection (all formats)
- ZIP: Unix mode bits extracted from `external_attr >> 16`; `(unix_mode & 0o170000) == 0o120000` checks the file type field. Explicit parentheses avoid the Python operator-precedence trap where `& 0o170000 == 0o120000` would evaluate `==` first.
- tar.gz: `member.issym()` (symlink) and `member.islnk()` (hard link).
- 7z: `info.is_symlink` attribute via `getattr` with False fallback (py7zr exposes this in newer versions). Belt-and-suspenders: after `sz.extractall()`, walk the output dir and delete + raise on any symlinks that materialised anyway.
- RAR: `info.is_symlink()` (rarfile 4.x API).

### 6. Path Traversal / Zip Slip
String-level checks happen BEFORE `Path()` construction (Path() can swallow some edge cases):
1. Null bytes → `ArchiveError`
2. Leading `/` → `ArchiveError`
3. Windows drive letter regex `^[A-Za-z]:[\\/]` → `ArchiveError`
4. Split on both `/` and `\` → reject any part equal to `".."`
5. Resolve target: `(output_dir / clean).resolve()` must be `is_relative_to(output_dir.resolve())` — catches any remaining escape attempts.

`base = output_dir.resolve()` is captured once before the loop to ensure symlinks in `output_dir`'s parents are resolved consistently.

### 7. Magic-Byte Detection
Extension is not trusted. Reads first 16 bytes and matches against known magic signatures:
- ZIP: `PK\x03\x04`, `PK\x05\x06` (empty), `PK\x07\x08`
- tar.gz: `\x1f\x8b\x08`
- 7z: `37 7A BC AF 27 1C`
- RAR v4: `Rar!\x1a\x07\x00`, v5: `Rar!\x1a\x07\x01\x00`
Extension fallback only if magic bytes are ambiguous.

### 8. Two-Pass Validation (partial-extract prevention)
`_validate()` is called on the complete entry list before any extractor is invoked. If validation raises, no extractor runs and no files are created (except `output_dir` itself, which is created pre-validation — empty directory is harmless and required by `is_relative_to` resolution).

## Implementation Notes

### 7z extractall vs per-member extract
The spec suggested per-member extraction via `sz.extract()` with a targets filter. In practice, py7zr's solid archive handling is unreliable with per-member extraction (seeking back to the beginning of the solid block for each member causes O(N²) reads). `sz.extractall(path=out)` is used instead, with the post-extract symlink scan as belt-and-suspenders. This is a deliberate trade-off noted for reviewers.

### System `unrar` dependency
RAR extraction requires the `unrar` binary in PATH. `rarfile.RarCannotExec` is caught in both `_rar_entries()` and `_extract_rar()` and translated to `ArchiveError` with `from None` to suppress exception chaining (the original exception may contain a PATH or filesystem path that could leak information). The bootstrap-dockerfile job already installs `unrar` in the Docker image.

### py7zr symlink handling
`py7zr` versions ≥ 0.20 expose `is_symlink` on the `FileInfo` object. Earlier versions do not, hence the `getattr(info, "is_symlink", False)` fallback. The post-extract walk removes any symlink that slipped through, ensuring safety even on older versions.

### Rejection message policy
All rejection messages use `entry #N` (ordinal index) rather than the entry's raw name. This prevents log injection attacks if rejection_reason is forwarded to structured logging, and prevents information leakage in error responses if ArchiveError messages are surfaced to callers.
