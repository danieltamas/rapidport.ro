-- Phase 1 worker bootstrap. Replaced by Phase 2 Drizzle baseline (app/drizzle/). See jobs/phase2-nuxt/JOB.md.

BEGIN;

-- ---------------------------------------------------------------------------
-- Migration ledger — tracks which .sql files have been applied
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS _worker_migrations (
    filename    TEXT        PRIMARY KEY,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper (idempotent via CREATE OR REPLACE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jobs (
    id                          UUID        PRIMARY KEY,
    status                      TEXT        NOT NULL
                                            CHECK (status IN (
                                                'pending',
                                                'running',
                                                'succeeded',
                                                'failed',
                                                'cancelled'
                                            )),
    progress_stage              TEXT,
    progress_pct                INTEGER     NOT NULL DEFAULT 0
                                            CHECK (progress_pct >= 0 AND progress_pct <= 100),
    worker_version              TEXT        NOT NULL,
    canonical_schema_version    TEXT        NOT NULL,
    delta_syncs_used            INTEGER     NOT NULL DEFAULT 0,
    delta_syncs_allowed         INTEGER     NOT NULL DEFAULT 0,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
CREATE TRIGGER trg_jobs_updated_at
BEFORE UPDATE ON jobs
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- mapping_cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mapping_cache (
    id              BIGSERIAL   PRIMARY KEY,
    source_software TEXT        NOT NULL,
    table_name      TEXT        NOT NULL,
    field_name      TEXT        NOT NULL,
    target_field    TEXT        NOT NULL,
    confidence      NUMERIC(4,3) NOT NULL
                                CHECK (confidence >= 0 AND confidence <= 1),
    reasoning       TEXT,
    hit_count       INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (source_software, table_name, field_name)
);

-- ---------------------------------------------------------------------------
-- ai_usage
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_usage (
    id          BIGSERIAL   PRIMARY KEY,
    job_id      UUID        REFERENCES jobs(id) ON DELETE CASCADE,
    model       TEXT        NOT NULL,
    tokens_in   INTEGER     NOT NULL DEFAULT 0,
    tokens_out  INTEGER     NOT NULL DEFAULT 0,
    cost_usd    NUMERIC(10,6) NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_job_id ON ai_usage(job_id);

COMMIT;
