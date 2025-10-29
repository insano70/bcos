-- Migration: Fix Data Explorer Column Names
-- Remove redundant exp_ prefix from all columns
-- Strategy: Drop and recreate tables (early stage - acceptable data loss)

-- Drop all explorer tables (cascade removes foreign keys)
DROP TABLE IF EXISTS explorer_column_metadata CASCADE;
DROP TABLE IF EXISTS explorer_query_patterns CASCADE;
DROP TABLE IF EXISTS explorer_saved_queries CASCADE;
DROP TABLE IF EXISTS explorer_table_relationships CASCADE;
DROP TABLE IF EXISTS explorer_query_history CASCADE;
DROP TABLE IF EXISTS explorer_table_metadata CASCADE;

-- Recreate with correct column names (no exp_ prefix)

CREATE TABLE IF NOT EXISTS explorer_table_metadata (
  table_metadata_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_name text NOT NULL DEFAULT 'ih',
  table_name text NOT NULL,
  display_name text,
  description text,
  row_meaning text,
  primary_entity text,
  common_filters text[],
  common_joins text[],
  tier integer DEFAULT 3,
  sample_questions text[],
  tags text[],
  is_active boolean DEFAULT true,
  is_auto_discovered boolean DEFAULT false,
  confidence_score numeric(3, 2),
  row_count_estimate bigint,
  last_analyzed timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by text,
  updated_by text
);

CREATE TABLE IF NOT EXISTS explorer_column_metadata (
  column_metadata_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES explorer_table_metadata(table_metadata_id) ON DELETE CASCADE,
  column_name text NOT NULL,
  display_name text,
  description text,
  data_type text NOT NULL,
  semantic_type text,
  is_nullable boolean DEFAULT true,
  is_primary_key boolean DEFAULT false,
  is_foreign_key boolean DEFAULT false,
  foreign_key_table text,
  foreign_key_column text,
  is_org_filter boolean DEFAULT false,
  is_phi boolean DEFAULT false,
  common_values jsonb,
  value_format text,
  example_values text[],
  min_value text,
  max_value text,
  distinct_count integer,
  null_percentage numeric(5, 2),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS explorer_query_history (
  query_history_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  natural_language_query text NOT NULL,
  generated_sql text NOT NULL,
  executed_sql text,
  final_sql text,
  status text NOT NULL,
  execution_time_ms integer,
  row_count integer,
  error_message text,
  error_details jsonb,
  user_id text NOT NULL,
  user_email text,
  organization_id text,
  model_used text DEFAULT 'claude-3-5-sonnet',
  model_temperature numeric(2, 1),
  prompt_tokens integer,
  completion_tokens integer,
  total_cost_cents integer,
  user_rating integer,
  user_feedback text,
  was_helpful boolean,
  tables_used text[],
  execution_plan jsonb,
  result_sample jsonb,
  created_at timestamp with time zone DEFAULT now(),
  metadata jsonb
);

CREATE TABLE IF NOT EXISTS explorer_saved_queries (
  saved_query_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_history_id uuid REFERENCES explorer_query_history(query_history_id),
  name text NOT NULL,
  description text,
  category text,
  natural_language_template text,
  sql_template text,
  template_variables jsonb,
  tags text[],
  is_public boolean DEFAULT false,
  usage_count integer DEFAULT 0,
  last_used timestamp with time zone,
  created_by text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS explorer_table_relationships (
  table_relationship_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_table_id uuid REFERENCES explorer_table_metadata(table_metadata_id),
  to_table_id uuid REFERENCES explorer_table_metadata(table_metadata_id),
  relationship_type text,
  join_condition text NOT NULL,
  is_common boolean DEFAULT false,
  confidence_score numeric(3, 2),
  discovered_from text,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS explorer_query_patterns (
  query_pattern_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_type text,
  natural_language_pattern text,
  sql_pattern text,
  tables_involved text[],
  usage_count integer DEFAULT 1,
  success_rate numeric(5, 2),
  last_seen timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now()
);

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_explorer_table_metadata_schema_table ON explorer_table_metadata(schema_name, table_name);
CREATE INDEX IF NOT EXISTS idx_explorer_table_metadata_tier ON explorer_table_metadata(tier, is_active);
CREATE INDEX IF NOT EXISTS idx_explorer_column_metadata_table ON explorer_column_metadata(table_id);
CREATE INDEX IF NOT EXISTS idx_explorer_column_semantic ON explorer_column_metadata(semantic_type);
CREATE INDEX IF NOT EXISTS idx_explorer_query_history_user ON explorer_query_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_explorer_query_history_status ON explorer_query_history(status);
CREATE INDEX IF NOT EXISTS idx_explorer_query_history_tables ON explorer_query_history USING gin(tables_used);
CREATE INDEX IF NOT EXISTS idx_explorer_query_history_org ON explorer_query_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_explorer_patterns_type ON explorer_query_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_explorer_saved_queries_category ON explorer_saved_queries(category, is_public);
CREATE INDEX IF NOT EXISTS idx_explorer_saved_queries_created_by ON explorer_saved_queries(created_by);

