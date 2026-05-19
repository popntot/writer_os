import { Hono } from "hono";
import { createConsolidationWorker } from "@writer-os/consolidation";
import { createTrueLineStore, type AppDatabase } from "@writer-os/db";
import {
  createInboxTriageEngine,
  createSourceIngestionPipeline,
} from "@writer-os/inbox";
import type { LLMClient } from "@writer-os/llm";
import { createTTSStreamer, type TTSStreamer } from "@writer-os/tts";
import { createDbForWorker } from "./db.js";
import type { Env } from "./env.js";
import { createLLMForWorker } from "./llm.js";
import { authMiddleware } from "./middleware/auth.js";
import { createHealthRouter } from "./routes/health.js";
import { createInboxRouter } from "./routes/inbox.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createSessionsRouter } from "./routes/sessions.js";

export type TTSStreamerFactory = (env: Env) => TTSStreamer | null;

export function createTTSForWorker(env: Env): TTSStreamer | null {
  const apiKey = env.ELEVENLABS_API_KEY?.trim();

  if (!apiKey) {
    return null;
  }

  return createTTSStreamer({ apiKey });
}

export function createApp(
  db: AppDatabase,
  llm: LLMClient,
  createTTS: TTSStreamerFactory = createTTSForWorker,
): Hono<{ Bindings: Env }> {
  const trueLineStore = createTrueLineStore(db);
  const consolidationWorker = createConsolidationWorker({
    db,
    llm,
    trueLineStore,
  });
  const sourceIngestionPipeline = createSourceIngestionPipeline({ db });
  const inboxEngine = createInboxTriageEngine({
    db,
    llm,
    ingestionPipeline: sourceIngestionPipeline,
  });
  const app = new Hono<{ Bindings: Env }>();
  app.route("/health", createHealthRouter());
  app.use("/projects", authMiddleware);
  app.use("/projects/*", authMiddleware);
  app.use("/inbox", authMiddleware);
  app.use("/inbox/*", authMiddleware);
  app.use("/sessions/*", authMiddleware);
  app.route(
    "/projects",
    createProjectsRouter(db, trueLineStore, consolidationWorker),
  );
  app.route(
    "/",
    createSessionsRouter(db, llm, trueLineStore, createTTS, consolidationWorker),
  );
  app.route("/inbox", createInboxRouter(db, inboxEngine));
  return app;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // postgres-js TCP sockets are pinned to the request that opened them in
    // Cloudflare Workers, so we build the DB client + Hono app per request
    // and schedule connection cleanup via waitUntil.
    const handle = createDbForWorker(env);
    const llm = createLLMForWorker(env);
    const app = createApp(handle.db, llm, createTTSForWorker);
    try {
      return await app.fetch(request, env);
    } finally {
      ctx.waitUntil(handle.close());
    }
  },
};
