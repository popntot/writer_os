import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  createPgliteClient,
  schema,
  type PgliteHandle,
} from "@writer-os/db";
import {
  createInboxTriageEngine,
  createSourceIngestionPipeline,
  type TriageStub,
} from "@writer-os/inbox";
import type {
  ChatOptions,
  ChatResult,
  LLMClient,
  LLMStream,
} from "@writer-os/llm";
import { createApp } from "../src/index.js";
import type { Env } from "../src/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const env: Env = {
  WRITER_OS_API_SECRET: "test-secret",
  DATABASE_URL: "postgres://unused",
  ANTHROPIC_API_KEY: "test-anthropic-key",
  ENVIRONMENT: "test",
};

let handle: PgliteHandle;
let app: ReturnType<typeof createApp>;

function buildRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, init);
}

function authHeader(secret = env.WRITER_OS_API_SECRET): HeadersInit {
  return { Authorization: `Bearer ${secret}` };
}

function jsonHeaders(secret = env.WRITER_OS_API_SECRET): HeadersInit {
  return { ...authHeader(secret), "Content-Type": "application/json" };
}

function createNoopLLM(): LLMClient {
  const result: ChatResult = {
    text: "",
    usage: {
      model: "test",
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      costUsd: 0,
      durationMs: 0,
    },
  };

  return {
    chat: async (_opts: ChatOptions): Promise<ChatResult> => result,
    stream: (_opts: ChatOptions): LLMStream => ({
      done: Promise.resolve(result),
      async *[Symbol.asyncIterator](): AsyncIterator<string> {},
    }),
  };
}

function createJsonLLM(
  responseForCall: (opts: ChatOptions) => string | Promise<string>,
  onCall?: () => void,
): LLMClient {
  const resultForText = (text: string): ChatResult => ({
    text,
    usage: {
      model: "test",
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      costUsd: 0,
      durationMs: 0,
    },
  });

  return {
    chat: async (opts: ChatOptions): Promise<ChatResult> => {
      onCall?.();
      return resultForText(await responseForCall(opts));
    },
    stream: (_opts: ChatOptions): LLMStream => {
      const result = resultForText("");
      return {
        done: Promise.resolve(result),
        async *[Symbol.asyncIterator](): AsyncIterator<string> {},
      };
    },
  };
}

function createThrowingLLM(onCall?: () => void): LLMClient {
  return {
    chat: async (_opts: ChatOptions): Promise<ChatResult> => {
      onCall?.();
      throw new Error("triage model unavailable");
    },
    stream: (_opts: ChatOptions): LLMStream => ({
      done: Promise.reject(new Error("triage model unavailable")),
      async *[Symbol.asyncIterator](): AsyncIterator<string> {},
    }),
  };
}

async function applyMigrations(): Promise<void> {
  const migrationsDir = resolve(
    __dirname,
    "../../../packages/db/src/migrations",
  );
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const runSql = handle.pglite["exec"].bind(handle.pglite);
  for (const file of migrationFiles) {
    const migrationSql = await readFile(resolve(migrationsDir, file), "utf8");
    await runSql(migrationSql);
  }
}

function createTestEngine(triageStub?: TriageStub) {
  return createInboxTriageEngine({
    db: handle.db,
    ingestionPipeline: createSourceIngestionPipeline({ db: handle.db }),
    ...(triageStub !== undefined ? { triageStub } : {}),
  });
}

function createRealTriageEngine(
  llm: LLMClient,
  thresholds: { highConfidence?: number; lowConfidence?: number } = {},
) {
  return createInboxTriageEngine({
    db: handle.db,
    llm,
    ingestionPipeline: createSourceIngestionPipeline({ db: handle.db }),
    ...thresholds,
  });
}

async function createProject(title: string): Promise<string> {
  const [project] = await handle.db
    .insert(schema.projects)
    .values({ title })
    .returning({ id: schema.projects.id });

  if (project === undefined) {
    throw new Error("failed to create project");
  }

  return project.id;
}

async function createSource(projectId: string, title: string): Promise<string> {
  const [source] = await handle.db
    .insert(schema.sources)
    .values({
      projectId,
      type: "text",
      title,
      cachedContentRef: `seed:${title}`,
    })
    .returning({ id: schema.sources.id });

  if (source === undefined) {
    throw new Error("failed to create source");
  }

  return source.id;
}

