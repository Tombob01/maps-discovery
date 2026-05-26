-- =============================================================================
-- maps-discovery PostgreSQL init script
-- Runs once on first container creation (alphabetically ordered).
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enable fuzzy string matching (future: deduplication similarity)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enable unaccented text search (future: normalisation of business names)
CREATE EXTENSION IF NOT EXISTS "unaccent";
