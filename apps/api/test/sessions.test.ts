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
import type {
  SynthesizeOptions,
  TTSResult,
  TTSStream,
  TTSStreamer,
  TTSUsageEvent,
} from "@writer-os/tts";
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

interface SSEEvent {
  event: string;
  data: unknown;
}

interface RecordingLLMOptions {
  deltas?: string[];
  fail?: Error;
}

function buildRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, init);
}

function authHeader(secret = env.WRITER_OS_API_SECRET): HeadersInit {
  return { Authorization: `Bearer ${secret}` };
}

function jsonHeaders(secret = env.WRITER_OS_API_SECRET): HeadersInit {
  return { ...authHeader(secret), "Content-Type": "application/json" };
}

function createRecordingLLM(
  reply: string,
  options: RecordingLLMOptions = {},
): LLMClient {
  const deltas = options.deltas ?? [reply];

  const buildResult = (): ChatResult => ({
    text: deltas.join(""),
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
      if (options.fail) {
        throw options.fail;
      }
      return buildResult();
    },
    stream: (opts: ChatOptions): LLMStream => {
      llmCalls.push(opts);
      const result = buildResult();
      const failure = options.fail;
      let rejectDone!: (error: Error) => void;
      const done = failure
        ? new Promise<ChatResult>((_resolve, reject) => {
            rejectDone = reject;
          })
        : Promise.resolve(result);

      return {
        done,
        async *[Symbol.asyncIterator](): AsyncIterator<string> {
          if (failure) {
            rejectDone(failure);
            throw failure;
          }

          for (const delta of deltas) {
            yield delta;
          }
        },
      };
    },
  };
}

function createStubTTS(options: {
  chunks?: number[][];
  fail?: Error;
} = {}): TTSStreamer {
  const chunks = options.chunks ?? [[1, 2, 3]];
  const usage: TTSUsageEvent = {
    voiceId: "test-voice",
    charactersUsed: 11,
    costUsd: 0.00198,
    durationMs: 7,
  };

  return {
    synthesize: async (_opts: SynthesizeOptions): Promise<TTSResult> => ({
      audio: concatChunks(chunks.map((chunk) => new Uint8Array(chunk))),
      usage,
    }),
    stream: (_opts: SynthesizeOptions): TTSStream => {
      let resolveDone!: (result: TTSResult) => void;
      let rejectDone!: (error: Error) => void;
      const done = new Promise<TTSResult>((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
      });

      return {
        done,
        async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
          const emitted: Uint8Array[] = [];

          for (const chunk of chunks) {
            const bytes = new Uint8Array(chunk);
            emitted.push(bytes);
            yield bytes;
          }

          if (options.fail) {
            rejectDone(options.fail);
            throw options.fail;
          }

          resolveDone({
            audio: concatChunks(emitted),
            usage,
          });
        },
      };
    },
  };
}

async function parseSSE(response: Response): Promise<SSEEvent[]> {
  return parseSSEText(await response.text());
}

