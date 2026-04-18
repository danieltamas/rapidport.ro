"""Paradox .DB file parsers for WinMentor tables.

Two entry points:
- ``read_standard`` — pypxlib-based reader for well-formed .DB/.MB files.
- ``read_fallback`` — manual binary reader for non-standard tables (e.g. BUGET1.DB).

Encoding: WinMentor on Romanian Windows uses CP852 (sort-order 0x4C).
``read_standard`` defaults to CP852 with CP1250 fallback on decode error.
The fallback reader always decodes text as CP852.

Hard caps: MAX_ROWS=5_000_000 rows/table, MAX_FIELDS=500 fields/record.
Never log row data; byte offsets are safe for error context.
"""

from __future__ import annotations

import struct
from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pypxlib  # type: ignore[import-untyped]

from migrator.utils.logger import get_logger

__all__ = [
    "ParadoxParseError",
    "read_standard",
    "read_fallback",
]

log = get_logger(__name__)

MAX_ROWS: int = 5_000_000
MAX_FIELDS: int = 500

# Paradox field-type codes used by the fallback reader
_FTYPE_ALPHA: int = 0x01    # fixed-length string (CP852)
_FTYPE_NUMBER: int = 0x02   # 8-byte modified IEEE 754
_FTYPE_SHORT: int = 0x03    # 2-byte signed int (XOR 0x8000)
_FTYPE_DATE: int = 0x04     # 4-byte Julian day (XOR 0x80000000)
_FTYPE_MONEY: int = 0x05    # same layout as NUMBER
_FTYPE_LONG: int = 0x06     # 4-byte signed int (XOR 0x80000000)
_FTYPE_LOGICAL: int = 0x09  # 1 byte: 0x80 = true


class ParadoxParseError(Exception):
    """Raised when a Paradox .DB file is unreadable or violates hard caps."""


# ---------------------------------------------------------------------------
# Standard reader (pypxlib)
# ---------------------------------------------------------------------------


def read_standard(
    db_path: Path,
    encoding: str = "cp852",
) -> Iterator[dict[str, object]]:
    """Iterate records from a standard Paradox .DB/.MB file via pypxlib.

    Decodes raw-bytes values from pypxlib using *encoding* (CP852 default),
    falling back to CP1250 then lossy replace on decode error.

    Args:
        db_path:  Path to the ``.DB`` file; companion ``.MB`` is opened automatically.
        encoding: Primary text encoding.  Defaults to ``"cp852"``.

    Yields:
        One ``dict[str, object]`` per active record, keyed by column name.

    Raises:
        ParadoxParseError: If the file cannot be opened or MAX_ROWS is exceeded.
    """
    log.info("paradox_standard_opened", table=db_path.stem, encoding=encoding)

    try:
        table: pypxlib.Table = pypxlib.open(str(db_path))
    except Exception as exc:
        log.error("paradox_standard_open_failed", table=db_path.stem, error=str(exc))
        raise ParadoxParseError(f"Cannot open {db_path.name}: {exc}") from exc

    fallback_enc = "cp1250" if encoding != "cp1250" else "cp852"
    row_count: int = 0

    try:
        col_names: list[str] = [f.name for f in table.fields]

        for record in table:
            if row_count >= MAX_ROWS:
                log.error("paradox_standard_cap_exceeded", table=db_path.stem, cap=MAX_ROWS)
                raise ParadoxParseError(
                    f"{db_path.name}: record count exceeds hard cap {MAX_ROWS}"
                )

            row: dict[str, object] = {}
            for name in col_names:
                val: object = record[name]
                if isinstance(val, bytes):
                    raw_bytes: bytes = val
                    try:
                        val = raw_bytes.decode(encoding)
                    except UnicodeDecodeError:
                        try:
                            val = raw_bytes.decode(fallback_enc)
                        except UnicodeDecodeError:
                            val = raw_bytes.decode(encoding, errors="replace")
                row[name] = val

            yield row
            row_count += 1

    except ParadoxParseError:
        raise
    except Exception as exc:
        log.error("paradox_standard_read_failed", table=db_path.stem, error=str(exc))
        raise ParadoxParseError(f"Error reading {db_path.name}: {exc}") from exc
    finally:
        try:
            table.close()
        except Exception:
            pass

    log.info("paradox_standard_done", table=db_path.stem, rows=row_count)


# ---------------------------------------------------------------------------
# Fallback binary reader helpers
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class _FieldDef:
    name: str
    ftype: int
    size: int


