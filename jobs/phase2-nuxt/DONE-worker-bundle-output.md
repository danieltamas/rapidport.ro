# Completed: worker-bundle-output

**Task:** unblock `GET /api/jobs/[id]/download` (Wave 4b 501) | **Status:** done (single-agent) | **Date:** 2026-04-20

## Background

`api/jobs/[id]/download.get.ts` returns 501 `zip_bundler_unavailable` unless `/data/jobs/{id}/output.zip` exists. The Python worker writes individual SAGA output files (XML/DBF + report.json/pdf) to `/data/jobs/{id}/output/` but doesn't bundle them. Auto-memory + HANDOFF flagged this as the highest-blocker fix for the end-to-end loop. Done on the worker side per the recorded preference (no `archiver` dep on the Nuxt side).

## Changes Made

- `worker/src/migrator/utils/archive.py:29` — extend `__all__` with `bundle_output`.
- `worker/src/migrator/utils/archive.py:end` — new `bundle_output(output_dir: Path) -> Path`. Stdlib `zipfile.ZipFile` only (no new deps). `ZIP_DEFLATED` compression. Atomic write: `output.zip.tmp` → `os.replace` → `output.zip` so a concurrent reader (the Nuxt download handler) never sees a half-written file. Raises `ArchiveError` if `output_dir` is missing/not-a-dir/empty. Logs `output_bundled` with `zip_bytes` + `file_count` (no PII).
- `worker/src/migrator/consumer.py:247` — import `bundle_output` alongside the existing `extract_archive`.
- `worker/src/migrator/consumer.py:375` — call `bundle_output(output_dir)` AFTER `write_report_pdf` and BEFORE `_mark_rp_succeeded`. Rationale: the SSE 'done' event implies the zip is ready to download. Failure raises `RuntimeError("bundle_failed: ...")` which falls through to `_handle_job`'s except-branch and marks the job failed — better than landing the user on a 'succeeded' job that 501s on download.

## Acceptance Criteria Check

- [x] `output.zip` is materialized inside the worker pipeline before `_mark_rp_succeeded`
- [x] Atomic-write semantics — no half-written file visible
- [x] No new Python deps
- [x] Failure path marks the job failed, not silently succeeded
- [x] Filename layout matches `download.get.ts`'s expectation: `/data/jobs/{id}/output.zip` (sibling of `output/`)

## Security Check

- [x] All DB access goes through Drizzle (or parameterized `sql` template) — N/A (no DB access in this change)
- [x] Every mutation endpoint is CSRF-protected — N/A (worker code)
- [x] Every job endpoint calls `assertJobAccess` — N/A
- [x] Every admin endpoint calls `assertAdminSession` + writes to `admin_audit_log` — N/A
- [x] All inputs Zod-validated — N/A (worker; `output_dir` is server-built from validated job UUID upstream)
- [x] No PII in logs — log emits `zip_bytes` + `file_count` only; no filenames
- [x] Session cookies — N/A
- [x] Rate limits — N/A
- [x] Path traversal — `arcname=p.relative_to(output_dir).as_posix()` keeps the zip rooted; no absolute paths leak into the archive

## Validation

- `python3 -m py_compile src/migrator/utils/archive.py src/migrator/consumer.py` → EXIT=0.
- `ruff` and `mypy` not installed in this dev environment; not run. Per CLAUDE.md hook docs the worker-side `task-complete-gate.sh` runs them when present. Recommend the next agent in a worker-tooling-installed env re-runs `ruff check src/ && mypy src/` before the next worker change.
- No new tests authored (the worker `tests/` dir is empty — Phase 1 GATE deferred). A future test should assert: empty dir → `ArchiveError`; happy path → zip extracts to identical bytes; concurrent reader sees only the final file (atomic rename test).

## Branch + commit

Branch: `job/phase2-nuxt/worker-bundle-output` (off `main`, single-agent merge)
Commit: `feat(worker): bundle_output() — atomic-zip /data/jobs/{id}/output → output.zip`
