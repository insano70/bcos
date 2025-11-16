-- Add chart_provider_colors table for persistent provider color assignments
-- Uses Tableau's industry-standard 20-color palette for optimal visual distinction
-- Organization-segregated: different orgs can assign different colors to same provider

CREATE TABLE IF NOT EXISTS "chart_provider_colors" (
	"provider_color_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"provider_uid" integer NOT NULL,
	"provider_name" varchar(255) NOT NULL,
	"assigned_color" varchar(7) NOT NULL,
	"color_palette_id" varchar(50) DEFAULT 'tableau20',
	"is_custom" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_by" uuid,
	"updated_by" uuid,
	CONSTRAINT "unique_org_provider_color" UNIQUE("organization_id","provider_uid")
);
--> statement-breakpoint

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS "idx_chart_provider_colors_org_provider" ON "chart_provider_colors" USING btree ("organization_id","provider_uid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chart_provider_colors_uid" ON "chart_provider_colors" USING btree ("provider_uid");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chart_provider_colors_org" ON "chart_provider_colors" USING btree ("organization_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chart_provider_colors_custom" ON "chart_provider_colors" USING btree ("is_custom");
