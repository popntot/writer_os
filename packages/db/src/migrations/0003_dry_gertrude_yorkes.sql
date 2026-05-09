CREATE TABLE IF NOT EXISTS "session_turns" (
	"session_id" uuid NOT NULL,
	"turn_idx" integer NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_turns_session_id_turn_idx_pk" PRIMARY KEY("session_id","turn_idx"),
	CONSTRAINT "session_turns_role_check" CHECK ("session_turns"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_turns" ADD CONSTRAINT "session_turns_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
