CREATE TABLE "practice_attributes" (
	"practice_attribute_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid,
	"phone" varchar(20),
	"email" varchar(255),
	"address_line1" varchar(255),
	"address_line2" varchar(255),
	"city" varchar(100),
	"state" varchar(50),
	"zip_code" varchar(20),
	"business_hours" text,
	"services" text,
	"insurance_accepted" text,
	"conditions_treated" text,
	"about_text" text,
	"mission_statement" text,
	"welcome_message" text,
	"logo_url" varchar(500),
	"hero_image_url" varchar(500),
	"gallery_images" text,
	"meta_title" varchar(255),
	"meta_description" varchar(500),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "practices" (
	"practice_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"domain" varchar(255) NOT NULL,
	"template_id" uuid,
	"status" varchar(20) DEFAULT 'pending',
	"owner_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone,
	CONSTRAINT "practices_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"staff_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid,
	"name" varchar(255) NOT NULL,
	"title" varchar(255),
	"credentials" varchar(255),
	"bio" text,
	"photo_url" varchar(500),
	"specialties" text,
	"education" text,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "templates" (
	"template_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"preview_image_url" varchar(500),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone,
	CONSTRAINT "templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "practice_attributes" ADD CONSTRAINT "practice_attributes_practice_id_practices_practice_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("practice_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practices" ADD CONSTRAINT "practices_template_id_templates_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("template_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practices" ADD CONSTRAINT "practices_owner_user_id_users_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_practice_id_practices_practice_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("practice_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_practice_attributes_practice_id" ON "practice_attributes" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "idx_practices_domain" ON "practices" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "idx_practices_template_id" ON "practices" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "idx_practices_owner" ON "practices" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_practices_status" ON "practices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_staff_members_practice_id" ON "staff_members" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "idx_staff_members_display_order" ON "staff_members" USING btree ("practice_id","display_order");--> statement-breakpoint
CREATE INDEX "idx_staff_members_active" ON "staff_members" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_templates_slug" ON "templates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_templates_active" ON "templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_created_at" ON "users" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_users_deleted_at" ON "users" USING btree ("deleted_at");