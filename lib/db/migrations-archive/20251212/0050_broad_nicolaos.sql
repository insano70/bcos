DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'work_item_attachments' AND column_name = 'work_item_field_id'
  ) THEN
    ALTER TABLE "work_item_attachments" ADD COLUMN "work_item_field_id" uuid;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND constraint_name = 'work_item_attachments_work_item_field_id_work_item_fields_'
    AND table_name = 'work_item_attachments'
  ) THEN
    ALTER TABLE "work_item_attachments" ADD CONSTRAINT "work_item_attachments_work_item_field_id_work_item_fields_work_item_field_id_fk" FOREIGN KEY ("work_item_field_id") REFERENCES "public"."work_item_fields"("work_item_field_id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_attachments_field') THEN
    CREATE INDEX "idx_attachments_field" ON "work_item_attachments" USING btree ("work_item_field_id");
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_attachments_work_item_field') THEN
    CREATE INDEX "idx_attachments_work_item_field" ON "work_item_attachments" USING btree ("work_item_id","work_item_field_id");
  END IF;
END $$;