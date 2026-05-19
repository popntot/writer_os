import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { schema, type AppDatabase, type InboxItemRow } from "@writer-os/db";
import type {
  CaptureSurface,
  InboxItem,
  InboxItemStatus,
  InboxTriageEngine,
  RawContent,
  SourceIngestionPipeline,
  TriageDecision,
} from "@writer-os/shared-types";

export type {
  CaptureSurface,
  InboxItem,
  InboxItemStatus,
  InboxTriageEngine,
  RawContent,
  SourceIngestionPipeline,
  TriageDecision,
} from "@writer-os/shared-types";
export { createSourceIngestionPipeline } from "./source-ingestion.js";

export type TriageStub = (input: {
  item: InboxItem;
  rawContent: RawContent;
}) => Promise<TriageDecision> | TriageDecision;

export interface InboxTriageEngineDeps {
  db: AppDatabase;
  llm?: unknown;
  ingestionPipeline: SourceIngestionPipeline;
  triageStub?: TriageStub;
}

const AUDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function createInboxTriageEngine(
  deps: InboxTriageEngineDeps,
): InboxTriageEngine {
  void deps.llm;
  const triage = deps.triageStub ?? createDefaultTriageStub(deps.db);

  return {
    deposit: async (input) => {
      const capturedAt = input.capturedAt ?? new Date();
      const itemId = randomUUID();
      const [created] = await deps.db
        .insert(schema.inboxItems)
        .values({
          id: itemId,
          rawContentRef: encodeRawContentRef(input.rawContent),
          contentType: input.rawContent.type,
          captureSurface: input.captureSurface,
          status: "captured",
          depositedAt: capturedAt,
          lastActionAt: capturedAt,
        })
        .returning();

      if (created === undefined) {
        throw new Error("inbox deposit failed");
      }

      return {
        itemId: created.id,
        status: asInboxStatus(created.status),
      };
    },

    getItem: async (itemId) => rowToInboxItem(await readItem(deps.db, itemId)),

    listPending: async () => {
      const rows = await deps.db
        .select()
        .from(schema.inboxItems)
        .where(eq(schema.inboxItems.status, "triaged-pending"))
        .orderBy(asc(schema.inboxItems.depositedAt));

      return rows.map(rowToInboxItem);
    },

    listAuditWindow: async (now) => {
      const cutoff = new Date(now.getTime() - AUDIT_WINDOW_MS);
      const rows = await deps.db
        .select()
        .from(schema.inboxItems)
        .where(
          and(
            eq(schema.inboxItems.status, "triaged-auto"),
            gte(schema.inboxItems.depositedAt, cutoff),
          ),
        )
        .orderBy(asc(schema.inboxItems.depositedAt));

      return rows.map(rowToInboxItem);
    },

    listStale: async () => {
      const rows = await deps.db
        .select()
        .from(schema.inboxItems)
        .where(eq(schema.inboxItems.status, "stale"))
        .orderBy(asc(schema.inboxItems.lastActionAt));

      return rows.map(rowToInboxItem);
    },

    confirmDestination: async (itemId, projectId) => {
      const item = rowToInboxItem(await readItem(deps.db, itemId));

      if (
        item.status === "filed" &&
        item.resolvedProjectId === projectId &&
        item.sourceId !== null
      ) {
        return item;
      }

      if (
        item.status !== "triaged-pending" &&
        item.status !== "triaged-auto"
      ) {
        throw new Error(`cannot confirm inbox item from ${item.status}`);
      }

      const sourceId =
        item.sourceId ??
        (
          await deps.ingestionPipeline.ingest({
            inboxItemId: item.id,
            raw: decodeRawContentRef(item.rawContentRef),
          })
        ).id;
      const now = new Date();
      let updated: InboxItemRow | undefined;

      await deps.db.transaction(async (tx) => {
        [updated] = await tx
          .update(schema.inboxItems)
          .set({
            status: "filed",
            resolvedProjectId: projectId,
            sourceId,
            filedAt: now,
            lastActionAt: now,
          })
          .where(eq(schema.inboxItems.id, itemId))
          .returning();

        await tx
          .update(schema.sources)
          .set({ projectId, lastReferencedAt: now })
          .where(eq(schema.sources.id, sourceId));
      });

      if (updated === undefined) {
        throw new Error("inbox item not found");
      }

      return rowToInboxItem(updated);
    },

    recoverFromStale: async (itemId) => {
      const item = rowToInboxItem(await readItem(deps.db, itemId));
      if (item.status !== "stale") {
        throw new Error(`cannot recover inbox item from ${item.status}`);
      }

      const [updated] = await deps.db
        .update(schema.inboxItems)
        .set({ status: "triaged-pending", lastActionAt: new Date() })
        .where(eq(schema.inboxItems.id, itemId))
        .returning();

      if (updated === undefined) {
        throw new Error("inbox item not found");
      }

      return rowToInboxItem(updated);
    },

    triageItem: async (itemId) => {
      const item = rowToInboxItem(await readItem(deps.db, itemId));
      if (item.status !== "captured" && item.decision !== null) {
        return item.decision;
      }
      if (item.status !== "captured") {
        throw new Error(`cannot triage inbox item from ${item.status}`);
      }

      try {
        const rawContent = decodeRawContentRef(item.rawContentRef);
        const decision = await triage({ item, rawContent });
        const now = new Date();

        if (decision.kind === "auto-filed") {
          const processed = await deps.ingestionPipeline.ingest({
            inboxItemId: item.id,
            raw: rawContent,
          });
          const finalized: TriageDecision = {
            ...decision,
            sourceId: processed.id,
          };

          await deps.db.transaction(async (tx) => {
            await tx
              .update(schema.sources)
              .set({
                projectId: finalized.projectId,
                lastReferencedAt: now,
              })
              .where(eq(schema.sources.id, finalized.sourceId));

            await tx
              .update(schema.inboxItems)
              .set({
                status: "triaged-auto",
                decisionKind: finalized.kind,
                decisionProjectId: finalized.projectId,
                decisionSourceId: finalized.sourceId,
                confidence: finalized.confidence,
                agentReasoning: finalized.reasoning,
                resolvedProjectId: finalized.projectId,
                sourceId: finalized.sourceId,
                proposedProjectId: finalized.projectId,
                triagedAt: now,
                lastActionAt: now,
              })
              .where(eq(schema.inboxItems.id, itemId));
          });

          return finalized;
        }

        await deps.db
          .update(schema.inboxItems)
          .set(updateForPendingDecision(decision, now))
          .where(eq(schema.inboxItems.id, itemId));

        return decision;
      } catch (error) {
        const now = new Date();
        await deps.db
          .update(schema.inboxItems)
          .set({
            status: "triage-failed",
            agentReasoning: errorMessage(error),
            lastActionAt: now,
          })
          .where(eq(schema.inboxItems.id, itemId));
        throw error;
      }
    },

    runAuditWindowSweep: async (now) => {
      const cutoff = new Date(now.getTime() - AUDIT_WINDOW_MS);
      const rows = await deps.db
        .select({ id: schema.inboxItems.id })
        .from(schema.inboxItems)
        .where(
          and(
            eq(schema.inboxItems.status, "triaged-auto"),
            lt(schema.inboxItems.depositedAt, cutoff),
          ),
        );

      const filed: string[] = [];
      for (const row of rows) {
        const [updated] = await deps.db
          .update(schema.inboxItems)
          .set({ status: "filed", filedAt: now, lastActionAt: now })
          .where(eq(schema.inboxItems.id, row.id))
          .returning();
        if (updated !== undefined) {
          filed.push(updated.id);
        }
      }

      return { filed };
    },

    runStaleSweep: async (now) => {
      const cutoff = new Date(now.getTime() - STALE_WINDOW_MS);
      const rows = await deps.db
        .select({ id: schema.inboxItems.id })
        .from(schema.inboxItems)
        .where(
          and(
            eq(schema.inboxItems.status, "triaged-pending"),
            lt(schema.inboxItems.lastActionAt, cutoff),
          ),
        );

      const archived: string[] = [];
      for (const row of rows) {
        const [updated] = await deps.db
          .update(schema.inboxItems)
          .set({ status: "stale", lastActionAt: now })
          .where(eq(schema.inboxItems.id, row.id))
          .returning();
        if (updated !== undefined) {
          archived.push(updated.id);
        }
      }

      return { archived };
    },
  };
}

