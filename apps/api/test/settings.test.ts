import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
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

interface SettingsResponse {
  id: string;
  audioCaptureDefault: boolean;
  audioRetentionHotDays: number;
  audioRetentionColdDays: number;
  locationTagDefault: boolean;
  updatedAt: string;
}

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

async function applyMigrations(): Promise<void> {
  const migrationsDir = resolve(
    __dirname,
    "../../../packages/db/src/migrations",
  );
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const migrationSql = await readFile(resolve(migrationsDir, file), "utf8");
    await handle.pglite.exec(migrationSql);
  }
}

async function getSettings(): Promise<SettingsResponse> {
  const response = await app.fetch(
    buildRequest("/settings", { headers: authHeader() }),
    env,
  );
  expect(response.status).toBe(200);
  return (await response.json()) as SettingsResponse;
}

beforeEach(async () => {
  handle = await createPgliteClient();
  await applyMigrations();
  app = createApp(handle.db, createNoopLLM());
});

afterEach(async () => {
  await handle.close();
});

describe("Writer OS API settings", () => {
  test("GET /settings returns defaults on fresh DB", async () => {
    const response = await app.fetch(
      buildRequest("/settings", { headers: authHeader() }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: "singleton",
      audioCaptureDefault: false,
      audioRetentionHotDays: 30,
      audioRetentionColdDays: 365,
      locationTagDefault: false,
      updatedAt: expect.any(String),
    });
  });

  test("GET /settings requires auth", async () => {
    const response = await app.fetch(buildRequest("/settings"), env);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("PATCH /settings with audioCaptureDefault updates only that field", async () => {
    const before = await getSettings();
    const response = await app.fetch(
      buildRequest("/settings", {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ audioCaptureDefault: true }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...before,
      audioCaptureDefault: true,
      updatedAt: expect.any(String),
    });
  });

  test("PATCH /settings with invalid body shape returns 400", async () => {
    const response = await app.fetch(
      buildRequest("/settings", {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ audioCaptureDefault: "yes" }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "audioCaptureDefault must be a boolean",
    });
  });

  test("PATCH /settings with hot retention greater than cold returns 400", async () => {
    const response = await app.fetch(
      buildRequest("/settings", {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({
          audioRetentionHotDays: 90,
          audioRetentionColdDays: 30,
        }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error:
        "audioRetentionHotDays must be less than or equal to audioRetentionColdDays",
    });
  });

  test("PATCH /settings is idempotent", async () => {
    const firstResponse = await app.fetch(
      buildRequest("/settings", {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ locationTagDefault: true }),
      }),
      env,
    );
    const first = await firstResponse.json();

    const secondResponse = await app.fetch(
      buildRequest("/settings", {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({ locationTagDefault: true }),
      }),
      env,
    );
    const second = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(second).toEqual(first);
  });

  test("GET after PATCH returns the patched state", async () => {
    const patchResponse = await app.fetch(
      buildRequest("/settings", {
        method: "PATCH",
        headers: jsonHeaders(),
        body: JSON.stringify({
          audioCaptureDefault: true,
          audioRetentionHotDays: 10,
          audioRetentionColdDays: 120,
          locationTagDefault: true,
        }),
      }),
      env,
    );
    expect(patchResponse.status).toBe(200);

    expect(await getSettings()).toMatchObject({
      id: "singleton",
      audioCaptureDefault: true,
      audioRetentionHotDays: 10,
      audioRetentionColdDays: 120,
      locationTagDefault: true,
    });
  });
});
