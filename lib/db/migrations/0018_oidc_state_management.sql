-- OIDC State Management Tables
-- Supports horizontal scaling with PostgreSQL-backed state validation

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
CREATE TABLE "oidc_nonces" (
	"nonce" varchar(255) PRIMARY KEY NOT NULL,
	"state" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oidc_nonces" ADD CONSTRAINT "oidc_nonces_state_oidc_states_state_fk" FOREIGN KEY ("state") REFERENCES "public"."oidc_states"("state") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_oidc_states_expires" ON "oidc_states" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "idx_oidc_states_is_used" ON "oidc_states" USING btree ("is_used");
--> statement-breakpoint
CREATE INDEX "idx_oidc_nonces_expires" ON "oidc_nonces" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "idx_oidc_nonces_state" ON "oidc_nonces" USING btree ("state");
