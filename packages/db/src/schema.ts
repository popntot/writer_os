import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const vector1536 = customType<{ data: string }>({
  dataType() {
    return "vector(1536)";
  },
});

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
  nextSessionStarter: text("next_session_starter"),
  nextSessionStarterUpdatedAt: timestamp("next_session_starter_updated_at", {
    withTimezone: true,
  }),
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
    consolidationState: text("consolidation_state")
      .notNull()
      .default("not-started"),
    consolidationQueuedAt: timestamp("consolidation_queued_at", {
      withTimezone: true,
    }),
    consolidationStartedAt: timestamp("consolidation_started_at", {
      withTimezone: true,
    }),
    consolidationCompletedAt: timestamp("consolidation_completed_at", {
      withTimezone: true,
    }),
    consolidationFailedAt: timestamp("consolidation_failed_at", {
      withTimezone: true,
    }),
    consolidationError: text("consolidation_error"),
    consolidationTrigger: text("consolidation_trigger"),
    consolidationRetriesRemaining: integer("consolidation_retries_remaining"),
    consolidationNextRetryAt: timestamp("consolidation_next_retry_at", {
      withTimezone: true,
    }),
    consolidationContributionSummary: text(
      "consolidation_contribution_summary",
    ),
    consolidationTrueLineVersion: integer("consolidation_true_line_version"),
    summary: text("summary"),
  },
  (table) => ({
    consolidationStatusCheck: check(
      "sessions_consolidation_status_check",
      sql`${table.consolidationStatus} in ('pending', 'running', 'succeeded', 'failed')`,
    ),
    consolidationStateCheck: check(
      "sessions_consolidation_state_check",
      sql`${table.consolidationState} in ('not-started', 'queued', 'in-progress', 'completed', 'failed')`,
    ),
    consolidationTriggerCheck: check(
      "sessions_consolidation_trigger_check",
      sql`${table.consolidationTrigger} is null or ${table.consolidationTrigger} in ('session-end', 'manual', 'retry-auto', 'retry-manual')`,
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

/**
 * Session turns — immutable transcript rows for each user/assistant exchange.
 * ConsolidationWorker reads these rows after a session ends to synthesize the
 * next TrueLine delta.
 */
export const sessionTurns = pgTable(
  "session_turns",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    turnIdx: integer("turn_idx").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sessionId, table.turnIdx] }),
    roleCheck: check(
      "session_turns_role_check",
      sql`${table.role} in ('user', 'assistant')`,
    ),
  }),
);

/**
 * Sources — captured material after inbox ingestion. The inbox engine owns the
 * project linkage; SourceIngestionPipeline creates rows with projectId null.
 */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    title: text("title"),
    originalUri: text("original_uri"),
    cachedContentRef: text("cached_content_ref"),
    summary: text("summary"),
    embeddingDocRef: text("embedding_doc_ref"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastReferencedAt: timestamp("last_referenced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    typeCheck: check(
      "sources_type_check",
      sql`${table.type} in ('url', 'pdf', 'text', 'voice-memo', 'image', 'book-reference')`,
    ),
  }),
);

/**
 * Inbox items — the state-machine surface for captured material before and
 * during project filing.
 */
export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawContentRef: text("raw_content_ref").notNull(),
    contentType: text("content_type").notNull(),
    captureSurface: text("capture_surface").notNull(),
    status: text("status").notNull().default("captured"),
    decisionKind: text("decision_kind"),
    decisionProjectId: uuid("decision_project_id").references(
      () => projects.id,
      { onDelete: "set null" },
    ),
    decisionSourceId: uuid("decision_source_id").references(() => sources.id, {
      onDelete: "set null",
    }),
    confidence: real("confidence"),
    agentReasoning: text("agent_reasoning"),
    resolvedProjectId: uuid("resolved_project_id").references(
      () => projects.id,
      { onDelete: "set null" },
    ),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "set null",
    }),
    proposedProjectId: uuid("proposed_project_id").references(
      () => projects.id,
      { onDelete: "set null" },
    ),
    depositedAt: timestamp("deposited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    filedAt: timestamp("filed_at", { withTimezone: true }),
    lastActionAt: timestamp("last_action_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    statusLastActionIdx: index("inbox_items_status_last_action_at_idx").on(
      table.status,
      table.lastActionAt,
    ),
    statusDepositedIdx: index("inbox_items_status_deposited_at_idx").on(
      table.status,
      table.depositedAt,
    ),
    contentTypeCheck: check(
      "inbox_items_content_type_check",
      sql`${table.contentType} in ('url', 'pdf', 'text', 'voice-memo', 'image', 'book-reference')`,
    ),
    captureSurfaceCheck: check(
      "inbox_items_capture_surface_check",
      sql`${table.captureSurface} in ('ios-share-sheet', 'ios-app-dump', 'ios-voice-memo', 'web-drag-drop', 'web-paste', 'web-book-form')`,
    ),
    statusCheck: check(
      "inbox_items_status_check",
      sql`${table.status} in ('captured', 'triage-failed', 'triaged-auto', 'triaged-pending', 'filed', 'stale')`,
    ),
    decisionKindCheck: check(
      "inbox_items_decision_kind_check",
      sql`${table.decisionKind} is null or ${table.decisionKind} in ('auto-filed', 'proposed', 'no-match')`,
    ),
  }),
);

/**
 * Embeddings — pgvector-backed source chunks. Tests use no vector operations;
 * the migration falls back to a text embedding column when pgvector is absent.
 */
export const embeddings = pgTable("embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceChunkId: text("source_chunk_id").notNull(),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => sources.id, { onDelete: "cascade" }),
  embedding: vector1536("embedding").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type TrueLineVersionRow = typeof trueLineVersions.$inferSelect;
export type NewTrueLineVersionRow = typeof trueLineVersions.$inferInsert;
export type SessionTurnRow = typeof sessionTurns.$inferSelect;
export type NewSessionTurnRow = typeof sessionTurns.$inferInsert;
export type SourceRow = typeof sources.$inferSelect;
export type NewSourceRow = typeof sources.$inferInsert;
export type InboxItemRow = typeof inboxItems.$inferSelect;
export type NewInboxItemRow = typeof inboxItems.$inferInsert;
export type EmbeddingRow = typeof embeddings.$inferSelect;
export type NewEmbeddingRow = typeof embeddings.$inferInsert;
