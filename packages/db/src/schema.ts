import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

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

/**
 * TrueLine versions — one row per committed version per project. Whole-document
 * replacement; history is immutable. v0 (empty initial state) is synthesized by
 * TrueLineStore.read() and never stored. The locked interface
 * (docs/interfaces/trueline-store.md) hides the storage split as internal: a
 * single Postgres table satisfies the contract today; a future vendor swap to
 * object storage stays behind the same interface.
 */
export const trueLineVersions = pgTable(
  "true_line_versions",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    sourceSessionId: uuid("source_session_id")
      .notNull()
      .references(() => sessions.id),
    contributionSummary: text("contribution_summary"),
    committedAt: timestamp("committed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.projectId, table.version] }),
    versionPositive: check(
      "true_line_versions_version_positive",
      sql`${table.version} > 0`,
    ),
  }),
);

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type TrueLineVersionRow = typeof trueLineVersions.$inferSelect;
export type NewTrueLineVersionRow = typeof trueLineVersions.$inferInsert;
