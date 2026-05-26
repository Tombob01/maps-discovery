-- =============================================================================
-- 001_init.sql
-- Initial schema for maps-discovery.
--
-- Tables
--   runs                  Pipeline run metadata + config + stats
--   business_records      Normalised business entities
--
-- Conventions
--   • All IDs are TEXT (branded UUID strings from TypeScript).
--   • Timestamps are TIMESTAMPTZ — always UTC.
--   • JSONB used for nested objects (config, stats, address, hours, externalIds).
--   • Enum-like columns use TEXT + CHECK constraints so TypeScript union types
--     map cleanly without requiring Postgres enum DDL changes on each update.
--   • ON DELETE RESTRICT is intentional — orphan prevention at the DB layer.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- runs
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS runs (
  id            TEXT        NOT NULL PRIMARY KEY,
  status        TEXT        NOT NULL
                  CHECK (status IN ('pending','running','paused','complete','failed','cancelled')),
  config        JSONB       NOT NULL,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  stats         JSONB       NOT NULL DEFAULT '{
    "queriesGenerated":  0,
    "queriesDispatched": 0,
    "rawResultsFound":   0,
    "recordsNormalized": 0,
    "recordsUnique":     0,
    "recordsDuplicate":  0,
    "recordsExported":   0,
    "errors":            0
  }'::jsonb
);

-- ---------------------------------------------------------------------------
-- business_records
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS business_records (
  id                      TEXT        NOT NULL PRIMARY KEY,
  fingerprint             TEXT        NOT NULL,
  external_ids            JSONB       NOT NULL DEFAULT '{}',

  -- Core identity
  name                    TEXT        NOT NULL,
  normalized_name         TEXT        NOT NULL,

  -- Location
  address                 JSONB       NOT NULL,
  geo_lat                 DOUBLE PRECISION,
  geo_lng                 DOUBLE PRECISION,

  -- Contact
  phone                   TEXT,
  normalized_phone        TEXT,
  website                 TEXT,

  -- Classification
  categories              TEXT[]      NOT NULL DEFAULT '{}',
  primary_category        TEXT,

  -- Ratings
  rating                  DOUBLE PRECISION,
  review_count            INTEGER,

  -- Operating info
  hours                   JSONB,
  price_level             SMALLINT    CHECK (price_level IN (1, 2, 3, 4)),

  -- Provenance
  source_provider         TEXT        NOT NULL,
  source_url              TEXT,
  collected_at            TIMESTAMPTZ NOT NULL,
  run_id                  TEXT        NOT NULL REFERENCES runs (id) ON DELETE RESTRICT,
  query_id                TEXT        NOT NULL,

  -- Processing state
  normalization_status    TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (normalization_status IN ('pending','complete','failed','skipped')),
  deduplication_status    TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (deduplication_status IN ('pending','unique','duplicate','uncertain')),
  export_status           TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (export_status IN ('pending','exported','excluded'))
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Fast lookups by run (used by getByRunId / countByRunId)
CREATE INDEX IF NOT EXISTS idx_business_records_run_id
  ON business_records (run_id);

-- Deduplication lookups by fingerprint
CREATE INDEX IF NOT EXISTS idx_business_records_fingerprint
  ON business_records (fingerprint);

-- Pipeline stage fan-out queries
CREATE INDEX IF NOT EXISTS idx_business_records_normalization_status
  ON business_records (normalization_status);

CREATE INDEX IF NOT EXISTS idx_business_records_deduplication_status
  ON business_records (deduplication_status);

CREATE INDEX IF NOT EXISTS idx_business_records_export_status
  ON business_records (export_status);
