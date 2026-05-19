import { eq } from "drizzle-orm";
import type { Database } from "./client-node.js";
import type { PgliteDb } from "./client-pglite.js";
import * as schema from "./schema.js";

type AppDatabase = Database | PgliteDb;

const SETTINGS_ID = "singleton";

type EditableSettingsFields = Pick<
  schema.Settings,
  | "audioCaptureDefault"
  | "audioRetentionHotDays"
  | "audioRetentionColdDays"
  | "locationTagDefault"
>;

export interface SettingsStore {
  read(): Promise<schema.Settings>;
  update(patch: Partial<schema.Settings>): Promise<schema.Settings>;
}

export function createSettingsStore(db: AppDatabase): SettingsStore {
  return {
    read: async () => {
      return ensureSettings(db);
    },

    update: async (patch) => {
      const current = await ensureSettings(db);
      const changes = editableChanges(current, patch);

      if (Object.keys(changes).length === 0) {
        return current;
      }

      const [row] = await db
        .update(schema.settings)
        .set({ ...changes, updatedAt: new Date() })
        .where(eq(schema.settings.id, SETTINGS_ID))
        .returning();

      if (row === undefined) {
        throw new Error("SettingsStore.update: update returned no row");
      }

      return row;
    },
  };
}

async function ensureSettings(db: AppDatabase): Promise<schema.Settings> {
  const existing = await readSettings(db);
  if (existing !== null) {
    return existing;
  }

  await db
    .insert(schema.settings)
    .values({ id: SETTINGS_ID })
    .onConflictDoNothing({ target: schema.settings.id });

  const inserted = await readSettings(db);
  if (inserted === null) {
    throw new Error("SettingsStore.read: singleton row was not created");
  }

  return inserted;
}

async function readSettings(db: AppDatabase): Promise<schema.Settings | null> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.id, SETTINGS_ID))
    .limit(1);

  return row ?? null;
}

function editableChanges(
  current: schema.Settings,
  patch: Partial<schema.Settings>,
): Partial<EditableSettingsFields> {
  const changes: Partial<EditableSettingsFields> = {};

  if (
    patch.audioCaptureDefault !== undefined &&
    patch.audioCaptureDefault !== current.audioCaptureDefault
  ) {
    changes.audioCaptureDefault = patch.audioCaptureDefault;
  }

  if (
    patch.audioRetentionHotDays !== undefined &&
    patch.audioRetentionHotDays !== current.audioRetentionHotDays
  ) {
    changes.audioRetentionHotDays = patch.audioRetentionHotDays;
  }

  if (
    patch.audioRetentionColdDays !== undefined &&
    patch.audioRetentionColdDays !== current.audioRetentionColdDays
  ) {
    changes.audioRetentionColdDays = patch.audioRetentionColdDays;
  }

  if (
    patch.locationTagDefault !== undefined &&
    patch.locationTagDefault !== current.locationTagDefault
  ) {
    changes.locationTagDefault = patch.locationTagDefault;
  }

  return changes;
}
