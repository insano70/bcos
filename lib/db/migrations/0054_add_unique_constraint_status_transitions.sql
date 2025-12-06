-- Migration: Add unique constraint to work_item_status_transitions
-- Ensures only one transition rule per (work_item_type_id, from_status_id, to_status_id) combination
-- This prevents duplicate transition rules which could cause inconsistent workflow behavior

-- Drop the existing index if it exists (it was incorrectly defined as an index instead of a constraint)
DROP INDEX IF EXISTS "idx_unique_transition";

-- Add the proper unique constraint
ALTER TABLE "work_item_status_transitions"
ADD CONSTRAINT "uq_transition_type_from_to"
UNIQUE ("work_item_type_id", "from_status_id", "to_status_id");





