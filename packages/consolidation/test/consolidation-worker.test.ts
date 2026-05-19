import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  createPgliteClient,
  schema,
  type ApplyDeltaInput,
  type PgliteHandle,
  type Project,
  type Session,
  type TrueLineDocument,
  type TrueLineStore,
} from "@writer-os/db";
import type {
  ChatOptions,
  ChatResult,
  LLMClient,
  UsageEvent,
} from "@writer-os/llm";
import type { ConsolidationOutputForTest } from "./types.js";
import { createConsolidationWorker } from "../src/index.ts";
import { longWalkTurns } from "./fixtures/long-walk.ts";
import { shortWalkTurns } from "./fixtures/short-walk.ts";
import { topicPivotWalkTurns } from "./fixtures/topic-pivot-walk.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface SeededSession {
  projectId: string;
  sessionId: string;
}

interface FixtureCase {
  name: string;
  turns: Array<{ role: "user" | "assistant"; content: string }>;
  output: ConsolidationOutputForTest;
}

let handle: PgliteHandle;

const shortWalkOutput: ConsolidationOutputForTest = {
  trueLine:
    "Attention is the project's core subject: chosen attention beats reactive input.",
  contributionSummary: "Clarified the attention argument.",
  nextSessionStarter:
    "Start by naming the two kinds of attention in one sentence.",
};

const fixtureCases: FixtureCase[] = [
  {
    name: "short-walk",
    turns: shortWalkTurns,
    output: shortWalkOutput,
  },
  {
    name: "long-walk",
    turns: longWalkTurns,
    output: {
      trueLine:
        "The essay argues that creative independence means recommitting to the work without treating readers as gatekeepers.",
      contributionSummary:
        "Built the essay arc from approval-seeking to recommitment.",
      nextSessionStarter:
        "Draft the workshop scene as the midpoint of the approval trap.",
    },
  },
  {
    name: "topic-pivot-walk",
    turns: topicPivotWalkTurns,
    output: {
      trueLine:
        "The project shifted from productivity routines to grief: routine is a container for returning after loss.",
      contributionSummary: "Captured the pivot from discipline to grief.",
      nextSessionStarter:
        "Open with the moment the routine revealed the grief underneath it.",
    },
  },
];

async function applyMigrations(): Promise<void> {
  const migrationsDir = resolve(__dirname, "../../db/src/migrations");
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const migrationSql = await readFile(resolve(migrationsDir, file), "utf8");
    await handle.pglite.exec(migrationSql);
  }
}

async function seedSession(
  turns: Array<{ role: "user" | "assistant"; content: string }>,
): Promise<SeededSession> {
  const [project] = await handle.db
    .insert(schema.projects)
    .values({ title: "Fixture project", type: "essay" })
    .returning();
  if (project === undefined) {
    throw new Error("failed to seed project");
  }

  const [session] = await handle.db
    .insert(schema.sessions)
    .values({
      projectId: project.id,
      endAt: new Date("2026-05-08T12:00:00.000Z"),
    })
    .returning();
  if (session === undefined) {
    throw new Error("failed to seed session");
  }

  await handle.db.insert(schema.sessionTurns).values(
    turns.map((turn, index) => ({
      sessionId: session.id,
      turnIdx: index,
      role: turn.role,
      content: turn.content,
    })),
  );

  return { projectId: project.id, sessionId: session.id };
}

function usage(): UsageEvent {
  return {
    model: "claude-sonnet-4-6",
    inputTokens: 10,
    outputTokens: 20,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    costUsd: 0.01,
    durationMs: 25,
  };
}

class FakeLLM implements LLMClient {
  calls: ChatOptions[] = [];
  nextOutput: ConsolidationOutputForTest;
  error: Error | null = null;

  constructor(output: ConsolidationOutputForTest) {
    this.nextOutput = output;
  }

  async chat(opts: ChatOptions): Promise<ChatResult> {
    this.calls.push(opts);
    if (this.error !== null) {
      throw this.error;
    }
    return { text: JSON.stringify(this.nextOutput), usage: usage() };
  }

  stream(): never {
    throw new Error("stream is not used by ConsolidationWorker");
  }
}

