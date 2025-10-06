-- Add is_default column to dashboards table
-- Only one dashboard can be marked as default at a time
-- This will be used as the fallback home screen for users

ALTER TABLE "dashboards"
  ADD COLUMN IF NOT EXISTS "is_default" boolean DEFAULT false;

-- Create a unique partial index to ensure only one dashboard can be default
-- This enforces the business rule at the database level
CREATE UNIQUE INDEX IF NOT EXISTS "idx_dashboards_default_unique"
  ON "dashboards" ("is_default")
  WHERE "is_default" = true AND "is_active" = true AND "is_published" = true;

-- Add index for efficient querying of default dashboard
CREATE INDEX IF NOT EXISTS "idx_dashboards_default"
  ON "dashboards" ("is_default")
  WHERE "is_default" = true;
