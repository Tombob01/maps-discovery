-- migrations/005_businesses_services.sql
--
-- Adds the services column to the businesses table.
--
-- services: optional array of service strings scraped from the provider
-- listing page (e.g. "Drain cleaning", "Leak detection").
-- Nullable: NULL means the provider did not surface a services section
-- for this listing, or the row predates services support.
-- Consistent with hours_raw TEXT[] which uses the same nullable pattern.

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS services TEXT[];