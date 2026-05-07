import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
