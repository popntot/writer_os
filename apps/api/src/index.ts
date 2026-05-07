import { Hono } from "hono";
import type { AppDatabase } from "@writer-os/db";
import type { LLMClient } from "@writer-os/llm";
import { createDbForWorker } from "./db.js";
import type { Env } from "./env.js";
import { createLLMForWorker } from "./llm.js";
import { authMiddleware } from "./middleware/auth.js";
import { createHealthRouter } from "./routes/health.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createSessionsRouter } from "./routes/sessions.js";

export function createApp(
  db: AppDatabase,
  llm: LLMClient,
): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/health", createHealthRouter());
  app.use("/projects", authMiddleware);
  app.use("/projects/*", authMiddleware);
  app.use("/sessions/*", authMiddleware);
  app.route("/projects", createProjectsRouter(db));
  app.route("/", createSessionsRouter(db, llm));
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
    const app = createApp(handle.db, llm);
    try {
      return await app.fetch(request, env);
    } finally {
      ctx.waitUntil(handle.close());
    }
  },
};
