# SourceIngestionPipeline — Locked Interface

**Status:** locked at module-interface depth review (2026-05-06). Concrete TypeScript signatures will land in `packages/shared-types` once the monorepo is scaffolded.

**Module priority:** High (per [`docs/prd.md`](../prd.md) §"Modules").

## Responsibility

Transform a raw deposit into a fully processed Source: extracted text, user-facing summary, agent-internal chunks + embeddings, persisted Source record. One method per ingestion; type-specific processing branches internally. Per PRD §"Source ingestion (MVP types)":

- **URL** — fetch HTML, readability-parse, cache full content (link-rot insurance), summarize, chunk (~800 tokens with overlap), embed each chunk into pgvector.
- **PDF** — extract text (no OCR at MVP), then same summarize + chunk + embed.
- **Text dump / quote** — store, summarize if >500 words, embed.
- **Voice memo** — transcribe via Apple Speech, summarize, embed.
- **Book reference** — title + author + optional notes only. No full-text indexing.

The pipeline is the only writer of `sources` rows and per-source artifacts (cached content, embeddings). It runs synchronously from its caller's view (InboxTriageEngine) but uses streaming I/O internally; it does not own a queue surface.

## Domain types

```ts
type SourceId = string;
type InboxItemId = string;

type RawContent =
  | { type: "url";            url: string }
  | { type: "pdf";            blobRef: string; filename?: string }
  | { type: "text";           body: string; suppliedTitle?: string }
  | { type: "voice-memo";     audioRef: string; durationMs: number }
  | { type: "image";          imageRef: string }                // accepted; ingestion no-ops at MVP (OCR deferred)
  | { type: "book-reference"; title: string; author: string; notes?: string };

type SourceKind = RawContent["type"];

interface ProcessedSource {
  id: SourceId;                              // stable identity from ingestion forward
  inboxItemId: InboxItemId;                  // origin
  kind: SourceKind;
  title: string;                             // extracted, supplied, or "<filename>" / "<author> — <title>"
  originalUri: string | null;                // URL for url; null otherwise
  cachedContentRef: string | null;           // raw cache ref (HTML, extracted PDF text, transcript) — null for book-reference and image
  summary: string | null;                    // user-facing summary; null for short text, book-reference, image
  embeddingsRef: EmbeddingsRef | null;       // null for book-reference, image, very short text
  ingestedAt: Date;
}

interface EmbeddingsRef {
  sourceId: SourceId;
  chunkCount: number;
}
```

## Interface

```ts
interface SourceIngestionPipeline {
  // Ingest a raw deposit. Creates the sources row (with project_id null —
  // populated later by InboxTriageEngine at filing time), processes per-type,
  // writes cached content + summary + embeddings, returns the ProcessedSource.
  //
  // Idempotent on inboxItemId: re-running returns the existing ProcessedSource
  // without re-fetching, re-parsing, or re-embedding.
  //
  // Throws on terminal failure (URL 404, PDF corrupt, transcription failed).
  // The caller (InboxTriageEngine) handles failure-path bookkeeping.
  ingest(input: {
    inboxItemId: InboxItemId;
    raw: RawContent;
  }): Promise<ProcessedSource>;

  // Read a previously processed source by id. Used by InboxTriageEngine to
  // hand processed content to the triage LLM; used by RAGRetriever and
  // citation lookups for metadata. Chunks themselves are read via RAGRetriever.
  getProcessedSource(sourceId: SourceId): Promise<ProcessedSource>;
}
```

## What this interface hides

- **Per-type processing.** URL fetch + readability + cache, PDF text extraction, Apple Speech transcription, chunking strategy, embedding model choice — all internal. The type tag on `raw` drives a single dispatch.
- **Stage ordering.** Whether the pipeline writes the `sources` row first then the cached content then the summary then the embeddings, or batches them, or rolls back on partial failure.
- **Embedding storage.** pgvector vs alternative; chunk size; overlap; embedding model. Surfaced only as the opaque `EmbeddingsRef`.
- **Title derivation.** From `<title>` for HTML, from PDF metadata or filename for PDFs, from `suppliedTitle` for text, from "voice memo {timestamp}" for voice memos, from `{author} — {title}` for book references. Internal heuristic.
- **Idempotency mechanism.** Per-inboxItemId lock + completed-check, source-row UPSERT keyed by inboxItemId, or content-hash dedup. Implementation choice.
- **Network + I/O retry.** Transient HTTP, blob-fetch, and LLM failures retry internally with backoff before raising.

