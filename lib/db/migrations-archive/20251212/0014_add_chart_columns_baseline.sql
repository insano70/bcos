-- Baseline migration for manually-applied chart column changes
-- These columns were added manually before Drizzle tracking existed
-- Using IF NOT EXISTS to make this safe on all environments

ALTER TABLE "chart_data_source_columns" 
  ADD COLUMN IF NOT EXISTS "is_measure_type" boolean DEFAULT false;

ALTER TABLE "chart_data_source_columns" 
  ADD COLUMN IF NOT EXISTS "is_time_period" boolean DEFAULT false;

-- Recreate index to include new columns
DROP INDEX IF EXISTS "idx_chart_data_source_columns_flags";

CREATE INDEX IF NOT EXISTS "idx_chart_data_source_columns_flags" 
  ON "chart_data_source_columns" 
  USING btree ("is_filterable", "is_groupable", "is_measure", "is_measure_type");
