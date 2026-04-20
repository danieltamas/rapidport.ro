ALTER TABLE "jobs" ADD COLUMN "email_mapping_ready_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "email_conversion_ready_sent_at" timestamp with time zone;