-- Add statistics tracking fields to explorer_column_metadata (idempotent)

-- Add statistics_last_analyzed column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'explorer_column_metadata' 
    AND column_name = 'statistics_last_analyzed'
  ) THEN
    ALTER TABLE explorer_column_metadata 
    ADD COLUMN statistics_last_analyzed timestamp with time zone;
  END IF;
END $$;

-- Add statistics_analysis_status column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'explorer_column_metadata' 
    AND column_name = 'statistics_analysis_status'
  ) THEN
    ALTER TABLE explorer_column_metadata 
    ADD COLUMN statistics_analysis_status text;
  END IF;
END $$;

-- Add statistics_analysis_error column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'explorer_column_metadata' 
    AND column_name = 'statistics_analysis_error'
  ) THEN
    ALTER TABLE explorer_column_metadata 
    ADD COLUMN statistics_analysis_error text;
  END IF;
END $$;

-- Add statistics_analysis_duration_ms column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'explorer_column_metadata' 
    AND column_name = 'statistics_analysis_duration_ms'
  ) THEN
    ALTER TABLE explorer_column_metadata 
    ADD COLUMN statistics_analysis_duration_ms integer;
  END IF;
END $$;

