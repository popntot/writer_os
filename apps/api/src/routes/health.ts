import { Hono } from "hono";
import type { Env } from "../env.js";

export function createHealthRouter(): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>();
  router.get("/", (c) => c.json({ ok: true }));
  return router;
}
