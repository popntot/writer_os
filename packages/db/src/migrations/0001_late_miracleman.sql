CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"target_article_id" uuid,
	"start_at" timestamp with time zone DEFAULT now() NOT NULL,
	"end_at" timestamp with time zone,
	"audio_ref" text,
	"transcript_ref" text,
	"consolidation_status" text DEFAULT 'pending' NOT NULL,
	"summary" text,
	CONSTRAINT "sessions_consolidation_status_check" CHECK ("sessions"."consolidation_status" in ('pending', 'running', 'succeeded', 'failed'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
