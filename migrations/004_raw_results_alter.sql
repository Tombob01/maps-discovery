-- migrations/004_raw_results_alter.sql
--
-- Alters the existing raw_results table to match current runtime behaviour:
--
--   1. query_id: remove NOT NULL constraint.
--      The current pipeline does not persist rows to the queries table
--      (KI-2). Enforcing a FK to a non-existent row blocks every insert.
--      Matches the same accommodation already applied to businesses.query_id.
--
--   2. resume_token: add nullable JSONB column.
--      ProviderResult.resumeToken is pipeline metadata required for crash
--      recovery. Not part of rawPayload (provider data). Nullable so
--      existing rows and future inserts that omit it are both safe.

ALTER TABLE raw_results
  ALTER COLUMN query_id DROP NOT NULL;

ALTER TABLE raw_results
  ADD COLUMN IF NOT EXISTS resume_token JSONB;
