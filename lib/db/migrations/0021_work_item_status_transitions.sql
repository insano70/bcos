-- Phase 4: Multiple Work Item Types
-- Create work_item_status_transitions table for configurable status workflows

CREATE TABLE IF NOT EXISTS "work_item_status_transitions" (
  "work_item_status_transition_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "work_item_type_id" uuid NOT NULL,
  "from_status_id" uuid NOT NULL,
  "to_status_id" uuid NOT NULL,
  "is_allowed" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Foreign Keys
ALTER TABLE "work_item_status_transitions" ADD CONSTRAINT "work_item_status_transitions_work_item_type_id_work_item_types_work_item_type_id_fk" FOREIGN KEY ("work_item_type_id") REFERENCES "work_item_types"("work_item_type_id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "work_item_status_transitions" ADD CONSTRAINT "work_item_status_transitions_from_status_id_work_item_statuses_work_item_status_id_fk" FOREIGN KEY ("from_status_id") REFERENCES "work_item_statuses"("work_item_status_id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "work_item_status_transitions" ADD CONSTRAINT "work_item_status_transitions_to_status_id_work_item_statuses_work_item_status_id_fk" FOREIGN KEY ("to_status_id") REFERENCES "work_item_statuses"("work_item_status_id") ON DELETE cascade ON UPDATE no action;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "idx_transitions_type" ON "work_item_status_transitions" ("work_item_type_id");
CREATE INDEX IF NOT EXISTS "idx_transitions_from" ON "work_item_status_transitions" ("from_status_id");
CREATE INDEX IF NOT EXISTS "idx_transitions_to" ON "work_item_status_transitions" ("to_status_id");

-- Unique constraint: one transition rule per type + from_status + to_status combination
CREATE INDEX IF NOT EXISTS "idx_unique_transition" ON "work_item_status_transitions" ("work_item_type_id","from_status_id","to_status_id");
