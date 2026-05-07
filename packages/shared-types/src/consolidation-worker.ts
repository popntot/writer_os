/**
 * ConsolidationWorker — locked interface.
 * Source: docs/interfaces/consolidation-worker.md
 */

import type {
  ArticleId,
  DocumentRef,
  OpenQuestionId,
  SessionId,
} from "./domain.js";
import type { TrueLineVersion } from "./trueline-store.js";

export type ArtifactRef = {
  kind: "outline" | "draft-section" | "scratchpad-entry";
  id: string;
  articleId: ArticleId;
};

export type ConsolidationTrigger =
  | "session-end"
  | "manual"
  | "retry-auto"
  | "retry-manual";

export type ConsolidationStatus =
  | { state: "not-started" }
  | { state: "queued"; queuedAt: Date; trigger: ConsolidationTrigger }
  | { state: "in-progress"; startedAt: Date; trigger: ConsolidationTrigger }
  | {
      state: "completed";
      completedAt: Date;
      result: ConsolidationResult;
    }
  | {
      state: "failed";
      failedAt: Date;
      error: string;
      retriesRemaining: number;
      nextRetryAt: Date | null;
    };

export interface ConsolidationResult {
  sessionId: SessionId;
  trueLineVersion: TrueLineVersion;
  openQuestionsOpened: OpenQuestionId[];
  openQuestionsResolved: OpenQuestionId[];
  artifactsGenerated: ArtifactRef[];
  nextSessionStarterRef: DocumentRef;
  contributionSummary: string;
  completedAt: Date;
}

export interface ConsolidationWorker {
  enqueue(
    sessionId: SessionId,
    trigger: ConsolidationTrigger,
  ): Promise<ConsolidationStatus>;

  getStatus(sessionId: SessionId): Promise<ConsolidationStatus>;

  retry(sessionId: SessionId): Promise<ConsolidationStatus>;

  processSession(sessionId: SessionId): Promise<ConsolidationResult>;
}
