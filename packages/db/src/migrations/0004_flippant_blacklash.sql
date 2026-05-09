ALTER TABLE "projects" ADD COLUMN "next_session_starter" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "next_session_starter_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "consolidation_state" text DEFAULT 'not-started' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "consolidation_queued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "consolidation_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "consolidation_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "consolidation_failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "consolidation_error" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "consolidation_trigger" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "consolidation_retries_remaining" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "consolidation_next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "consolidation_contribution_summary" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "consolidation_true_line_version" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_consolidation_state_check" CHECK ("sessions"."consolidation_state" in ('not-started', 'queued', 'in-progress', 'completed', 'failed'));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_consolidation_trigger_check" CHECK ("sessions"."consolidation_trigger" is null or "sessions"."consolidation_trigger" in ('session-end', 'manual', 'retry-auto', 'retry-manual'));