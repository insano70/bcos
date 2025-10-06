-- Add icon display columns to chart_data_source_columns table
-- These columns support icon display functionality for data source columns

ALTER TABLE "chart_data_source_columns" 
  ADD COLUMN IF NOT EXISTS "display_icon" boolean DEFAULT false;

ALTER TABLE "chart_data_source_columns" 
  ADD COLUMN IF NOT EXISTS "icon_type" varchar(20);

ALTER TABLE "chart_data_source_columns" 
  ADD COLUMN IF NOT EXISTS "icon_color_mode" varchar(20) DEFAULT 'auto';

ALTER TABLE "chart_data_source_columns" 
  ADD COLUMN IF NOT EXISTS "icon_color" varchar(50);

ALTER TABLE "chart_data_source_columns" 
  ADD COLUMN IF NOT EXISTS "icon_mapping" jsonb;
