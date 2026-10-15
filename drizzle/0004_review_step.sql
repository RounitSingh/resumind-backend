ALTER TYPE "public"."customization_status" ADD VALUE 'review' BEFORE 'tailoring';--> statement-breakpoint
ALTER TABLE "customizations" ADD COLUMN "review" jsonb;