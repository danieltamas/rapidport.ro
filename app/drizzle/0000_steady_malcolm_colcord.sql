CREATE TABLE IF NOT EXISTS "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"model" text NOT NULL,
	"tokens_in" integer NOT NULL,
	"tokens_out" integer NOT NULL,
	"cost_usd" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text NOT NULL,
	"progress_stage" text,
	"progress_pct" integer DEFAULT 0,
	"worker_version" text,
	"canonical_schema_version" text,
	"delta_syncs_used" integer DEFAULT 0,
	"delta_syncs_allowed" integer DEFAULT 3,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mapping_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_software" text NOT NULL,
	"table_name" text NOT NULL,
	"field_name" text NOT NULL,
	"target_field" text NOT NULL,
	"confidence" real NOT NULL,
	"reasoning" text,
	"hit_count" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "mapping_cache_source_software_table_name_field_name_unique" UNIQUE("source_software","table_name","field_name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
