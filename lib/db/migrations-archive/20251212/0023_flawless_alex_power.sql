-- Add data_source_type column (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chart_data_sources'
      AND column_name = 'data_source_type'
  ) THEN
    ALTER TABLE "chart_data_sources" ADD COLUMN "data_source_type" varchar(20) DEFAULT 'measure-based' NOT NULL;
  END IF;
END $$;--> statement-breakpoint

-- Add CHECK constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chart_data_sources_data_source_type_check'
  ) THEN
    ALTER TABLE "chart_data_sources"
    ADD CONSTRAINT "chart_data_sources_data_source_type_check"
    CHECK ("data_source_type" IN ('measure-based', 'table-based'));
  END IF;
END $$;--> statement-breakpoint

-- Create index (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'chart_data_sources'
      AND indexname = 'idx_chart_data_sources_type'
  ) THEN
    CREATE INDEX "idx_chart_data_sources_type" ON "chart_data_sources" USING btree ("data_source_type","is_active");
  END IF;
END $$;--> statement-breakpoint

-- Backfill data_source_type based on column configuration
DO $$
BEGIN
  -- Set to 'table-based' for sources without measure columns
  UPDATE "chart_data_sources" ds
  SET "data_source_type" = 'table-based'
  WHERE "data_source_type" = 'measure-based'
    AND NOT EXISTS (
      SELECT 1 FROM "chart_data_source_columns" cols
      WHERE cols.data_source_id = ds.data_source_id
        AND cols.is_measure = true
    );
END $$;