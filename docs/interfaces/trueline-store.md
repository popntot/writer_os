# TrueLineStore — Locked Interface

**Status:** locked at module-interface depth review (2026-05-06). Concrete TypeScript signatures will land in `packages/shared-types` once the monorepo is scaffolded.

**Module priority:** High (per [`docs/prd.md`](../prd.md) §"Modules"; property-tested per §"Modules to test for v0.1").

## Responsibility

Versioned read/write of the canonical TrueLine document for a Project. One TrueLine per Project. Versioning is whole-document and append-only. The store is the single write path for TrueLine content, used by ConsolidationWorker (writes) and by the API projection layer + ConversationOrchestrator (reads). Vendor-swappable behind this interface (Supabase Storage today, R2 tomorrow — see [ADR-0003](../adr/0003-cloud-first-hybrid-storage.md)).

## Domain types

```ts
type ProjectId = string;           // UUID
type SessionId = string;           // UUID
type TrueLineVersion = number;     // monotonic per project; 0 = empty initial state

interface TrueLineDocument {
  projectId: ProjectId;
  version: TrueLineVersion;
  content: string;                 // markdown body
  sourceSessionId: SessionId | null;       // null only for v0 (empty initial)
  committedAt: Date;
  contributionSummary: string | null;       // "what this session added", null for v0
}

interface TrueLineVersionMeta {
  projectId: ProjectId;
  version: TrueLineVersion;
  sourceSessionId: SessionId | null;
  committedAt: Date;
  contributionSummary: string | null;
}
```

## Interface

```ts
interface TrueLineStore {
  // Read current TrueLine. Always returns a document — empty (v0) if never written.
  read(projectId: ProjectId): Promise<TrueLineDocument>;

  // Read a specific historical version. Returns null if version does not exist.
  readVersion(
    projectId: ProjectId,
    version: TrueLineVersion,
  ): Promise<TrueLineDocument | null>;

  // List version metadata (newest first), no content. Used by API for the
  // version-listing endpoint and by the per-Session contribution audit view.
  listVersions(projectId: ProjectId): Promise<TrueLineVersionMeta[]>;

  // Current version number (0 if never written). Cheap; metadata-only lookup.
  // Used by OutOfSyncDetector and freshness checks without paying the blob fetch.
  currentVersion(projectId: ProjectId): Promise<TrueLineVersion>;

  // Commit a new TrueLine version. Whole-document replacement.
  // Atomic: blob write + version pointer update succeed together or not at all.
  // Monotonic: returned document.version === currentVersion(projectId) before
  // call + 1. Concurrent calls for the same projectId are linearized.
  applyDelta(input: {
    projectId: ProjectId;
    sourceSessionId: SessionId;
    newContent: string;
    contributionSummary?: string;
  }): Promise<TrueLineDocument>;
}
```

## What this interface hides

- **Storage split.** Document bodies live in object storage; version metadata and the current-version pointer live in Postgres. Coordination of the two is internal.
- **Atomicity.** Blob-then-pointer ordering, idempotent retries on partial failure, and concurrent-write linearization are not visible to callers.
- **Caching.** The "current TrueLine" is read on every conversation turn during a live session. Read-through cache (and invalidation on `applyDelta`) is internal.
- **Vendor identity.** No signed URLs, no bucket keys, no Supabase RPC names, no R2 specifics surface. ADR-0003 calls this module out by name as the seam for a future vendor swap.
- **Initial-state handling.** Callers never see "TrueLine does not exist." A fresh project reads as `{ version: 0, content: "", sourceSessionId: null, ... }`.

## What this interface does *not* do (deliberately separated)

- **No section parsing.** TrueLine is opaque markdown here. Section identity (the `true_line_section_ref` referenced by OpenQuestions in the PRD schema) is a document convention maintained by ConsolidationWorker. If/when a `getSection(projectId, sectionRef)` need surfaces, it lives in a TrueLineSectionIndex module that wraps the store, not in the store.
- **No citation indexing.** "Source citations indexed into TrueLine" (PRD §"Consolidation loop") is a RAG/citation concern, not a storage concern.
- **No projection.** Stripping agent-internal scaffolding before serving to the UI (per [ADR-0004](../adr/0004-source-of-truth-and-projection.md)) happens in the API projection layer, not in the store. The store always returns the canonical document; the projection runs on the way out.
- **No diff computation.** `contributionSummary` is supplied by the writer (ConsolidationWorker has the diff in flight from its LLM pass). The store does not diff version N against N-1.
- **No patches.** No `applyPatch(...)` method. Consolidation produces full TrueLines per session, and TrueLine direct edit is read-only at MVP — there is no concurrent-partial-writer scenario to design for. Add patches only when a real caller needs them.

## Why these calls and not others

| Call | Caller(s) | Why it must be on the store |
|---|---|---|
| `read` | ConversationOrchestrator (every turn), API projection layer | Hot path; needs cache + atomic-current semantics. |
| `readVersion` | API version-listing endpoint, audit views, OutOfSyncDetector (occasional) | Historical access without re-deriving from session log. |
| `listVersions` | API version-listing endpoint, per-Session contribution view | Cheap metadata scan; would be wasteful as N round-trips of `readVersion`. |
| `currentVersion` | OutOfSyncDetector, freshness checks | Avoids paying a blob fetch when only the version number matters. |
| `applyDelta` | ConsolidationWorker (only writer at MVP) | Sole write path; encapsulates atomicity and monotonicity. |

## Invariants (property-tested)

1. `applyDelta` returns a document whose `version === previous currentVersion + 1`.
2. After `applyDelta`, `read(projectId)` returns the same document.
3. `readVersion(projectId, v)` for any committed `v` returns content equal to the content committed at version `v` (immutability of history).
4. Concurrent `applyDelta` calls for the same `projectId` produce a strict linearization — no version is skipped, none is duplicated, no content is lost.
5. For a project with no writes, `read` returns `{ version: 0, content: "", sourceSessionId: null, contributionSummary: null }` and `listVersions` returns `[]`.

## Deferred

- `applyPatch(projectId, patch, ...)` — only if a partial-writer use case appears.
- `TrueLineSectionIndex` (separate module) — only if section-ref resolution becomes a real query, e.g. when OpenQuestions need to render the linked section inline in the web UI.
- Soft-delete / project archival semantics — covered when archival is built; out of scope for this interface.
