-- Make migrations idempotent for safe re-running
ALTER TABLE "explorer_query_history" ADD COLUMN IF NOT EXISTS "was_sql_edited" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "explorer_query_history" ADD COLUMN IF NOT EXISTS "original_generated_sql" text;--> statement-breakpoint
ALTER TABLE "explorer_query_history" ADD COLUMN IF NOT EXISTS "sql_edit_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "practice_attributes" ADD COLUMN IF NOT EXISTS "practice_slug" text;--> statement-breakpoint
ALTER TABLE "practice_attributes" ADD COLUMN IF NOT EXISTS "ratings_feed_enabled" boolean DEFAULT false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_practice_attributes_slug" ON "practice_attributes" USING btree ("practice_slug");--> statement-breakpoint

-- Add column comments for documentation
COMMENT ON COLUMN "practice_attributes"."practice_slug" IS 'Clinect-provided slug for practice ratings lookup (e.g., "michelle-wands")';--> statement-breakpoint
COMMENT ON COLUMN "practice_attributes"."ratings_feed_enabled" IS 'Enable/disable Clinect live ratings feed display on practice website';