function createDefaultTriageStub(db: AppDatabase): TriageStub {
  return async () => {
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .orderBy(
        desc(
          sql`coalesce(${schema.projects.nextSessionStarterUpdatedAt}, ${schema.projects.createdAt})`,
        ),
      )
      .limit(1);

    if (project === undefined) {
      return { kind: "no-match", reasoning: "no projects yet" };
    }

    return {
      kind: "proposed",
      projectId: project.id,
      confidence: 0.5,
      reasoning: "stub",
    };
  };
}

async function readItem(
  db: AppDatabase,
  itemId: string,
): Promise<InboxItemRow> {
  const [row] = await db
    .select()
    .from(schema.inboxItems)
    .where(eq(schema.inboxItems.id, itemId))
    .limit(1);

  if (row === undefined) {
    throw new Error("inbox item not found");
  }

  return row;
}

function updateForPendingDecision(
  decision: Exclude<TriageDecision, { kind: "auto-filed" }>,
  triagedAt: Date,
): Partial<typeof schema.inboxItems.$inferInsert> {
  if (decision.kind === "proposed") {
    return {
      status: "triaged-pending",
      decisionKind: decision.kind,
      decisionProjectId: decision.projectId,
      confidence: decision.confidence,
      agentReasoning: decision.reasoning,
      proposedProjectId: decision.projectId,
      triagedAt,
      lastActionAt: triagedAt,
    };
  }

  return {
    status: "triaged-pending",
    decisionKind: decision.kind,
    agentReasoning: decision.reasoning,
    triagedAt,
    lastActionAt: triagedAt,
  };
}

