# ---------------------------------------------------------------------------
# Rapidport — Python worker image
# Base: python:3.12-slim-bookworm (Debian-based; NOT alpine — pypxlib/pydbf
#        wheels require glibc and may not build on musl).
# ---------------------------------------------------------------------------

FROM python:3.12-slim-bookworm AS base

LABEL org.opencontainers.image.source="https://github.com/…/rapidport"

# ---------------------------------------------------------------------------
# System dependencies — installed as root before user switch
# ---------------------------------------------------------------------------
# unrar: required by the `rarfile` Python package to extract .rar archives
# build-essential: C compiler for any deps that need to compile extensions
#   (prefer wheels — build-essential kept small; clean cache in same layer)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        unrar \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Non-root user — UID/GID 1000 ("worker")
# ---------------------------------------------------------------------------
RUN groupadd --gid 1000 worker \
    && useradd --uid 1000 --gid worker --create-home worker

# ---------------------------------------------------------------------------
# Working directory
# ---------------------------------------------------------------------------
WORKDIR /app

# ---------------------------------------------------------------------------
# Install Python dependencies
# Layer-cache strategy: copy pyproject.toml FIRST so that `pip install`
# is only re-run when dependencies change, not on every src/ edit.
# ---------------------------------------------------------------------------
COPY pyproject.toml ./

# Placeholder src layout expected by hatchling before `pip install`
# We install in editable-style but without -e so the final image is
# self-contained (no src/ dependency at runtime after install).
# hatchling needs the package to exist at install time — we create a
# minimal stub, install, then overwrite with the real src below.
RUN mkdir -p src/migrator \
    && touch src/migrator/__init__.py \
    && pip install --no-cache-dir . \
    && rm -rf src/

# ---------------------------------------------------------------------------
# Copy application source — changes here do NOT invalidate the pip layer
# ---------------------------------------------------------------------------
COPY src/migrator/ /app/migrator/

# ---------------------------------------------------------------------------
# Switch to non-root user for all subsequent commands + runtime
# ---------------------------------------------------------------------------
USER worker

# ---------------------------------------------------------------------------
# Health check — verifies the package is importable (catches broken installs)
# ---------------------------------------------------------------------------
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import migrator; print('ok')"

# ---------------------------------------------------------------------------
# Entry point — pg-boss consumer mode by default.
# CLI invocations override this: docker run ... python -m migrator.cli ...
# ---------------------------------------------------------------------------
ENTRYPOINT ["python", "-m", "migrator.consumer"]
