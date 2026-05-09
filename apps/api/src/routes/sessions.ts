import { and, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import {
  schema,
  type AppDatabase,
  type Session,
  type TrueLineDocument,
  type TrueLineStore,
} from "@writer-os/db";
import type { LLMClient, UsageEvent } from "@writer-os/llm";
import type {
  AudioFormat,
  TTSStreamer,
  TTSUsageEvent,
} from "@writer-os/tts";
import type {
  ConsolidationStatus,
  ConsolidationWorker,
} from "@writer-os/consolidation";
import type { Env } from "../env.js";

interface SessionResponse {
  id: string;
  projectId: string;
  targetArticleId: string | null;
  startAt: string;
  endAt: string | null;
  audioRef: string | null;
  transcriptRef: string | null;
  consolidationStatus: string;
  summary: string | null;
}

interface TurnInput {
  message: string;
}

type TTSStreamerFactory = (env: Env) => TTSStreamer | null;
type StreamEvent = "text" | "audio" | "usage" | "done" | "error";

interface TurnUsageEvent {
  llm: UsageEvent;
  tts: TTSUsageEvent | null;
}

const TTS_AUDIO_FORMAT: AudioFormat = "pcm_16000";

interface EndSessionResponse extends SessionResponse {
  consolidation: ConsolidationStatus;
}


function serializeSession(session: Session): SessionResponse {
  return {
    id: session.id,
    projectId: session.projectId,
    targetArticleId: session.targetArticleId,
    startAt: session.startAt.toISOString(),
    endAt: session.endAt?.toISOString() ?? null,
    audioRef: session.audioRef,
    transcriptRef: session.transcriptRef,
    consolidationStatus: session.consolidationStatus,
    summary: session.summary,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateTurnBody(body: unknown): TurnInput | string {
  if (!isRecord(body)) {
    return "request body must be an object";
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return "message must be a non-empty string";
  }

  return { message: body.message.trim() };
}

function buildSystemPrompt(trueLine: TrueLineDocument): string {
  const header =
    "You are Writer OS, a thinking partner for a writer. Help them sharpen their thinking through dialogue.";

  if (trueLine.version === 0 || trueLine.content.trim().length === 0) {
    return `${header}\n\nThis is the first session for this project; the TrueLine is empty.`;
  }

  return `${header}\n\nTrueLine for this project (canonical understanding so far, version ${trueLine.version}):\n---\n${trueLine.content}\n---`;
}

function hasElevenLabsKey(env: Env): boolean {
  return (env.ELEVENLABS_API_KEY?.trim().length ?? 0) > 0;
}

function createSSEWriter(stream: SSEStreamingApi): {
  write: (event: StreamEvent, payload: unknown) => Promise<void>;
} {
  let chain = Promise.resolve();

  return {
    write(event: StreamEvent, payload: unknown): Promise<void> {
      chain = chain.then(() =>
        stream.writeSSE({
          event,
          data: JSON.stringify(payload),
        }),
      );

      return chain;
    },
  };
}

interface LLMDrainResult {
  usage: UsageEvent;
  fullText: string;
}

async function drainLLMText(
  llm: LLMClient,
  opts: Parameters<LLMClient["stream"]>[0],
  writer: ReturnType<typeof createSSEWriter>,
): Promise<LLMDrainResult> {
  const llmStream = llm.stream(opts);
  let fullText = "";

  try {
    for await (const delta of llmStream) {
      fullText += delta;
      await writer.write("text", { delta });
    }

    const result = await llmStream.done;
    return { usage: result.usage, fullText };
  } catch (error) {
    await llmStream.done.catch(() => undefined);
    throw error;
  }
}

async function drainLLMStream(
  llmStream: ReturnType<LLMClient["stream"]>,
  queue: AsyncQueue<string>,
  writer: ReturnType<typeof createSSEWriter>,
  ttsIterator: AsyncIterator<Uint8Array>,
): Promise<LLMDrainResult> {
  let fullText = "";

  try {
    for await (const delta of llmStream) {
      fullText += delta;
      await writer.write("text", { delta });
      queue.push(delta);
    }

    queue.close();
    const result = await llmStream.done;
    return { usage: result.usage, fullText };
  } catch (error) {
    queue.close();
    await ttsIterator.return?.();
    await llmStream.done.catch(() => undefined);
    throw error;
  }
}

async function drainTTSStream(
  iterator: AsyncIterator<Uint8Array>,
  done: Promise<{ usage: TTSUsageEvent }>,
  writer: ReturnType<typeof createSSEWriter>,
): Promise<TTSUsageEvent | null> {
  try {
    while (true) {
      const next = await iterator.next();
      if (next.done === true) {
        break;
      }

      await writer.write("audio", {
        chunk: encodeBase64(next.value),
        format: TTS_AUDIO_FORMAT,
      });
    }

    const result = await done;
    return result.usage;
  } catch (error) {
    await done.catch(() => undefined);
    await writer.write("error", { message: errorMessage(error) });
    return null;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<() => void> = [];
  private closed = false;

  push(value: T): void {
    if (this.closed) {
      return;
    }

    this.values.push(value);
    this.notify();
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.notify();
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async (): Promise<IteratorResult<T>> => {
        while (this.values.length === 0) {
          if (this.closed) {
            return { done: true, value: undefined };
          }

          await new Promise<void>((resolve) => {
            this.waiters.push(resolve);
          });
        }

        const value = this.values.shift();
        if (value === undefined) {
          throw new Error("async queue value was unexpectedly missing");
        }

        return { done: false, value };
      },
    };
  }

  private notify(): void {
    for (const waiter of this.waiters.splice(0)) {
      waiter();
    }
  }
}

async function persistSessionTurnPair(
  db: AppDatabase,
  input: {
    sessionId: string;
    userContent: string;
    assistantContent: string;
  },
): Promise<void> {
  if (input.assistantContent.trim().length === 0) {
    return;
  }

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        maxTurnIdx: sql<number | null>`max(${schema.sessionTurns.turnIdx})`,
      })
      .from(schema.sessionTurns)
      .where(eq(schema.sessionTurns.sessionId, input.sessionId));
    const baseTurnIdx = (row?.maxTurnIdx ?? -1) + 1;

    await tx.insert(schema.sessionTurns).values([
      {
        sessionId: input.sessionId,
        turnIdx: baseTurnIdx,
        role: "user",
        content: input.userContent,
      },
      {
        sessionId: input.sessionId,
        turnIdx: baseTurnIdx + 1,
        role: "assistant",
        content: input.assistantContent,
      },
    ]);
  });
}