function rowToInboxItem(row: InboxItemRow): InboxItem {
  return {
    id: row.id,
    rawContentRef: row.rawContentRef,
    contentType: asRawContentType(row.contentType),
    captureSurface: asCaptureSurface(row.captureSurface),
    status: asInboxStatus(row.status),
    decision: decisionFromRow(row),
    proposedProjectId: row.proposedProjectId,
    resolvedProjectId: row.resolvedProjectId,
    sourceId: row.sourceId,
    agentReasoning: row.agentReasoning,
    depositedAt: row.depositedAt,
    triagedAt: row.triagedAt,
    filedAt: row.filedAt,
    lastActionAt: row.lastActionAt,
  };
}

function decisionFromRow(row: InboxItemRow): TriageDecision | null {
  switch (row.decisionKind) {
    case null:
      return null;
    case "auto-filed":
      return {
        kind: "auto-filed",
        projectId: required(row.decisionProjectId, "decisionProjectId"),
        sourceId: required(row.decisionSourceId, "decisionSourceId"),
        confidence: required(row.confidence, "confidence"),
        reasoning: required(row.agentReasoning, "agentReasoning"),
      };
    case "proposed":
      return {
        kind: "proposed",
        projectId: required(row.decisionProjectId, "decisionProjectId"),
        confidence: required(row.confidence, "confidence"),
        reasoning: required(row.agentReasoning, "agentReasoning"),
      };
    case "no-match":
      return {
        kind: "no-match",
        reasoning: required(row.agentReasoning, "agentReasoning"),
      };
    default:
      throw new Error(`unknown triage decision: ${row.decisionKind}`);
  }
}

