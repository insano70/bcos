CREATE TABLE "practice_comments" (
	"comment_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_id" uuid NOT NULL,
	"commenter_name" varchar(255),
	"commenter_location" varchar(255),
	"comment" text NOT NULL,
	"rating" numeric NOT NULL,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_comments" ADD CONSTRAINT "practice_comments_practice_id_practices_practice_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("practice_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_practice_comments_practice_id" ON "practice_comments" USING btree ("practice_id");--> statement-breakpoint
CREATE INDEX "idx_practice_comments_display_order" ON "practice_comments" USING btree ("practice_id","display_order");