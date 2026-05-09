import { asc, eq } from "drizzle-orm";
import {
  schema,
  type AppDatabase,
  type Project,
  type Session,
  type SessionTurnRow,
  type TrueLineDocument,
  type TrueLineStore,
} from "@writer-os/db";
import type { LLMClient } from "@writer-os/llm";
import type {
  ConsolidationResult,
  ConsolidationStatus,
  ConsolidationTrigger,
  ConsolidationWorker,
} from "@writer-os/shared-types";

export type {
  ConsolidationResult,
  ConsolidationStatus,
  ConsolidationTrigger,
  ConsolidationWorker,
} from "@writer-os/shared-types";

export interface ConsolidationWorkerDeps {
  db: AppDatabase;
  llm: LLMClient;
  trueLineStore: TrueLineStore;
}

interface ConsolidationOutput {
  trueLine: string;
  contributionSummary: string;
  nextSessionStarter: string;
}

interface SessionContext {
  session: Session;
  project: Project;
  priorTrueLine: TrueLineDocument;
  turns: SessionTurnRow[];
}

const CONSOLIDATION_SYSTEM_PROMPT =
  "You are the consolidation engine for Writer OS. Your job is to read a thinking-walk session transcript and produce three outputs: the updated TrueLine, a concise contribution summary, and a next-session conversation starter.";

const DEFAULT_PROCESS_TRIGGER: ConsolidationTrigger = "session-end";
const FIRST_FAILURE_RETRIES_REMAINING = 3;

export function createConsolidationWorker(
  deps: ConsolidationWorkerDeps,
): ConsolidationWorker {
  return {
    enqueue: async (sessionId, trigger) => {
      const session = await readSession(deps.db, sessionId);
      const status = statusFromSession(session);

      if (status.state !== "not-started" && status.state !== "failed") {
        return status;
      }

      const queuedAt = new Date();
      const [updated] = await deps.db
        .update(schema.sessions)
        .set({
          consolidationStatus: "pending",
          consolidationState: "queued",
          consolidationQueuedAt: queuedAt,
          consolidationTrigger: trigger,
          consolidationStartedAt: null,
          consolidationCompletedAt: null,
          consolidationFailedAt: null,
          consolidationError: null,
          consolidationNextRetryAt: null,
        })
        .where(eq(schema.sessions.id, sessionId))
        .returning();

      if (updated === undefined) {
        throw new Error("session not found");
      }

      return statusFromSession(updated);
    },

    getStatus: async (sessionId) =>
      statusFromSession(await readSession(deps.db, sessionId)),

    retry: async (sessionId) => {
      const session = await readSession(deps.db, sessionId);
      const status = statusFromSession(session);

      if (status.state !== "failed") {
        return status;
      }

      const retriesRemaining =
        status.retriesRemaining > 0
          ? status.retriesRemaining - 1
          : status.retriesRemaining;
      const queuedAt = new Date();
      const [updated] = await deps.db
        .update(schema.sessions)
        .set({
          consolidationStatus: "pending",
          consolidationState: "queued",
          consolidationQueuedAt: queuedAt,
          consolidationTrigger: "retry-manual",
          consolidationStartedAt: null,
          consolidationFailedAt: null,
          consolidationError: null,
          consolidationRetriesRemaining: retriesRemaining,
          consolidationNextRetryAt: null,
        })
        .where(eq(schema.sessions.id, sessionId))
        .returning();

      if (updated === undefined) {
        throw new Error("session not found");
      }

      return statusFromSession(updated);
    },

    processSession: async (sessionId) => {
      const initialSession = await readSession(deps.db, sessionId);
      const initialStatus = statusFromSession(initialSession);

      if (initialStatus.state === "completed") {
        return initialStatus.result;
      }

      if (initialStatus.state === "in-progress") {
        throw new Error("consolidation in progress");
      }

      const trigger =
        initialSession.consolidationTrigger === null
          ? DEFAULT_PROCESS_TRIGGER
          : asConsolidationTrigger(initialSession.consolidationTrigger);
      await markInProgress(deps.db, sessionId, trigger);

      try {
        const context = await readSessionContext(deps, sessionId);
        const output = hasMaterialContent(context.turns)
          ? await runConsolidationLLM(deps.llm, context)
          : noMaterialOutput(context.priorTrueLine, context.project);
        const result = await commitSuccessfulConsolidation(
          deps,
          context,
          output,
        );
        return result;
      } catch (error) {
        await markFailed(deps.db, sessionId, initialSession, error);
        throw error;
      }
    },
  };
}