def _decode_number(data: bytes) -> float | None:
    """Decode 8-byte Paradox modified-IEEE-754 number; returns None for NULL."""
    if len(data) != 8 or data == b"\x00" * 8:
        return None
    raw = bytearray(data)
    if raw[0] & 0x80:
        raw[0] ^= 0x80
        sign = 1.0
    else:
        for i in range(8):
            raw[i] ^= 0xFF
        sign = -1.0
    (val,) = struct.unpack(">d", bytes(raw))
    return sign * val


def _decode_short(data: bytes) -> int | None:
    """Decode 2-byte Paradox signed short (XOR 0x8000); None for zero sentinel."""
    if len(data) != 2:
        return None
    (raw,) = struct.unpack(">H", data)
    return None if raw == 0 else (raw ^ 0x8000)


def _decode_long(data: bytes) -> int | None:
    """Decode 4-byte Paradox signed long (XOR 0x80000000); None for zero sentinel."""
    if len(data) != 4:
        return None
    (raw,) = struct.unpack(">I", data)
    if raw == 0:
        return None
    flipped: int = raw ^ 0x80000000
    return flipped - (1 << 32) if flipped >= (1 << 31) else flipped


def _decode_field(fdef: _FieldDef, raw: bytes) -> object:
    """Decode one field's raw bytes according to its Paradox type code."""
    if fdef.ftype == _FTYPE_ALPHA:
        text = raw.rstrip(b"\x00")
        return text.decode("cp852", errors="replace")

    if fdef.ftype in (_FTYPE_NUMBER, _FTYPE_MONEY):
        return _decode_number(raw)

    if fdef.ftype == _FTYPE_SHORT:
        return _decode_short(raw)

    if fdef.ftype == _FTYPE_LONG:
        return _decode_long(raw)

    if fdef.ftype == _FTYPE_DATE:
        if len(raw) < 4:
            return None
        (raw_val,) = struct.unpack(">I", raw[:4])
        return None if raw_val == 0 else (raw_val ^ 0x80000000)

    if fdef.ftype == _FTYPE_LOGICAL:
        return None if not raw else (raw[0] == 0x80)

    return bytes(raw)  # memo refs, unknown types — return raw


# ---------------------------------------------------------------------------
# Header parser
# ---------------------------------------------------------------------------

# Minimum byte count before the first field descriptor (at 0x58 + 2 bytes)
_MIN_HEADER: int = 0x58 + 2
# Offset of the "number of fields" byte in the Paradox header
_NUM_FIELDS_OFFSET: int = 28
# Offset where field type/size descriptor block starts
_TYPE_BLOCK_OFFSET: int = 0x58


def _parse_fallback_header(
    data: bytes,
    db_path: Path,
) -> tuple[int, int, list[_FieldDef]]:
    """Parse Paradox header; return (record_size, header_size, field_defs).

    Header layout (little-endian unless noted):
      0-1   record size
      2-3   header size (data section begins at this offset)
      28    number of fields
      0x58  field descriptors: [type:u8, size:u8] × num_fields
      0x58 + num_fields*2 …  null-terminated field names (CP852)

    Raises:
        ParadoxParseError: truncated header, zero record_size, cap violation.
    """
    if len(data) < _MIN_HEADER:
        raise ParadoxParseError(
            f"{db_path.name}: file too short ({len(data)} bytes, need ≥ {_MIN_HEADER})"
        )

    record_size: int = struct.unpack_from("<H", data, 0)[0]
    header_size: int = struct.unpack_from("<H", data, 2)[0]

    if record_size == 0:
        raise ParadoxParseError(
            f"{db_path.name}: record_size=0 at offset 0 — not a valid Paradox file"
        )
    if header_size < _MIN_HEADER or header_size > len(data):
        raise ParadoxParseError(
            f"{db_path.name}: header_size={header_size} invalid (file={len(data)} bytes)"
        )

    num_fields: int = data[_NUM_FIELDS_OFFSET]
    if num_fields == 0:
        raise ParadoxParseError(f"{db_path.name}: num_fields=0 — no fields defined")
    if num_fields > MAX_FIELDS:
        raise ParadoxParseError(
            f"{db_path.name}: field count {num_fields} exceeds hard cap {MAX_FIELDS}"
        )

    type_block_end: int = _TYPE_BLOCK_OFFSET + num_fields * 2
    if type_block_end > len(data):
        raise ParadoxParseError(
            f"{db_path.name}: field descriptor block truncated "
            f"(need offset {type_block_end}, have {len(data)})"
        )

    field_types: list[tuple[int, int]] = [
        (data[_TYPE_BLOCK_OFFSET + i * 2], data[_TYPE_BLOCK_OFFSET + i * 2 + 1])
        for i in range(num_fields)
    ]

    # Field names: null-terminated strings between type_block_end and header_size
    name_bytes: bytes = data[type_block_end:header_size]
    names: list[str] = []
    pos: int = 0

    for _ in range(num_fields):
        if pos >= len(name_bytes):
            raise ParadoxParseError(
                f"{db_path.name}: field name block truncated "
                f"(got {len(names)}, expected {num_fields})"
            )
        null_idx = name_bytes.find(b"\x00", pos)
        raw_name = name_bytes[pos:] if null_idx == -1 else name_bytes[pos:null_idx]
        pos = len(name_bytes) if null_idx == -1 else null_idx + 1
        names.append(raw_name.decode("cp852", errors="replace"))

    if len(names) != num_fields:
        raise ParadoxParseError(
            f"{db_path.name}: expected {num_fields} names, parsed {len(names)}"
        )

    fields = [
        _FieldDef(name=names[i], ftype=field_types[i][0], size=field_types[i][1])
        for i in range(num_fields)
    ]
    return record_size, header_size, fields


