/**
 * TrueLineStore — locked interface.
 * Source: docs/interfaces/trueline-store.md
 */

import type { ProjectId, SessionId } from "./domain.js";

export type TrueLineVersion = number;

export interface TrueLineDocument {
  projectId: ProjectId;
  version: TrueLineVersion;
  content: string;
  sourceSessionId: SessionId | null;
  committedAt: Date;
  contributionSummary: string | null;
}

export interface TrueLineVersionMeta {
  projectId: ProjectId;
  version: TrueLineVersion;
  sourceSessionId: SessionId | null;
  committedAt: Date;
  contributionSummary: string | null;
}

export interface TrueLineStore {
  read(projectId: ProjectId): Promise<TrueLineDocument>;

  readVersion(
    projectId: ProjectId,
    version: TrueLineVersion,
  ): Promise<TrueLineDocument | null>;

  listVersions(projectId: ProjectId): Promise<TrueLineVersionMeta[]>;

  currentVersion(projectId: ProjectId): Promise<TrueLineVersion>;

  applyDelta(input: {
    projectId: ProjectId;
    sourceSessionId: SessionId;
    newContent: string;
    contributionSummary?: string;
  }): Promise<TrueLineDocument>;
}
