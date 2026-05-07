export * as schema from "./schema.js";
export type { Project, NewProject } from "./schema.js";
export {
  createNodeClient,
  type Database,
  type NodeHandle,
} from "./client-node.js";
export {
  createPgliteClient,
  type PgliteDb,
  type PgliteHandle,
} from "./client-pglite.js";

import type { Database } from "./client-node.js";
import type { PgliteDb } from "./client-pglite.js";

/**
 * Either Drizzle backend. The query API surface (`select`, `insert`, ...) is
 * identical for our usage; routes accept this union so prod (postgres-js) and
 * tests (pglite) drive the same code path.
 */
export type AppDatabase = Database | PgliteDb;
