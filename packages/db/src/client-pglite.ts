/**
 * In-process Postgres-compatible database client backed by PGlite (WASM).
 * Used for tests and local dev — zero external dependencies, no Postgres install,
 * no Docker. Production stays on Supabase (see client-node.ts).
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema.js";

export type PgliteDb = PgliteDatabase<typeof schema>;

export interface PgliteHandle {
  db: PgliteDb;
  pglite: PGlite;
  close(): Promise<void>;
}

export async function createPgliteClient(): Promise<PgliteHandle> {
  const pglite = new PGlite();
  const db = drizzle(pglite, { schema });
  return {
    db,
    pglite,
    close: async () => {
      await pglite.close();
    },
  };
}

export { schema };
