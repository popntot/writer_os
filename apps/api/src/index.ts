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

let cached: { db: AppDatabase; app: Hono<{ Bindings: Env }> } | null = null;

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    if (cached === null) {
      const db = createDbForWorker(env);
      cached = { db, app: createApp(db) };
    }
    return cached.app.fetch(request, env);
  },
};