async function sourceCount(): Promise<number> {
  return (await handle.db.select({ id: schema.sources.id }).from(schema.sources))
    .length;
}

async function depositText(body = "A note worth triaging."): Promise<string> {
  const response = await app.fetch(
    buildRequest("/inbox", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        rawContent: { type: "text", body },
        captureSurface: "ios-app-dump",
      }),
    }),
    env,
  );
  const responseBody = (await response.json()) as { itemId: string };
  return responseBody.itemId;
}

async function readInboxItem(itemId: string) {
  const [item] = await handle.db
    .select()
    .from(schema.inboxItems)
    .where(eq(schema.inboxItems.id, itemId))
    .limit(1);

  if (item === undefined) {
    throw new Error("inbox item not found");
  }

  return item;
}

beforeEach(async () => {
  handle = await createPgliteClient();
  await applyMigrations();
  app = createApp(handle.db, createNoopLLM());
});

afterEach(async () => {
  await handle.close();
});

describe("Writer OS API inbox", () => {
  test("deposit text returns 201 and itemId, item exists in captured status", async () => {
    const response = await app.fetch(
      buildRequest("/inbox", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({
          rawContent: { type: "text", body: "first dump" },
          captureSurface: "ios-app-dump",
        }),
      }),
      env,
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      itemId: string;
      status: string;
    };
    expect(body).toEqual({ itemId: expect.any(String), status: "captured" });
    expect((await readInboxItem(body.itemId)).status).toBe("captured");
  });

  test("listPending returns empty until triage runs", async () => {
    await depositText();

    const response = await app.fetch(
      buildRequest("/inbox/pending", { headers: authHeader() }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("triageItem with stubbed LLM transitions item to triaged-pending and writes a decision with confidence 0.5", async () => {
    const projectId = await createProject("Recent project");
    const itemId = await depositText();
    const engine = createTestEngine();

    const decision = await engine.triageItem(itemId);
    const item = await readInboxItem(itemId);

    expect(decision).toEqual({
      kind: "proposed",
      projectId,
      confidence: 0.5,
      reasoning: "stub",
    });
    expect(item.status).toBe("triaged-pending");
    expect(item.decisionKind).toBe("proposed");
    expect(item.decisionProjectId).toBe(projectId);
    expect(item.confidence).toBe(0.5);
    expect(item.agentReasoning).toBe("stub");
  });

  test("listPending returns the item after triage", async () => {
    await createProject("Pending project");
    const itemId = await depositText("pending body");
    await createTestEngine().triageItem(itemId);

    const response = await app.fetch(
      buildRequest("/inbox/pending", { headers: authHeader() }),
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as Array<{
      id: string;
      status: string;
      contentPreview: string;
    }>;
    expect(body).toHaveLength(1);
    const pending = body[0];
    if (pending === undefined) {
      throw new Error("expected one pending item");
    }
    expect(pending).toMatchObject({
      id: itemId,
      status: "triaged-pending",
      contentPreview: "pending body",
    });
  });

  test("confirmDestination with the proposed projectId creates a sources row, sets status to filed, populates resolvedProjectId and sourceId", async () => {
    const projectId = await createProject("Confirm project");
    const itemId = await depositText("confirm this note");
    await createTestEngine().triageItem(itemId);

    const response = await app.fetch(
      buildRequest(`/inbox/${itemId}/confirm`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ projectId }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      status: string;
      resolvedProjectId: string;
      sourceId: string;
    };
    expect(body.status).toBe("filed");
    expect(body.resolvedProjectId).toBe(projectId);
    expect(body.sourceId).toEqual(expect.any(String));

    const [source] = await handle.db
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.id, body.sourceId))
      .limit(1);
    expect(source).toMatchObject({
      projectId,
      type: "text",
      cachedContentRef: `inline:${body.sourceId}`,
    });
  });

  test("confirmDestination with a different projectId overrides and files to the override", async () => {
    const proposedProjectId = await createProject("Proposed project");
    const overrideProjectId = await createProject("Override project");
    const itemId = await depositText("override this note");
    await createTestEngine(async () => ({
      kind: "proposed",
      projectId: proposedProjectId,
      confidence: 0.5,
      reasoning: "stub",
    })).triageItem(itemId);

    const response = await app.fetch(
      buildRequest(`/inbox/${itemId}/confirm`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ projectId: overrideProjectId }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      resolvedProjectId: string;
      sourceId: string;
    };
    expect(body.resolvedProjectId).toBe(overrideProjectId);

    const [source] = await handle.db
      .select({ projectId: schema.sources.projectId })
      .from(schema.sources)
      .where(eq(schema.sources.id, body.sourceId))
      .limit(1);
    expect(source?.projectId).toBe(overrideProjectId);
  });

  test("triageItem is idempotent: second call returns the same decision without re-invoking the stub", async () => {
    const projectId = await createProject("Idempotent project");
    const itemId = await depositText();
    let calls = 0;
    const engine = createTestEngine(async () => {
      calls += 1;
      return {
        kind: "proposed",
        projectId,
        confidence: 0.5,
        reasoning: "stub",
      };
    });

    const first = await engine.triageItem(itemId);
    const second = await engine.triageItem(itemId);

    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });

  test("runAuditWindowSweep transitions triaged-auto items past depositedAt + 7d to filed", async () => {
    const projectId = await createProject("Audit project");
    const sourceId = crypto.randomUUID();
    const itemId = crypto.randomUUID();
    const depositedAt = new Date("2026-05-01T00:00:00.000Z");
    const now = new Date("2026-05-09T00:00:00.000Z");

    await handle.db.insert(schema.sources).values({
      id: sourceId,
      projectId,
      type: "text",
      title: "Audit source",
      cachedContentRef: `inline:${sourceId}`,
      firstSeenAt: depositedAt,
      lastReferencedAt: depositedAt,
    });
    await handle.db.insert(schema.inboxItems).values({
      id: itemId,
      rawContentRef:
        "inline-json:%7B%22type%22%3A%22text%22%2C%22body%22%3A%22auto%22%7D",
      contentType: "text",
      captureSurface: "ios-app-dump",
      status: "triaged-auto",
      decisionKind: "auto-filed",
      decisionProjectId: projectId,
      decisionSourceId: sourceId,
      confidence: 0.9,
      agentReasoning: "auto",
      resolvedProjectId: projectId,
      sourceId,
      proposedProjectId: projectId,
      depositedAt,
      triagedAt: depositedAt,
      lastActionAt: depositedAt,
    });

    const result = await createTestEngine().runAuditWindowSweep(now);

    expect(result).toEqual({ filed: [itemId] });
    const item = await readInboxItem(itemId);
    expect(item.status).toBe("filed");
    expect(item.filedAt?.toISOString()).toBe(now.toISOString());
  });

  test("runStaleSweep transitions triaged-pending items past lastActionAt + 30d to stale", async () => {
    const projectId = await createProject("Stale project");
    const itemId = crypto.randomUUID();
    const lastActionAt = new Date("2026-05-01T00:00:00.000Z");
    const now = new Date("2026-06-01T00:00:00.000Z");

    await handle.db.insert(schema.inboxItems).values({
      id: itemId,
      rawContentRef:
        "inline-json:%7B%22type%22%3A%22text%22%2C%22body%22%3A%22pending%22%7D",
      contentType: "text",
      captureSurface: "ios-app-dump",
      status: "triaged-pending",
      decisionKind: "proposed",
      decisionProjectId: projectId,
      confidence: 0.5,
      agentReasoning: "stub",
      proposedProjectId: projectId,
      depositedAt: lastActionAt,
      triagedAt: lastActionAt,
      lastActionAt,
    });

    const result = await createTestEngine().runStaleSweep(now);

    expect(result).toEqual({ archived: [itemId] });
    expect((await readInboxItem(itemId)).status).toBe("stale");
  });

  test("real LLM high-confidence triage auto-files, creates a source, and stores reasoning", async () => {
    const projectId = await createProject("High confidence project");
    await createSource(projectId, "Existing high-confidence source");
    const beforeSources = await sourceCount();
    const itemId = await depositText("This belongs in the high confidence project.");
    const engine = createRealTriageEngine(
      createJsonLLM(() =>
        JSON.stringify({
          project_id: projectId,
          confidence: 0.91,
          reasoning: "The note directly matches the seeded project.",
        }),
      ),
    );

    const decision = await engine.triageItem(itemId);
    const item = await readInboxItem(itemId);

    expect(decision.kind).toBe("auto-filed");
    expect(decision).toMatchObject({
      projectId,
      confidence: 0.91,
      reasoning: "The note directly matches the seeded project.",
    });
    expect(decision.kind === "auto-filed" ? decision.sourceId : null).toEqual(
      expect.any(String),
    );
    expect(item.status).toBe("triaged-auto");
    expect(item.sourceId).toEqual(expect.any(String));
    expect(item.agentReasoning).toBe(
      "The note directly matches the seeded project.",
    );
    expect(await sourceCount()).toBe(beforeSources + 1);
  });

  test("real LLM low-confidence triage proposes a project without creating a source", async () => {
    const projectId = await createProject("Low confidence project");
    await createSource(projectId, "Existing low-confidence source");
    const beforeSources = await sourceCount();
    const itemId = await depositText("This might fit the low confidence project.");
    const engine = createRealTriageEngine(
      createJsonLLM(() =>
        JSON.stringify({
          project_id: projectId,
          confidence: 0.65,
          reasoning: "Some overlap, but not enough to auto-file.",
        }),
      ),
    );

    const decision = await engine.triageItem(itemId);
    const item = await readInboxItem(itemId);

    expect(decision).toEqual({
      kind: "proposed",
      projectId,
      confidence: 0.65,
      reasoning: "Some overlap, but not enough to auto-file.",
    });
    expect(item.status).toBe("triaged-pending");
    expect(item.proposedProjectId).toBe(projectId);
    expect(item.sourceId).toBeNull();
    expect(item.agentReasoning).toBe("Some overlap, but not enough to auto-file.");
    expect(await sourceCount()).toBe(beforeSources);
  });

  test("real LLM below-low-confidence triage records no-match without creating a source", async () => {
    const projectId = await createProject("No match project");
    await createSource(projectId, "Existing no-match source");
    const beforeSources = await sourceCount();
    const itemId = await depositText("This is too ambiguous to file.");
    const engine = createRealTriageEngine(
      createJsonLLM(() =>
        JSON.stringify({
          project_id: projectId,
          confidence: 0.31,
          reasoning: "The candidate is too weak.",
        }),
      ),
    );

    const decision = await engine.triageItem(itemId);
    const item = await readInboxItem(itemId);

    expect(decision).toEqual({
      kind: "no-match",
      reasoning: "The candidate is too weak.",
    });
    expect(item.status).toBe("triaged-pending");
    expect(item.proposedProjectId).toBeNull();
    expect(item.sourceId).toBeNull();
    expect(item.agentReasoning).toBe("The candidate is too weak.");
    expect(await sourceCount()).toBe(beforeSources);
  });

  test("real LLM triage is idempotent and does not reinvoke the LLM after a decision exists", async () => {
    const projectId = await createProject("Real idempotent project");
    await createSource(projectId, "Existing idempotent source");
    const itemId = await depositText("idempotent body");
    let calls = 0;
    const engine = createRealTriageEngine(
      createJsonLLM(
        () =>
          JSON.stringify({
            project_id: projectId,
            confidence: 0.66,
            reasoning: "First pass only.",
          }),
        () => {
          calls += 1;
        },
      ),
    );

    const first = await engine.triageItem(itemId);
    const second = await engine.triageItem(itemId);

    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });

  test("runAuditWindowSweep leaves boundary items and files post-boundary items", async () => {
    const projectId = await createProject("Audit boundary project");
    const boundarySourceId = crypto.randomUUID();
    const postBoundarySourceId = crypto.randomUUID();
    const boundaryItemId = crypto.randomUUID();
    const postBoundaryItemId = crypto.randomUUID();
    const now = new Date("2026-05-08T00:00:00.000Z");
    const boundaryDepositedAt = new Date("2026-05-01T00:00:00.000Z");
    const postBoundaryDepositedAt = new Date("2026-04-30T23:59:59.999Z");

    await handle.db.insert(schema.sources).values([
      {
        id: boundarySourceId,
        projectId,
        type: "text",
        title: "Boundary source",
        cachedContentRef: `inline:${boundarySourceId}`,
        firstSeenAt: boundaryDepositedAt,
        lastReferencedAt: boundaryDepositedAt,
      },
      {
        id: postBoundarySourceId,
        projectId,
        type: "text",
        title: "Post-boundary source",
        cachedContentRef: `inline:${postBoundarySourceId}`,
        firstSeenAt: postBoundaryDepositedAt,
        lastReferencedAt: postBoundaryDepositedAt,
      },
    ]);
    await handle.db.insert(schema.inboxItems).values([
      {
        id: boundaryItemId,
        rawContentRef:
          "inline-json:%7B%22type%22%3A%22text%22%2C%22body%22%3A%22boundary%22%7D",
        contentType: "text",
        captureSurface: "ios-app-dump",
        status: "triaged-auto",
        decisionKind: "auto-filed",
        decisionProjectId: projectId,
        decisionSourceId: boundarySourceId,
        confidence: 0.9,
        agentReasoning: "boundary",
        resolvedProjectId: projectId,
        sourceId: boundarySourceId,
        proposedProjectId: projectId,
        depositedAt: boundaryDepositedAt,
        triagedAt: boundaryDepositedAt,
        lastActionAt: boundaryDepositedAt,
      },
      {
        id: postBoundaryItemId,
        rawContentRef:
          "inline-json:%7B%22type%22%3A%22text%22%2C%22body%22%3A%22post%22%7D",
        contentType: "text",
        captureSurface: "ios-app-dump",
        status: "triaged-auto",
        decisionKind: "auto-filed",
        decisionProjectId: projectId,
        decisionSourceId: postBoundarySourceId,
        confidence: 0.9,
        agentReasoning: "post-boundary",
        resolvedProjectId: projectId,
        sourceId: postBoundarySourceId,
        proposedProjectId: projectId,
        depositedAt: postBoundaryDepositedAt,
        triagedAt: postBoundaryDepositedAt,
        lastActionAt: postBoundaryDepositedAt,
      },
    ]);

    const result = await createTestEngine().runAuditWindowSweep(now);

    expect(result).toEqual({ filed: [postBoundaryItemId] });
    expect((await readInboxItem(boundaryItemId)).status).toBe("triaged-auto");
    expect((await readInboxItem(postBoundaryItemId)).status).toBe("filed");
  });

  test("runStaleSweep leaves boundary items and archives post-boundary items", async () => {
    const projectId = await createProject("Stale boundary project");
    const boundaryItemId = crypto.randomUUID();
    const postBoundaryItemId = crypto.randomUUID();
    const now = new Date("2026-05-31T00:00:00.000Z");
    const boundaryLastActionAt = new Date("2026-05-01T00:00:00.000Z");
    const postBoundaryLastActionAt = new Date("2026-04-30T23:59:59.999Z");

    await handle.db.insert(schema.inboxItems).values([
      {
        id: boundaryItemId,
        rawContentRef:
          "inline-json:%7B%22type%22%3A%22text%22%2C%22body%22%3A%22boundary%22%7D",
        contentType: "text",
        captureSurface: "ios-app-dump",
        status: "triaged-pending",
        decisionKind: "proposed",
        decisionProjectId: projectId,
        confidence: 0.6,
        agentReasoning: "boundary",
        proposedProjectId: projectId,
        depositedAt: boundaryLastActionAt,
        triagedAt: boundaryLastActionAt,
        lastActionAt: boundaryLastActionAt,
      },
      {
        id: postBoundaryItemId,
        rawContentRef:
          "inline-json:%7B%22type%22%3A%22text%22%2C%22body%22%3A%22post%22%7D",
        contentType: "text",
        captureSurface: "ios-app-dump",
        status: "triaged-pending",
        decisionKind: "proposed",
        decisionProjectId: projectId,
        confidence: 0.6,
        agentReasoning: "post-boundary",
        proposedProjectId: projectId,
        depositedAt: postBoundaryLastActionAt,
        triagedAt: postBoundaryLastActionAt,
        lastActionAt: postBoundaryLastActionAt,
      },
    ]);

    const result = await createTestEngine().runStaleSweep(now);

    expect(result).toEqual({ archived: [postBoundaryItemId] });
    expect((await readInboxItem(boundaryItemId)).status).toBe(
      "triaged-pending",
    );
    expect((await readInboxItem(postBoundaryItemId)).status).toBe("stale");
  });

  test("LLM failure marks the item triage-failed and preserves the error reasoning", async () => {
    await createProject("Failure project");
    const itemId = await depositText("this will fail");
    let calls = 0;
    const engine = createRealTriageEngine(
      createThrowingLLM(() => {
        calls += 1;
      }),
    );

    await expect(engine.triageItem(itemId)).rejects.toThrow(
      "triage model unavailable",
    );

    const item = await readInboxItem(itemId);
    expect(calls).toBe(1);
    expect(item.status).toBe("triage-failed");
    expect(item.agentReasoning).toBe("triage model unavailable");
  });
});
