-- Add Data Explorer feedback tables (idempotent)

CREATE TABLE IF NOT EXISTS "explorer_query_feedback" (
	"feedback_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query_history_id" uuid NOT NULL,
	"feedback_type" text NOT NULL,
	"feedback_category" text NOT NULL,
	"severity" text NOT NULL,
	"original_sql" text NOT NULL,
	"corrected_sql" text,
	"user_explanation" text,
	"detected_issue" text,
	"affected_tables" text[],
	"affected_columns" text[],
	"resolution_status" text DEFAULT 'pending',
	"resolution_action" jsonb,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"similar_query_count" integer DEFAULT 0,
	"recurrence_score" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now(),
	"created_by" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "explorer_improvement_suggestions" (
	"suggestion_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feedback_id" uuid,
	"suggestion_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"suggested_change" jsonb NOT NULL,
	"confidence_score" numeric(3, 2),
	"status" text DEFAULT 'pending',
	"applied_at" timestamp with time zone,
	"applied_by" text,
	"created_at" timestamp with time zone DEFAULT now()
);

-- Add foreign keys (idempotent)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'explorer_query_feedback_query_history_id_explorer_query_history_query_history_id_fk'
  ) THEN
    ALTER TABLE "explorer_query_feedback" 
    ADD CONSTRAINT "explorer_query_feedback_query_history_id_explorer_query_history_query_history_id_fk" 
    FOREIGN KEY ("query_history_id") 
    REFERENCES "public"."explorer_query_history"("query_history_id") 
    ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'explorer_improvement_suggestions_feedback_id_explorer_query_feedback_feedback_id_fk'
  ) THEN
    ALTER TABLE "explorer_improvement_suggestions" 
    ADD CONSTRAINT "explorer_improvement_suggestions_feedback_id_explorer_query_feedback_feedback_id_fk" 
    FOREIGN KEY ("feedback_id") 
    REFERENCES "public"."explorer_query_feedback"("feedback_id") 
    ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;

-- Add indexes (idempotent)
CREATE INDEX IF NOT EXISTS "idx_feedback_query_history" ON "explorer_query_feedback" USING btree ("query_history_id");
CREATE INDEX IF NOT EXISTS "idx_feedback_status" ON "explorer_query_feedback" USING btree ("resolution_status");
CREATE INDEX IF NOT EXISTS "idx_feedback_type" ON "explorer_query_feedback" USING btree ("feedback_type","feedback_category");
CREATE INDEX IF NOT EXISTS "idx_feedback_severity" ON "explorer_query_feedback" USING btree ("severity");
CREATE INDEX IF NOT EXISTS "idx_suggestions_feedback" ON "explorer_improvement_suggestions" USING btree ("feedback_id");
CREATE INDEX IF NOT EXISTS "idx_suggestions_status" ON "explorer_improvement_suggestions" USING btree ("status");
CREATE INDEX IF NOT EXISTS "idx_suggestions_type" ON "explorer_improvement_suggestions" USING btree ("suggestion_type");