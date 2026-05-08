import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from "vitest";
import { createPgliteClient, type PgliteHandle } from "@writer-os/db";
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
let llmCalls: ChatOptions[];
let projectId: string;
let openSessionId: string;
let endableSessionId: string;

function buildRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, init);
}

function authHeader(secret = env.WRITER_OS_API_SECRET): HeadersInit {
  return { Authorization: `Bearer ${secret}` };
}

function jsonHeaders(secret = env.WRITER_OS_API_SECRET): HeadersInit {
  return { ...authHeader(secret), "Content-Type": "application/json" };
}

function createRecordingLLM(reply: string): LLMClient {
  const buildResult = (): ChatResult => ({
    text: reply,
    usage: {
      model: "claude-sonnet-4-6",
      inputTokens: 12,
      outputTokens: 34,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      costUsd: 0.00075,
      durationMs: 5,
    },
  });

  return {
    chat: async (opts: ChatOptions): Promise<ChatResult> => {
      llmCalls.push(opts);
      return buildResult();
    },
    stream: (opts: ChatOptions): LLMStream => {
      llmCalls.push(opts);
      const result = buildResult();
      return {
        done: Promise.resolve(result),
        async *[Symbol.asyncIterator](): AsyncIterator<string> {
          yield result.text;
        },
      };
    },
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

beforeAll(async () => {
  handle = await createPgliteClient();
  await applyMigrations();
  llmCalls = [];
  app = createApp(handle.db, createRecordingLLM("Hello from the mentor."));

  const projectResponse = await app.fetch(
    buildRequest("/projects", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({ title: "Sessions fixture" }),
    }),
    env,
  );
  const projectBody = (await projectResponse.json()) as { id: string };
  projectId = projectBody.id;

  const openResponse = await app.fetch(
    buildRequest(`/projects/${projectId}/sessions`, {
      method: "POST",
      headers: jsonHeaders(),
      body: "{}",
    }),
    env,
  );
  const openBody = (await openResponse.json()) as { id: string };
  openSessionId = openBody.id;

  const endableResponse = await app.fetch(
    buildRequest(`/projects/${projectId}/sessions`, {
      method: "POST",
      headers: jsonHeaders(),
      body: "{}",
    }),
    env,
  );
  const endableBody = (await endableResponse.json()) as { id: string };
  endableSessionId = endableBody.id;
});

afterAll(async () => {
  await handle.close();
});

describe("Writer OS API sessions", () => {
  test("POST /projects/:projectId/sessions without auth returns 401", async () => {
    const response = await app.fetch(
      buildRequest(`/projects/${projectId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
      env,
    );
    expect(response.status).toBe(401);
  });

  test("POST /projects/:projectId/sessions creates a session", async () => {
    const response = await app.fetch(
      buildRequest(`/projects/${projectId}/sessions`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({}),
      }),
      env,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: expect.any(String),
      projectId,
      targetArticleId: null,
      startAt: expect.any(String),
      endAt: null,
      audioRef: null,
      transcriptRef: null,
      consolidationStatus: "pending",
      summary: null,
    });
  });

  test("POST /projects/:projectId/sessions returns 404 for unknown project", async () => {
    const response = await app.fetch(
      buildRequest(
        "/projects/00000000-0000-0000-0000-000000000000/sessions",
        {
          method: "POST",
          headers: jsonHeaders(),
          body: "{}",
        },
      ),
      env,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "project not found" });
  });

  test("POST /sessions/:sessionId/turn without auth returns 401", async () => {
    const response = await app.fetch(
      buildRequest(`/sessions/${openSessionId}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "hi" }),
      }),
      env,
    );
    expect(response.status).toBe(401);
  });

  test("POST /sessions/:sessionId/turn returns LLM response and records the call", async () => {
    const callsBefore = llmCalls.length;
    const response = await app.fetch(
      buildRequest(`/sessions/${openSessionId}/turn`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ message: "Walk me through the next step." }),
      }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      text: "Hello from the mentor.",
      usage: {
        inputTokens: 12,
        outputTokens: 34,
        costUsd: 0.00075,
      },
    });
    expect(llmCalls.length).toBe(callsBefore + 1);
    const lastCall = llmCalls[llmCalls.length - 1];
    expect(lastCall?.messages).toEqual([
      { role: "user", content: "Walk me through the next step." },
    ]);
  });

  test("POST /sessions/:sessionId/turn returns 404 for unknown session", async () => {
    const response = await app.fetch(
      buildRequest(
        "/sessions/00000000-0000-0000-0000-000000000000/turn",
        {
          method: "POST",
          headers: jsonHeaders(),
          body: JSON.stringify({ message: "hi" }),
        },
      ),
      env,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "session not found" });
  });

  test("POST /sessions/:sessionId/end without auth returns 401", async () => {
    const response = await app.fetch(
      buildRequest(`/sessions/${endableSessionId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
      env,
    );
    expect(response.status).toBe(401);
  });

  test("POST /sessions/:sessionId/end sets end_at and second call returns 409", async () => {
    const firstResponse = await app.fetch(
      buildRequest(`/sessions/${endableSessionId}/end`, {
        method: "POST",
        headers: jsonHeaders(),
      }),
      env,
    );
    expect(firstResponse.status).toBe(200);
    const firstBody = (await firstResponse.json()) as { endAt: string | null };
    expect(firstBody.endAt).not.toBeNull();

    const secondResponse = await app.fetch(
      buildRequest(`/sessions/${endableSessionId}/end`, {
        method: "POST",
        headers: jsonHeaders(),
      }),
      env,
    );
    expect(secondResponse.status).toBe(409);
    expect(await secondResponse.json()).toEqual({
      error: "session already ended",
    });
  });

  test("POST /sessions/:sessionId/turn on an ended session returns 409", async () => {
    const response = await app.fetch(
      buildRequest(`/sessions/${endableSessionId}/turn`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ message: "still talking?" }),
      }),
      env,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "session already ended" });
  });
});

describe("Writer OS API TrueLine spine round-trip", () => {
  let trueLineProjectId: string;

  async function createProject(): Promise<string> {
    const response = await app.fetch(
      buildRequest("/projects", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ title: "TrueLine fixture" }),
      }),
      env,
    );
    const body = (await response.json()) as { id: string };
    return body.id;
  }

  async function startSession(projectId: string): Promise<string> {
    const response = await app.fetch(
      buildRequest(`/projects/${projectId}/sessions`, {
        method: "POST",
        headers: jsonHeaders(),
        body: "{}",
      }),
      env,
    );
    const body = (await response.json()) as { id: string };
    return body.id;
  }

  test("first session: GET /projects/:id/trueline returns v0 empty document", async () => {
    trueLineProjectId = await createProject();

    const response = await app.fetch(
      buildRequest(`/projects/${trueLineProjectId}/trueline`, {
        headers: authHeader(),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      projectId: trueLineProjectId,
      version: 0,
      content: "",
      sourceSessionId: null,
      committedAt: null,
      contributionSummary: null,
    });
  });

  test("session 1 turn: empty TrueLine surfaces an empty-state system prompt", async () => {
    const sessionId = await startSession(trueLineProjectId);

    const callsBefore = llmCalls.length;
    const response = await app.fetch(
      buildRequest(`/sessions/${sessionId}/turn`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ message: "first turn" }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    const lastCall = llmCalls[callsBefore];
    expect(lastCall?.system).toMatch(/the TrueLine is empty/i);
  });

  test("end session 1 → applyDelta writes a hardcoded v1 delta visible at GET /projects/:id/trueline", async () => {
    const sessionId = await startSession(trueLineProjectId);

    const endResponse = await app.fetch(
      buildRequest(`/sessions/${sessionId}/end`, {
        method: "POST",
        headers: jsonHeaders(),
      }),
      env,
    );
    expect(endResponse.status).toBe(200);

    const trueLineResponse = await app.fetch(
      buildRequest(`/projects/${trueLineProjectId}/trueline`, {
        headers: authHeader(),
      }),
      env,
    );
    expect(trueLineResponse.status).toBe(200);
    const body = (await trueLineResponse.json()) as {
      version: number;
      content: string;
      sourceSessionId: string | null;
      contributionSummary: string | null;
      committedAt: string | null;
    };
    expect(body.version).toBeGreaterThanOrEqual(1);
    expect(body.content).toContain(`Session ${sessionId} ended at`);
    expect(body.sourceSessionId).toBe(sessionId);
    expect(body.contributionSummary).toContain(sessionId);
    expect(body.committedAt).not.toBeNull();
  });

  test("session 2 turn: TrueLine from session 1 is injected into the system prompt", async () => {
    const session2Id = await startSession(trueLineProjectId);

    const callsBefore = llmCalls.length;
    const response = await app.fetch(
      buildRequest(`/sessions/${session2Id}/turn`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ message: "session 2 first message" }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    const lastCall = llmCalls[callsBefore];
    expect(typeof lastCall?.system).toBe("string");
    expect(lastCall?.system).toMatch(/Session [0-9a-f-]+ ended at/i);
  });

  test("GET /projects/:id/trueline 404s for unknown project", async () => {
    const response = await app.fetch(
      buildRequest(
        "/projects/00000000-0000-0000-0000-000000000000/trueline",
        { headers: authHeader() },
      ),
      env,
    );
    expect(response.status).toBe(404);
  });

  test("GET /projects/:id/trueline without auth returns 401", async () => {
    const response = await app.fetch(
      buildRequest(`/projects/${trueLineProjectId}/trueline`),
      env,
    );
    expect(response.status).toBe(401);
  });
});
