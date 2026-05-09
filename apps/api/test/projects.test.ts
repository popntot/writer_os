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
import { eq } from "drizzle-orm";
import { createPgliteClient, schema, type PgliteHandle } from "@writer-os/db";
import type { ChatOptions, ChatResult, LLMClient, LLMStream } from "@writer-os/llm";
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

function createFakeLLM(): LLMClient {
  const result: ChatResult = {
    text: "unused",
    usage: {
      model: "test-model",
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
      async *[Symbol.asyncIterator](): AsyncIterator<string> {
        yield result.text;
      },
    }),
  };
}

async function applyMigrations(): Promise<void> {
  const migrationsDir = resolve(__dirname, "../../../packages/db/src/migrations");
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const migrationSql = await readFile(resolve(migrationsDir, file), "utf8");
    await handle.pglite.exec(migrationSql);
  }
}

beforeAll(async () => {
  handle = await createPgliteClient();
  await applyMigrations();
  app = createApp(handle.db, createFakeLLM());
});

afterAll(async () => {
  await handle.close();
});

describe("Writer OS API projects", () => {
  test("GET /health returns ok without auth", async () => {
    const response = await app.fetch(buildRequest("/health"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("GET /projects without auth returns unauthorized", async () => {
    const response = await app.fetch(buildRequest("/projects"), env);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("GET /projects with wrong secret returns unauthorized", async () => {
    const response = await app.fetch(
      buildRequest("/projects", { headers: authHeader("wrong-secret") }),
      env,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("GET /projects with correct secret returns an empty list initially", async () => {
    const response = await app.fetch(
      buildRequest("/projects", { headers: authHeader() }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("POST /projects with valid body creates a project", async () => {
    const response = await app.fetch(
      buildRequest("/projects", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Essay collection", type: "book" }),
      }),
      env,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: expect.any(String),
      title: "Essay collection",
      type: "book",
      createdAt: expect.any(String),
      archivedAt: null,
      mentorRef: null,
    });
  });

  test("POST /projects with empty title returns bad request", async () => {
    const response = await app.fetch(
      buildRequest("/projects", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      }),
      env,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "title must be a non-empty string",
    });
  });

  test("GET /projects returns the created project", async () => {
    const response = await app.fetch(
      buildRequest("/projects", { headers: authHeader() }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: expect.any(String),
        title: "Essay collection",
        type: "book",
        createdAt: expect.any(String),
        archivedAt: null,
        mentorRef: null,
      },
    ]);
  });

  test("POST /projects/:projectId/sessions exposes previousConsolidation", async () => {
    const projectResponse = await app.fetch(
      buildRequest("/projects", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Race handling fixture" }),
      }),
      env,
    );
    const project = (await projectResponse.json()) as { id: string };

    const firstSessionResponse = await app.fetch(
      buildRequest(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: "{}",
      }),
      env,
    );
    expect(firstSessionResponse.status).toBe(201);
    const firstSession = (await firstSessionResponse.json()) as {
      id: string;
      previousConsolidation: unknown;
    };
    expect(firstSession.previousConsolidation).toBeNull();

    const completedAt = new Date("2026-05-08T12:00:00.000Z");
    await handle.db
      .update(schema.sessions)
      .set({
        endAt: completedAt,
        consolidationState: "completed",
        consolidationCompletedAt: completedAt,
        consolidationContributionSummary: "Previous session wrapped.",
        consolidationTrueLineVersion: 1,
      })
      .where(eq(schema.sessions.id, firstSession.id));

    const secondSessionResponse = await app.fetch(
      buildRequest(`/projects/${project.id}/sessions`, {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: "{}",
      }),
      env,
    );
    expect(secondSessionResponse.status).toBe(201);
    expect(await secondSessionResponse.json()).toMatchObject({
      id: expect.any(String),
      projectId: project.id,
      previousConsolidation: {
        state: "completed",
        completedAt: completedAt.toISOString(),
        result: {
          sessionId: firstSession.id,
          trueLineVersion: 1,
          contributionSummary: "Previous session wrapped.",
          completedAt: completedAt.toISOString(),
        },
      },
    });
  });
});
