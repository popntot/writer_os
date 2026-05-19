import { Hono } from "hono";
import type { AppDatabase } from "@writer-os/db";
import type {
  CaptureSurface,
  InboxItem,
  InboxTriageEngine,
  RawContent,
  TriageDecision,
} from "@writer-os/inbox";
import { rawContentPreview } from "@writer-os/inbox";
import type { Env } from "../env.js";

interface DepositInboxInput {
  rawContent: RawContent;
  captureSurface: CaptureSurface;
}

interface InboxItemResponse {
  id: string;
  rawContentRef: string;
  contentType: RawContent["type"];
  captureSurface: CaptureSurface;
  status: string;
  decision: TriageDecision | null;
  proposedProjectId: string | null;
  resolvedProjectId: string | null;
  sourceId: string | null;
  agentReasoning: string | null;
  depositedAt: string;
  triagedAt: string | null;
  filedAt: string | null;
  lastActionAt: string;
  contentPreview: string;
}

function serializeInboxItem(item: InboxItem): InboxItemResponse {
  return {
    id: item.id,
    rawContentRef: item.rawContentRef,
    contentType: item.contentType,
    captureSurface: item.captureSurface,
    status: item.status,
    decision: item.decision,
    proposedProjectId: item.proposedProjectId,
    resolvedProjectId: item.resolvedProjectId,
    sourceId: item.sourceId,
    agentReasoning: item.agentReasoning,
    depositedAt: item.depositedAt.toISOString(),
    triagedAt: item.triagedAt?.toISOString() ?? null,
    filedAt: item.filedAt?.toISOString() ?? null,
    lastActionAt: item.lastActionAt.toISOString(),
    contentPreview: rawContentPreview(item.rawContentRef),
  };
}

export function createInboxRouter(
  _db: AppDatabase,
  engine: InboxTriageEngine,
): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>();

  router.post("/", async (c) => {
    const body = await c.req.json().catch((): null => null);
    const validation = validateDepositBody(body);

    if (typeof validation === "string") {
      return c.json({ error: validation }, 400);
    }

    const deposited = await engine.deposit(validation);
    return c.json(deposited, 201);
  });

  router.get("/pending", async (c) => {
    const items = await engine.listPending();
    return c.json(items.map(serializeInboxItem));
  });

  router.post("/:id/confirm", async (c) => {
    const body = await c.req.json().catch((): null => null);
    const validation = validateConfirmBody(body);

    if (typeof validation === "string") {
      return c.json({ error: validation }, 400);
    }

    try {
      const item = await engine.confirmDestination(
        c.req.param("id"),
        validation.projectId,
      );
      return c.json(serializeInboxItem(item));
    } catch (error) {
      if (isNotFound(error)) {
        return c.json({ error: "inbox item not found" }, 404);
      }
      throw error;
    }
  });

  router.get("/:id", async (c) => {
    try {
      const item = await engine.getItem(c.req.param("id"));
      return c.json(serializeInboxItem(item));
    } catch (error) {
      if (isNotFound(error)) {
        return c.json({ error: "inbox item not found" }, 404);
      }
      throw error;
    }
  });

  return router;
}

function validateDepositBody(body: unknown): DepositInboxInput | string {
  if (!isRecord(body)) {
    return "request body must be an object";
  }

  const rawContent = parseRawContent(body.rawContent);
  if (typeof rawContent === "string") {
    return rawContent;
  }

  if (typeof body.captureSurface !== "string") {
    return "captureSurface must be a string";
  }

  const captureSurface = parseCaptureSurface(body.captureSurface);
  if (captureSurface === null) {
    return "captureSurface is not supported";
  }

  return { rawContent, captureSurface };
}

function validateConfirmBody(body: unknown): { projectId: string } | string {
  if (!isRecord(body)) {
    return "request body must be an object";
  }

  if (
    typeof body.projectId !== "string" ||
    body.projectId.trim().length === 0
  ) {
    return "projectId must be a non-empty string";
  }

  return { projectId: body.projectId.trim() };
}

function parseRawContent(value: unknown): RawContent | string {
  if (!isRecord(value) || typeof value.type !== "string") {
    return "rawContent must be an object with a type";
  }

  switch (value.type) {
    case "url":
      return typeof value.url === "string"
        ? { type: "url", url: value.url }
        : "rawContent.url must be a string";
    case "pdf":
      return typeof value.blobRef === "string"
        ? optionalFilename({ type: "pdf", blobRef: value.blobRef }, value)
        : "rawContent.blobRef must be a string";
    case "text":
      return typeof value.body === "string"
        ? optionalSuppliedTitle({ type: "text", body: value.body }, value)
        : "rawContent.body must be a string";
    case "voice-memo":
      return typeof value.audioRef === "string" &&
        typeof value.durationMs === "number"
        ? {
            type: "voice-memo",
            audioRef: value.audioRef,
            durationMs: value.durationMs,
          }
        : "rawContent voice memo fields are invalid";
    case "image":
      return typeof value.imageRef === "string"
        ? { type: "image", imageRef: value.imageRef }
        : "rawContent.imageRef must be a string";
    case "book-reference":
      return typeof value.title === "string" && typeof value.author === "string"
        ? optionalBookNotes(
            {
              type: "book-reference",
              title: value.title,
              author: value.author,
            },
            value,
          )
        : "rawContent book reference fields are invalid";
    default:
      return "rawContent type is not supported";
  }
}

function optionalFilename(
  raw: Extract<RawContent, { type: "pdf" }>,
  value: Record<string, unknown>,
): RawContent {
  return typeof value.filename === "string"
    ? { ...raw, filename: value.filename }
    : raw;
}

function optionalSuppliedTitle(
  raw: Extract<RawContent, { type: "text" }>,
  value: Record<string, unknown>,
): RawContent {
  return typeof value.suppliedTitle === "string"
    ? { ...raw, suppliedTitle: value.suppliedTitle }
    : raw;
}

function optionalBookNotes(
  raw: Extract<RawContent, { type: "book-reference" }>,
  value: Record<string, unknown>,
): RawContent {
  return typeof value.notes === "string" ? { ...raw, notes: value.notes } : raw;
}

function parseCaptureSurface(value: string): CaptureSurface | null {
  if (
    value === "ios-share-sheet" ||
    value === "ios-app-dump" ||
    value === "ios-voice-memo" ||
    value === "web-drag-drop" ||
    value === "web-paste" ||
    value === "web-book-form"
  ) {
    return value;
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && error.message === "inbox item not found";
}
