import { createNodeClient, type AppDatabase, type NodeHandle } from "@writer-os/db";
import type { Env } from "./env.js";

export type { AppDatabase };

export function createDbForWorker(env: Env): NodeHandle {
  return createNodeClient(env.DATABASE_URL);
}
