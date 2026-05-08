import { and, eq, isNull } from "drizzle-orm";
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

interface CreateSessionInput {
  targetArticleId?: string;
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

const TTS_AUDIO_FORMAT: AudioFormat = "mp3_44100_128";

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

function validateCreateSessionBody(
  body: unknown,
): CreateSessionInput | string {
  if (body === null || body === undefined) {
    return {};
  }

  if (!isRecord(body)) {
    return "request body must be an object";
  }

  if (
    body.targetArticleId !== undefined &&
    typeof body.targetArticleId !== "string"
  ) {
    return "targetArticleId must be a string";
  }

  const targetArticleId =
    typeof body.targetArticleId === "string" &&
    body.targetArticleId.trim().length > 0
      ? body.targetArticleId.trim()
      : undefined;

  return targetArticleId === undefined ? {} : { targetArticleId };
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

function appendHardcodedDelta(
  currentContent: string,
  sessionId: string,
  endedAt: Date,
): string {
  const line = `- Session ${sessionId} ended at ${endedAt.toISOString()}`;
  if (currentContent.trim().length === 0) {
    return line;
  }
  return `${currentContent}\n${line}`;
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

async function drainLLMText(
  llm: LLMClient,
  opts: Parameters<LLMClient["stream"]>[0],
  writer: ReturnType<typeof createSSEWriter>,
): Promise<UsageEvent> {
  const llmStream = llm.stream(opts);

  try {
    for await (const delta of llmStream) {
      await writer.write("text", { delta });
    }

    const result = await llmStream.done;
    return result.usage;
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
): Promise<UsageEvent> {
  try {
    for await (const delta of llmStream) {
      await writer.write("text", { delta });
      queue.push(delta);
    }

    queue.close();
    const result = await llmStream.done;
    return result.usage;
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

export function createSessionsRouter(
  db: AppDatabase,
  llm: LLMClient,
  trueLineStore: TrueLineStore,
  createTTS: TTSStreamerFactory,
): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>();

  router.post("/projects/:projectId/sessions", async (c) => {
    const projectId = c.req.param("projectId");
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);

    if (project === undefined) {
      return c.json({ error: "project not found" }, 404);
    }

    const body = await c.req.json().catch((): null => null);
    const validation = validateCreateSessionBody(body);

    if (typeof validation === "string") {
      return c.json({ error: validation }, 400);
    }

    const [created] = await db
      .insert(schema.sessions)
      .values({
        projectId,
        targetArticleId: validation.targetArticleId ?? null,
        startAt: new Date(),
        consolidationStatus: "pending",
      })
      .returning();

    if (created === undefined) {
      return c.json({ error: "failed to create session" }, 500);
    }

    return c.json(serializeSession(created), 201);
  });

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
          const llmUsage = await drainLLMText(llm, llmOptions, writer);
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
      try {
        llmUsage = await textTask;
      } catch (error) {
        void ttsStream.done.catch(() => undefined);
        void audioTask.catch(() => undefined);
        await writer.write("error", { message: errorMessage(error) });
        await writer.write("done", {});
        return;
      }

      const ttsUsage = await audioTask;
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

    // Hardcoded delta: real LLM-driven consolidation lands in #9. This slice
    // exercises the spine plumbing — TrueLine is read on the next turn's
    // system prompt, so the round-trip is verifiable end-to-end.
    //
    // Write the delta BEFORE marking endAt: if applyDelta fails (e.g. transient
    // postgres-js error), the session stays open and /end is retryable. The
    // alternative (endAt-first) would leave the session half-ended on a failed
    // applyDelta, since the 409 guard then blocks any retry.
    const endedAt = new Date();
    const current = await trueLineStore.read(session.projectId);
    const newContent = appendHardcodedDelta(current.content, sessionId, endedAt);

    await trueLineStore.applyDelta({
      projectId: session.projectId,
      sourceSessionId: sessionId,
      newContent,
      contributionSummary: `Session ${sessionId} ended (hardcoded)`,
    });

    const [updated] = await db
      .update(schema.sessions)
      .set({ endAt: endedAt })
      .where(and(eq(schema.sessions.id, sessionId), isNull(schema.sessions.endAt)))
      .returning();

    if (updated === undefined) {
      return c.json({ error: "session already ended" }, 409);
    }

    return c.json(serializeSession(updated));
  });

  return router;
}
