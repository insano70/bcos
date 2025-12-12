ALTER TABLE "chart_component_configs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "chart_component_configs" CASCADE;--> statement-breakpoint
ALTER TABLE "chart_display_configs" RENAME TO "chart_display_configurations";--> statement-breakpoint
ALTER TABLE "chart_display_configurations" RENAME COLUMN "config_id" TO "display_configuration_id";--> statement-breakpoint
ALTER TABLE "chart_display_configurations" DROP CONSTRAINT "chart_display_configs_default_color_palette_id_color_palettes_palette_id_fk";
--> statement-breakpoint
DROP INDEX "idx_chart_display_configs_type_freq";--> statement-breakpoint
DROP INDEX "idx_chart_display_configs_default";--> statement-breakpoint
DROP INDEX "idx_chart_display_configs_active";--> statement-breakpoint
ALTER TABLE "chart_display_configurations" ADD CONSTRAINT "chart_display_configurations_default_color_palette_id_color_palettes_palette_id_fk" FOREIGN KEY ("default_color_palette_id") REFERENCES "public"."color_palettes"("palette_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chart_display_configurations_type_freq" ON "chart_display_configurations" USING btree ("chart_type","frequency");--> statement-breakpoint
CREATE INDEX "idx_chart_display_configurations_default" ON "chart_display_configurations" USING btree ("is_default");--> statement-breakpoint
CREATE INDEX "idx_chart_display_configurations_active" ON "chart_display_configurations" USING btree ("is_active");