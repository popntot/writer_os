/**
 * Production / Node-runtime database client.
 * Used by the Worker when running with a real Postgres connection (Supabase).
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

export function createNodeClient(databaseUrl: string): Database {
  const client = postgres(databaseUrl, { prepare: false });
  return drizzle(client, { schema });
}

export { schema };
