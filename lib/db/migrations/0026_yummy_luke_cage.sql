CREATE TABLE IF NOT EXISTS "explorer_column_metadata" (
	"column_metadata_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_table_id" uuid NOT NULL,
	"exp_column_name" text NOT NULL,
	"exp_display_name" text,
	"exp_description" text,
	"exp_data_type" text NOT NULL,
	"exp_semantic_type" text,
	"exp_is_nullable" boolean DEFAULT true,
	"exp_is_primary_key" boolean DEFAULT false,
	"exp_is_foreign_key" boolean DEFAULT false,
	"exp_foreign_key_table" text,
	"exp_foreign_key_column" text,
	"exp_is_org_filter" boolean DEFAULT false,
	"exp_is_phi" boolean DEFAULT false,
	"exp_common_values" jsonb,
	"exp_value_format" text,
	"exp_example_values" text[],
	"exp_min_value" text,
	"exp_max_value" text,
	"exp_distinct_count" integer,
	"exp_null_percentage" numeric(5, 2),
	"exp_created_at" timestamp with time zone DEFAULT now(),
	"exp_updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explorer_query_history" (
	"query_history_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_natural_language_query" text NOT NULL,
	"exp_generated_sql" text NOT NULL,
	"exp_executed_sql" text,
	"exp_final_sql" text,
	"exp_status" text NOT NULL,
	"exp_execution_time_ms" integer,
	"exp_row_count" integer,
	"exp_error_message" text,
	"exp_error_details" jsonb,
	"exp_user_id" text NOT NULL,
	"exp_user_email" text,
	"exp_organization_id" text,
	"exp_model_used" text DEFAULT 'claude-3-5-sonnet',
	"exp_model_temperature" numeric(2, 1),
	"exp_prompt_tokens" integer,
	"exp_completion_tokens" integer,
	"exp_total_cost_cents" integer,
	"exp_user_rating" integer,
	"exp_user_feedback" text,
	"exp_was_helpful" boolean,
	"exp_tables_used" text[],
	"exp_execution_plan" jsonb,
	"exp_result_sample" jsonb,
	"exp_created_at" timestamp with time zone DEFAULT now(),
	"exp_metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explorer_query_patterns" (
	"query_pattern_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_pattern_type" text,
	"exp_natural_language_pattern" text,
	"exp_sql_pattern" text,
	"exp_tables_involved" text[],
	"exp_usage_count" integer DEFAULT 1,
	"exp_success_rate" numeric(5, 2),
	"exp_last_seen" timestamp with time zone DEFAULT now(),
	"exp_created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explorer_saved_queries" (
	"saved_query_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_query_history_id" uuid,
	"exp_name" text NOT NULL,
	"exp_description" text,
	"exp_category" text,
	"exp_natural_language_template" text,
	"exp_sql_template" text,
	"exp_template_variables" jsonb,
	"exp_tags" text[],
	"exp_is_public" boolean DEFAULT false,
	"exp_usage_count" integer DEFAULT 0,
	"exp_last_used" timestamp with time zone,
	"exp_created_by" text,
	"exp_created_at" timestamp with time zone DEFAULT now(),
	"exp_updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explorer_table_metadata" (
	"table_metadata_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_schema_name" text DEFAULT 'ih' NOT NULL,
	"exp_table_name" text NOT NULL,
	"exp_display_name" text,
	"exp_description" text,
	"exp_row_meaning" text,
	"exp_primary_entity" text,
	"exp_common_filters" text[],
	"exp_common_joins" text[],
	"exp_tier" integer DEFAULT 3,
	"exp_sample_questions" text[],
	"exp_tags" text[],
	"exp_is_active" boolean DEFAULT true,
	"exp_is_auto_discovered" boolean DEFAULT false,
	"exp_confidence_score" numeric(3, 2),
	"exp_row_count_estimate" bigint,
	"exp_last_analyzed" timestamp with time zone,
	"exp_created_at" timestamp with time zone DEFAULT now(),
	"exp_updated_at" timestamp with time zone DEFAULT now(),
	"exp_created_by" text,
	"exp_updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explorer_table_relationships" (
	"table_relationship_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exp_from_table_id" uuid,
	"exp_to_table_id" uuid,
	"exp_relationship_type" text,
	"exp_join_condition" text NOT NULL,
	"exp_is_common" boolean DEFAULT false,
	"exp_confidence_score" numeric(3, 2),
	"exp_discovered_from" text,
	"exp_created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
-- Add foreign key constraints (idempotent - PostgreSQL does not support IF NOT EXISTS for FK)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'explorer_column_metadata_exp_table_id_explorer_table_metadata_t') THEN
    ALTER TABLE "explorer_column_metadata" ADD CONSTRAINT "explorer_column_metadata_exp_table_id_explorer_table_metadata_table_metadata_id_fk" FOREIGN KEY ("exp_table_id") REFERENCES "public"."explorer_table_metadata"("table_metadata_id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'explorer_saved_queries_exp_query_history_id_explorer_query_hist') THEN
    ALTER TABLE "explorer_saved_queries" ADD CONSTRAINT "explorer_saved_queries_exp_query_history_id_explorer_query_history_query_history_id_fk" FOREIGN KEY ("exp_query_history_id") REFERENCES "public"."explorer_query_history"("query_history_id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'explorer_table_relationships_exp_from_table_id_explorer_table_m') THEN
    ALTER TABLE "explorer_table_relationships" ADD CONSTRAINT "explorer_table_relationships_exp_from_table_id_explorer_table_metadata_table_metadata_id_fk" FOREIGN KEY ("exp_from_table_id") REFERENCES "public"."explorer_table_metadata"("table_metadata_id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'explorer_table_relationships_exp_to_table_id_explorer_table_met') THEN
    ALTER TABLE "explorer_table_relationships" ADD CONSTRAINT "explorer_table_relationships_exp_to_table_id_explorer_table_metadata_table_metadata_id_fk" FOREIGN KEY ("exp_to_table_id") REFERENCES "public"."explorer_table_metadata"("table_metadata_id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_explorer_column_metadata_table" ON "explorer_column_metadata" USING btree ("exp_table_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_explorer_column_semantic" ON "explorer_column_metadata" USING btree ("exp_semantic_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_explorer_query_history_user" ON "explorer_query_history" USING btree ("exp_user_id","exp_created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_explorer_query_history_status" ON "explorer_query_history" USING btree ("exp_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_explorer_query_history_tables" ON "explorer_query_history" USING gin ("exp_tables_used");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_explorer_query_history_org" ON "explorer_query_history" USING btree ("exp_organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_explorer_patterns_type" ON "explorer_query_patterns" USING btree ("exp_pattern_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_explorer_saved_queries_category" ON "explorer_saved_queries" USING btree ("exp_category","exp_is_public");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_explorer_saved_queries_created_by" ON "explorer_saved_queries" USING btree ("exp_created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_explorer_table_metadata_schema_table" ON "explorer_table_metadata" USING btree ("exp_schema_name","exp_table_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_explorer_table_metadata_tier" ON "explorer_table_metadata" USING btree ("exp_tier","exp_is_active");