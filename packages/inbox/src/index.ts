import { and, asc, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { schema, type AppDatabase, type InboxItemRow } from "@writer-os/db";
import type { LLMClient } from "@writer-os/llm";
import type {
  CaptureSurface,
  InboxItem,
  InboxItemStatus,
  InboxTriageEngine,
  RawContent,
  SourceIngestionPipeline,
  TriageDecision,
} from "@writer-os/shared-types";

export type {
  CaptureSurface,
  InboxItem,
  InboxItemStatus,
  InboxTriageEngine,
  RawContent,
  SourceIngestionPipeline,
  TriageDecision,
} from "@writer-os/shared-types";
export type { LLMClient } from "@writer-os/llm";
export { createSourceIngestionPipeline } from "./source-ingestion.js";

// Env-driven defaults. API callers may override these with
// WRITER_OS_TRIAGE_HIGH_CONFIDENCE and WRITER_OS_TRIAGE_LOW_CONFIDENCE.
export const DEFAULT_TRIAGE_HIGH_CONFIDENCE = 0.8;
export const DEFAULT_TRIAGE_LOW_CONFIDENCE = 0.5;

export type TriageStub = (input: {
  item: InboxItem;
  rawContent: RawContent;
}) => Promise<TriageDecision> | TriageDecision;

export interface InboxTriageEngineDeps {
  db: AppDatabase;
  llm?: LLMClient;
  ingestionPipeline: SourceIngestionPipeline;
  triageStub?: TriageStub;
  highConfidence?: number;
  lowConfidence?: number;
}

const AUDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CANDIDATE_LIMIT = 5;

export function createInboxTriageEngine(
  deps: InboxTriageEngineDeps,
): InboxTriageEngine {
  const highConfidence =
    deps.highConfidence ?? DEFAULT_TRIAGE_HIGH_CONFIDENCE;
  const lowConfidence = deps.lowConfidence ?? DEFAULT_TRIAGE_LOW_CONFIDENCE;
  const triage =
    deps.triageStub ??
    (deps.llm !== undefined
      ? createRealTriage({
          db: deps.db,
          llm: deps.llm,
          highConfidence,
          lowConfidence,
        })
      : createDefaultTriageStub(deps.db));

  return {
    deposit: async (input) => {
      const capturedAt = input.capturedAt ?? new Date();
      const itemId = randomUUID();
      const [created] = await deps.db
        .insert(schema.inboxItems)
        .values({
          id: itemId,
          rawContentRef: encodeRawContentRef(input.rawContent),
          contentType: input.rawContent.type,
          captureSurface: input.captureSurface,
          status: "captured",
          depositedAt: capturedAt,
          lastActionAt: capturedAt,
        })
        .returning();

      if (created === undefined) {
        throw new Error("inbox deposit failed");
      }

      return {
        itemId: created.id,
        status: asInboxStatus(created.status),
      };
    },

    getItem: async (itemId) => rowToInboxItem(await readItem(deps.db, itemId)),

    listPending: async () => {
      const rows = await deps.db
        .select()
        .from(schema.inboxItems)
        .where(eq(schema.inboxItems.status, "triaged-pending"))
        .orderBy(asc(schema.inboxItems.depositedAt));

      return rows.map(rowToInboxItem);
    },

    listAuditWindow: async (now) => {
      const cutoff = new Date(now.getTime() - AUDIT_WINDOW_MS);
      const rows = await deps.db
        .select()
        .from(schema.inboxItems)
        .where(
          and(
            eq(schema.inboxItems.status, "triaged-auto"),
            gte(schema.inboxItems.depositedAt, cutoff),
          ),
        )
        .orderBy(asc(schema.inboxItems.depositedAt));

      return rows.map(rowToInboxItem);
    },

    listStale: async () => {
      const rows = await deps.db
        .select()
        .from(schema.inboxItems)
        .where(eq(schema.inboxItems.status, "stale"))
        .orderBy(asc(schema.inboxItems.lastActionAt));

      return rows.map(rowToInboxItem);
    },

    confirmDestination: async (itemId, projectId) => {
      const item = rowToInboxItem(await readItem(deps.db, itemId));

      if (
        item.status === "filed" &&
        item.resolvedProjectId === projectId &&
        item.sourceId !== null
      ) {
        return item;
      }

      if (
        item.status !== "triaged-pending" &&
        item.status !== "triaged-auto"
      ) {
        throw new Error(`cannot confirm inbox item from ${item.status}`);
      }

      const sourceId =
        item.sourceId ??
        (
          await deps.ingestionPipeline.ingest({
            inboxItemId: item.id,
            raw: decodeRawContentRef(item.rawContentRef),
          })
        ).id;
      const now = new Date();
      let updated: InboxItemRow | undefined;

      await deps.db.transaction(async (tx) => {
        [updated] = await tx
          .update(schema.inboxItems)
          .set({
            status: "filed",
            resolvedProjectId: projectId,
            sourceId,
            filedAt: now,
            lastActionAt: now,
          })
          .where(eq(schema.inboxItems.id, itemId))
          .returning();

        await tx
          .update(schema.sources)
          .set({ projectId, lastReferencedAt: now })
          .where(eq(schema.sources.id, sourceId));
      });

      if (updated === undefined) {
        throw new Error("inbox item not found");
      }

      return rowToInboxItem(updated);
    },

    recoverFromStale: async (itemId) => {
      const item = rowToInboxItem(await readItem(deps.db, itemId));
      if (item.status !== "stale") {
        throw new Error(`cannot recover inbox item from ${item.status}`);
      }

      const [updated] = await deps.db
        .update(schema.inboxItems)
        .set({ status: "triaged-pending", lastActionAt: new Date() })
        .where(eq(schema.inboxItems.id, itemId))
        .returning();

      if (updated === undefined) {
        throw new Error("inbox item not found");
      }

      return rowToInboxItem(updated);
    },

    triageItem: async (itemId) => {
      const item = rowToInboxItem(await readItem(deps.db, itemId));
      if (item.status !== "captured" && item.decision !== null) {
        return item.decision;
      }
      if (item.status !== "captured") {
        throw new Error(`cannot triage inbox item from ${item.status}`);
      }

      try {
        const rawContent = decodeRawContentRef(item.rawContentRef);
        const decision = await triage({ item, rawContent });
        const now = new Date();

        if (decision.kind === "auto-filed") {
          const processed = await deps.ingestionPipeline.ingest({
            inboxItemId: item.id,
            raw: rawContent,
          });
          const finalized: TriageDecision = {
            ...decision,
            sourceId: processed.id,
          };

          await deps.db.transaction(async (tx) => {
            await tx
              .update(schema.sources)
              .set({
                projectId: finalized.projectId,
                lastReferencedAt: now,
              })
              .where(eq(schema.sources.id, finalized.sourceId));

            await tx
              .update(schema.inboxItems)
              .set({
                status: "triaged-auto",
                decisionKind: finalized.kind,
                decisionProjectId: finalized.projectId,
                decisionSourceId: finalized.sourceId,
                confidence: finalized.confidence,
                agentReasoning: finalized.reasoning,
                resolvedProjectId: finalized.projectId,
                sourceId: finalized.sourceId,
                proposedProjectId: finalized.projectId,
                triagedAt: now,
                lastActionAt: now,
              })
              .where(eq(schema.inboxItems.id, itemId));
          });

          return finalized;
        }

        await deps.db
          .update(schema.inboxItems)
          .set(updateForPendingDecision(decision, now))
          .where(eq(schema.inboxItems.id, itemId));

        return decision;
      } catch (error) {
        const now = new Date();
        await deps.db
          .update(schema.inboxItems)
          .set({
            status: "triage-failed",
            agentReasoning: errorMessage(error),
            lastActionAt: now,
          })
          .where(eq(schema.inboxItems.id, itemId));
        throw error;
      }
    },

    runAuditWindowSweep: async (now) => {
      const cutoff = new Date(now.getTime() - AUDIT_WINDOW_MS);
      const rows = await deps.db
        .select({ id: schema.inboxItems.id })
        .from(schema.inboxItems)
        .where(
          and(
            eq(schema.inboxItems.status, "triaged-auto"),
            lt(schema.inboxItems.depositedAt, cutoff),
          ),
        );

      const filed: string[] = [];
      for (const row of rows) {
        const [updated] = await deps.db
          .update(schema.inboxItems)
          .set({ status: "filed", filedAt: now, lastActionAt: now })
          .where(eq(schema.inboxItems.id, row.id))
          .returning();
        if (updated !== undefined) {
          filed.push(updated.id);
        }
      }

      return { filed };
    },

    runStaleSweep: async (now) => {
      const cutoff = new Date(now.getTime() - STALE_WINDOW_MS);
      const rows = await deps.db
        .select({ id: schema.inboxItems.id })
        .from(schema.inboxItems)
        .where(
          and(
            eq(schema.inboxItems.status, "triaged-pending"),
            lt(schema.inboxItems.lastActionAt, cutoff),
          ),
        );

      const archived: string[] = [];
      for (const row of rows) {
        const [updated] = await deps.db
          .update(schema.inboxItems)
          .set({ status: "stale", lastActionAt: now })
          .where(eq(schema.inboxItems.id, row.id))
          .returning();
        if (updated !== undefined) {
          archived.push(updated.id);
        }
      }

      return { archived };
    },
  };
}

interface RealTriageDeps {
  db: AppDatabase;
  llm: LLMClient;
  highConfidence: number;
  lowConfidence: number;
}

interface TriageCandidate {
  projectId: string;
  projectTitle: string;
  trueLineExcerpt: string | null;
  lastSourceTitle: string | null;
  similarity: number | null;
}

interface RawLLMClassification {
  projectId: string | null;
  confidence: number;
  reasoning: string;
}

type EmbeddingCapableLLM = LLMClient & {
  embed?: (
    input: string | { input: string },
  ) => Promise<
    | number[]
    | {
        embedding?: number[];
        embeddings?: number[][];
        data?: Array<{ embedding: number[] }>;
      }
  >;
};

function createRealTriage(deps: RealTriageDeps): TriageStub {
  return async ({ item, rawContent }) => {
    const content = textForTriage(rawContent);
    const candidates = await retrieveCandidates(deps.db, deps.llm, content);
    const response = await deps.llm.chat({
      system:
        "You classify Writer OS inbox deposits into existing writing projects. Return only valid JSON with keys project_id, confidence, and reasoning. Use null project_id when no candidate fits.",
      messages: [
        {
          role: "user",
          content: buildTriagePrompt({ item, content, candidates }),
        },
      ],
      maxTokens: 700,
      temperature: 0,
    });
    const classification = parseLLMClassification(response.text);
    const candidateIds = new Set(
      candidates.map((candidate) => candidate.projectId),
    );

    if (
      classification.projectId === null ||
      !candidateIds.has(classification.projectId) ||
      classification.confidence < deps.lowConfidence
    ) {
      return {
        kind: "no-match",
        reasoning: classification.reasoning,
      };
    }

    if (classification.confidence >= deps.highConfidence) {
      return {
        kind: "auto-filed",
        projectId: classification.projectId,
        sourceId: "pending-ingestion",
        confidence: classification.confidence,
        reasoning: classification.reasoning,
      };
    }

    return {
      kind: "proposed",
      projectId: classification.projectId,
      confidence: classification.confidence,
      reasoning: classification.reasoning,
    };
  };
}

async function retrieveCandidates(
  db: AppDatabase,
  llm: LLMClient,
  content: string,
): Promise<TriageCandidate[]> {
  const vectorReady = await hasPgVectorEmbeddingColumn(db);
  const embedding = vectorReady ? await tryEmbed(llm, content) : null;

  if (vectorReady && embedding !== null) {
    const candidates = await retrieveVectorCandidates(db, embedding);
    if (candidates.length > 0) {
      return candidates;
    }
  }

  // TODO(real-embeddings): LLMClient does not expose embeddings yet. In PGlite
  // the migration also uses a text fallback column, so retrieval deliberately
  // falls back to the existing most-recently-touched project heuristic while
  // still asking the LLM to classify and explain the decision.
  const fallback = await mostRecentlyTouchedCandidate(db);
  return fallback === null ? [] : [fallback];
}

async function tryEmbed(
  llm: LLMClient,
  content: string,
): Promise<number[] | null> {
  const embed = (llm as EmbeddingCapableLLM).embed;
  if (typeof embed !== "function") {
    return null;
  }

  const result = await embed.call(llm, content);
  if (
    Array.isArray(result) &&
    result.every((value) => typeof value === "number")
  ) {
    return result;
  }

  if (typeof result !== "object" || result === null) {
    throw new Error("LLM embed returned an unsupported shape");
  }

  const obj = result as Exclude<typeof result, number[]>;
  if (Array.isArray(obj.embedding)) {
    return obj.embedding;
  }
  if (Array.isArray(obj.embeddings) && Array.isArray(obj.embeddings[0])) {
    const [firstEmbedding] = obj.embeddings;
    return firstEmbedding ?? null;
  }
  if (Array.isArray(obj.data) && Array.isArray(obj.data[0]?.embedding)) {
    const [firstEmbedding] = obj.data;
    return firstEmbedding?.embedding ?? null;
  }

  throw new Error("LLM embed returned an unsupported shape");
}

async function hasPgVectorEmbeddingColumn(db: AppDatabase): Promise<boolean> {
  try {
    const rows = await executeRows<{
      data_type: string | null;
      udt_name: string | null;
    }>(
      db,
      sql`
        select data_type, udt_name
        from information_schema.columns
        where table_name = 'embeddings'
          and column_name = 'embedding'
        limit 1
      `,
    );
    const row = rows[0];
    return row?.udt_name === "vector" || row?.data_type === "vector";
  } catch {
    return false;
  }
}

async function retrieveVectorCandidates(
  db: AppDatabase,
  embedding: number[],
): Promise<TriageCandidate[]> {
  const vectorLiteral = `[${embedding.join(",")}]`;
  const rows = await executeRows<{
    project_id: string;
    project_title: string;
    true_line_content: string | null;
    last_source_title: string | null;
    similarity: number | string | null;
  }>(
    db,
    sql`
      select
        p.id as project_id,
        p.title as project_title,
        latest_true_line.content as true_line_content,
        latest_source.title as last_source_title,
        (1 - (e.embedding <=> ${vectorLiteral}::vector)) as similarity
      from embeddings e
      join sources s on s.id = e.source_id
      join projects p on p.id = coalesce(e.project_id, s.project_id)
      left join lateral (
        select content
        from true_line_versions
        where project_id = p.id
        order by version desc
        limit 1
      ) latest_true_line on true
      left join lateral (
        select title
        from sources
        where project_id = p.id
        order by last_referenced_at desc
        limit 1
      ) latest_source on true
      where coalesce(e.project_id, s.project_id) is not null
      order by e.embedding <=> ${vectorLiteral}::vector
      limit ${CANDIDATE_LIMIT * 3}
    `,
  );
  const seen = new Set<string>();
  const candidates: TriageCandidate[] = [];

  for (const row of rows) {
    if (seen.has(row.project_id)) {
      continue;
    }
    seen.add(row.project_id);
    candidates.push({
      projectId: row.project_id,
      projectTitle: row.project_title,
      trueLineExcerpt: excerpt(row.true_line_content),
      lastSourceTitle: row.last_source_title,
      similarity:
        row.similarity === null
          ? null
          : Number.parseFloat(String(row.similarity)),
    });
    if (candidates.length >= CANDIDATE_LIMIT) {
      break;
    }
  }

  return candidates;
}

async function mostRecentlyTouchedCandidate(
  db: AppDatabase,
): Promise<TriageCandidate | null> {
  const [project] = await db
    .select({ id: schema.projects.id, title: schema.projects.title })
    .from(schema.projects)
    .orderBy(
      desc(
        sql`coalesce(${schema.projects.nextSessionStarterUpdatedAt}, ${schema.projects.createdAt})`,
      ),
    )
    .limit(1);

  if (project === undefined) {
    return null;
  }

  const [trueLine] = await db
    .select({ content: schema.trueLineVersions.content })
    .from(schema.trueLineVersions)
    .where(eq(schema.trueLineVersions.projectId, project.id))
    .orderBy(desc(schema.trueLineVersions.version))
    .limit(1);
  const [source] = await db
    .select({ title: schema.sources.title })
    .from(schema.sources)
    .where(eq(schema.sources.projectId, project.id))
    .orderBy(desc(schema.sources.lastReferencedAt))
    .limit(1);

  return {
    projectId: project.id,
    projectTitle: project.title,
    trueLineExcerpt: excerpt(trueLine?.content ?? null),
    lastSourceTitle: source?.title ?? null,
    similarity: null,
  };
}

async function executeRows<T>(
  db: AppDatabase,
  query: SQL,
): Promise<T[]> {
  const result = await (
    db as AppDatabase & { execute: (query: SQL) => Promise<unknown> }
  ).execute(query);
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (isRecord(result) && Array.isArray(result.rows)) {
    return result.rows as T[];
  }
  return [];
}

function buildTriagePrompt(input: {
  item: InboxItem;
  content: string;
  candidates: TriageCandidate[];
}): string {
  return JSON.stringify(
    {
      task:
        "Choose the best project for this inbox item. Return JSON only: {\"project_id\": string|null, \"confidence\": number, \"reasoning\": string}.",
      inbox_item: {
        id: input.item.id,
        content_type: input.item.contentType,
        capture_surface: input.item.captureSurface,
        content_excerpt: excerpt(input.content, 1600),
      },
      candidates: input.candidates.map((candidate) => ({
        project_id: candidate.projectId,
        project_name: candidate.projectTitle,
        true_line_excerpt: candidate.trueLineExcerpt,
        last_source_title: candidate.lastSourceTitle,
        embedding_similarity: candidate.similarity,
      })),
      scoring:
        "Use 0.0-1.0 confidence. Prefer null project_id below a weak match. Pick only listed project_id values.",
    },
    null,
    2,
  );
}

function parseLLMClassification(text: string): RawLLMClassification {
  const parsed = JSON.parse(extractJsonObject(text)) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("triage LLM returned non-object JSON");
  }

  const projectIdValue = parsed.project_id ?? parsed.projectId;
  const confidenceValue = parsed.confidence;
  const reasoningValue = parsed.reasoning;

  if (
    projectIdValue !== null &&
    projectIdValue !== undefined &&
    typeof projectIdValue !== "string"
  ) {
    throw new Error("triage LLM returned invalid project_id");
  }
  if (
    typeof confidenceValue !== "number" ||
    !Number.isFinite(confidenceValue)
  ) {
    throw new Error("triage LLM returned invalid confidence");
  }
  if (typeof reasoningValue !== "string" || reasoningValue.trim().length === 0) {
    throw new Error("triage LLM returned invalid reasoning");
  }

  const projectId =
    typeof projectIdValue === "string" ? projectIdValue : null;

  return {
    projectId,
    confidence: Math.max(0, Math.min(1, confidenceValue)),
    reasoning: reasoningValue.trim(),
  };
}

