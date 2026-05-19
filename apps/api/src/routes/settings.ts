import { Hono } from "hono";
import {
  createSettingsStore,
  type AppDatabase,
  type Settings,
} from "@writer-os/db";
import type { Env } from "../env.js";

interface SettingsResponse {
  id: string;
  audioCaptureDefault: boolean;
  audioRetentionHotDays: number;
  audioRetentionColdDays: number;
  locationTagDefault: boolean;
  updatedAt: string;
}

interface SettingsPatch {
  audioCaptureDefault?: boolean;
  audioRetentionHotDays?: number;
  audioRetentionColdDays?: number;
  locationTagDefault?: boolean;
}

function serializeSettings(settings: Settings): SettingsResponse {
  return {
    id: settings.id,
    audioCaptureDefault: settings.audioCaptureDefault,
    audioRetentionHotDays: settings.audioRetentionHotDays,
    audioRetentionColdDays: settings.audioRetentionColdDays,
    locationTagDefault: settings.locationTagDefault,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validatePatchBody(body: unknown): SettingsPatch | string {
  if (!isRecord(body)) {
    return "request body must be an object";
  }

  if (
    body.audioCaptureDefault !== undefined &&
    typeof body.audioCaptureDefault !== "boolean"
  ) {
    return "audioCaptureDefault must be a boolean";
  }

  if (
    body.locationTagDefault !== undefined &&
    typeof body.locationTagDefault !== "boolean"
  ) {
    return "locationTagDefault must be a boolean";
  }

  if (
    body.audioRetentionHotDays !== undefined &&
    !isNonnegativeInteger(body.audioRetentionHotDays)
  ) {
    return "audioRetentionHotDays must be a non-negative integer";
  }

  if (
    body.audioRetentionColdDays !== undefined &&
    !isNonnegativeInteger(body.audioRetentionColdDays)
  ) {
    return "audioRetentionColdDays must be a non-negative integer";
  }

  const patch: SettingsPatch = {};
  if (typeof body.audioCaptureDefault === "boolean") {
    patch.audioCaptureDefault = body.audioCaptureDefault;
  }
  if (typeof body.audioRetentionHotDays === "number") {
    patch.audioRetentionHotDays = body.audioRetentionHotDays;
  }
  if (typeof body.audioRetentionColdDays === "number") {
    patch.audioRetentionColdDays = body.audioRetentionColdDays;
  }
  if (typeof body.locationTagDefault === "boolean") {
    patch.locationTagDefault = body.locationTagDefault;
  }

  return patch;
}

function isNonnegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0
  );
}

function validateRetentionOrder(
  current: Settings,
  patch: SettingsPatch,
): string | null {
  const hot = patch.audioRetentionHotDays ?? current.audioRetentionHotDays;
  const cold = patch.audioRetentionColdDays ?? current.audioRetentionColdDays;

  return hot <= cold
    ? null
    : "audioRetentionHotDays must be less than or equal to audioRetentionColdDays";
}

export function createSettingsRouter(db: AppDatabase): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>();
  const store = createSettingsStore(db);

  router.get("/", async (c) => {
    const settings = await store.read();
    return c.json(serializeSettings(settings));
  });

  router.patch("/", async (c) => {
    const body = await c.req.json().catch((): null => null);
    const validation = validatePatchBody(body);

    if (typeof validation === "string") {
      return c.json({ error: validation }, 400);
    }

    const current = await store.read();
    const retentionError = validateRetentionOrder(current, validation);
    if (retentionError !== null) {
      return c.json({ error: retentionError }, 400);
    }

    const settings = await store.update(validation);

    return c.json(serializeSettings(settings));
  });

  return router;
}