function required<T>(value: T | null, field: string): T {
  if (value === null) {
    throw new Error(`inbox item missing ${field}`);
  }

  return value;
}

export function encodeRawContentRef(rawContent: RawContent): string {
  return `inline-json:${encodeURIComponent(JSON.stringify(rawContent))}`;
}

export function decodeRawContentRef(rawContentRef: string): RawContent {
  const prefix = "inline-json:";
  if (!rawContentRef.startsWith(prefix)) {
    throw new Error("unsupported raw content ref");
  }

  const parsed = JSON.parse(decodeURIComponent(rawContentRef.slice(prefix.length)));
  return asRawContent(parsed);
}

export function rawContentPreview(rawContentRef: string, limit = 80): string {
  try {
    const raw = decodeRawContentRef(rawContentRef);
    const text =
      raw.type === "text"
        ? raw.body
        : raw.type === "url"
          ? raw.url
          : raw.type === "book-reference"
            ? `${raw.author} — ${raw.title}`
            : raw.type;
    return text.length > limit ? text.slice(0, limit) : text;
  } catch {
    return rawContentRef.length > limit
      ? rawContentRef.slice(0, limit)
      : rawContentRef;
  }
}

function asRawContent(value: unknown): RawContent {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("raw content malformed");
  }

  switch (value.type) {
    case "url":
      if (typeof value.url === "string") {
        return { type: "url", url: value.url };
      }
      break;
    case "pdf":
      if (typeof value.blobRef === "string") {
        const raw: Extract<RawContent, { type: "pdf" }> = {
          type: "pdf",
          blobRef: value.blobRef,
        };
        return typeof value.filename === "string"
          ? { ...raw, filename: value.filename }
          : raw;
      }
      break;
    case "text":
      if (typeof value.body === "string") {
        const raw: Extract<RawContent, { type: "text" }> = {
          type: "text",
          body: value.body,
        };
        return typeof value.suppliedTitle === "string"
          ? { ...raw, suppliedTitle: value.suppliedTitle }
          : raw;
      }
      break;
    case "voice-memo":
      if (
        typeof value.audioRef === "string" &&
        typeof value.durationMs === "number"
      ) {
        return {
          type: "voice-memo",
          audioRef: value.audioRef,
          durationMs: value.durationMs,
        };
      }
      break;
    case "image":
      if (typeof value.imageRef === "string") {
        return { type: "image", imageRef: value.imageRef };
      }
      break;
    case "book-reference":
      if (typeof value.title === "string" && typeof value.author === "string") {
        const raw: Extract<RawContent, { type: "book-reference" }> = {
          type: "book-reference",
          title: value.title,
          author: value.author,
        };
        return typeof value.notes === "string"
          ? { ...raw, notes: value.notes }
          : raw;
      }
      break;
  }

  throw new Error("raw content malformed");
}

function asRawContentType(value: string): RawContent["type"] {
  if (
    value === "url" ||
    value === "pdf" ||
    value === "text" ||
    value === "voice-memo" ||
    value === "image" ||
    value === "book-reference"
  ) {
    return value;
  }

  throw new Error(`unknown content type: ${value}`);
}

function asCaptureSurface(value: string): CaptureSurface {
  if (
    value === "ios-share-sheet" ||
    value === "ios-app-dump" ||
    value === "ios-voice-memo" ||
    value === "web-drag-drop" ||
    value === "web-paste" ||
    value === "web-book-form"
  ) {
    return value;
  }

  throw new Error(`unknown capture surface: ${value}`);
}

function asInboxStatus(value: string): InboxItemStatus {
  if (
    value === "captured" ||
    value === "triage-failed" ||
    value === "triaged-auto" ||
    value === "triaged-pending" ||
    value === "filed" ||
    value === "stale"
  ) {
    return value;
  }

  throw new Error(`unknown inbox status: ${value}`);
}

function randomUUID(): string {
  return (
    globalThis as unknown as { crypto: { randomUUID: () => string } }
  ).crypto.randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