function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/u);
  if (fenced?.[1] !== undefined) {
    return fenced[1];
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error("triage LLM did not return JSON");
}

function textForTriage(raw: RawContent): string {
  switch (raw.type) {
    case "text":
      return [raw.suppliedTitle, raw.body].filter(Boolean).join("\n\n");
    case "url":
      return raw.url;
    case "pdf":
      return [raw.filename, raw.blobRef].filter(Boolean).join("\n");
    case "voice-memo":
      return `${raw.audioRef}\nduration_ms: ${raw.durationMs}`;
    case "image":
      return raw.imageRef;
    case "book-reference":
      return [raw.title, raw.author, raw.notes].filter(Boolean).join("\n");
  }
}

function excerpt(value: string | null | undefined, limit = 500): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length === 0) {
    return null;
  }
  return normalized.length > limit ? normalized.slice(0, limit) : normalized;
}

function createDefaultTriageStub(db: AppDatabase): TriageStub {
  return async () => {
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .orderBy(
        desc(
          sql`coalesce(${schema.projects.nextSessionStarterUpdatedAt}, ${schema.projects.createdAt})`,
        ),
      )
      .limit(1);

    if (project === undefined) {
      return { kind: "no-match", reasoning: "no projects yet" };
    }

    return {
      kind: "proposed",
      projectId: project.id,
      confidence: 0.5,
      reasoning: "stub",
    };
  };
}

