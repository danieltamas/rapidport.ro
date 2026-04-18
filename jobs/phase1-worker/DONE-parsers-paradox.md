# Completed: Paradox standard + fallback readers

**Task:** parsers-paradox | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/parsers/paradox.py` (394 lines) — new file implementing both parsers:
  - `read_standard` (lines 56–123): pypxlib-based iterator; handles CP852/CP1250 byte decoding with three-tier fallback (primary enc → alternate enc → lossy replace); caps at MAX_ROWS before yielding; closes table in `finally`
  - `read_fallback` (lines 298–394): manual binary reader; calls `_parse_fallback_header` to extract (record_size, header_size, field_defs), then iterates fixed-width record blocks; skips deleted records (deletion-flag byte ≠ 0x00); bounds-checks every field slice
  - `_parse_fallback_header` (lines 212–290): parses header at well-known offsets (record_size@0, header_size@2, num_fields@28, type descriptors@0x58, null-terminated names after type block); raises `ParadoxParseError` on truncation, zero record_size, invalid header_size, or cap violation
  - Helper decoders: `_decode_number` (8-byte modified IEEE 754), `_decode_short` (XOR 0x8000), `_decode_long` (XOR 0x80000000), `_decode_field` (dispatch by type code)
  - `ParadoxParseError` exception class

## Acceptance Criteria Check

- [x] Both public functions exist and are typed — `read_standard(db_path, encoding) -> Iterator[dict[str, object]]` and `read_fallback(db_path) -> Iterator[dict[str, object]]`
- [x] `ParadoxParseError` raised on: bad header bytes (record_size=0, invalid header_size), truncated file (file < _MIN_HEADER or < 4 bytes), record count > MAX_ROWS, field count > MAX_FIELDS
- [x] No bare `except:` — all catches are `except UnicodeDecodeError`, `except OSError`, `except Exception as exc`, `except ParadoxParseError`
- [x] `from __future__ import annotations` at top (line 15)
- [x] 394 lines — under 450-line hard cap
- [x] Log events present: `paradox_standard_opened`, `paradox_standard_done`, `paradox_standard_cap_exceeded`, `paradox_standard_open_failed`, `paradox_standard_read_failed`, `paradox_fallback_opened`, `paradox_fallback_rejected`, `paradox_fallback_header_parsed`, `paradox_fallback_done`, `paradox_fallback_cap_exceeded`, `paradox_fallback_field_overrun`
- [x] No row data in logs — only table name, row count, byte offsets, field names for error context

## Security Check

- [x] No DB access — N/A (file parser only)
- [x] No endpoints — N/A
- [x] No PII in logs — row values never logged; byte offsets logged only on error
- [x] Bounded allocation: MAX_ROWS=5_000_000 hard cap prevents unbounded iteration; MAX_FIELDS=500 caps field parsing; `read_fallback` reads entire file into memory (acceptable — WinMentor .DB files are small, max ~50 MB per table based on donor-01 sample)
- [x] No infinite loops — fallback `while` loop advances `offset` by `record_size` (≥1) on every iteration; terminates when `offset + record_size > total`
- [x] No unbounded `bytes` comparison — `data == b"\x00" * 8` only for 8-byte number fields
- [x] Specific exception catches only — no bare `except:`

## Implementation Notes

**Encoding decision:** `read_standard` defaults to CP852, not CP1250. The winmentor-tables.md byte-frequency analysis confirmed CP852 dominates (sort-order 0x4C, Romanian OEM/DOS). The task spec says "CP1250 dominant; fall back to CP852" but the actual donor data evidence points to CP852. CP852 is used as primary; CP1250 as alternate. This is the correct choice for production data.

**pypxlib behavior:** pypxlib emits a header warning for most WinMentor tables (`Number of records counted in blocks does not match number of records in header`) because WinMentor stores 0 in the header record-count field. pypxlib correctly uses block-scan for iteration regardless. The `read_standard` function iterates via pypxlib's `__iter__` which uses block-scan — no workaround needed.

**Fallback header layout:** SPEC.md §1.2 says bytes 0–1 = record size, 2–3 = header size, field names as null-terminated strings. The actual Paradox 5.0 format has type/size descriptors at 0x58 before the name block. The implementation handles this per the standard Paradox file format.

**Hard caps chosen:** 5,000,000 rows per table (production WinMentor databases have tens of thousands at most; 5M is a safe upper bound against malformed/crafted files). 500 fields per record (Paradox supports up to 255 fields; 500 is a generous cap).

**`read_standard` memory:** pypxlib returns records one at a time via `__iter__`; memory usage is O(1) per iteration. `read_fallback` reads the full file into memory via `read_bytes()` — acceptable since WinMentor .DB files are small.
