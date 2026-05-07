import { Hono } from "hono";
import type { AppDatabase } from "@writer-os/db";
import { createDbForWorker } from "./db.js";
import type { Env } from "./env.js";
import { authMiddleware } from "./middleware/auth.js";
import { createHealthRouter } from "./routes/health.js";
import { createProjectsRouter } from "./routes/projects.js";

export function createApp(db: AppDatabase): Hono<{ Bindings: Env }> {
  const app = new Hono<{ Bindings: Env }>();
  app.route("/health", createHealthRouter());
  app.use("/projects", authMiddleware);
  app.use("/projects/*", authMiddleware);
  app.route("/projects", createProjectsRouter(db));
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
    const app = createApp(handle.db);
    try {
      return await app.fetch(request, env);
    } finally {
      ctx.waitUntil(handle.close());
    }
  },
};
