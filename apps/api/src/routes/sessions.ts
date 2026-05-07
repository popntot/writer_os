import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { schema, type AppDatabase, type Session } from "@writer-os/db";
import type { LLMClient } from "@writer-os/llm";
import type { Env } from "../env.js";

interface SessionResponse {
  id: string;
  projectId: string;
  targetArticleId: string | null;
  startAt: string;
  endAt: string | null;
  audioRef: string | null;
  transcriptRef: string | null;
  consolidationStatus: string;
  summary: string | null;
}

interface CreateSessionInput {
  targetArticleId?: string;
}

interface TurnInput {
  message: string;
}

function serializeSession(session: Session): SessionResponse {
  return {
    id: session.id,
    projectId: session.projectId,
    targetArticleId: session.targetArticleId,
    startAt: session.startAt.toISOString(),
    endAt: session.endAt?.toISOString() ?? null,
    audioRef: session.audioRef,
    transcriptRef: session.transcriptRef,
    consolidationStatus: session.consolidationStatus,
    summary: session.summary,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateCreateSessionBody(
  body: unknown,
): CreateSessionInput | string {
  if (body === null || body === undefined) {
    return {};
  }

  if (!isRecord(body)) {
    return "request body must be an object";
  }

  if (
    body.targetArticleId !== undefined &&
    typeof body.targetArticleId !== "string"
  ) {
    return "targetArticleId must be a string";
  }

  const targetArticleId =
    typeof body.targetArticleId === "string" &&
    body.targetArticleId.trim().length > 0
      ? body.targetArticleId.trim()
      : undefined;

  return targetArticleId === undefined ? {} : { targetArticleId };
}

function validateTurnBody(body: unknown): TurnInput | string {
  if (!isRecord(body)) {
    return "request body must be an object";
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return "message must be a non-empty string";
  }

  return { message: body.message.trim() };
}

export function createSessionsRouter(
  db: AppDatabase,
  llm: LLMClient,
): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>();

  router.post("/projects/:projectId/sessions", async (c) => {
    const projectId = c.req.param("projectId");
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);

    if (project === undefined) {
      return c.json({ error: "project not found" }, 404);
    }

    const body = await c.req.json().catch((): null => null);
    const validation = validateCreateSessionBody(body);

    if (typeof validation === "string") {
      return c.json({ error: validation }, 400);
    }

    const [created] = await db
      .insert(schema.sessions)
      .values({
        projectId,
        targetArticleId: validation.targetArticleId ?? null,
        startAt: new Date(),
        consolidationStatus: "pending",
      })
      .returning();

    if (created === undefined) {
      return c.json({ error: "failed to create session" }, 500);
    }

    return c.json(serializeSession(created), 201);
  });

  router.post("/sessions/:sessionId/turn", async (c) => {
    const sessionId = c.req.param("sessionId");
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (session === undefined) {
      return c.json({ error: "session not found" }, 404);
    }

    if (session.endAt !== null) {
      return c.json({ error: "session already ended" }, 409);
    }

    const body = await c.req.json().catch((): null => null);
    const validation = validateTurnBody(body);

    if (typeof validation === "string") {
      return c.json({ error: validation }, 400);
    }

    const result = await llm.chat({
      messages: [{ role: "user", content: validation.message }],
    });

    return c.json({
      text: result.text,
      usage: {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.usage.costUsd,
      },
    });
  });

  router.post("/sessions/:sessionId/end", async (c) => {
    const sessionId = c.req.param("sessionId");
    const [session] = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    if (session === undefined) {
      return c.json({ error: "session not found" }, 404);
    }

    if (session.endAt !== null) {
      return c.json({ error: "session already ended" }, 409);
    }

    const [updated] = await db
      .update(schema.sessions)
      .set({ endAt: new Date() })
      .where(and(eq(schema.sessions.id, sessionId), isNull(schema.sessions.endAt)))
      .returning();

    if (updated === undefined) {
      return c.json({ error: "session already ended" }, 409);
    }

    return c.json(serializeSession(updated));
  });

  return router;
}
