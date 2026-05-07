/**
 * SourceIngestionPipeline — locked interface.
 * Source: docs/interfaces/source-ingestion-pipeline.md
 */

import type {
  InboxItemId,
  RawContent,
  SourceId,
  SourceKind,
} from "./domain.js";

export interface EmbeddingsRef {
  sourceId: SourceId;
  chunkCount: number;
}

export interface ProcessedSource {
  id: SourceId;
  inboxItemId: InboxItemId;
  kind: SourceKind;
  title: string;
  originalUri: string | null;
  cachedContentRef: string | null;
  summary: string | null;
  embeddingsRef: EmbeddingsRef | null;
  ingestedAt: Date;
}

export interface SourceIngestionPipeline {
  ingest(input: {
    inboxItemId: InboxItemId;
    raw: RawContent;
  }): Promise<ProcessedSource>;

  getProcessedSource(sourceId: SourceId): Promise<ProcessedSource>;
}
