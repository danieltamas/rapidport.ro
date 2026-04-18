# Completed: Python worker pyproject + project skeleton

**Task:** bootstrap-pyproject (JOB.md §bootstrap) | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/pyproject.toml` — new; hatchling build backend, Python 3.12, 12 production deps from REQUIREMENTS.md, 5 dev deps, entry point `migrator = "migrator.cli:main"`, strict mypy (pydantic.mypy plugin), ruff selects E/F/I/N/UP/B/SIM/RUF at line-length 100, pytest asyncio_mode=auto
- `worker/src/migrator/__init__.py` — new; sets `__version__ = "0.1.0"`
- `worker/src/migrator/parsers/__init__.py` — new; sealed empty (comment only)
- `worker/src/migrator/canonical/__init__.py` — new; sealed empty (comment only)
- `worker/src/migrator/mappers/__init__.py` — new; sealed empty (comment only)
- `worker/src/migrator/generators/__init__.py` — new; sealed empty (comment only)
- `worker/src/migrator/reports/__init__.py` — new; sealed empty (comment only)
- `worker/src/migrator/utils/__init__.py` — new; sealed empty (comment only)
- `worker/src/migrator/cli.py` — new; stub `main()` prints "not implemented yet", exits 0
- `worker/src/migrator/consumer.py` — new; stub `async def main()` for pg-boss consumer
- `worker/tests/__init__.py` — new; empty (pytest package discovery)
- `worker/README.md` — new; install/run/lint/test instructions (English only)
- `worker/.python-version` — new; `3.12`
- `worker/.gitignore` — new; standard Python ignores

## Acceptance Criteria Check

- [x] `pyproject.toml` parses via `python3 -c "import tomllib; ..."` — 12 production deps, 5 dev deps, all from REQUIREMENTS.md
- [x] Every REQUIREMENTS.md dep present — verified by tomllib dump
- [x] 8 `__init__.py` files created — `find src tests -name "__init__.py" | sort` returns exactly 8
- [x] Entry point `migrator.cli:main` resolves — `cli.py` exports `main()` at module top level
- [x] Ruff config: line-length 100, target py312, select E/F/I/N/UP/B/SIM/RUF
- [x] Mypy config: `strict = true`, `python_version = "3.12"`, `disallow_untyped_defs = true`, `warn_unused_ignores = true`, `plugins = ["pydantic.mypy"]`
- [x] `worker/README.md`, `worker/.python-version`, `worker/.gitignore` present

## Security Check (N/A — scaffolding only, no endpoints/DB/user input)

- [x] No secrets in `pyproject.toml` (no hardcoded keys, no URLs with credentials)
- [x] No PII-logging risk (stub code prints a single static string, no user input processed)
- N/A — CSRF, Zod, Drizzle, assertJobAccess, assertAdminSession (no endpoints touched)

## Notes

- `pg-boss-py` package name is a placeholder — marked with `# TODO(bootstrap-db-minimal): verify actual package name`. Downstream `bootstrap-db-minimal` task must validate whether the package exists on PyPI or whether direct asyncpg pg-boss polling is needed.
- All 7 subpackage `__init__.py` files are sealed as intentionally empty. Downstream workers MUST use direct imports (`from migrator.utils.logger import hash_email`, not `from migrator.utils import hash_email`). Editing these files is a scaffolding contract violation.
- `generators/__init__.py` is sealed here; JOB.md shows task `generators-orchestrator` will add a top-level `generate_saga_output` function there — that task must unseal it deliberately and only for that purpose.

## Verification Output

```
tomllib parse: OK — 12 production deps, 5 dev deps
find src tests -name "__init__.py" | sort:
  src/migrator/__init__.py
  src/migrator/canonical/__init__.py
  src/migrator/generators/__init__.py
  src/migrator/mappers/__init__.py
  src/migrator/parsers/__init__.py
  src/migrator/reports/__init__.py
  src/migrator/utils/__init__.py
  tests/__init__.py
Total: 8 files
```
