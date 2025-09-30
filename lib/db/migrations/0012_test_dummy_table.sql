CREATE TABLE "dummy_table" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_data" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);