async function readItem(
  db: AppDatabase,
  itemId: string,
): Promise<InboxItemRow> {
  const [row] = await db
    .select()
    .from(schema.inboxItems)
    .where(eq(schema.inboxItems.id, itemId))
    .limit(1);

  if (row === undefined) {
    throw new Error("inbox item not found");
  }

  return row;
}

function updateForPendingDecision(
  decision: Exclude<TriageDecision, { kind: "auto-filed" }>,
  triagedAt: Date,
): Partial<typeof schema.inboxItems.$inferInsert> {
  if (decision.kind === "proposed") {
    return {
      status: "triaged-pending",
      decisionKind: decision.kind,
      decisionProjectId: decision.projectId,
      confidence: decision.confidence,
      agentReasoning: decision.reasoning,
      proposedProjectId: decision.projectId,
      triagedAt,
      lastActionAt: triagedAt,
    };
  }

  return {
    status: "triaged-pending",
    decisionKind: decision.kind,
    agentReasoning: decision.reasoning,
    triagedAt,
    lastActionAt: triagedAt,
  };
}

function rowToInboxItem(row: InboxItemRow): InboxItem {
  return {
    id: row.id,
    rawContentRef: row.rawContentRef,
    contentType: asRawContentType(row.contentType),
    captureSurface: asCaptureSurface(row.captureSurface),
    status: asInboxStatus(row.status),
    decision: decisionFromRow(row),
    proposedProjectId: row.proposedProjectId,
    resolvedProjectId: row.resolvedProjectId,
    sourceId: row.sourceId,
    agentReasoning: row.agentReasoning,
    depositedAt: row.depositedAt,
    triagedAt: row.triagedAt,
    filedAt: row.filedAt,
    lastActionAt: row.lastActionAt,
  };
}

