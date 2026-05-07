/**
 * Shared domain types used across module interfaces.
 * Lifted from docs/interfaces/ as part of the locked interface review.
 */

export type ProjectId = string;
export type SessionId = string;
export type SourceId = string;
export type OpenQuestionId = string;
export type InboxItemId = string;
export type ArticleId = string;

export type DocumentRef = string;

/**
 * Raw content shared between InboxTriageEngine.deposit and SourceIngestionPipeline.ingest.
 * Single union — the two modules consume the same shape.
 */
export type RawContent =
  | { type: "url"; url: string }
  | { type: "pdf"; blobRef: string; filename?: string }
  | { type: "text"; body: string; suppliedTitle?: string }
  | { type: "voice-memo"; audioRef: string; durationMs: number }
  | { type: "image"; imageRef: string }
  | { type: "book-reference"; title: string; author: string; notes?: string };

export type SourceKind = RawContent["type"];

export type CaptureSurface =
  | "ios-share-sheet"
  | "ios-app-dump"
  | "ios-voice-memo"
  | "web-drag-drop"
  | "web-paste"
  | "web-book-form";
