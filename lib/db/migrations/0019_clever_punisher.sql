-- Migration: WebAuthn MFA and Chart Enhancements
-- Description: Add WebAuthn tables, MFA columns, icon display features, and dashboard defaults
-- Date: 2025-10-07
-- Note: This migration assumes 0015-0018 have already been applied (SAML, CSRF, OIDC tables)

-- WebAuthn challenges table for MFA authentication
CREATE TABLE "webauthn_challenges" (
	"challenge_id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"challenge" varchar(255) NOT NULL,
	"challenge_type" varchar(20) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
-- WebAuthn credentials table for storing user passkeys
CREATE TABLE "webauthn_credentials" (
	"credential_id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"credential_device_type" varchar(32) NOT NULL,
	"transports" text,
	"aaguid" text,
	"credential_name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"registration_ip" varchar(45) NOT NULL,
	"registration_user_agent" text
);
--> statement-breakpoint
-- Add MFA columns to account_security table
ALTER TABLE "account_security" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account_security" ADD COLUMN "mfa_method" varchar(20);--> statement-breakpoint
ALTER TABLE "account_security" ADD COLUMN "mfa_enforced_at" timestamp with time zone;--> statement-breakpoint
-- Add icon display columns to chart_data_source_columns
ALTER TABLE "chart_data_source_columns" ADD COLUMN "is_measure_type" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "is_time_period" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "display_icon" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "icon_type" varchar(20);--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "icon_color_mode" varchar(20) DEFAULT 'auto';--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "icon_color" varchar(50);--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "icon_mapping" jsonb;--> statement-breakpoint
-- Add is_default column to dashboards table
ALTER TABLE "dashboards" ADD COLUMN "is_default" boolean DEFAULT false;--> statement-breakpoint
-- Add foreign key constraints
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Create indexes for WebAuthn tables
CREATE INDEX "idx_webauthn_challenges_user_id" ON "webauthn_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_webauthn_challenges_expires_at" ON "webauthn_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_webauthn_challenges_challenge_type" ON "webauthn_challenges" USING btree ("challenge_type");--> statement-breakpoint
CREATE INDEX "idx_webauthn_credentials_user_id" ON "webauthn_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_webauthn_credentials_active" ON "webauthn_credentials" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_webauthn_credentials_last_used" ON "webauthn_credentials" USING btree ("last_used");--> statement-breakpoint
-- Create indexes for new columns
CREATE INDEX "idx_account_security_mfa_enabled" ON "account_security" USING btree ("mfa_enabled");--> statement-breakpoint
CREATE INDEX "idx_dashboards_default" ON "dashboards" USING btree ("is_default");--> statement-breakpoint
-- Recreate chart_data_source_columns flags index with new columns
DROP INDEX IF EXISTS "idx_chart_data_source_columns_flags";--> statement-breakpoint
CREATE INDEX "idx_chart_data_source_columns_flags" ON "chart_data_source_columns" USING btree ("is_filterable","is_groupable","is_measure","is_measure_type");
