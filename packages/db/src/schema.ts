import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Projects — the spine entity. One TrueLine per Project; Articles/Sources/Sessions/OpenQuestions
 * are the five children (per PRD §"Spine model"). At MVP only `projects` is created;
 * children land in subsequent slices.
 */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  type: text("type"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  mentorRef: text("mentor_ref"),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    targetArticleId: uuid("target_article_id"),
    startAt: timestamp("start_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endAt: timestamp("end_at", { withTimezone: true }),
    audioRef: text("audio_ref"),
    transcriptRef: text("transcript_ref"),
    consolidationStatus: text("consolidation_status")
      .notNull()
      .default("pending"),
    summary: text("summary"),
  },
  (table) => ({
    consolidationStatusCheck: check(
      "sessions_consolidation_status_check",
      sql`${table.consolidationStatus} in ('pending', 'running', 'succeeded', 'failed')`,
    ),
  }),
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