async function readSession(db: AppDatabase, sessionId: string): Promise<Session> {
  const [session] = await db
    .select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);

  if (session === undefined) {
    throw new Error("session not found");
  }

  return session;
}

async function readSessionContext(
  deps: ConsolidationWorkerDeps,
  sessionId: string,
): Promise<SessionContext> {
  const session = await readSession(deps.db, sessionId);
  const [project] = await deps.db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, session.projectId))
    .limit(1);

  if (project === undefined) {
    throw new Error("project not found");
  }

  const [priorTrueLine, turns] = await Promise.all([
    deps.trueLineStore.read(project.id),
    deps.db
      .select()
      .from(schema.sessionTurns)
      .where(eq(schema.sessionTurns.sessionId, sessionId))
      .orderBy(asc(schema.sessionTurns.turnIdx)),
  ]);

  return { session, project, priorTrueLine, turns };
}

async function markInProgress(
  db: AppDatabase,
  sessionId: string,
  trigger: ConsolidationTrigger,
): Promise<void> {
  const startedAt = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.sessions)
      .set({
        consolidationStatus: "running",
        consolidationState: "in-progress",
        consolidationStartedAt: startedAt,
        consolidationTrigger: trigger,
        consolidationCompletedAt: null,
        consolidationFailedAt: null,
        consolidationError: null,
        consolidationNextRetryAt: null,
      })
      .where(eq(schema.sessions.id, sessionId));
  });
}

async function commitSuccessfulConsolidation(
  deps: ConsolidationWorkerDeps,
  context: SessionContext,
  output: ConsolidationOutput,
): Promise<ConsolidationResult> {
  const changedTrueLine = output.trueLine !== context.priorTrueLine.content;
  const trueLineVersion = changedTrueLine
    ? (
        await deps.trueLineStore.applyDelta({
          projectId: context.project.id,
          sourceSessionId: context.session.id,
          newContent: output.trueLine,
          contributionSummary: output.contributionSummary,
        })
      ).version
    : context.priorTrueLine.version;

  const completedAt = new Date();
  const result: ConsolidationResult = {
    sessionId: context.session.id,
    trueLineVersion,
    openQuestionsOpened: [],
    openQuestionsResolved: [],
    artifactsGenerated: [],
    nextSessionStarterRef: nextSessionStarterRef(context.project.id),
    contributionSummary: output.contributionSummary,
    completedAt,
  };

  await deps.db.transaction(async (tx) => {
    await tx
      .update(schema.projects)
      .set({
        nextSessionStarter: output.nextSessionStarter,
        nextSessionStarterUpdatedAt: completedAt,
      })
      .where(eq(schema.projects.id, context.project.id));

    await tx
      .update(schema.sessions)
      .set({
        consolidationStatus: "succeeded",
        consolidationState: "completed",
        consolidationCompletedAt: completedAt,
        consolidationFailedAt: null,
        consolidationError: null,
        consolidationContributionSummary: output.contributionSummary,
        consolidationTrueLineVersion: trueLineVersion,
      })
      .where(eq(schema.sessions.id, context.session.id));
  });

  return result;
}

async function markFailed(
  db: AppDatabase,
  sessionId: string,
  sessionBeforeAttempt: Session,
  error: unknown,
): Promise<void> {
  const failedAt = new Date();
  const currentRetries = sessionBeforeAttempt.consolidationRetriesRemaining;
  const retriesRemaining =
    currentRetries === null
      ? FIRST_FAILURE_RETRIES_REMAINING
      : Math.max(0, currentRetries - 1);
  const delayMs = retryDelayMs(currentRetries);
  const nextRetryAt =
    retriesRemaining > 0 ? new Date(failedAt.getTime() + delayMs) : null;

  await db.transaction(async (tx) => {
    await tx
      .update(schema.sessions)
      .set({
        consolidationStatus: "failed",
        consolidationState: "failed",
        consolidationCompletedAt: null,
        consolidationFailedAt: failedAt,
        consolidationError: errorMessage(error),
        consolidationRetriesRemaining: retriesRemaining,
        consolidationNextRetryAt: nextRetryAt,
      })
      .where(eq(schema.sessions.id, sessionId));
  });
}

async function runConsolidationLLM(
  llm: LLMClient,
  context: SessionContext,
): Promise<ConsolidationOutput> {
  const result = await llm.chat({
    model: "sonnet-4-6",
    temperature: 0,
    system: CONSOLIDATION_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          "Return only a JSON object with keys trueLine, contributionSummary, and nextSessionStarter.\n\n" +
          JSON.stringify(
            {
              project: {
                title: context.project.title,
                type: context.project.type,
              },
              priorTrueLine: {
                version: context.priorTrueLine.version,
                content: context.priorTrueLine.content,
              },
              transcript: formatTranscript(context.turns),
            },
            null,
            2,
          ),
      },
    ],
  });

  return parseConsolidationOutput(result.text);
}