## What this interface does *not* do (deliberately separated)

- **No project assignment.** The `sources` row is created with `project_id = null`. InboxTriageEngine sets it at auto-file or user confirmation. ADR-0004's single-write-path principle applies: this module owns the inbox→source artifact write; the engine owns the project linkage.
- **No queue.** Unlike ConsolidationWorker and InboxTriageEngine, this pipeline is invoked synchronously by its single caller. The async-from-user-perspective behavior comes from the inbox engine's queue, not here.
- **No retrieval.** Reading chunks for RAG queries lives in RAGRetriever. This module produces the embeddings; the query side is elsewhere.
- **No re-ingestion / re-processing.** No `reingest(sourceId)` for "the URL changed, re-fetch." If/when needed, surfaces as a separate method.
- **No synthesis-doc maintenance.** Per-source extended synthesis (PRD §"Source ingestion" — agent-internal) is *not* part of this lock. The PRD mentions it but does not pin when it's authored or by which module. Defer until pinned (likely a SourceSynthesisUpdater module driven by ConsolidationWorker).
- **No citation indexing.** "Citation graph linking back to TrueLine entries" (PRD §agent-internal) belongs to a citation-index module, not the pipeline.
- **No image OCR.** `image` type produces a ProcessedSource with `cachedContentRef: imageRef` and everything else null. Hangs in the inbox until OCR ships.

## Why these calls and not others

| Call | Caller(s) | Why on this interface |
|---|---|---|
| `ingest` | InboxTriageEngine, immediately after `deposit` | The single transform-and-persist entry point. |
| `getProcessedSource` | InboxTriageEngine (during `triageItem`); citation lookups; admin / debug reads | Generic read by id; metadata-shaped. Chunk content goes through RAGRetriever, not here. |

That's it. Two methods. The pipeline does not need a queue, status, retry, or sweep surface — those concerns live one layer up in InboxTriageEngine.

## Invariants (integration-tested per PRD §"Testing Decisions")

1. **Idempotent ingest.** Re-running `ingest` with the same `inboxItemId` returns the same `ProcessedSource.id`, does not duplicate the `sources` row, does not re-fetch the URL, does not re-embed.
2. **Per-type completeness.**
   - URL → `cachedContentRef`, `summary`, `embeddingsRef` all non-null on success.
   - PDF → same.
   - Text >500 words → `summary`, `embeddingsRef` non-null; `cachedContentRef` non-null (the body itself).
   - Text ≤500 words → `cachedContentRef` non-null; `summary` may be null; `embeddingsRef` non-null.
   - Voice memo → `cachedContentRef` (transcript), `summary`, `embeddingsRef` all non-null.
   - Book reference → `cachedContentRef` null; `summary` null; `embeddingsRef` null. Only `title` and structured fields populated.
   - Image → all rich fields null; `cachedContentRef` = imageRef.
3. **Source-row state at end of ingest.** A `sources` row exists with `id === ProcessedSource.id`, `project_id IS NULL`, `type = kind`, `first_seen_at = ingestedAt`. InboxTriageEngine populates `project_id` on file/auto-file.
4. **Failure leaves no orphans.** If ingest throws, no partial `sources` row is left behind; no embeddings exist for the failed source. (Implementation may use a transaction or compensating delete.)

## Integration test shape

Per PRD §"Testing Decisions" — real DB, stubbed LLM + stubbed HTTP fetcher. For each type, a fixture raw deposit goes in; assert the ProcessedSource shape, the `sources` row state, and (for embedding-producing types) that `chunkCount` matches the chunker's output for the fixture content.

## Deferred

- `reingest(sourceId)` — only if URL refresh / cache invalidation becomes a real need.
- Per-source extended synthesis doc — out of this lock; pin owner when the synthesis-update story is decided.
- OCR for image type — accepted-but-unprocessed per PRD.
- Multi-language transcription / translation — Apple Speech default at MVP.
- Custom chunkers per type — single chunker at MVP.
