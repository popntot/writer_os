CREATE TABLE IF NOT EXISTS "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"type" text NOT NULL,
	"title" text,
	"original_uri" text,
	"cached_content_ref" text,
	"summary" text,
	"embedding_doc_ref" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_referenced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_type_check" CHECK ("sources"."type" in ('url', 'pdf', 'text', 'voice-memo', 'image', 'book-reference'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sources" ADD CONSTRAINT "sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"raw_content_ref" text NOT NULL,
	"content_type" text NOT NULL,
	"capture_surface" text NOT NULL,
	"status" text DEFAULT 'captured' NOT NULL,
	"decision_kind" text,
	"decision_project_id" uuid,
	"decision_source_id" uuid,
	"confidence" real,
	"agent_reasoning" text,
	"resolved_project_id" uuid,
	"source_id" uuid,
	"proposed_project_id" uuid,
	"deposited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triaged_at" timestamp with time zone,
	"filed_at" timestamp with time zone,
	"last_action_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_items_content_type_check" CHECK ("inbox_items"."content_type" in ('url', 'pdf', 'text', 'voice-memo', 'image', 'book-reference')),
	CONSTRAINT "inbox_items_capture_surface_check" CHECK ("inbox_items"."capture_surface" in ('ios-share-sheet', 'ios-app-dump', 'ios-voice-memo', 'web-drag-drop', 'web-paste', 'web-book-form')),
	CONSTRAINT "inbox_items_status_check" CHECK ("inbox_items"."status" in ('captured', 'triage-failed', 'triaged-auto', 'triaged-pending', 'filed', 'stale')),
	CONSTRAINT "inbox_items_decision_kind_check" CHECK ("inbox_items"."decision_kind" is null or "inbox_items"."decision_kind" in ('auto-filed', 'proposed', 'no-match'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_decision_project_id_projects_id_fk" FOREIGN KEY ("decision_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_decision_source_id_sources_id_fk" FOREIGN KEY ("decision_source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_resolved_project_id_projects_id_fk" FOREIGN KEY ("resolved_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_proposed_project_id_projects_id_fk" FOREIGN KEY ("proposed_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_items_status_last_action_at_idx" ON "inbox_items" USING btree ("status","last_action_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_items_status_deposited_at_idx" ON "inbox_items" USING btree ("status","deposited_at");
--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
  CREATE EXTENSION IF NOT EXISTS vector;
  EXECUTE 'CREATE TABLE IF NOT EXISTS "embeddings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"source_chunk_id" text NOT NULL,
  	"project_id" uuid,
  	"source_id" uuid NOT NULL,
  	"embedding" vector(1536) NOT NULL,
  	"content" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  )';
  EXECUTE 'CREATE INDEX IF NOT EXISTS "embeddings_embedding_idx" ON "embeddings" USING hnsw ("embedding" vector_cosine_ops)';
 ELSE
  EXECUTE 'CREATE TABLE IF NOT EXISTS "embeddings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"source_chunk_id" text NOT NULL,
  	"project_id" uuid,
  	"source_id" uuid NOT NULL,
  	"embedding" text NOT NULL,
  	"content" text NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL
  )';
 END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