function parseConsolidationOutput(text: string): ConsolidationOutput {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("```")
    ? extractJsonFromFence(trimmed)
    : trimmed;
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error("consolidation output malformed", { cause: error });
  }

  if (!isRecord(parsed)) {
    throw new Error("consolidation output malformed");
  }

  const { trueLine, contributionSummary, nextSessionStarter } = parsed;
  if (
    typeof trueLine !== "string" ||
    typeof contributionSummary !== "string" ||
    typeof nextSessionStarter !== "string"
  ) {
    throw new Error("consolidation output malformed");
  }

  return { trueLine, contributionSummary, nextSessionStarter };
}

function extractJsonFromFence(text: string): string {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(text);
  if (match?.[1] === undefined) {
    return text;
  }
  return match[1];
}

function formatTranscript(turns: SessionTurnRow[]): string {
  return turns
    .map((turn) => `[${turn.role}] ${turn.content}`)
    .join("\n");
}

function hasMaterialContent(turns: SessionTurnRow[]): boolean {
  return turns.some((turn) => turn.content.trim().length > 0);
}

function noMaterialOutput(
  priorTrueLine: TrueLineDocument,
  project: Project,
): ConsolidationOutput {
  return {
    trueLine: priorTrueLine.content,
    contributionSummary: "No material content in this session.",
    nextSessionStarter:
      project.nextSessionStarter ?? "Continue from the current TrueLine.",
  };
}

function statusFromSession(session: Session): ConsolidationStatus {
  switch (session.consolidationState) {
    case "not-started":
      return { state: "not-started" };
    case "queued":
      return {
        state: "queued",
        queuedAt: requiredDate(session.consolidationQueuedAt, "queuedAt"),
        trigger: asConsolidationTrigger(
          requiredString(session.consolidationTrigger, "trigger"),
        ),
      };
    case "in-progress":
      return {
        state: "in-progress",
        startedAt: requiredDate(session.consolidationStartedAt, "startedAt"),
        trigger: asConsolidationTrigger(
          requiredString(session.consolidationTrigger, "trigger"),
        ),
      };
    case "completed": {
      const completedAt = requiredDate(
        session.consolidationCompletedAt,
        "completedAt",
      );
      return {
        state: "completed",
        completedAt,
        result: {
          sessionId: session.id,
          trueLineVersion: requiredNumber(
            session.consolidationTrueLineVersion,
            "trueLineVersion",
          ),
          openQuestionsOpened: [],
          openQuestionsResolved: [],
          artifactsGenerated: [],
          nextSessionStarterRef: nextSessionStarterRef(session.projectId),
          contributionSummary: requiredString(
            session.consolidationContributionSummary,
            "contributionSummary",
          ),
          completedAt,
        },
      };
    }
    case "failed":
      return {
        state: "failed",
        failedAt: requiredDate(session.consolidationFailedAt, "failedAt"),
        error: requiredString(session.consolidationError, "error"),
        retriesRemaining: session.consolidationRetriesRemaining ?? 0,
        nextRetryAt: session.consolidationNextRetryAt,
      };
    default:
      throw new Error(
        `unknown consolidation state: ${session.consolidationState}`,
      );
  }
}

function retryDelayMs(currentRetries: number | null): number {
  if (currentRetries === null) {
    return 60_000;
  }
  if (currentRetries >= 3) {
    return 5 * 60_000;
  }
  return 15 * 60_000;
}

function nextSessionStarterRef(projectId: string): string {
  return `project:${projectId}:next-session-starter`;
}

function asConsolidationTrigger(value: string): ConsolidationTrigger {
  if (
    value === "session-end" ||
    value === "manual" ||
    value === "retry-auto" ||
    value === "retry-manual"
  ) {
    return value;
  }

  throw new Error(`unknown consolidation trigger: ${value}`);
}

function requiredDate(value: Date | null, field: string): Date {
  if (value === null) {
    throw new Error(`completed consolidation missing ${field}`);
  }
  return value;
}

function requiredString(value: string | null, field: string): string {
  if (value === null) {
    throw new Error(`completed consolidation missing ${field}`);
  }
  return value;
}

function requiredNumber(value: number | null, field: string): number {
  if (value === null) {
    throw new Error(`completed consolidation missing ${field}`);
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
