-- Migration: Work Item Type Relationships
-- Description: Add work_item_type_relationships table for Phase 6
-- Date: 2025-10-08
-- Phase: 6 - Type Relationships & Auto-Creation
-- Note: Uses DO blocks for idempotency to handle partially applied migrations

-- Work Item Type Relationships table for parent-child type configurations
CREATE TABLE IF NOT EXISTS "work_item_type_relationships" (
	"work_item_type_relationship_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_type_id" uuid NOT NULL,
	"child_type_id" uuid NOT NULL,
	"relationship_name" text NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"min_count" integer,
	"max_count" integer,
	"auto_create" boolean DEFAULT false NOT NULL,
	"auto_create_config" jsonb,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint

-- Add foreign key constraints (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'work_item_type_relationships_parent_type_id_fk') THEN
        ALTER TABLE "work_item_type_relationships" ADD CONSTRAINT "work_item_type_relationships_parent_type_id_fk" FOREIGN KEY ("parent_type_id") REFERENCES "public"."work_item_types"("work_item_type_id") ON DELETE cascade ON UPDATE no action;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'work_item_type_relationships_child_type_id_fk') THEN
        ALTER TABLE "work_item_type_relationships" ADD CONSTRAINT "work_item_type_relationships_child_type_id_fk" FOREIGN KEY ("child_type_id") REFERENCES "public"."work_item_types"("work_item_type_id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint

-- Create indexes for work_item_type_relationships (idempotent)
CREATE INDEX IF NOT EXISTS "idx_type_relationships_parent" ON "work_item_type_relationships" USING btree ("parent_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_type_relationships_child" ON "work_item_type_relationships" USING btree ("child_type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_type_relationships_deleted_at" ON "work_item_type_relationships" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_unique_type_relationship" ON "work_item_type_relationships" USING btree ("parent_type_id","child_type_id","deleted_at");
