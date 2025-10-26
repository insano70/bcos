-- Add hero_overlay_opacity to practice_attributes if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'practice_attributes' AND column_name = 'hero_overlay_opacity'
  ) THEN
    ALTER TABLE "practice_attributes" ADD COLUMN "hero_overlay_opacity" real DEFAULT 0.1;
  END IF;
END $$;
--> statement-breakpoint

-- Add is_required_on_creation to work_item_fields if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_item_fields' AND column_name = 'is_required_on_creation'
  ) THEN
    ALTER TABLE "work_item_fields" ADD COLUMN "is_required_on_creation" boolean DEFAULT false NOT NULL;
  END IF;
END $$;
--> statement-breakpoint

-- Add is_required_to_complete to work_item_fields if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_item_fields' AND column_name = 'is_required_to_complete'
  ) THEN
    ALTER TABLE "work_item_fields" ADD COLUMN "is_required_to_complete" boolean DEFAULT false NOT NULL;
  END IF;
END $$;
--> statement-breakpoint

-- Drop is_required from work_item_fields if exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'work_item_fields' AND column_name = 'is_required'
  ) THEN
    ALTER TABLE "work_item_fields" DROP COLUMN "is_required";
  END IF;
END $$;