function scheduleConsolidation(
  c: { executionCtx?: ExecutionContext },
  worker: ConsolidationWorker,
  sessionId: string,
): void {
  const processPromise = worker.processSession(sessionId);

  // Hono's c.executionCtx is a getter that throws when no Worker runtime is
  // bound (PGlite tests, plain local invocation), so we can't probe with
  // optional chaining or `!== undefined` — both still trigger the getter.
  let executionCtx: ExecutionContext | undefined;
  try {
    executionCtx = c.executionCtx;
  } catch {
    executionCtx = undefined;
  }

  if (executionCtx !== undefined) {
    executionCtx.waitUntil(processPromise);
    return;
  }

  void processPromise.catch((error: unknown) => {
    console.error("background consolidation failed", error);
  });
}

export function createSessionsRouter(
  db: AppDatabase,
  llm: LLMClient,
  trueLineStore: TrueLineStore,
  createTTS: TTSStreamerFactory,
  worker: ConsolidationWorker,
): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>();

  router.post("/sessions/:sessionId/turn", async (c) => {
    const sessionId = c.req.param("sessionId");
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (session === undefined) {
      return c.json({ error: "session not found" }, 404);
    }

    if (session.endAt !== null) {
      return c.json({ error: "session already ended" }, 409);
    }

    const body = await c.req.json().catch((): null => null);
    const validation = validateTurnBody(body);

    if (typeof validation === "string") {
      return c.json({ error: validation }, 400);
    }

    const trueLine = await trueLineStore.read(session.projectId);
    const llmOptions = {
      system: buildSystemPrompt(trueLine),
      messages: [{ role: "user" as const, content: validation.message }],
    };

    return streamSSE(c, async (stream) => {
      const writer = createSSEWriter(stream);
      const tts = hasElevenLabsKey(c.env) ? createTTS(c.env) : null;

      if (!tts) {
        try {
          const { usage: llmUsage, fullText } = await drainLLMText(
            llm,
            llmOptions,
            writer,
          );
          await persistSessionTurnPair(db, {
            sessionId,
            userContent: validation.message,
            assistantContent: fullText,
          });
          await writer.write("usage", { llm: llmUsage, tts: null });
          await writer.write("done", {});
        } catch (error) {
          await writer.write("error", { message: errorMessage(error) });
          await writer.write("done", {});
        }
        return;
      }

      const queue = new AsyncQueue<string>();
      const llmStream = llm.stream(llmOptions);
      const ttsStream = tts.stream({
        text: queue,
        format: TTS_AUDIO_FORMAT,
        metadata: { sessionId },
      });
      const ttsIterator = ttsStream[Symbol.asyncIterator]();

      const textTask = drainLLMStream(llmStream, queue, writer, ttsIterator);
      const audioTask = drainTTSStream(ttsIterator, ttsStream.done, writer);

      let llmUsage: UsageEvent;
      let fullText: string;
      try {
        ({ usage: llmUsage, fullText } = await textTask);
      } catch (error) {
        void ttsStream.done.catch(() => undefined);
        void audioTask.catch(() => undefined);
        await writer.write("error", { message: errorMessage(error) });
        await writer.write("done", {});
        return;
      }

      const ttsUsage = await audioTask;
      await persistSessionTurnPair(db, {
        sessionId,
        userContent: validation.message,
        assistantContent: fullText,
      });
      const usage: TurnUsageEvent = { llm: llmUsage, tts: ttsUsage };
      await writer.write("usage", usage);
      await writer.write("done", {});
    });
  });

  router.post("/sessions/:sessionId/end", async (c) => {
    const sessionId = c.req.param("sessionId");
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (session === undefined) {
      return c.json({ error: "session not found" }, 404);
    }

    if (session.endAt !== null) {
      return c.json({ error: "session already ended" }, 409);
    }

    const endedAt = new Date();
    const [updated] = await db
      .update(schema.sessions)
      .set({ endAt: endedAt })
      .where(and(eq(schema.sessions.id, sessionId), isNull(schema.sessions.endAt)))
      .returning();

    if (updated === undefined) {
      return c.json({ error: "session already ended" }, 409);
    }

    const consolidation = await worker.enqueue(sessionId, "session-end");
    scheduleConsolidation(
      c as { executionCtx?: ExecutionContext },
      worker,
      sessionId,
    );

    const response: EndSessionResponse = {
      ...serializeSession(updated),
      consolidation,
    };
    return c.json(response);
  });

  router.get("/sessions/:sessionId/consolidation", async (c) => {
    const sessionId = c.req.param("sessionId");
    const [session] = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (session === undefined) {
      return c.json({ error: "session not found" }, 404);
    }

    return c.json({ consolidation: await worker.getStatus(sessionId) });
  });

  router.post("/sessions/:sessionId/consolidation/retry", async (c) => {
    const sessionId = c.req.param("sessionId");
    const [session] = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (session === undefined) {
      return c.json({ error: "session not found" }, 404);
    }

    const before = await worker.getStatus(sessionId);
    const consolidation = await worker.retry(sessionId);

    if (before.state === "failed" && consolidation.state === "queued") {
      scheduleConsolidation(
        c as { executionCtx?: ExecutionContext },
        worker,
        sessionId,
      );
    }

    return c.json({ consolidation });
  });

  return router;
}
