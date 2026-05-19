CREATE TABLE IF NOT EXISTS "settings" (
	"id" text PRIMARY KEY NOT NULL,
	"audio_capture_default" boolean DEFAULT false NOT NULL,
	"audio_retention_hot_days" integer DEFAULT 30 NOT NULL,
	"audio_retention_cold_days" integer DEFAULT 365 NOT NULL,
	"location_tag_default" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton_id_check" CHECK ("settings"."id" = 'singleton'),
	CONSTRAINT "settings_audio_retention_hot_days_nonnegative" CHECK ("settings"."audio_retention_hot_days" >= 0),
	CONSTRAINT "settings_audio_retention_cold_days_nonnegative" CHECK ("settings"."audio_retention_cold_days" >= 0),
	CONSTRAINT "settings_audio_retention_order_check" CHECK ("settings"."audio_retention_hot_days" <= "settings"."audio_retention_cold_days")
);
--> statement-breakpoint
INSERT INTO "settings" (
	"id",
	"audio_capture_default",
	"audio_retention_hot_days",
	"audio_retention_cold_days",
	"location_tag_default"
)
VALUES ('singleton', false, 30, 365, false)
ON CONFLICT ("id") DO NOTHING;
