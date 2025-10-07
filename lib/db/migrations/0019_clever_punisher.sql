-- Migration: WebAuthn MFA and Chart Enhancements
-- Description: Add WebAuthn tables, MFA columns, icon display features, and dashboard defaults
-- Date: 2025-10-07
-- Note: This migration assumes 0015-0018 have already been applied (SAML, CSRF, OIDC tables)
-- Note: Uses DO blocks for idempotency to handle partially applied migrations

-- WebAuthn challenges table for MFA authentication
CREATE TABLE IF NOT EXISTS "webauthn_challenges" (
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
CREATE TABLE IF NOT EXISTS "webauthn_credentials" (
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
-- Add MFA columns to account_security table (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_security' AND column_name = 'mfa_enabled') THEN
        ALTER TABLE "account_security" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_security' AND column_name = 'mfa_method') THEN
        ALTER TABLE "account_security" ADD COLUMN "mfa_method" varchar(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'account_security' AND column_name = 'mfa_enforced_at') THEN
        ALTER TABLE "account_security" ADD COLUMN "mfa_enforced_at" timestamp with time zone;
    END IF;
END $$;
--> statement-breakpoint
-- Add icon display columns to chart_data_source_columns (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chart_data_source_columns' AND column_name = 'is_measure_type') THEN
        ALTER TABLE "chart_data_source_columns" ADD COLUMN "is_measure_type" boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chart_data_source_columns' AND column_name = 'is_time_period') THEN
        ALTER TABLE "chart_data_source_columns" ADD COLUMN "is_time_period" boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chart_data_source_columns' AND column_name = 'display_icon') THEN
        ALTER TABLE "chart_data_source_columns" ADD COLUMN "display_icon" boolean DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chart_data_source_columns' AND column_name = 'icon_type') THEN
        ALTER TABLE "chart_data_source_columns" ADD COLUMN "icon_type" varchar(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chart_data_source_columns' AND column_name = 'icon_color_mode') THEN
        ALTER TABLE "chart_data_source_columns" ADD COLUMN "icon_color_mode" varchar(20) DEFAULT 'auto';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chart_data_source_columns' AND column_name = 'icon_color') THEN
        ALTER TABLE "chart_data_source_columns" ADD COLUMN "icon_color" varchar(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'chart_data_source_columns' AND column_name = 'icon_mapping') THEN
        ALTER TABLE "chart_data_source_columns" ADD COLUMN "icon_mapping" jsonb;
    END IF;
END $$;
--> statement-breakpoint
-- Add is_default column to dashboards table (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dashboards' AND column_name = 'is_default') THEN
        ALTER TABLE "dashboards" ADD COLUMN "is_default" boolean DEFAULT false;
    END IF;
END $$;
--> statement-breakpoint
-- Add foreign key constraints (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'webauthn_credentials_user_id_users_user_id_fk') THEN
        ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;
    END IF;
END $$;
--> statement-breakpoint
-- Create indexes for WebAuthn tables (idempotent)
CREATE INDEX IF NOT EXISTS "idx_webauthn_challenges_user_id" ON "webauthn_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webauthn_challenges_expires_at" ON "webauthn_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webauthn_challenges_challenge_type" ON "webauthn_challenges" USING btree ("challenge_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webauthn_credentials_user_id" ON "webauthn_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webauthn_credentials_active" ON "webauthn_credentials" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webauthn_credentials_last_used" ON "webauthn_credentials" USING btree ("last_used");--> statement-breakpoint
-- Create indexes for new columns (idempotent)
CREATE INDEX IF NOT EXISTS "idx_account_security_mfa_enabled" ON "account_security" USING btree ("mfa_enabled");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_dashboards_default" ON "dashboards" USING btree ("is_default");--> statement-breakpoint
-- Recreate chart_data_source_columns flags index with new columns (idempotent)
DROP INDEX IF EXISTS "idx_chart_data_source_columns_flags";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chart_data_source_columns_flags" ON "chart_data_source_columns" USING btree ("is_filterable","is_groupable","is_measure","is_measure_type");
