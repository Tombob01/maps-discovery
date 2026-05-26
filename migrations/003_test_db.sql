-- =============================================================================
-- 003_test_db.sql
-- Creates a separate test database so CI tests never touch development data.
--
-- The test database uses the same schema as the development database.
-- It is reset before each test run (or between test suites that need a
-- clean slate) using standard PostgreSQL DROP/CREATE operations.
--
-- Loaded automatically by docker-entrypoint-initdb.d on first container start.
-- This file runs as the postgres superuser.
-- =============================================================================

-- Create the test database if it doesn't already exist.
-- We use a DO block because CREATE DATABASE cannot run inside a transaction.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'maps_discovery_test'
  ) THEN
    PERFORM dblink_exec(
      'dbname=postgres',
      'CREATE DATABASE maps_discovery_test
         OWNER     maps_user
         ENCODING  UTF8
         LC_COLLATE ''en_US.UTF-8''
         LC_CTYPE   ''en_US.UTF-8''
         TEMPLATE  template0'
    );
  END IF;
EXCEPTION
  -- dblink may not be installed; fall back to a direct statement approach.
  -- This will fail silently if the database already exists.
  WHEN undefined_function THEN
    NULL;
END;
$$;

-- Simpler approach that works without dblink.
-- Run via psql -c directly in the docker entrypoint.
-- The CREATE DATABASE below is in a separate transaction context.
\c postgres
SELECT 'CREATE DATABASE maps_discovery_test
  OWNER     maps_user
  ENCODING  UTF8
  TEMPLATE  template0'
WHERE NOT EXISTS (
  SELECT FROM pg_database WHERE datname = 'maps_discovery_test'
)\gexec

-- Apply the same extensions to the test database.
\c maps_discovery_test

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Grant all privileges to the application user.
GRANT ALL PRIVILEGES ON DATABASE maps_discovery_test TO maps_user;
GRANT ALL ON SCHEMA public TO maps_user;
