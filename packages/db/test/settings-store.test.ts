import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import {
  createPgliteClient,
  createSettingsStore,
  schema,
  type PgliteHandle,
  type SettingsStore,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let handle: PgliteHandle;
let store: SettingsStore;

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

beforeEach(async () => {
  handle = await createPgliteClient();
  await applyMigrations();
  store = createSettingsStore(handle.db);
});

afterEach(async () => {
  await handle.close();
});

describe("SettingsStore", () => {
  test("read returns defaults on a fresh DB", async () => {
    const settings = await store.read();

    expect(settings).toEqual({
      id: "singleton",
      audioCaptureDefault: false,
      audioRetentionHotDays: 30,
      audioRetentionColdDays: 365,
      locationTagDefault: false,
      updatedAt: expect.any(Date),
    });
  });

  test("read recreates the singleton row if it is missing", async () => {
    await handle.db
      .delete(schema.settings)
      .where(eq(schema.settings.id, "singleton"));

    const settings = await store.read();

    expect(settings).toMatchObject({
      id: "singleton",
      audioCaptureDefault: false,
      audioRetentionHotDays: 30,
      audioRetentionColdDays: 365,
      locationTagDefault: false,
    });
  });

  test("update mutates only the patched fields", async () => {
    const before = await store.read();

    const updated = await store.update({
      audioCaptureDefault: true,
      audioRetentionHotDays: 14,
    });

    expect(updated).toMatchObject({
      id: "singleton",
      audioCaptureDefault: true,
      audioRetentionHotDays: 14,
      audioRetentionColdDays: before.audioRetentionColdDays,
      locationTagDefault: before.locationTagDefault,
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
      before.updatedAt.getTime(),
    );
  });

  test("update is idempotent when patch values already match", async () => {
    const first = await store.update({
      locationTagDefault: true,
      audioRetentionColdDays: 400,
    });
    const second = await store.update({
      locationTagDefault: true,
      audioRetentionColdDays: 400,
    });

    expect(second).toEqual(first);
  });
});