class FakeTrueLineStore implements TrueLineStore {
  applyDeltaCalls: ApplyDeltaInput[] = [];
  current: TrueLineDocument;

  constructor(projectId: string, content = "", version = 0) {
    this.current = {
      projectId,
      version,
      content,
      sourceSessionId: null,
      committedAt: new Date(0),
      contributionSummary: null,
    };
  }

  async read(projectId: string): Promise<TrueLineDocument> {
    return { ...this.current, projectId };
  }

  async readVersion(): Promise<TrueLineDocument | null> {
    return this.current;
  }

  async listVersions(): Promise<TrueLineDocument[]> {
    return [this.current];
  }

  async currentVersion(): Promise<number> {
    return this.current.version;
  }

  async applyDelta(input: ApplyDeltaInput): Promise<TrueLineDocument> {
    this.applyDeltaCalls.push(input);
    this.current = {
      projectId: input.projectId,
      version: this.current.version + 1,
      content: input.newContent,
      sourceSessionId: input.sourceSessionId,
      committedAt: new Date(),
      contributionSummary: input.contributionSummary ?? null,
    };
    return this.current;
  }
}

async function readSession(sessionId: string): Promise<Session> {
  const [session] = await handle.db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);
  if (session === undefined) {
    throw new Error("session not found");
  }
  return session;
}

async function readProject(projectId: string): Promise<Project> {
  const [project] = await handle.db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  if (project === undefined) {
    throw new Error("project not found");
  }
  return project;
}

beforeEach(async () => {
  handle = await createPgliteClient();
  await applyMigrations();
});

afterEach(async () => {
  await handle.close();
});

describe("ConsolidationWorker fixture-driven processSession", () => {
  test.each(fixtureCases)(
    "processSession consolidates $name fixture",
    async ({ turns, output }) => {
      const { projectId, sessionId } = await seedSession(turns);
      const trueLineStore = new FakeTrueLineStore(projectId);
      const llm = new FakeLLM(output);
      const worker = createConsolidationWorker({
        db: handle.db,
        llm,
        trueLineStore,
      });

      const result = await worker.processSession(sessionId);
      const project = await readProject(projectId);
      const session = await readSession(sessionId);

      expect(llm.calls).toHaveLength(1);
      expect(trueLineStore.applyDeltaCalls).toEqual([
        {
          projectId,
          sourceSessionId: sessionId,
          newContent: output.trueLine,
          contributionSummary: output.contributionSummary,
        },
      ]);
      expect(project.nextSessionStarter).toBe(output.nextSessionStarter);
      expect(project.nextSessionStarterUpdatedAt).toBeInstanceOf(Date);
      expect(session.consolidationState).toBe("completed");
      expect(session.consolidationContributionSummary).toBe(
        output.contributionSummary,
      );
      expect(session.consolidationTrueLineVersion).toBe(1);
      expect(session.consolidationCompletedAt).toBeInstanceOf(Date);
      expect(result).toEqual({
        sessionId,
        trueLineVersion: 1,
        openQuestionsOpened: [],
        openQuestionsResolved: [],
        artifactsGenerated: [],
        nextSessionStarterRef: `project:${projectId}:next-session-starter`,
        contributionSummary: output.contributionSummary,
        completedAt: expect.any(Date),
      });
    },
  );

  test("idempotency 2: completed session returns cached result without calling the LLM", async () => {
    const { projectId, sessionId } = await seedSession(shortWalkTurns);
    const completedAt = new Date("2026-05-08T12:30:00.000Z");
    await handle.db
      .update(schema.sessions)
      .set({
        consolidationState: "completed",
        consolidationCompletedAt: completedAt,
        consolidationContributionSummary: "Cached summary",
        consolidationTrueLineVersion: 7,
      })
      .where(eq(schema.sessions.id, sessionId));

    const llm = new FakeLLM(shortWalkOutput);
    const trueLineStore = new FakeTrueLineStore(projectId);
    const worker = createConsolidationWorker({
      db: handle.db,
      llm,
      trueLineStore,
    });

    const result = await worker.processSession(sessionId);

    expect(llm.calls).toHaveLength(0);
    expect(trueLineStore.applyDeltaCalls).toHaveLength(0);
    expect(result).toEqual({
      sessionId,
      trueLineVersion: 7,
      openQuestionsOpened: [],
      openQuestionsResolved: [],
      artifactsGenerated: [],
      nextSessionStarterRef: `project:${projectId}:next-session-starter`,
      contributionSummary: "Cached summary",
      completedAt,
    });
  });

  test("monotonic TrueLine 3: same TrueLine content keeps prior version", async () => {
    const { projectId, sessionId } = await seedSession(shortWalkTurns);
    const prior = "Stable TrueLine";
    const trueLineStore = new FakeTrueLineStore(projectId, prior, 4);
    const llm = new FakeLLM({
      trueLine: prior,
      contributionSummary: "No material TrueLine change.",
      nextSessionStarter: "Continue with the stable thread.",
    });
    const worker = createConsolidationWorker({
      db: handle.db,
      llm,
      trueLineStore,
    });

    const result = await worker.processSession(sessionId);

    expect(result.trueLineVersion).toBe(4);
    expect(trueLineStore.applyDeltaCalls).toHaveLength(0);
  });
});

