-- Migration: Add data_source_id column to chart_definitions table
-- Purpose: Direct foreign key to chart_data_sources instead of looking up by table_name
-- This improves performance and data integrity

-- Add data_source_id column with foreign key constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chart_definitions' AND column_name = 'data_source_id'
  ) THEN
    ALTER TABLE chart_definitions
    ADD COLUMN data_source_id INTEGER
    REFERENCES chart_data_sources(data_source_id) ON DELETE SET NULL;
  END IF;
END $$;

-- Create index for efficient lookups (idempotent)
CREATE INDEX IF NOT EXISTS idx_chart_definitions_data_source
ON chart_definitions(data_source_id);

-- Backfill existing records: extract dataSourceId from chart_config JSON
-- This assumes the JSON structure: chart_config->>'dataSourceId'
UPDATE chart_definitions
SET data_source_id = (chart_config->>'dataSourceId')::integer
WHERE chart_config->>'dataSourceId' IS NOT NULL
  AND chart_config->>'dataSourceId' ~ '^[0-9]+$'
  AND data_source_id IS NULL;  -- Only update if not already set

-- Add comment for documentation
COMMENT ON COLUMN chart_definitions.data_source_id IS
  'Foreign key to chart_data_sources. Denormalized from chart_config JSON for performance and referential integrity.';
