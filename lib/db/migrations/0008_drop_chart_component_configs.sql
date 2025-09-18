ALTER TABLE "chart_data_sources" RENAME COLUMN "created_by_user_id" TO "created_by";--> statement-breakpoint
ALTER TABLE "chart_definitions" RENAME COLUMN "created_by_user_id" TO "created_by";--> statement-breakpoint
ALTER TABLE "color_palettes" RENAME COLUMN "created_by_user_id" TO "created_by";--> statement-breakpoint
ALTER TABLE "dashboards" RENAME COLUMN "created_by_user_id" TO "created_by";--> statement-breakpoint
ALTER TABLE "chart_categories" DROP CONSTRAINT "chart_categories_parent_category_id_chart_categories_chart_category_id_fk";
--> statement-breakpoint
ALTER TABLE "chart_definitions" DROP CONSTRAINT "chart_definitions_created_by_user_id_users_user_id_fk";
--> statement-breakpoint
ALTER TABLE "dashboards" DROP CONSTRAINT "dashboards_created_by_user_id_users_user_id_fk";
--> statement-breakpoint
DROP INDEX "idx_chart_definitions_created_by";--> statement-breakpoint
DROP INDEX "idx_dashboards_created_by";--> statement-breakpoint
ALTER TABLE "chart_definitions" ADD CONSTRAINT "chart_definitions_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_created_by_users_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chart_definitions_created_by" ON "chart_definitions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_dashboards_created_by" ON "dashboards" USING btree ("created_by");