import { Hono } from "hono";
import { schema, type AppDatabase, type Project } from "@writer-os/db";
import type { Env } from "../env.js";

interface ProjectResponse {
  id: string;
  title: string;
  type: string | null;
  createdAt: string;
  archivedAt: string | null;
  mentorRef: string | null;
}

interface CreateProjectInput {
  title: string;
  type?: string;
}

function serializeProject(project: Project): ProjectResponse {
  return {
    id: project.id,
    title: project.title,
    type: project.type,
    createdAt: project.createdAt.toISOString(),
    archivedAt: project.archivedAt?.toISOString() ?? null,
    mentorRef: project.mentorRef,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateCreateProjectBody(
  body: unknown,
): CreateProjectInput | string {
  if (!isRecord(body)) {
    return "request body must be an object";
  }

  if (typeof body.title !== "string" || body.title.trim().length === 0) {
    return "title must be a non-empty string";
  }

  if (body.type !== undefined && typeof body.type !== "string") {
    return "type must be a string";
  }

  const title = body.title.trim();
  const type =
    typeof body.type === "string" && body.type.trim().length > 0
      ? body.type.trim()
      : undefined;

  return type === undefined ? { title } : { title, type };
}

export function createProjectsRouter(
  db: AppDatabase,
): Hono<{ Bindings: Env }> {
  const router = new Hono<{ Bindings: Env }>();

  router.get("/", async (c) => {
    const rows = await db.select().from(schema.projects);
    return c.json(rows.map(serializeProject));
  });

  router.post("/", async (c) => {
    const body = await c.req.json().catch((): null => null);
    const validation = validateCreateProjectBody(body);

    if (typeof validation === "string") {
      return c.json({ error: validation }, 400);
    }

    const [created] = await db
      .insert(schema.projects)
      .values(validation)
      .returning();

    if (created === undefined) {
      return c.json({ error: "failed to create project" }, 500);
    }

    return c.json(serializeProject(created), 201);
  });

  return router;
}
