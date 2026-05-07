/**
 * InboxTriageEngine — locked interface.
 * Source: docs/interfaces/inbox-triage-engine.md
 */

import type {
  CaptureSurface,
  InboxItemId,
  ProjectId,
  RawContent,
  SourceId,
  SourceKind,
} from "./domain.js";

export type InboxItemStatus =
  | "captured"
  | "triage-failed"
  | "triaged-auto"
  | "triaged-pending"
  | "filed"
  | "stale";

export type TriageDecision =
  | {
      kind: "auto-filed";
      projectId: ProjectId;
      sourceId: SourceId;
      confidence: number;
      reasoning: string;
    }
  | {
      kind: "proposed";
      projectId: ProjectId;
      confidence: number;
      reasoning: string;
    }
  | { kind: "no-match"; reasoning: string };

export interface InboxItem {
  id: InboxItemId;
  rawContentRef: string;
  contentType: SourceKind;
  captureSurface: CaptureSurface;
  status: InboxItemStatus;
  decision: TriageDecision | null;
  proposedProjectId: ProjectId | null;
  resolvedProjectId: ProjectId | null;
  sourceId: SourceId | null;
  agentReasoning: string | null;
  depositedAt: Date;
  triagedAt: Date | null;
  filedAt: Date | null;
  lastActionAt: Date;
}

export interface InboxTriageEngine {
  deposit(input: {
    rawContent: RawContent;
    captureSurface: CaptureSurface;
    capturedAt?: Date;
  }): Promise<{ itemId: InboxItemId; status: InboxItemStatus }>;

  getItem(itemId: InboxItemId): Promise<InboxItem>;

  listPending(): Promise<InboxItem[]>;

  listAuditWindow(now: Date): Promise<InboxItem[]>;

  listStale(): Promise<InboxItem[]>;

  confirmDestination(
    itemId: InboxItemId,
    projectId: ProjectId,
  ): Promise<InboxItem>;

  recoverFromStale(itemId: InboxItemId): Promise<InboxItem>;

  triageItem(itemId: InboxItemId): Promise<TriageDecision>;

  runAuditWindowSweep(now: Date): Promise<{ filed: InboxItemId[] }>;

  runStaleSweep(now: Date): Promise<{ archived: InboxItemId[] }>;
}
