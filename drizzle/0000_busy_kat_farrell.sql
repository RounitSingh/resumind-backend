CREATE TYPE "public"."customization_status" AS ENUM('queued', 'analyzing', 'tailoring', 'scoring', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "cover_letters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customization_id" uuid NOT NULL,
	"tone" varchar(32) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"resume_id" uuid NOT NULL,
	"job_description_id" uuid NOT NULL,
	"status" "customization_status" DEFAULT 'queued' NOT NULL,
	"sections" jsonb NOT NULL,
	"tone" varchar(32) NOT NULL,
	"result" jsonb,
	"scores" jsonb,
	"model" varchar(64) NOT NULL,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_descriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_hash" varchar(64) NOT NULL,
	"content" text NOT NULL,
	"requirements" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_descriptions_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" varchar(128) NOT NULL,
	"file_size" integer NOT NULL,
	"raw_text" text NOT NULL,
	"structured" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "cover_letters" ADD CONSTRAINT "cover_letters_customization_id_customizations_id_fk" FOREIGN KEY ("customization_id") REFERENCES "public"."customizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customizations" ADD CONSTRAINT "customizations_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customizations" ADD CONSTRAINT "customizations_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customizations_client_created_idx" ON "customizations" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "customizations_status_idx" ON "customizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "resumes_client_idx" ON "resumes" USING btree ("client_id");