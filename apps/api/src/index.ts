import { Hono } from "hono";
import { createConsolidationWorker } from "@writer-os/consolidation";
import { createTrueLineStore, type AppDatabase } from "@writer-os/db";
import {
  createInboxTriageEngine,
  createSourceIngestionPipeline,
  DEFAULT_TRIAGE_HIGH_CONFIDENCE,
  DEFAULT_TRIAGE_LOW_CONFIDENCE,
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
import { createSettingsRouter } from "./routes/settings.js";
import { createSessionsRouter } from "./routes/sessions.js";

export type TTSStreamerFactory = (env: Env) => TTSStreamer | null;

interface TriageThresholds {
  highConfidence: number;
  lowConfidence: number;
}

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
  thresholds: TriageThresholds = {
    highConfidence: DEFAULT_TRIAGE_HIGH_CONFIDENCE,
    lowConfidence: DEFAULT_TRIAGE_LOW_CONFIDENCE,
  },
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
    highConfidence: thresholds.highConfidence,
    lowConfidence: thresholds.lowConfidence,
  });
  const app = new Hono<{ Bindings: Env }>();
  app.route("/health", createHealthRouter());
  app.use("/projects", authMiddleware);
  app.use("/projects/*", authMiddleware);
  app.use("/inbox", authMiddleware);
  app.use("/inbox/*", authMiddleware);
  app.use("/settings", authMiddleware);
  app.use("/settings/*", authMiddleware);
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
  app.route("/settings", createSettingsRouter(db));
  return app;
}

function parseTriageThresholds(env: Env): TriageThresholds {
  const highConfidence = parseOptionalThreshold(
    env.WRITER_OS_TRIAGE_HIGH_CONFIDENCE,
    DEFAULT_TRIAGE_HIGH_CONFIDENCE,
    "WRITER_OS_TRIAGE_HIGH_CONFIDENCE",
  );
  const lowConfidence = parseOptionalThreshold(
    env.WRITER_OS_TRIAGE_LOW_CONFIDENCE,
    DEFAULT_TRIAGE_LOW_CONFIDENCE,
    "WRITER_OS_TRIAGE_LOW_CONFIDENCE",
  );

  if (lowConfidence > highConfidence) {
    throw new Error(
      "WRITER_OS_TRIAGE_LOW_CONFIDENCE must be less than or equal to WRITER_OS_TRIAGE_HIGH_CONFIDENCE",
    );
  }

  return { highConfidence, lowConfidence };
}

function parseOptionalThreshold(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be a number between 0 and 1`);
  }

  return parsed;
}

async function runScheduledSweeps(
  db: AppDatabase,
  llm: LLMClient,
  env: Env,
): Promise<void> {
  const sourceIngestionPipeline = createSourceIngestionPipeline({ db });
  const inboxEngine = createInboxTriageEngine({
    db,
    llm,
    ingestionPipeline: sourceIngestionPipeline,
    ...parseTriageThresholds(env),
  });
  const now = new Date();
  const [audit, stale] = await Promise.all([
    inboxEngine.runAuditWindowSweep(now),
    inboxEngine.runStaleSweep(now),
  ]);

  console.log("inbox scheduled sweeps completed", {
    auditFiled: audit.filed.length,
    staleArchived: stale.archived.length,
  });
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
    const app = createApp(
      handle.db,
      llm,
      createTTSForWorker,
      parseTriageThresholds(env),
    );
    try {
      return await app.fetch(request, env);
    } finally {
      ctx.waitUntil(handle.close());
    }
  },

  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const handle = createDbForWorker(env);
    const llm = createLLMForWorker(env);
    ctx.waitUntil(
      runScheduledSweeps(handle.db, llm, env).finally(async () => {
        await handle.close();
      }),
    );
  },
};
