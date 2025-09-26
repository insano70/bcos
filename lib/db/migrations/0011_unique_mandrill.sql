ALTER TABLE "dashboards" ADD COLUMN "is_published" boolean DEFAULT false;--> statement-breakpoint
CREATE INDEX "idx_dashboards_published" ON "dashboards" USING btree ("is_published");