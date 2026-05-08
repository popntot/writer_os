CREATE TABLE IF NOT EXISTS "true_line_versions" (
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"source_session_id" uuid NOT NULL,
	"contribution_summary" text,
	"committed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "true_line_versions_project_id_version_pk" PRIMARY KEY("project_id","version"),
	CONSTRAINT "true_line_versions_version_positive" CHECK ("true_line_versions"."version" > 0)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "true_line_versions" ADD CONSTRAINT "true_line_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "true_line_versions" ADD CONSTRAINT "true_line_versions_source_session_id_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
