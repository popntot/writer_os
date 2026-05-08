/**
 * TrueLineStore — Postgres-backed implementation of the locked interface in
 * docs/interfaces/trueline-store.md.
 *
 * Storage today is a single Postgres table (true_line_versions). The locked
 * interface hides the storage split as an internal detail, so a future swap to
 * object storage stays behind this seam.
 *
 * Concurrency is enforced by a UNIQUE primary key (project_id, version): two
 * racing applyDelta calls both compute next = MAX(version) + 1, both attempt to
 * INSERT, and one fails with a unique-violation. We retry the loser, which
 * recomputes MAX and lands at the next slot.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "./client-node.js";
import type { PgliteDb } from "./client-pglite.js";
import * as schema from "./schema.js";

type AppDatabase = Database | PgliteDb;

export interface TrueLineDocument {
  projectId: string;
  version: number;
  content: string;
  sourceSessionId: string | null;
  committedAt: Date;
  contributionSummary: string | null;
}

export interface TrueLineVersionMeta {
  projectId: string;
  version: number;
  sourceSessionId: string | null;
  committedAt: Date;
  contributionSummary: string | null;
}

export interface ApplyDeltaInput {
  projectId: string;
  sourceSessionId: string;
  newContent: string;
  contributionSummary?: string;
}

export interface TrueLineStore {
  read(projectId: string): Promise<TrueLineDocument>;
  readVersion(
    projectId: string,
    version: number,
  ): Promise<TrueLineDocument | null>;
  listVersions(projectId: string): Promise<TrueLineVersionMeta[]>;
  currentVersion(projectId: string): Promise<number>;
  applyDelta(input: ApplyDeltaInput): Promise<TrueLineDocument>;
}

const MAX_APPLY_DELTA_ATTEMPTS = 8;

export function createTrueLineStore(db: AppDatabase): TrueLineStore {
  return {
    read: async (projectId) => {
      const [row] = await db
        .select()
        .from(schema.trueLineVersions)
        .where(eq(schema.trueLineVersions.projectId, projectId))
        .orderBy(desc(schema.trueLineVersions.version))
        .limit(1);

      if (row === undefined) {
        return emptyDocument(projectId);
      }

      return rowToDocument(row);
    },

    readVersion: async (projectId, version) => {
      if (version === 0) {
        return emptyDocument(projectId);
      }

      const [row] = await db
        .select()
        .from(schema.trueLineVersions)
        .where(
          and(
            eq(schema.trueLineVersions.projectId, projectId),
            eq(schema.trueLineVersions.version, version),
          ),
        )
        .limit(1);

      return row === undefined ? null : rowToDocument(row);
    },

    listVersions: async (projectId) => {
      const rows = await db
        .select({
          projectId: schema.trueLineVersions.projectId,
          version: schema.trueLineVersions.version,
          sourceSessionId: schema.trueLineVersions.sourceSessionId,
          committedAt: schema.trueLineVersions.committedAt,
          contributionSummary: schema.trueLineVersions.contributionSummary,
        })
        .from(schema.trueLineVersions)
        .where(eq(schema.trueLineVersions.projectId, projectId))
        .orderBy(desc(schema.trueLineVersions.version));

      return rows.map((row) => ({
        projectId: row.projectId,
        version: row.version,
        sourceSessionId: row.sourceSessionId,
        committedAt: row.committedAt,
        contributionSummary: row.contributionSummary,
      }));
    },

    currentVersion: async (projectId) => {
      const [row] = await db
        .select({ version: schema.trueLineVersions.version })
        .from(schema.trueLineVersions)
        .where(eq(schema.trueLineVersions.projectId, projectId))
        .orderBy(desc(schema.trueLineVersions.version))
        .limit(1);

      return row?.version ?? 0;
    },

    applyDelta: async (input) => {
      let lastError: unknown;

      for (let attempt = 0; attempt < MAX_APPLY_DELTA_ATTEMPTS; attempt += 1) {
        try {
          return await insertNextVersion(db, input);
        } catch (error) {
          if (!isUniqueViolation(error)) {
            throw error;
          }
          lastError = error;
        }
      }

      throw new Error(
        "TrueLineStore.applyDelta: exceeded retry budget on unique-violation",
        { cause: lastError },
      );
    },
  };
}

async function insertNextVersion(
  db: AppDatabase,
  input: ApplyDeltaInput,
): Promise<TrueLineDocument> {
  const aggregateRows = await db
    .select({
      next: sql<number>`COALESCE(MAX(${schema.trueLineVersions.version}), 0) + 1`,
    })
    .from(schema.trueLineVersions)
    .where(eq(schema.trueLineVersions.projectId, input.projectId));

  // Aggregate SELECT with no GROUP BY always yields one row, but TS doesn't
  // know that — unwrap explicitly.
  const aggregate = aggregateRows[0];
  if (aggregate === undefined) {
    throw new Error("TrueLineStore.applyDelta: aggregate query returned no row");
  }
  const next = Number(aggregate.next);

  const [row] = await db
    .insert(schema.trueLineVersions)
    .values({
      projectId: input.projectId,
      version: next,
      content: input.newContent,
      sourceSessionId: input.sourceSessionId,
      contributionSummary: input.contributionSummary ?? null,
    })
    .returning();

  if (row === undefined) {
    throw new Error("TrueLineStore.applyDelta: insert returned no row");
  }

  return rowToDocument(row);
}

function rowToDocument(row: schema.TrueLineVersionRow): TrueLineDocument {
  return {
    projectId: row.projectId,
    version: row.version,
    content: row.content,
    sourceSessionId: row.sourceSessionId,
    committedAt: row.committedAt,
    contributionSummary: row.contributionSummary,
  };
}

function emptyDocument(projectId: string): TrueLineDocument {
  return {
    projectId,
    version: 0,
    content: "",
    sourceSessionId: null,
    committedAt: new Date(0),
    contributionSummary: null,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  if (code === "23505") {
    return true;
  }

  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    (message.includes("duplicate key value") ||
      message.includes("UNIQUE constraint"))
  );
}
