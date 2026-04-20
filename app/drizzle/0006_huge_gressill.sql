ALTER TABLE "payments" ADD COLUMN "smartbill_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "smartbill_canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "smartbill_storno_invoice_id" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "smartbill_storno_invoice_url" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "smartbill_stornoed_at" timestamp with time zone;