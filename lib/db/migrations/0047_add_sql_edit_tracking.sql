-- Add SQL editing tracking to explorer_query_history (idempotent)

-- Add was_sql_edited column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'explorer_query_history' 
    AND column_name = 'was_sql_edited'
  ) THEN
    ALTER TABLE explorer_query_history 
    ADD COLUMN was_sql_edited boolean DEFAULT false;
  END IF;
END $$;

-- Add original_generated_sql column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'explorer_query_history' 
    AND column_name = 'original_generated_sql'
  ) THEN
    ALTER TABLE explorer_query_history 
    ADD COLUMN original_generated_sql text;
  END IF;
END $$;

-- Add sql_edit_count column
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'explorer_query_history' 
    AND column_name = 'sql_edit_count'
  ) THEN
    ALTER TABLE explorer_query_history 
    ADD COLUMN sql_edit_count integer DEFAULT 0;
  END IF;
END $$;

-- Add index for tracking edited queries
CREATE INDEX IF NOT EXISTS idx_explorer_query_history_edited 
ON explorer_query_history(was_sql_edited) 
WHERE was_sql_edited = true;

