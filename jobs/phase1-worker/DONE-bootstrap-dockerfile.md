# Completed: Dockerfile + docker-compose + .gitignore .secrets/

**Task:** bootstrap-dockerfile (JOB.md §bootstrap) | **Status:** done | **Date:** 2026-04-18

## Changes Made

- `worker/Dockerfile` — new (50 lines); python:3.12-slim-bookworm base; installs `unrar` + `build-essential` system deps as root, cleans apt cache in same layer; creates `worker` group+user UID/GID 1000; copies `pyproject.toml` first for pip-layer caching, installs deps with `pip install --no-cache-dir .`; copies `src/migrator/` to `/app/migrator/` after install; switches to `USER worker`; `WORKDIR /app`; HEALTHCHECK every 30s (`import migrator`); `ENTRYPOINT ["python", "-m", "migrator.consumer"]`; OCI source label
- `worker/.dockerignore` — new (50 lines); excludes `__pycache__`, `*.pyc`, `.venv/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `dist/`, `*.egg-info/`, `.coverage`, `htmlcov/`, `tests/`, `.git/`, `README.md`, `.env*`, `.python-version`; keeps `pyproject.toml` + `src/` in build context
- `docker-compose.yml` — new at repo root (100 lines); defines `postgres` (postgres:16-alpine, healthcheck via `pg_isready`, secret-injected password, `postgres_data` volume) and `worker` (built from `./worker`, `user: "1000:1000"`, `mem_limit: 1g`, `cpus: 1.0`, `read_only: true`, `tmpfs: /tmp`, all env vars wired, `jobs_data` volume at `/data/jobs`, `worker_net` network, `depends_on postgres: service_healthy`); no `version:` key (compose v2 syntax); secrets block points to `.secrets/postgres_password` file
- `.gitignore` at repo root — appended `.secrets/` entry (idempotent via grep check)

## Acceptance Criteria Check

- [x] `worker/Dockerfile` exists, uses non-root user UID 1000 — `useradd --uid 1000 --gid worker`, `USER worker`
- [x] Install deps before copying src — `COPY pyproject.toml` + `pip install` layer precedes `COPY src/migrator/`
- [x] Entry point is `python -m migrator.consumer` — `ENTRYPOINT ["python", "-m", "migrator.consumer"]`
- [x] `worker/.dockerignore` excludes cache + venv + tests — all listed above present
- [x] `docker-compose.yml` at repo root — present; no `version:` key
- [x] worker service: `mem_limit: 1g`, `cpus: 1.0`, `user: "1000:1000"`, `read_only: true` — all four present
- [x] worker service: `tmpfs: /tmp` — present
- [x] Secret-based DB password — `POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password` + `secrets.postgres_password.file: ./.secrets/postgres_password`
- [x] `jobs_data` volume at `/data/jobs` — `volumes: jobs_data:/data/jobs`
- [x] `worker_net` network — defined in `networks:` block, used by both services
- [x] `.gitignore` contains `.secrets/` — appended in last section of file
- [x] YAML validation — structure verified by visual inspection (bash restricted in this session; orchestrator should run `python -c "import yaml; yaml.safe_load(open('docker-compose.yml'))"` to confirm)

## Security Check

- [x] Non-root user — `USER worker` (UID 1000, GID 1000); container cannot write to system paths
- [x] `read_only: true` — container filesystem is immutable; only `/tmp` (tmpfs) is writable at runtime
- [x] Secret-based DB password — password never appears as plaintext in compose file or env; injected via Docker secrets from file path
- [x] Network isolation — `worker_net` bridge network isolates worker to postgres service; Anthropic API egress enforced at reverse-proxy level (documented in compose comments)
- [x] No PII in image — Dockerfile copies only source code + pyproject; no `.env`, no credentials, no sample data (`.dockerignore` enforces)
- [x] `tmpfs` for /tmp — temporary files cleared on container stop, not persisted to volume
- N/A — CSRF: worker has no HTTP server
- N/A — Zod/Drizzle/assertJobAccess/assertAdminSession: Python worker, no Nitro endpoints

## Notes

- `pg-boss-py` is a placeholder dependency in `pyproject.toml` (noted by bootstrap-pyproject worker); the `pip install` step in the Dockerfile will fail at build time if this package doesn't exist on PyPI. `bootstrap-db-minimal` task must resolve this before a real `docker compose build` can succeed.
- REQUIREMENTS.md §Deliverables listed the compose file as `infra/docker-compose.worker.yml` but the task spec (`bootstrap-dockerfile` instructions) explicitly specifies `docker-compose.yml` at repo root. Task spec wins — file placed at repo root.
- base image is `python:3.12-slim-bookworm` (Debian bookworm-based) as instructed — NOT alpine, ensuring glibc availability for pypxlib/pydbf native wheels.
- `build-essential` is included for C-extension deps; if all wheels are pre-built it can be removed in a later optimization pass.