function parseSSEText(text: string): SSEEvent[] {
  return text
    .trim()
    .split(/\n\n/)
    .filter((block) => block.length > 0)
    .map((block) => {
      const eventLine = block
        .split("\n")
        .find((line) => line.startsWith("event: "));
      const dataLines = block
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length));

      if (eventLine === undefined) {
        throw new Error(`missing event line in ${block}`);
      }

      return {
        event: eventLine.slice("event: ".length),
        data: JSON.parse(dataLines.join("\n")) as unknown,
      };
    });
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
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

  test("POST /sessions/:sessionId/turn streams text events and records the call", async () => {
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
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const events = await parseSSE(response);
    expect(events).toEqual([
      { event: "text", data: { delta: "Hello from the mentor." } },
      {
        event: "usage",
        data: {
          llm: {
            model: "claude-sonnet-4-6",
            inputTokens: 12,
            outputTokens: 34,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            costUsd: 0.00075,
            durationMs: 5,
          },
          tts: null,
        },
      },
      { event: "done", data: {} },
    ]);
    expect(llmCalls.length).toBe(callsBefore + 1);
    const lastCall = llmCalls[llmCalls.length - 1];
    expect(lastCall?.messages).toEqual([
      { role: "user", content: "Walk me through the next step." },
    ]);
  });

  test("POST /sessions/:sessionId/turn emits Claude deltas as separate text events", async () => {
    const localApp = createApp(
      handle.db,
      createRecordingLLM("", { deltas: ["I ", "think"] }),
    );
    const response = await localApp.fetch(
      buildRequest(`/sessions/${openSessionId}/turn`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ message: "stream" }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    const events = await parseSSE(response);
    expect(events.filter((event) => event.event === "text")).toEqual([
      { event: "text", data: { delta: "I " } },
      { event: "text", data: { delta: "think" } },
    ]);
  });

  test("POST /sessions/:sessionId/turn emits audio events when TTS is wired", async () => {
    const localApp = createApp(
      handle.db,
      createRecordingLLM("", { deltas: ["Talk."] }),
      () => createStubTTS({ chunks: [[0, 255, 42]] }),
    );
    const response = await localApp.fetch(
      buildRequest(`/sessions/${openSessionId}/turn`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ message: "speak" }),
      }),
      { ...env, ELEVENLABS_API_KEY: "test-elevenlabs-key" },
    );

    expect(response.status).toBe(200);
    const events = await parseSSE(response);
    const audioEvent = events.find((event) => event.event === "audio");

    expect(audioEvent?.data).toEqual({
      chunk: expect.any(String),
      format: "pcm_16000",
    });

    const audioData = audioEvent?.data as { chunk: string; format: string };
    expect(decodeBase64(audioData.chunk)).toEqual(new Uint8Array([0, 255, 42]));
    expect(events.find((event) => event.event === "usage")?.data).toEqual({
      llm: expect.objectContaining({ inputTokens: 12, outputTokens: 34 }),
      tts: expect.objectContaining({ voiceId: "test-voice" }),
    });
  });

  test("POST /sessions/:sessionId/turn skips audio when no ElevenLabs key is configured", async () => {
    const localApp = createApp(
      handle.db,
      createRecordingLLM("", { deltas: ["Text only."] }),
      () => createStubTTS({ chunks: [[9, 9, 9]] }),
    );
    const response = await localApp.fetch(
      buildRequest(`/sessions/${openSessionId}/turn`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ message: "no key" }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain("event: audio");
    const events = parseSSEText(raw);
    expect(events.find((event) => event.event === "usage")?.data).toEqual({
      llm: expect.objectContaining({ inputTokens: 12, outputTokens: 34 }),
      tts: null,
    });
  });

  test("POST /sessions/:sessionId/turn emits error then done on Claude error", async () => {
    const localApp = createApp(
      handle.db,
      createRecordingLLM("", { fail: new Error("claude unavailable") }),
      () => createStubTTS({ chunks: [] }),
    );
    const response = await localApp.fetch(
      buildRequest(`/sessions/${openSessionId}/turn`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ message: "fail" }),
      }),
      { ...env, ELEVENLABS_API_KEY: "test-elevenlabs-key" },
    );

    expect(response.status).toBe(200);
    expect(await parseSSE(response)).toEqual([
      { event: "error", data: { message: "claude unavailable" } },
      { event: "done", data: {} },
    ]);
  });

  test("POST /sessions/:sessionId/turn emits TTS error, keeps text, then completes", async () => {
    const localApp = createApp(
      handle.db,
      createRecordingLLM("", { deltas: ["Still ", "thinking."] }),
      () => createStubTTS({ fail: new Error("tts unavailable") }),
    );
    const response = await localApp.fetch(
      buildRequest(`/sessions/${openSessionId}/turn`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ message: "tts fail" }),
      }),
      { ...env, ELEVENLABS_API_KEY: "test-elevenlabs-key" },
    );

    expect(response.status).toBe(200);
    const events = await parseSSE(response);

    expect(events.filter((event) => event.event === "text")).toEqual([
      { event: "text", data: { delta: "Still " } },
      { event: "text", data: { delta: "thinking." } },
    ]);
    expect(events).toContainEqual({
      event: "error",
      data: { message: "tts unavailable" },
    });
    expect(events.at(-2)).toEqual({
      event: "usage",
      data: {
        llm: expect.objectContaining({ inputTokens: 12, outputTokens: 34 }),
        tts: null,
      },
    });
    expect(events.at(-1)).toEqual({ event: "done", data: {} });
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

  test("POST /sessions/:sessionId/turn returns 400 for an empty body", async () => {
    const response = await app.fetch(
      buildRequest(`/sessions/${openSessionId}/turn`, {
        method: "POST",
        headers: jsonHeaders(),
        body: "{}",
      }),
      env,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "message must be a non-empty string",
    });
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
    await parseSSE(response);
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
    await parseSSE(response);
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
