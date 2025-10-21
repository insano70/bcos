CREATE TABLE IF NOT EXISTS "work_item_activity" (
	"work_item_activity_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_id" uuid NOT NULL,
	"activity_type" text NOT NULL,
	"field_name" text,
	"old_value" text,
	"new_value" text,
	"description" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_item_attachments" (
	"work_item_attachment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_type" text NOT NULL,
	"s3_key" text NOT NULL,
	"s3_bucket" text NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_item_comments" (
	"work_item_comment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_id" uuid NOT NULL,
	"parent_comment_id" uuid,
	"comment_text" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_item_field_values" (
	"work_item_field_value_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_id" uuid NOT NULL,
	"work_item_field_id" uuid NOT NULL,
	"field_value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_item_fields" (
	"work_item_field_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_type_id" uuid NOT NULL,
	"field_name" varchar(100) NOT NULL,
	"field_label" varchar(255) NOT NULL,
	"field_type" varchar(50) NOT NULL,
	"field_description" text,
	"field_options" jsonb,
	"field_config" jsonb,
	"is_required" boolean DEFAULT false,
	"validation_rules" jsonb,
	"default_value" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_visible" boolean DEFAULT true,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_item_status_transitions" (
	"work_item_status_transition_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_type_id" uuid NOT NULL,
	"from_status_id" uuid NOT NULL,
	"to_status_id" uuid NOT NULL,
	"is_allowed" boolean DEFAULT true NOT NULL,
	"validation_config" jsonb,
	"action_config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_item_statuses" (
	"work_item_status_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_type_id" uuid NOT NULL,
	"status_name" text NOT NULL,
	"status_category" text NOT NULL,
	"is_initial" boolean DEFAULT false NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"color" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "work_item_types" (
	"work_item_type_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"color" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_item_watchers" (
	"work_item_watcher_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"watch_type" text DEFAULT 'manual' NOT NULL,
	"notify_status_changes" boolean DEFAULT true NOT NULL,
	"notify_comments" boolean DEFAULT true NOT NULL,
	"notify_assignments" boolean DEFAULT true NOT NULL,
	"notify_due_date" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "work_items" (
	"work_item_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_type_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"status_id" uuid NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"assigned_to" uuid,
	"due_date" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"parent_work_item_id" uuid,
	"root_work_item_id" uuid,
	"depth" integer DEFAULT 0 NOT NULL,
	"path" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
-- ALTER TABLE "account_security" ADD COLUMN "mfa_skips_remaining" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
-- ALTER TABLE "account_security" ADD COLUMN "mfa_skip_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- ALTER TABLE "account_security" ADD COLUMN "mfa_first_skipped_at" timestamp with time zone;--> statement-breakpoint
-- ALTER TABLE "account_security" ADD COLUMN "mfa_last_skipped_at" timestamp with time zone;--> statement-breakpoint
-- ALTER TABLE "chart_definitions" ADD COLUMN "data_source_id" integer;--> statement-breakpoint
-- ALTER TABLE "dashboards" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
-- ALTER TABLE "organizations" ADD COLUMN "practice_uids" integer[] DEFAULT '{}';--> statement-breakpoint
-- ALTER TABLE "users" ADD COLUMN "provider_uid" integer;--> statement-breakpoint
-- ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_work_item_id_work_items_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("work_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_attachments" ADD CONSTRAINT "work_item_attachments_work_item_id_work_items_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("work_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_attachments" ADD CONSTRAINT "work_item_attachments_uploaded_by_users_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_work_item_id_work_items_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("work_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_field_values" ADD CONSTRAINT "work_item_field_values_work_item_id_work_items_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("work_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_field_values" ADD CONSTRAINT "work_item_field_values_work_item_field_id_work_item_fields_work_item_field_id_fk" FOREIGN KEY ("work_item_field_id") REFERENCES "public"."work_item_fields"("work_item_field_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_fields" ADD CONSTRAINT "work_item_fields_work_item_type_id_work_item_types_work_item_type_id_fk" FOREIGN KEY ("work_item_type_id") REFERENCES "public"."work_item_types"("work_item_type_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_fields" ADD CONSTRAINT "work_item_fields_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_status_transitions" ADD CONSTRAINT "work_item_status_transitions_work_item_type_id_work_item_types_work_item_type_id_fk" FOREIGN KEY ("work_item_type_id") REFERENCES "public"."work_item_types"("work_item_type_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_status_transitions" ADD CONSTRAINT "work_item_status_transitions_from_status_id_work_item_statuses_work_item_status_id_fk" FOREIGN KEY ("from_status_id") REFERENCES "public"."work_item_statuses"("work_item_status_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_status_transitions" ADD CONSTRAINT "work_item_status_transitions_to_status_id_work_item_statuses_work_item_status_id_fk" FOREIGN KEY ("to_status_id") REFERENCES "public"."work_item_statuses"("work_item_status_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_statuses" ADD CONSTRAINT "work_item_statuses_work_item_type_id_work_item_types_work_item_type_id_fk" FOREIGN KEY ("work_item_type_id") REFERENCES "public"."work_item_types"("work_item_type_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_type_relationships" ADD CONSTRAINT "work_item_type_relationships_parent_type_id_work_item_types_work_item_type_id_fk" FOREIGN KEY ("parent_type_id") REFERENCES "public"."work_item_types"("work_item_type_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_type_relationships" ADD CONSTRAINT "work_item_type_relationships_child_type_id_work_item_types_work_item_type_id_fk" FOREIGN KEY ("child_type_id") REFERENCES "public"."work_item_types"("work_item_type_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_types" ADD CONSTRAINT "work_item_types_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_types" ADD CONSTRAINT "work_item_types_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_watchers" ADD CONSTRAINT "work_item_watchers_work_item_id_work_items_work_item_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("work_item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_item_watchers" ADD CONSTRAINT "work_item_watchers_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_items" ADD CONSTRAINT "work_items_work_item_type_id_work_item_types_work_item_type_id_fk" FOREIGN KEY ("work_item_type_id") REFERENCES "public"."work_item_types"("work_item_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_items" ADD CONSTRAINT "work_items_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_items" ADD CONSTRAINT "work_items_status_id_work_item_statuses_work_item_status_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."work_item_statuses"("work_item_status_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assigned_to_users_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "work_items" ADD CONSTRAINT "work_items_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_activity_work_item" ON "work_item_activity" USING btree ("work_item_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_activity_type" ON "work_item_activity" USING btree ("activity_type");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_activity_created_by" ON "work_item_activity" USING btree ("created_by");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_activity_created_at" ON "work_item_activity" USING btree ("created_at");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_attachments_work_item" ON "work_item_attachments" USING btree ("work_item_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_attachments_uploaded_by" ON "work_item_attachments" USING btree ("uploaded_by");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_attachments_uploaded_at" ON "work_item_attachments" USING btree ("uploaded_at");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_attachments_deleted_at" ON "work_item_attachments" USING btree ("deleted_at");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_comments_work_item" ON "work_item_comments" USING btree ("work_item_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_comments_parent" ON "work_item_comments" USING btree ("parent_comment_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_comments_created_by" ON "work_item_comments" USING btree ("created_by");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_comments_created_at" ON "work_item_comments" USING btree ("created_at");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_comments_deleted_at" ON "work_item_comments" USING btree ("deleted_at");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_item_field_values_work_item" ON "work_item_field_values" USING btree ("work_item_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_item_field_values_field" ON "work_item_field_values" USING btree ("work_item_field_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_item_field_values_work_item_field" ON "work_item_field_values" USING btree ("work_item_id","work_item_field_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_item_fields_type" ON "work_item_fields" USING btree ("work_item_type_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_item_fields_created_by" ON "work_item_fields" USING btree ("created_by");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_item_fields_deleted_at" ON "work_item_fields" USING btree ("deleted_at");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_item_fields_display_order" ON "work_item_fields" USING btree ("display_order");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_item_fields_type_visible" ON "work_item_fields" USING btree ("work_item_type_id","is_visible");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_item_fields_type_order" ON "work_item_fields" USING btree ("work_item_type_id","display_order");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_transitions_type" ON "work_item_status_transitions" USING btree ("work_item_type_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_transitions_from" ON "work_item_status_transitions" USING btree ("from_status_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_transitions_to" ON "work_item_status_transitions" USING btree ("to_status_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_unique_transition" ON "work_item_status_transitions" USING btree ("work_item_type_id","from_status_id","to_status_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_statuses_type" ON "work_item_statuses" USING btree ("work_item_type_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_statuses_category" ON "work_item_statuses" USING btree ("status_category");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_type_relationships_parent" ON "work_item_type_relationships" USING btree ("parent_type_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_type_relationships_child" ON "work_item_type_relationships" USING btree ("child_type_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_type_relationships_deleted_at" ON "work_item_type_relationships" USING btree ("deleted_at");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_unique_type_relationship" ON "work_item_type_relationships" USING btree ("parent_type_id","child_type_id","deleted_at");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_item_types_org" ON "work_item_types" USING btree ("organization_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_item_types_active" ON "work_item_types" USING btree ("is_active");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_item_types_deleted_at" ON "work_item_types" USING btree ("deleted_at");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_watchers_work_item" ON "work_item_watchers" USING btree ("work_item_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_watchers_user" ON "work_item_watchers" USING btree ("user_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_watchers_type" ON "work_item_watchers" USING btree ("watch_type");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_unique_watcher" ON "work_item_watchers" USING btree ("work_item_id","user_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_type" ON "work_items" USING btree ("work_item_type_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_org" ON "work_items" USING btree ("organization_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_status" ON "work_items" USING btree ("status_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_assigned" ON "work_items" USING btree ("assigned_to");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_priority" ON "work_items" USING btree ("priority");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_due_date" ON "work_items" USING btree ("due_date");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_created_at" ON "work_items" USING btree ("created_at");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_created_by" ON "work_items" USING btree ("created_by");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_deleted_at" ON "work_items" USING btree ("deleted_at");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_parent" ON "work_items" USING btree ("parent_work_item_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_root" ON "work_items" USING btree ("root_work_item_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_depth" ON "work_items" USING btree ("depth");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_work_items_path" ON "work_items" USING btree ("path");--> statement-breakpoint
-- ALTER TABLE "chart_definitions" ADD CONSTRAINT "chart_definitions_data_source_id_chart_data_sources_data_source_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."chart_data_sources"("data_source_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_organization_id_organizations_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("organization_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_account_security_mfa_skips" ON "account_security" USING btree ("mfa_skips_remaining");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_chart_definitions_data_source" ON "chart_definitions" USING btree ("data_source_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_dashboards_organization_id" ON "dashboards" USING btree ("organization_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_dashboards_published_org" ON "dashboards" USING btree ("is_published","organization_id");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_organizations_practice_uids" ON "organizations" USING gin ("practice_uids");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_users_provider_uid" ON "users" USING btree ("provider_uid") WHERE provider_uid IS NOT NULL;--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_webauthn_challenges_expires_used" ON "webauthn_challenges" USING btree ("expires_at","used_at");--> statement-breakpoint
-- CREATE INDEX IF NOT EXISTS "idx_webauthn_credentials_user_active" ON "webauthn_credentials" USING btree ("user_id","is_active");