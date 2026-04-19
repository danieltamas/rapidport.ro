CREATE TABLE IF NOT EXISTS "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_email" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"details" jsonb,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_oauth_state" (
	"state" text PRIMARY KEY NOT NULL,
	"code_verifier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"ip_hash" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "admin_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"job_id" uuid,
	"event" text NOT NULL,
	"details" jsonb,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mapping_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"name" text NOT NULL,
	"source_software_version" text,
	"target_software_version" text,
	"mappings" jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"adoption_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric" text NOT NULL,
	"value" real NOT NULL,
	"meta" jsonb,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"stripe_payment_intent_id" text,
	"stripe_fee_amount" integer,
	"smartbill_invoice_id" text,
	"smartbill_invoice_url" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'ron' NOT NULL,
	"status" text NOT NULL,
	"refunded_amount" integer DEFAULT 0 NOT NULL,
	"refunded_at" timestamp with time zone,
	"billing_info" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "anonymous_access_token" text NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "source_software" text NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "target_software" text NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "upload_filename" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "upload_size" bigint;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "discovery_result" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "mapping_result" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "mapping_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mapping_profiles" ADD CONSTRAINT "mapping_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_admin_email_index" ON "admin_audit_log" USING btree ("admin_email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_action_index" ON "admin_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_audit_log_created_at_index" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_sessions_email_index" ON "admin_sessions" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "admin_sessions_expires_at_index" ON "admin_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_user_id_index" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_job_id_index" ON "audit_log" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_event_index" ON "audit_log" USING btree ("event");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_created_at_index" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mapping_profiles_user_id_index" ON "mapping_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mapping_profiles_is_public_index" ON "mapping_profiles" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metrics_metric_recorded_at_index" ON "metrics" USING btree ("metric","recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_job_id_index" ON "payments" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_status_index" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limits_key_window_start_index" ON "rate_limits" USING btree ("key","window_start");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_mapping_profile_id_mapping_profiles_id_fk" FOREIGN KEY ("mapping_profile_id") REFERENCES "public"."mapping_profiles"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_user_id_index" ON "jobs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_anonymous_access_token_index" ON "jobs" USING btree ("anonymous_access_token");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_expires_at_index" ON "jobs" USING btree ("expires_at");