describe("ConsolidationWorker status transitions", () => {
  test("status transitions 6: legal transitions apply and illegal enqueue/retry calls are no-ops", async () => {
    const { projectId, sessionId } = await seedSession(shortWalkTurns);
    const worker = createConsolidationWorker({
      db: handle.db,
      llm: new FakeLLM(shortWalkOutput),
      trueLineStore: new FakeTrueLineStore(projectId),
    });

    expect(await worker.getStatus(sessionId)).toEqual({ state: "not-started" });

    const queued = await worker.enqueue(sessionId, "manual");
    expect(queued.state).toBe("queued");
    expect(queued).toMatchObject({ trigger: "manual" });

    const stillQueued = await worker.enqueue(sessionId, "session-end");
    expect(stillQueued).toEqual(queued);

    await handle.db
      .update(schema.sessions)
      .set({
        consolidationState: "in-progress",
        consolidationStartedAt: new Date("2026-05-08T12:00:00.000Z"),
        consolidationTrigger: "manual",
      })
      .where(eq(schema.sessions.id, sessionId));
    const inProgressNoop = await worker.enqueue(sessionId, "session-end");
    expect(inProgressNoop.state).toBe("in-progress");
    expect(inProgressNoop).toMatchObject({ trigger: "manual" });

    const completedAt = new Date("2026-05-08T12:05:00.000Z");
    await handle.db
      .update(schema.sessions)
      .set({
        consolidationState: "completed",
        consolidationCompletedAt: completedAt,
        consolidationContributionSummary: "Done",
        consolidationTrueLineVersion: 1,
      })
      .where(eq(schema.sessions.id, sessionId));
    const completedNoop = await worker.retry(sessionId);
    expect(completedNoop.state).toBe("completed");

    await handle.db
      .update(schema.sessions)
      .set({
        consolidationState: "failed",
        consolidationFailedAt: new Date("2026-05-08T12:10:00.000Z"),
        consolidationError: "boom",
        consolidationRetriesRemaining: 2,
        consolidationNextRetryAt: new Date("2026-05-08T12:15:00.000Z"),
      })
      .where(eq(schema.sessions.id, sessionId));
    const retried = await worker.retry(sessionId);
    expect(retried.state).toBe("queued");
    expect(retried).toMatchObject({ trigger: "retry-manual" });
  });

  test("failure visibility 7: LLM failure transitions to failed status", async () => {
    const { projectId, sessionId } = await seedSession(shortWalkTurns);
    const llm = new FakeLLM(shortWalkOutput);
    llm.error = new Error("llm unavailable");
    const worker = createConsolidationWorker({
      db: handle.db,
      llm,
      trueLineStore: new FakeTrueLineStore(projectId),
    });

    await expect(worker.processSession(sessionId)).rejects.toThrow(
      "llm unavailable",
    );

    const status = await worker.getStatus(sessionId);
    expect(status).toMatchObject({
      state: "failed",
      error: "llm unavailable",
      retriesRemaining: 3,
    });
    if (status.state !== "failed") {
      throw new Error("expected failed status");
    }
    expect(status.failedAt).toBeInstanceOf(Date);
    expect(status.nextRetryAt).toBeInstanceOf(Date);
  });
});