function decisionFromRow(row: InboxItemRow): TriageDecision | null {
  switch (row.decisionKind) {
    case null:
      return null;
    case "auto-filed":
      return {
        kind: "auto-filed",
        projectId: required(row.decisionProjectId, "decisionProjectId"),
        sourceId: required(row.decisionSourceId, "decisionSourceId"),
        confidence: required(row.confidence, "confidence"),
        reasoning: required(row.agentReasoning, "agentReasoning"),
      };
    case "proposed":
      return {
        kind: "proposed",
        projectId: required(row.decisionProjectId, "decisionProjectId"),
        confidence: required(row.confidence, "confidence"),
        reasoning: required(row.agentReasoning, "agentReasoning"),
      };
    case "no-match":
      return {
        kind: "no-match",
        reasoning: required(row.agentReasoning, "agentReasoning"),
      };
    default:
      throw new Error(`unknown triage decision: ${row.decisionKind}`);
  }
}

function required<T>(value: T | null, field: string): T {
  if (value === null) {
    throw new Error(`inbox item missing ${field}`);
  }

  return value;
}

export function encodeRawContentRef(rawContent: RawContent): string {
  return `inline-json:${encodeURIComponent(JSON.stringify(rawContent))}`;
}

export function decodeRawContentRef(rawContentRef: string): RawContent {
  const prefix = "inline-json:";
  if (!rawContentRef.startsWith(prefix)) {
    throw new Error("unsupported raw content ref");
  }

  const parsed = JSON.parse(decodeURIComponent(rawContentRef.slice(prefix.length)));
  return asRawContent(parsed);
}

