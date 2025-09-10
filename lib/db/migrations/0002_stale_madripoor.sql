CREATE TABLE "account_security" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"last_failed_attempt" timestamp with time zone,
	"locked_until" timestamp with time zone,
	"lockout_reason" varchar(50),
	"max_concurrent_sessions" integer DEFAULT 3 NOT NULL,
	"require_fresh_auth_minutes" integer DEFAULT 5 NOT NULL,
	"password_changed_at" timestamp with time zone,
	"last_password_reset" timestamp with time zone,
	"suspicious_activity_detected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"audit_log_id" varchar(255) PRIMARY KEY NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"action" varchar(100) NOT NULL,
	"user_id" varchar(255),
	"ip_address" varchar(45),
	"user_agent" text,
	"resource_type" varchar(50),
	"resource_id" varchar(255),
	"old_values" text,
	"new_values" text,
	"metadata" text,
	"severity" varchar(20) DEFAULT 'low' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"attempt_id" varchar(255) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"user_id" uuid,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"device_fingerprint" varchar(255),
	"success" boolean NOT NULL,
	"failure_reason" varchar(100),
	"remember_me_requested" boolean DEFAULT false NOT NULL,
	"session_id" varchar(255),
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"token_id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"device_fingerprint" varchar(255) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"remember_me" boolean DEFAULT false NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" varchar(50),
	"rotation_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_blacklist" (
	"jti" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_type" varchar(20) NOT NULL,
	"blacklisted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reason" varchar(50) NOT NULL,
	"blacklisted_by" uuid,
	"ip_address" varchar(45),
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"session_id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"refresh_token_id" varchar(255),
	"device_fingerprint" varchar(255) NOT NULL,
	"device_name" varchar(100),
	"ip_address" varchar(45) NOT NULL,
	"user_agent" text,
	"remember_me" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" varchar(50)
);
--> statement-breakpoint
CREATE INDEX "idx_account_security_locked_until" ON "account_security" USING btree ("locked_until");--> statement-breakpoint
CREATE INDEX "idx_account_security_suspicious" ON "account_security" USING btree ("suspicious_activity_detected");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_event_type" ON "audit_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_severity" ON "audit_logs" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_resource" ON "audit_logs" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_email" ON "login_attempts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_ip" ON "login_attempts" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_attempted_at" ON "login_attempts" USING btree ("attempted_at");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_success" ON "login_attempts" USING btree ("success");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_user_id" ON "login_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_login_attempts_session_id" ON "login_attempts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_active" ON "refresh_tokens" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_expires_at" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_device" ON "refresh_tokens" USING btree ("device_fingerprint");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_hash" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_token_blacklist_user_id" ON "token_blacklist" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_token_blacklist_expires_at" ON "token_blacklist" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_token_blacklist_type" ON "token_blacklist" USING btree ("token_type");--> statement-breakpoint
CREATE INDEX "idx_token_blacklist_blacklisted_at" ON "token_blacklist" USING btree ("blacklisted_at");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_user_id" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_refresh_token" ON "user_sessions" USING btree ("refresh_token_id");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_active" ON "user_sessions" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_device" ON "user_sessions" USING btree ("device_fingerprint");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_last_activity" ON "user_sessions" USING btree ("last_activity");