/**
 * TrueLineStore property tests — verifies the five invariants from
 * docs/interfaces/trueline-store.md against the PGlite-backed implementation.
 *
 * 1. applyDelta returns version === previous currentVersion + 1
 * 2. After applyDelta, read returns the same document
 * 3. readVersion(v) returns the content committed at v (immutable history)
 * 4. Concurrent applyDelta linearizes — no skipped, no duplicated versions
 * 5. Empty project: read returns v0; listVersions returns []
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  createPgliteClient,
  createTrueLineStore,
  schema,
  type PgliteHandle,
  type TrueLineStore,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let handle: PgliteHandle;
let store: TrueLineStore;
let projectId: string;
let sessionId: string;

async function applyMigrations(): Promise<void> {
  const migrationsDir = resolve(__dirname, "../src/migrations");
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const migrationSql = await readFile(resolve(migrationsDir, file), "utf8");
    await handle.pglite.exec(migrationSql);
  }
}

async function seedProjectAndSession(): Promise<{
  projectId: string;
  sessionId: string;
}> {
  const [project] = await handle.db
    .insert(schema.projects)
    .values({ title: "Test project" })
    .returning();
  if (project === undefined) {
    throw new Error("failed to seed project");
  }

  const [session] = await handle.db
    .insert(schema.sessions)
    .values({ projectId: project.id })
    .returning();
  if (session === undefined) {
    throw new Error("failed to seed session");
  }

  return { projectId: project.id, sessionId: session.id };
}

beforeEach(async () => {
  handle = await createPgliteClient();
  await applyMigrations();
  store = createTrueLineStore(handle.db);
  ({ projectId, sessionId } = await seedProjectAndSession());
});

afterEach(async () => {
  await handle.close();
});

describe("TrueLineStore — locked invariants", () => {
  test("invariant 5: empty project — read returns v0, listVersions []", async () => {
    const doc = await store.read(projectId);
    expect(doc).toEqual({
      projectId,
      version: 0,
      content: "",
      sourceSessionId: null,
      committedAt: expect.any(Date),
      contributionSummary: null,
    });

    expect(await store.listVersions(projectId)).toEqual([]);
    expect(await store.currentVersion(projectId)).toBe(0);
  });

  test("invariant 1: applyDelta increments version monotonically", async () => {
    const v1 = await store.applyDelta({
      projectId,
      sourceSessionId: sessionId,
      newContent: "first",
    });
    expect(v1.version).toBe(1);

    const v2 = await store.applyDelta({
      projectId,
      sourceSessionId: sessionId,
      newContent: "second",
    });
    expect(v2.version).toBe(2);

    const v3 = await store.applyDelta({
      projectId,
      sourceSessionId: sessionId,
      newContent: "third",
    });
    expect(v3.version).toBe(3);

    expect(await store.currentVersion(projectId)).toBe(3);
  });

  test("invariant 2: read returns the most recently applied document", async () => {
    await store.applyDelta({
      projectId,
      sourceSessionId: sessionId,
      newContent: "first",
      contributionSummary: "session 1 contribution",
    });
    const applied = await store.applyDelta({
      projectId,
      sourceSessionId: sessionId,
      newContent: "second",
      contributionSummary: "session 2 contribution",
    });

    const current = await store.read(projectId);
    expect(current.version).toBe(applied.version);
    expect(current.content).toBe(applied.content);
    expect(current.contributionSummary).toBe("session 2 contribution");
    expect(current.sourceSessionId).toBe(sessionId);
  });

  test("invariant 3: readVersion returns the content committed at that version (immutable history)", async () => {
    await store.applyDelta({
      projectId,
      sourceSessionId: sessionId,
      newContent: "v1 content",
      contributionSummary: "v1 summary",
    });
    await store.applyDelta({
      projectId,
      sourceSessionId: sessionId,
      newContent: "v2 content",
      contributionSummary: "v2 summary",
    });
    await store.applyDelta({
      projectId,
      sourceSessionId: sessionId,
      newContent: "v3 content",
      contributionSummary: "v3 summary",
    });

    const v1 = await store.readVersion(projectId, 1);
    expect(v1?.content).toBe("v1 content");
    expect(v1?.contributionSummary).toBe("v1 summary");

    const v2 = await store.readVersion(projectId, 2);
    expect(v2?.content).toBe("v2 content");
    expect(v2?.contributionSummary).toBe("v2 summary");

    const v0 = await store.readVersion(projectId, 0);
    expect(v0?.version).toBe(0);
    expect(v0?.content).toBe("");

    const missing = await store.readVersion(projectId, 99);
    expect(missing).toBeNull();
  });

  test("invariant 4: concurrent applyDelta produces strict linearization", async () => {
    const FAN_OUT = 8;
    const results = await Promise.all(
      Array.from({ length: FAN_OUT }, (_, i) =>
        store.applyDelta({
          projectId,
          sourceSessionId: sessionId,
          newContent: `payload-${i}`,
        }),
      ),
    );

    const versions = results.map((doc) => doc.version).sort((a, b) => a - b);
    expect(versions).toEqual(
      Array.from({ length: FAN_OUT }, (_, i) => i + 1),
    );

    expect(await store.currentVersion(projectId)).toBe(FAN_OUT);

    const list = await store.listVersions(projectId);
    expect(list.map((m) => m.version)).toEqual(
      Array.from({ length: FAN_OUT }, (_, i) => FAN_OUT - i),
    );
  });

  test("listVersions is metadata-only and ordered newest-first", async () => {
    await store.applyDelta({
      projectId,
      sourceSessionId: sessionId,
      newContent: "first",
      contributionSummary: "summary 1",
    });
    await store.applyDelta({
      projectId,
      sourceSessionId: sessionId,
      newContent: "second",
      contributionSummary: "summary 2",
    });

    const versions = await store.listVersions(projectId);
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
    expect(versions[0]?.contributionSummary).toBe("summary 2");
    expect(versions[1]?.contributionSummary).toBe("summary 1");
    expect(versions[0]).not.toHaveProperty("content");
  });
});
