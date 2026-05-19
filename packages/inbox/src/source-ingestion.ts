import { eq } from "drizzle-orm";
import { schema, type AppDatabase, type SourceRow } from "@writer-os/db";
import type {
  ProcessedSource,
  RawContent,
  SourceIngestionPipeline,
} from "@writer-os/shared-types";

export interface SourceIngestionPipelineDeps {
  db: AppDatabase;
}

export function createSourceIngestionPipeline(
  deps: SourceIngestionPipelineDeps,
): SourceIngestionPipeline {
  return {
    ingest: async (input) => {
      const [item] = await deps.db
        .select()
        .from(schema.inboxItems)
        .where(eq(schema.inboxItems.id, input.inboxItemId))
        .limit(1);

      if (item === undefined) {
        throw new Error("inbox item not found");
      }

      if (item.sourceId !== null) {
        return await readProcessedSource(deps.db, item.sourceId);
      }

      if (input.raw.type !== "text") {
        throw new Error("content type not yet supported");
      }
      const textRaw = input.raw;

      const now = new Date();
      const sourceId = randomUUID();
      let source: SourceRow | undefined;
      await deps.db.transaction(async (tx) => {
        [source] = await tx
          .insert(schema.sources)
          .values({
            id: sourceId,
            projectId: null,
            type: textRaw.type,
            title: titleForText(textRaw),
            originalUri: null,
            cachedContentRef: `inline:${sourceId}`,
            summary: null,
            embeddingDocRef: null,
            firstSeenAt: now,
            lastReferencedAt: now,
          })
          .returning();

        await tx
          .update(schema.inboxItems)
          .set({ sourceId })
          .where(eq(schema.inboxItems.id, input.inboxItemId));
      });

      if (source === undefined) {
        throw new Error("source ingestion failed");
      }

      return rowToProcessedSource(source, input.inboxItemId);
    },

    getProcessedSource: async (sourceId) =>
      await readProcessedSource(deps.db, sourceId),
  };
}

async function readProcessedSource(
  db: AppDatabase,
  sourceId: string,
): Promise<ProcessedSource> {
  const [source] = await db
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.id, sourceId))
    .limit(1);

  if (source === undefined) {
    throw new Error("source not found");
  }

  const [item] = await db
    .select({ id: schema.inboxItems.id })
    .from(schema.inboxItems)
    .where(eq(schema.inboxItems.sourceId, sourceId))
    .limit(1);

  if (item === undefined) {
    throw new Error("source is missing inbox origin");
  }

  return rowToProcessedSource(source, item.id);
}

function rowToProcessedSource(
  source: SourceRow,
  inboxItemId: string,
): ProcessedSource {
  return {
    id: source.id,
    inboxItemId,
    kind: asSourceKind(source.type),
    title: source.title ?? "Untitled source",
    originalUri: source.originalUri,
    cachedContentRef: source.cachedContentRef,
    summary: source.summary,
    embeddingsRef: null,
    ingestedAt: source.firstSeenAt,
  };
}

function titleForText(raw: Extract<RawContent, { type: "text" }>): string {
  const supplied = raw.suppliedTitle?.trim();
  if (supplied !== undefined && supplied.length > 0) {
    return supplied;
  }

  const firstLine = raw.body
    .split(/\r?\n/u)
    .find((line) => line.trim().length > 0)
    ?.trim();
  const fallback = firstLine ?? "Untitled text";

  return fallback.length > 60 ? fallback.slice(0, 60) : fallback;
}

function asSourceKind(value: string): ProcessRowKind {
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

  throw new Error(`unknown source type: ${value}`);
}

type ProcessRowKind = ProcessedSource["kind"];

function randomUUID(): string {
  return (
    globalThis as unknown as { crypto: { randomUUID: () => string } }
  ).crypto.randomUUID();
}
