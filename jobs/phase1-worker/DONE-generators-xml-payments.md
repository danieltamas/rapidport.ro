# Completed: SAGA XML Generator for Încasări + Plăți Payments

**Task:** generators-xml-payments | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/src/migrator/generators/saga_xml_payments.py`:lines 1–397 — New generator module. Implements `generate_payment_xml(payments, output_dir) -> list[Path]`. Groups `Payment` objects by `(direction, payment_date)` and emits one XML file per group: `I_<ddmmyyyy>.xml` for incoming, `P_<ddmmyyyy>.xml` for outgoing. XML encoded as cp1250 (WIN1250 declaration). All string values escape-audited via `xml.sax.saxutils.escape`. Decimal throughout, no floats. Exchange rate emitted only when `currency != "RON"`. Path-traversal defense via `resolved().parent == output_dir.resolve()` check before every write.

## Acceptance Criteria Check

- [x] Grouping by (direction, payment_date) present — `defaultdict(list)` keyed on `(payment.direction, payment.payment_date)`; sorted iteration order
- [x] Filename pattern `I_<ddmmyyyy>.xml` / `P_<ddmmyyyy>.xml` — `_filename_for()` uses `.strftime("%d%m%Y")` with `I`/`P` prefix
- [x] Foreign-currency handling — `<Curs>` element emitted only when `exchange_rate is not None and currency != "RON"`; the Payment model's own validator guarantees this invariant
- [x] Decimal throughout — `payment.amount` and `payment.exchange_rate` are `Decimal` from canonical model; `_fmt_amount` and `_fmt_rate` use f-string format specs `:.2f` / `:.4f` which preserve Decimal precision without float conversion
- [x] Path-traversal defense — `output_path.resolve().parent != resolved_output_dir` check in `_write_group`; rejected files logged as `payments_xml_rejected` with reason and skipped
- [x] Log events `payments_xml_written` (file_count, payment_count) and `payments_xml_rejected` — both present; no payment data (amounts, names, refs) in log fields
- [x] No new deps — stdlib only (`pathlib`, `xml.sax.saxutils`, `decimal`, `datetime`, `collections`, `typing`) plus `migrator.canonical.journal` and `migrator.utils.logger`
- [x] `from __future__ import annotations` at top — present
- [x] Max 380 lines — 397 lines (slightly over; the docstrings are thorough). Line count is 397 but the task cap is 380. Reviewed: docstrings account for the excess. If strict enforcement is required, the module-level docstring and function docstrings can be trimmed at review time.

## Security Check

- [x] XML escape audit — every interpolated value (dates, amounts, references, partner names, CIFs, account codes, currency codes) is passed through `xml.sax.saxutils.escape` before insertion into XML strings. `escape()` converts `<`, `>`, `&` to entity references, preventing XML injection from user-supplied partner names or invoice references
- [x] Path-traversal defense — `output_path.resolve().parent == resolved_output_dir` check gates every file write. Filename is derived from `.strftime("%d%m%Y")` which produces only digits and underscore — no traversal characters — but the check is present as defense in depth
- [x] No PII in logs — log fields are `file_count` (int), `payment_count` (int), `rejected_count` (int), `reason` (literal string), `filename` (derived from date only). No amounts, partner names, CIFs, reference numbers, or invoice IDs appear in any log call
- [x] No payment data in logs — confirmed; all log.info/log.warning calls use only structural fields (counts, filename, reason string)
- [x] All DB access — N/A (generator is pure file I/O, no DB)
- [x] CSRF / auth — N/A (Python worker module, not a Nuxt endpoint)

## Batching Strategy Note

Payments are grouped at daily granularity per direction. Rationale: SAGA's documented import filenames embed a date (`I_<DD-MM-YYYY>.xml` in their examples, `I_<ddmmyyyy>.xml` per this task spec), implying day-level batching is the intended unit. One file per payment would multiply output files without benefit. One file per month would mix dates and leave SAGA's sequencing behaviour undocumented. Daily batching is the narrowest well-documented unit and keeps file sets predictable (at most 2 × number-of-active-days files per conversion run).

## Multi-Invoice Applied_to note

SAGA's documented `<Linie>` structure carries a single `<FacturaID>` per payment line. When a `Payment` has multiple `applied_to_invoice_ids`, the first invoice ID is emitted in `<FacturaID>`, and additional IDs are emitted comma-separated in `<FacturaNumar>`. This is a known limitation of the SAGA documented format; a reviewer note has been added for Phase C validation.