# ---------------------------------------------------------------------------
# Fallback reader (public)
# ---------------------------------------------------------------------------


def read_fallback(db_path: Path) -> Iterator[dict[str, object]]:
    """Iterate records from a non-standard Paradox .DB file via manual binary parsing.

    Used for tables pypxlib cannot open (e.g. ``BUGET1.DB``).  Reads the
    Paradox header manually, then iterates record-sized blocks starting at
    ``header_size`` offset.  Skips deleted records (non-zero deletion-flag byte).

    Args:
        db_path: Path to the ``.DB`` file.

    Yields:
        One ``dict[str, object]`` per active record, keyed by field name.

    Raises:
        ParadoxParseError: Bad header, truncated file, or cap exceeded.
    """
    log.info("paradox_fallback_opened", table=db_path.stem)

    try:
        raw_data: bytes = db_path.read_bytes()
    except OSError as exc:
        log.error("paradox_fallback_rejected", table=db_path.stem, error=str(exc))
        raise ParadoxParseError(f"Cannot read {db_path.name}: {exc}") from exc

    if len(raw_data) < 4:
        log.error(
            "paradox_fallback_rejected",
            table=db_path.stem,
            reason="file_too_short",
            size=len(raw_data),
        )
        raise ParadoxParseError(f"{db_path.name}: file too short ({len(raw_data)} bytes)")

    record_size, data_offset, fields = _parse_fallback_header(raw_data, db_path)

    log.info(
        "paradox_fallback_header_parsed",
        table=db_path.stem,
        record_size=record_size,
        data_offset=data_offset,
        num_fields=len(fields),
    )

    data_section: bytes = raw_data[data_offset:]
    total: int = len(data_section)

    if total == 0:
        log.info("paradox_fallback_done", table=db_path.stem, rows=0)
        return

    row_count: int = 0
    offset: int = 0

    while offset + record_size <= total:
        if row_count >= MAX_ROWS:
            log.error(
                "paradox_fallback_cap_exceeded",
                table=db_path.stem,
                cap=MAX_ROWS,
                byte_offset=data_offset + offset,
            )
            raise ParadoxParseError(
                f"{db_path.name}: record count exceeds hard cap {MAX_ROWS}"
            )

        record_raw: bytes = data_section[offset : offset + record_size]

        # Deletion flag: 0x00 = active record
        if record_raw[0] != 0x00:
            offset += record_size
            continue

        row: dict[str, object] = {}
        field_offset: int = 1  # byte 0 is the deletion flag

        for fdef in fields:
            field_end = field_offset + fdef.size
            if field_end > record_size:
                log.error(
                    "paradox_fallback_field_overrun",
                    table=db_path.stem,
                    field=fdef.name,
                    byte_offset=data_offset + offset + field_offset,
                )
                raise ParadoxParseError(
                    f"{db_path.name}: field '{fdef.name}' overruns record "
                    f"at byte offset {data_offset + offset + field_offset}"
                )
            row[fdef.name] = _decode_field(fdef, record_raw[field_offset:field_end])
            field_offset = field_end

        yield row
        row_count += 1
        offset += record_size

    log.info("paradox_fallback_done", table=db_path.stem, rows=row_count)
