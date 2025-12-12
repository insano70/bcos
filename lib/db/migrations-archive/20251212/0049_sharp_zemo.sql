CREATE TABLE IF NOT EXISTS "explorer_column_metadata" (
	"column_metadata_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"column_name" text NOT NULL,
	"display_name" text,
	"description" text,
	"data_type" text NOT NULL,
	"semantic_type" text,
	"is_nullable" boolean DEFAULT true,
	"is_primary_key" boolean DEFAULT false,
	"is_foreign_key" boolean DEFAULT false,
	"foreign_key_table" text,
	"foreign_key_column" text,
	"is_org_filter" boolean DEFAULT false,
	"is_phi" boolean DEFAULT false,
	"common_values" jsonb,
	"value_format" text,
	"example_values" text[],
	"min_value" text,
	"max_value" text,
	"distinct_count" integer,
	"null_percentage" numeric(5, 2),
	"statistics_last_analyzed" timestamp with time zone,
	"statistics_analysis_status" text,
	"statistics_analysis_error" text,
	"statistics_analysis_duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explorer_query_history" (
	"query_history_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"natural_language_query" text NOT NULL,
	"generated_sql" text NOT NULL,
	"executed_sql" text,
	"final_sql" text,
	"status" text NOT NULL,
	"execution_time_ms" integer,
	"row_count" integer,
	"error_message" text,
	"error_details" jsonb,
	"user_id" text NOT NULL,
	"user_email" text,
	"organization_id" text,
	"model_used" text DEFAULT 'claude-3-5-sonnet',
	"model_temperature" numeric(2, 1),
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"total_cost_cents" integer,
	"user_rating" integer,
	"user_feedback" text,
	"was_helpful" boolean,
	"tables_used" text[],
	"execution_plan" jsonb,
	"result_sample" jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explorer_query_patterns" (
	"query_pattern_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pattern_type" text,
	"natural_language_pattern" text,
	"sql_pattern" text,
	"tables_involved" text[],
	"usage_count" integer DEFAULT 1,
	"success_rate" numeric(5, 2),
	"last_seen" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explorer_saved_queries" (
	"saved_query_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_history_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"natural_language_template" text,
	"sql_template" text,
	"template_variables" jsonb,
	"tags" text[],
	"is_public" boolean DEFAULT false,
	"usage_count" integer DEFAULT 0,
	"last_used" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explorer_schema_instructions" (
	"instruction_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_name" text DEFAULT 'ih' NOT NULL,
	"category" text,
	"title" text NOT NULL,
	"instruction" text NOT NULL,
	"priority" integer DEFAULT 2,
	"applies_to_tables" text[],
	"example_query" text,
	"example_sql" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explorer_table_metadata" (
	"table_metadata_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schema_name" text DEFAULT 'ih' NOT NULL,
	"table_name" text NOT NULL,
	"display_name" text,
	"description" text,
	"row_meaning" text,
	"primary_entity" text,
	"common_filters" text[],
	"common_joins" text[],
	"tier" integer DEFAULT 3,
	"sample_questions" text[],
	"tags" text[],
	"is_active" boolean DEFAULT true,
	"is_auto_discovered" boolean DEFAULT false,
	"confidence_score" numeric(3, 2),
	"row_count_estimate" bigint,
	"last_analyzed" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by" text,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "explorer_table_relationships" (
	"table_relationship_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_table_id" uuid,
	"to_table_id" uuid,
	"relationship_type" text,
	"join_condition" text NOT NULL,
	"is_common" boolean DEFAULT false,
	"confidence_score" numeric(3, 2),
	"discovered_from" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND constraint_name = 'explorer_column_metadata_table_id_explorer_table_metadata_table'
    AND table_name = 'explorer_column_metadata'
  ) THEN
    ALTER TABLE "explorer_column_metadata" ADD CONSTRAINT "explorer_column_metadata_table_id_explorer_table_metadata_table_metadata_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."explorer_table_metadata"("table_metadata_id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND constraint_name = 'explorer_saved_queries_query_history_id_explorer_query_history_'
    AND table_name = 'explorer_saved_queries'
  ) THEN
    ALTER TABLE "explorer_saved_queries" ADD CONSTRAINT "explorer_saved_queries_query_history_id_explorer_query_history_query_history_id_fk" FOREIGN KEY ("query_history_id") REFERENCES "public"."explorer_query_history"("query_history_id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND constraint_name = 'explorer_table_relationships_from_table_id_explorer_table_metad'
    AND table_name = 'explorer_table_relationships'
  ) THEN
    ALTER TABLE "explorer_table_relationships" ADD CONSTRAINT "explorer_table_relationships_from_table_id_explorer_table_metadata_table_metadata_id_fk" FOREIGN KEY ("from_table_id") REFERENCES "public"."explorer_table_metadata"("table_metadata_id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND constraint_name = 'explorer_table_relationships_to_table_id_explorer_table_metadat'
    AND table_name = 'explorer_table_relationships'
  ) THEN
    ALTER TABLE "explorer_table_relationships" ADD CONSTRAINT "explorer_table_relationships_to_table_id_explorer_table_metadata_table_metadata_id_fk" FOREIGN KEY ("to_table_id") REFERENCES "public"."explorer_table_metadata"("table_metadata_id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_explorer_column_metadata_table') THEN
    CREATE INDEX "idx_explorer_column_metadata_table" ON "explorer_column_metadata" USING btree ("table_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_explorer_column_semantic') THEN
    CREATE INDEX "idx_explorer_column_semantic" ON "explorer_column_metadata" USING btree ("semantic_type");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_explorer_query_history_user') THEN
    CREATE INDEX "idx_explorer_query_history_user" ON "explorer_query_history" USING btree ("user_id","created_at");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_explorer_query_history_status') THEN
    CREATE INDEX "idx_explorer_query_history_status" ON "explorer_query_history" USING btree ("status");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_explorer_query_history_tables') THEN
    CREATE INDEX "idx_explorer_query_history_tables" ON "explorer_query_history" USING gin ("tables_used");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_explorer_query_history_org') THEN
    CREATE INDEX "idx_explorer_query_history_org" ON "explorer_query_history" USING btree ("organization_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_explorer_patterns_type') THEN
    CREATE INDEX "idx_explorer_patterns_type" ON "explorer_query_patterns" USING btree ("pattern_type");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_explorer_saved_queries_category') THEN
    CREATE INDEX "idx_explorer_saved_queries_category" ON "explorer_saved_queries" USING btree ("category","is_public");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_explorer_saved_queries_created_by') THEN
    CREATE INDEX "idx_explorer_saved_queries_created_by" ON "explorer_saved_queries" USING btree ("created_by");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_schema_instructions_schema') THEN
    CREATE INDEX "idx_schema_instructions_schema" ON "explorer_schema_instructions" USING btree ("schema_name","is_active");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_schema_instructions_priority') THEN
    CREATE INDEX "idx_schema_instructions_priority" ON "explorer_schema_instructions" USING btree ("priority","is_active");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_explorer_table_metadata_schema_table') THEN
    CREATE INDEX "idx_explorer_table_metadata_schema_table" ON "explorer_table_metadata" USING btree ("schema_name","table_name");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_explorer_table_metadata_tier') THEN
    CREATE INDEX "idx_explorer_table_metadata_tier" ON "explorer_table_metadata" USING btree ("tier","is_active");
  END IF;
END $$;