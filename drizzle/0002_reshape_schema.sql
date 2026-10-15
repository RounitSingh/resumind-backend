CREATE TABLE "clients" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customization_id" uuid,
	"task" varchar(32) NOT NULL,
	"model" varchar(64) NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"ok" boolean NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_descriptions" DROP CONSTRAINT "job_descriptions_content_hash_unique";--> statement-breakpoint
ALTER TABLE "customizations" DROP CONSTRAINT "customizations_job_description_id_job_descriptions_id_fk";
--> statement-breakpoint
DROP INDEX "resumes_client_idx";--> statement-breakpoint
ALTER TABLE "job_descriptions" ALTER COLUMN "content_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_descriptions" ALTER COLUMN "content" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_descriptions" ALTER COLUMN "created_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "cover_letters" ADD COLUMN "model" varchar(64);--> statement-breakpoint
ALTER TABLE "customizations" ADD COLUMN "jd_analysis" jsonb;--> statement-breakpoint
ALTER TABLE "customizations" ADD COLUMN "match_before" integer;--> statement-breakpoint
ALTER TABLE "customizations" ADD COLUMN "match_after" integer;--> statement-breakpoint
ALTER TABLE "customizations" ADD COLUMN "ats_score" integer;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD COLUMN "role" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD COLUMN "company" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD COLUMN "experience" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_descriptions" ADD COLUMN "job_description" text;--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "content_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "resumes" ADD COLUMN "schema_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
-- Backfill existing rows before constraints are applied.
INSERT INTO "clients" ("id") SELECT "client_id" FROM "resumes" UNION SELECT "client_id" FROM "customizations" ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "resumes" SET "content_hash" = encode(sha256(convert_to("raw_text", 'UTF8')), 'hex');--> statement-breakpoint
ALTER TABLE "resumes" ALTER COLUMN "content_hash" SET NOT NULL;--> statement-breakpoint
UPDATE "job_descriptions" SET "job_description" = "content", "role" = COALESCE("requirements"->>'role', ''), "company" = COALESCE("requirements"->>'company', '');--> statement-breakpoint
ALTER TABLE "job_descriptions" ALTER COLUMN "job_description" SET NOT NULL;--> statement-breakpoint
UPDATE "customizations" c SET "jd_analysis" = j."requirements" FROM "job_descriptions" j WHERE c."job_description_id" = j."id";--> statement-breakpoint
UPDATE "customizations" SET "match_before" = ("scores"->'match'->>'before')::int, "match_after" = ("scores"->'match'->>'after')::int, "ats_score" = ("scores"->'ats'->>'score')::int WHERE "scores" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "llm_runs" ADD CONSTRAINT "llm_runs_customization_id_customizations_id_fk" FOREIGN KEY ("customization_id") REFERENCES "public"."customizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_runs_customization_idx" ON "llm_runs" USING btree ("customization_id");--> statement-breakpoint
ALTER TABLE "customizations" ADD CONSTRAINT "customizations_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customizations" ADD CONSTRAINT "customizations_job_description_id_job_descriptions_id_fk" FOREIGN KEY ("job_description_id") REFERENCES "public"."job_descriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cover_letters_customization_idx" ON "cover_letters" USING btree ("customization_id");--> statement-breakpoint
CREATE INDEX "customizations_resume_idx" ON "customizations" USING btree ("resume_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resumes_client_hash_uq" ON "resumes" USING btree ("client_id","content_hash");--> statement-breakpoint
CREATE INDEX "resumes_client_created_idx" ON "resumes" USING btree ("client_id","created_at");--> statement-breakpoint
ALTER TABLE "customizations" ADD CONSTRAINT "customizations_tone_chk" CHECK ("customizations"."tone" in ('professional','confident','concise'));--> statement-breakpoint
ALTER TABLE "customizations" ADD CONSTRAINT "customizations_sections_chk" CHECK (jsonb_typeof("customizations"."sections") = 'array' and "customizations"."sections" <@ '["summary","skills","experience","projects","education","certifications","additional"]'::jsonb);--> statement-breakpoint
ALTER TABLE "customizations" ADD CONSTRAINT "customizations_scores_chk" CHECK (("customizations"."match_before" is null or "customizations"."match_before" between 0 and 100) and ("customizations"."match_after" is null or "customizations"."match_after" between 0 and 100) and ("customizations"."ats_score" is null or "customizations"."ats_score" between 0 and 100));