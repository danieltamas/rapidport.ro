# migrator — Python worker

Converts a WinMentor company database export into SAGA-compatible import files.
Runs as a standalone CLI and as a pg-boss consumer alongside the Nuxt app.

## Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

## Run

```bash
python -m migrator.cli --help
```

## Lint + type-check

```bash
ruff check src/ tests/
mypy src/
```

## Test

```bash
pytest
```