export function rawContentPreview(rawContentRef: string, limit = 80): string {
  try {
    const raw = decodeRawContentRef(rawContentRef);
    const text =
      raw.type === "text"
        ? raw.body
        : raw.type === "url"
          ? raw.url
          : raw.type === "book-reference"
            ? `${raw.author} — ${raw.title}`
            : raw.type;
    return text.length > limit ? text.slice(0, limit) : text;
  } catch {
    return rawContentRef.length > limit
      ? rawContentRef.slice(0, limit)
      : rawContentRef;
  }
}

function asRawContent(value: unknown): RawContent {
  if (!isRecord(value) || typeof value.type !== "string") {
    throw new Error("raw content malformed");
  }

  switch (value.type) {
    case "url":
      if (typeof value.url === "string") {
        return { type: "url", url: value.url };
      }
      break;
    case "pdf":
      if (typeof value.blobRef === "string") {
        const raw: Extract<RawContent, { type: "pdf" }> = {
          type: "pdf",
          blobRef: value.blobRef,
        };
        return typeof value.filename === "string"
          ? { ...raw, filename: value.filename }
          : raw;
      }
      break;
    case "text":
      if (typeof value.body === "string") {
        const raw: Extract<RawContent, { type: "text" }> = {
          type: "text",
          body: value.body,
        };
        return typeof value.suppliedTitle === "string"
          ? { ...raw, suppliedTitle: value.suppliedTitle }
          : raw;
      }
      break;
    case "voice-memo":
      if (
        typeof value.audioRef === "string" &&
        typeof value.durationMs === "number"
      ) {
        return {
          type: "voice-memo",
          audioRef: value.audioRef,
          durationMs: value.durationMs,
        };
      }
      break;
    case "image":
      if (typeof value.imageRef === "string") {
        return { type: "image", imageRef: value.imageRef };
      }
      break;
    case "book-reference":
      if (typeof value.title === "string" && typeof value.author === "string") {
        const raw: Extract<RawContent, { type: "book-reference" }> = {
          type: "book-reference",
          title: value.title,
          author: value.author,
        };
        return typeof value.notes === "string"
          ? { ...raw, notes: value.notes }
          : raw;
      }
      break;
  }

  throw new Error("raw content malformed");
}

function asRawContentType(value: string): RawContent["type"] {
  if (
    value === "url" ||
    value === "pdf" ||
    value === "text" ||
    value === "voice-memo" ||
    value === "image" ||
    value === "book-reference"
  ) {
    return value;
  }

  throw new Error(`unknown content type: ${value}`);
}

function asCaptureSurface(value: string): CaptureSurface {
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

  throw new Error(`unknown capture surface: ${value}`);
}

function asInboxStatus(value: string): InboxItemStatus {
  if (
    value === "captured" ||
    value === "triage-failed" ||
    value === "triaged-auto" ||
    value === "triaged-pending" ||
    value === "filed" ||
    value === "stale"
  ) {
    return value;
  }

  throw new Error(`unknown inbox status: ${value}`);
}

function randomUUID(): string {
  return (
    globalThis as unknown as { crypto: { randomUUID: () => string } }
  ).crypto.randomUUID();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
