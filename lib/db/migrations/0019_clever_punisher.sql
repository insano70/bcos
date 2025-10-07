CREATE TABLE "csrf_failure_events" (
	"event_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text NOT NULL,
	"pathname" varchar(500) NOT NULL,
	"reason" varchar(200) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_nonces" (
	"nonce" varchar(255) PRIMARY KEY NOT NULL,
	"state" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_states" (
	"state" varchar(255) PRIMARY KEY NOT NULL,
	"nonce" varchar(255) NOT NULL,
	"user_fingerprint" varchar(64),
	"is_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "saml_replay_prevention" (
	"replay_id" text PRIMARY KEY NOT NULL,
	"in_response_to" text NOT NULL,
	"user_email" text NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text NOT NULL,
	"user_agent" text,
	"session_id" text
);
--> statement-breakpoint
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
DROP INDEX "idx_chart_data_source_columns_flags";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "account_security" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account_security" ADD COLUMN "mfa_method" varchar(20);--> statement-breakpoint
ALTER TABLE "account_security" ADD COLUMN "mfa_enforced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "is_measure_type" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "is_time_period" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "display_icon" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "icon_type" varchar(20);--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "icon_color_mode" varchar(20) DEFAULT 'auto';--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "icon_color" varchar(50);--> statement-breakpoint
ALTER TABLE "chart_data_source_columns" ADD COLUMN "icon_mapping" jsonb;--> statement-breakpoint
ALTER TABLE "dashboards" ADD COLUMN "is_default" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "csrf_failure_events" ADD CONSTRAINT "csrf_failure_events_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_nonces" ADD CONSTRAINT "oidc_nonces_state_oidc_states_state_fk" FOREIGN KEY ("state") REFERENCES "public"."oidc_states"("state") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_csrf_failures_ip_timestamp" ON "csrf_failure_events" USING btree ("ip_address","timestamp");--> statement-breakpoint
CREATE INDEX "idx_csrf_failures_timestamp" ON "csrf_failure_events" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "idx_csrf_failures_pathname_timestamp" ON "csrf_failure_events" USING btree ("pathname","timestamp");--> statement-breakpoint
CREATE INDEX "idx_csrf_failures_severity_timestamp" ON "csrf_failure_events" USING btree ("severity","timestamp");--> statement-breakpoint
CREATE INDEX "idx_csrf_failures_user_id" ON "csrf_failure_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_csrf_failures_alert_detection" ON "csrf_failure_events" USING btree ("ip_address","severity","timestamp");--> statement-breakpoint
CREATE INDEX "idx_oidc_nonces_expires" ON "oidc_nonces" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_oidc_nonces_state" ON "oidc_nonces" USING btree ("state");--> statement-breakpoint
CREATE INDEX "idx_oidc_states_expires" ON "oidc_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_oidc_states_is_used" ON "oidc_states" USING btree ("is_used");--> statement-breakpoint
CREATE INDEX "idx_saml_replay_expires_at" ON "saml_replay_prevention" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_saml_replay_in_response_to" ON "saml_replay_prevention" USING btree ("in_response_to");--> statement-breakpoint
CREATE INDEX "idx_saml_replay_user_email" ON "saml_replay_prevention" USING btree ("user_email");--> statement-breakpoint
CREATE INDEX "idx_webauthn_challenges_user_id" ON "webauthn_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_webauthn_challenges_expires_at" ON "webauthn_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_webauthn_challenges_challenge_type" ON "webauthn_challenges" USING btree ("challenge_type");--> statement-breakpoint
CREATE INDEX "idx_webauthn_credentials_user_id" ON "webauthn_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_webauthn_credentials_active" ON "webauthn_credentials" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_webauthn_credentials_last_used" ON "webauthn_credentials" USING btree ("last_used");--> statement-breakpoint
CREATE INDEX "idx_account_security_mfa_enabled" ON "account_security" USING btree ("mfa_enabled");--> statement-breakpoint
CREATE INDEX "idx_dashboards_default" ON "dashboards" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "idx_chart_data_source_columns_flags" ON "chart_data_source_columns" USING btree ("is_filterable","is_groupable","is_measure","is_measure_type");