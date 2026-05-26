-- =============================================================================
-- migrations/001_initial.sql
-- =============================================================================
-- Committed reference copy of the initial schema.
-- This file is the single source of truth for the v0.1 database structure.
--
-- The same SQL runs automatically on first docker container start via
-- docker/postgres/init/002_schema.sql.
--
-- For future schema changes:
--   1. Create migrations/002_your_change.sql
--   2. Run: npm run db:migrate
--   3. Never edit this file after it has been applied to any environment.
--
-- Applied: automatically on first docker:up
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions (idempotent)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ---------------------------------------------------------------------------
-- runs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS runs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','running','paused','complete','failed','cancelled')),
  config        JSONB       NOT NULL DEFAULT '{}',
  stats         JSONB       NOT NULL DEFAULT '{}',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runs_status     ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at DESC);

-- ---------------------------------------------------------------------------
-- queries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS queries (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                  UUID        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  parent_id               UUID        REFERENCES queries(id),
  query_hash              CHAR(64)    NOT NULL,
  raw_text                TEXT        NOT NULL,
  canonical_text          TEXT        NOT NULL,
  canonical_geo_label     TEXT        NOT NULL,
  niche                   TEXT        NOT NULL,
  provider_id             TEXT        NOT NULL,
  generated_by_strategies TEXT[]      NOT NULL DEFAULT '{}',
  expansion_metadata      JSONB       NOT NULL DEFAULT '[]',
  geo_target              JSONB       NOT NULL,
  score                   NUMERIC(5,4),
  lifecycle_state         TEXT        NOT NULL DEFAULT 'generated'
                          CHECK (lifecycle_state IN (
                            'generated','canonicalized','queued','dispatched',
                            'running','complete','failed','skipped'
                          )),
  status                  TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','dispatched','complete','failed','skipped')),
  result_count            INTEGER,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_queries_hash_per_run UNIQUE (run_id, provider_id, query_hash)
);

CREATE INDEX IF NOT EXISTS idx_queries_run_id      ON queries(run_id);
CREATE INDEX IF NOT EXISTS idx_queries_query_hash  ON queries(query_hash);
CREATE INDEX IF NOT EXISTS idx_queries_provider_id ON queries(provider_id);
CREATE INDEX IF NOT EXISTS idx_queries_status      ON queries(status);
CREATE INDEX IF NOT EXISTS idx_queries_lifecycle   ON queries(lifecycle_state);
CREATE INDEX IF NOT EXISTS idx_queries_parent_id   ON queries(parent_id);
CREATE INDEX IF NOT EXISTS idx_queries_niche       ON queries(niche);

-- ---------------------------------------------------------------------------
-- raw_results
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS raw_results (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id             UUID        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  query_id           UUID        NOT NULL REFERENCES queries(id),
  provider_id        TEXT        NOT NULL,
  provider_result_id TEXT        NOT NULL,
  raw_payload        JSONB       NOT NULL,
  source_url         TEXT,
  collected_at       TIMESTAMPTZ NOT NULL,
  processed          BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_raw_results_provider_result UNIQUE (run_id, provider_id, provider_result_id)
);

CREATE INDEX IF NOT EXISTS idx_raw_results_run_id    ON raw_results(run_id);
CREATE INDEX IF NOT EXISTS idx_raw_results_query_id  ON raw_results(query_id);
CREATE INDEX IF NOT EXISTS idx_raw_results_processed ON raw_results(processed) WHERE processed = FALSE;

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS businesses (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint           TEXT        NOT NULL UNIQUE,
  run_id                UUID        NOT NULL REFERENCES runs(id),
  query_id              UUID        NOT NULL REFERENCES queries(id),
  raw_result_id         UUID        REFERENCES raw_results(id),
  source_provider       TEXT        NOT NULL,
  name                  TEXT        NOT NULL,
  normalized_name       TEXT        NOT NULL,
  phone                 TEXT,
  normalized_phone      TEXT,
  website               TEXT,
  rating                NUMERIC(3,1),
  review_count          INTEGER,
  price_level           SMALLINT    CHECK (price_level BETWEEN 1 AND 4),
  primary_category      TEXT,
  categories            TEXT[]      NOT NULL DEFAULT '{}',
  address_raw           TEXT,
  address_street        TEXT,
  address_city          TEXT,
  address_state         TEXT,
  address_postal_code   TEXT,
  address_country       TEXT,
  address_country_code  CHAR(2),
  geo_lat               NUMERIC(10,7),
  geo_lng               NUMERIC(10,7),
  hours_raw             TEXT[],
  hours_parsed          JSONB,
  external_ids          JSONB       NOT NULL DEFAULT '{}',
  source_url            TEXT,
  collected_at          TIMESTAMPTZ NOT NULL,
  normalization_status  TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (normalization_status IN ('pending','complete','failed','skipped')),
  deduplication_status  TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (deduplication_status IN ('pending','unique','duplicate','uncertain')),
  export_status         TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (export_status IN ('pending','exported','excluded')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_businesses_run_id          ON businesses(run_id);
CREATE INDEX IF NOT EXISTS idx_businesses_fingerprint     ON businesses(fingerprint);
CREATE INDEX IF NOT EXISTS idx_businesses_normalized_phone ON businesses(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_businesses_dedup_status    ON businesses(deduplication_status);
CREATE INDEX IF NOT EXISTS idx_businesses_export_status   ON businesses(export_status);
CREATE INDEX IF NOT EXISTS idx_businesses_external_ids    ON businesses USING GIN(external_ids);
CREATE INDEX IF NOT EXISTS idx_businesses_categories      ON businesses USING GIN(categories);

-- ---------------------------------------------------------------------------
-- stage_checkpoints
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage_checkpoints (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      UUID        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  stage       TEXT        NOT NULL,
  entity_id   TEXT        NOT NULL,
  status      TEXT        NOT NULL
              CHECK (status IN ('started','complete','failed','skipped')),
  error       TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_checkpoints UNIQUE (run_id, stage, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_run_stage ON stage_checkpoints(run_id, stage);
CREATE INDEX IF NOT EXISTS idx_checkpoints_status    ON stage_checkpoints(status);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['runs','queries','businesses','stage_checkpoints'] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON %I;
       CREATE TRIGGER set_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();',
      t, t
    );
  END LOOP;
END;
$$;
