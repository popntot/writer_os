import { createNodeClient, type AppDatabase } from "@writer-os/db";
import type { Env } from "./env.js";

export type { AppDatabase };

export function createDbForWorker(env: Env): AppDatabase {
  return createNodeClient(env.DATABASE_URL);
}
