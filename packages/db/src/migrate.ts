/**
 * Run pending Drizzle migrations against the configured DATABASE_URL.
 * Invoked via `pnpm db:migrate` (root) or `pnpm --filter @writer-os/db db:migrate`.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(databaseUrl, { prepare: false, max: 1 });
const db = drizzle(client);

await migrate(db, { migrationsFolder: "./src/migrations" });
await client.end();

console.log("Migrations complete");
