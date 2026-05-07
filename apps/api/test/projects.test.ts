import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from "vitest";
import { createPgliteClient, type PgliteHandle } from "@writer-os/db";
import { createApp } from "../src/index.js";
import type { Env } from "../src/env.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const env: Env = {
  WRITER_OS_API_SECRET: "test-secret",
  DATABASE_URL: "postgres://unused",
  ENVIRONMENT: "test",
};

let handle: PgliteHandle;
let app: ReturnType<typeof createApp>;

function buildRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, init);
}

function authHeader(secret = env.WRITER_OS_API_SECRET): HeadersInit {
  return { Authorization: `Bearer ${secret}` };
}

beforeAll(async () => {
  handle = await createPgliteClient();
  const migrationPath = resolve(
    __dirname,
    "../../../packages/db/src/migrations/0000_fresh_ravenous.sql",
  );
  const migrationSql = await readFile(migrationPath, "utf8");
  await handle.pglite.exec(migrationSql);
  app = createApp(handle.db);
});

afterAll(async () => {
  await handle.close();
});

describe("Writer OS API projects", () => {
  test("GET /health returns ok without auth", async () => {
    const response = await app.fetch(buildRequest("/health"), env);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test("GET /projects without auth returns unauthorized", async () => {
    const response = await app.fetch(buildRequest("/projects"), env);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("GET /projects with wrong secret returns unauthorized", async () => {
    const response = await app.fetch(
      buildRequest("/projects", { headers: authHeader("wrong-secret") }),
      env,
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
  });

  test("GET /projects with correct secret returns an empty list initially", async () => {
    const response = await app.fetch(
      buildRequest("/projects", { headers: authHeader() }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test("POST /projects with valid body creates a project", async () => {
    const response = await app.fetch(
      buildRequest("/projects", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Essay collection", type: "book" }),
      }),
      env,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      id: expect.any(String),
      title: "Essay collection",
      type: "book",
      createdAt: expect.any(String),
      archivedAt: null,
      mentorRef: null,
    });
  });

  test("POST /projects with empty title returns bad request", async () => {
    const response = await app.fetch(
      buildRequest("/projects", {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      }),
      env,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "title must be a non-empty string",
    });
  });

  test("GET /projects returns the created project", async () => {
    const response = await app.fetch(
      buildRequest("/projects", { headers: authHeader() }),
      env,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      {
        id: expect.any(String),
        title: "Essay collection",
        type: "book",
        createdAt: expect.any(String),
        archivedAt: null,
        mentorRef: null,
      },
    ]);
  });
});
