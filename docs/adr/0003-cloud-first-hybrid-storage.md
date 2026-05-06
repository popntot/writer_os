# ADR-0003: Cloud-First Hybrid Storage with Document-Shaped Agent Layer

**Status**: Accepted
**Date**: 2026-05-06
**Deciders**: Will (founder/PM)
**Supersedes**: —
**Related**: PRD §"Data architecture", PRD §"Schema sketch", PRD §"Sources"; ADR-0004 (logical structure of the data, complementary to this ADR's physical-storage decision)

---

## Context

Writer OS holds three fundamentally different shapes of data:

1. **Documents the agent reads and rewrites in its native idiom** — TrueLine, per-Source synthesis docs, framework notes. These are markdown, prose-shaped, agent-edited, occasionally large. The agent's working surface.
2. **Structured records the user-facing UI queries** — Projects, Articles, Sources, Sessions, OpenQuestions, Inbox items. Tabular, indexed, paginated. The UI's working surface.
3. **Embeddings for semantic retrieval** — chunked source content as vectors, queried by similarity to provide RAG context to the agent during sessions.

The product surfaces are two clients (iOS app, web app) hitting a shared backend. iOS needs offline-read of recent projects/sessions. Web is a thin client over the network. Sessions, transcripts, and audio accumulate over years per user.

The architecture choice is where each shape lives, on what substrate, and how the clients access it.

A naive design picks one substrate (say, "everything in Postgres") and forces all three shapes through it, paying tax on each. A document store loses query power; a relational schema loses prose flexibility; vector-only loses both. The right answer is hybrid: each shape on the substrate that fits it, with one operational provider managing as much as possible.

This decision is paired with ADR-0004 (one source of truth + interface projection — the *logical* organization). ADR-0003 is the *physical* storage decision: where bytes live, what hosting model we adopt, and what the cross-client access pattern looks like.

## Decision

Writer OS adopts a **cloud-first hybrid storage architecture** built primarily on **Supabase** as the operational provider, with **Cloudflare R2 / Supabase Storage** for blob assets:

- **Postgres (Supabase)** holds structured records: Projects, Articles, Sources, Sessions, OpenQuestions, Inbox items, TrueLine version metadata. Standard CRUD, indexed, queryable.
- **pgvector (Supabase Postgres extension)** holds embeddings co-located with the structured records. Single SQL query can join an embedding lookup against per-Project filtering.
- **Object storage (Supabase Storage or Cloudflare R2)** holds blob and document content: TrueLine document bodies (versioned), Source synthesis docs, raw source content (cached HTML, PDF text, voice memo audio), session audio, session transcripts.
- **Cloudflare Workers** hosts the API. Stateless edge handlers fronting Supabase + Storage.
- **iOS (SwiftData)** caches recent Projects and Sessions for offline read and queues writes during offline. The cache is a projection of the canonical cloud state, not a peer.
- **Web** is a thin client. Standard HTTP caching only. No local persistence beyond browser-level session state.

**Cloud-first**: the canonical state of every user-visible artifact lives in the cloud. Local clients are caches and capture surfaces, not authorities.

**Document-shaped agent layer**: the agent reads and writes prose documents (TrueLine, source synthesis, framework notes) as **first-class markdown documents in object storage**, not as columns in a relational schema. The structured DB layer holds *metadata about* these documents (current version pointer, project ref, source session ref, committed-at timestamp); the documents themselves live as blobs.

**Single managed provider for the data plane**: Supabase manages Postgres, pgvector, auth (when needed), and Storage. Reduces operational burden and cross-service coordination at MVP.

## Alternatives Considered

### Alternative A: Local-first (CRDT, sync engine)
Run a local-first store on iOS (e.g., SQLite + sync engine like Replicache, Yjs over WebSocket, or Automerge), with the cloud as a sync target.

**Rejected** for v0.1 because:

1. The product's value is **the agent's persistent project memory**, which is canonically a cloud-side asynchronous consolidation process. A local-first model fights this — the spine has to live where consolidation runs, which is the cloud.
2. **Single-user, multi-device** is the only sync case at MVP. Cloud-first solves this directly without CRDT complexity.
3. **Conflict surface is small**: explicit-save on web, single-device write at any moment in the typical flow. The cases where local-first shines (frequent offline edits, multi-user collab) don't apply.
4. **Operational complexity is high**: a local-first sync engine adds a major dependency and a class of bugs (sync drift, schema migration) that aren't worth the cost when network is reliable for the target user.

Phase 2 may revisit if BYO-storage or full-offline operation becomes a requirement.

### Alternative B: Single-substrate (everything in Postgres, including documents and audio)
Store TrueLine and synthesis docs as Postgres TEXT columns; store audio as `bytea` or `LARGE_OBJECT`.

**Rejected.** Postgres is the wrong shape for prose-document workflows (no native versioning of large text, awkward update semantics for partial document edits) and is operationally expensive for blob storage (audio in Postgres makes backups, replication, and storage costs unbearable). Object storage is purpose-built for this and is dramatically cheaper.

### Alternative C: All-document store (Mongo, Firestore, etc.)
Drop the relational schema; store everything as documents.

**Rejected.** The structured records (Projects, Sessions, Sources) need indexed, queryable, joined access — exactly what a relational schema is for. Document stores would lose this and force application-side indexing.

### Alternative D: Dual-cloud split (e.g., AWS RDS + S3 + separate vector DB)
Split across multiple cloud providers, each best-of-breed.

**Rejected** for v0.1. Three providers (Anthropic, ElevenLabs, plus the data plane) are already enough vendor coordination. Splitting the data plane across two more providers adds operational tax for no MVP-load benefit. Supabase covers Postgres + pgvector + Storage in one account, one billing surface, one auth model. Productization may revisit if Supabase becomes a constraint at scale.

### Alternative E: Cloudflare R2 + D1 + Vectorize (full Cloudflare stack)
Use Cloudflare's Postgres-equivalent (D1) and vector index (Vectorize) instead of Supabase.

**Deferred.** Cloudflare's data services are improving rapidly but are less mature than Supabase for the SQL + pgvector workload. Workers stay on Cloudflare for API hosting; data plane stays on Supabase. **Migration is preserved as an option** behind the same module boundaries — `SpineStore`, `TrueLineStore`, `RAGRetriever` are vendor-agnostic by design.

## Consequences

### Architecture

1. **Three storage tiers, one provider envelope.** Postgres (structured), pgvector (embeddings), object storage (documents, audio, transcripts). All operationally inside Supabase at MVP.
2. **API is stateless edge functions.** Cloudflare Workers; horizontal scale; no per-instance state. All durable state in Supabase.
3. **iOS holds a projection cache, not a peer store.** SwiftData cache invalidates against cloud truth; conflicts resolve cloud-side, not by sync.
4. **Web is thin client.** No local persistence model to build or maintain at MVP. Offline web is out of scope.

### Document layer behavior

5. **TrueLine is versioned in object storage**, with metadata (current version pointer, version history, source session refs, committed-at) in Postgres. Reads of "current TrueLine" are a metadata lookup + blob fetch. Reads of historical versions are blob fetches by version key.
6. **Synthesis docs and framework notes follow the same pattern.** Per-Source extended synthesis is a markdown blob; per-Source metadata is a row.
7. **Agent edits documents as whole-document writes**, not row-level updates. The document is the unit. Versioning is at the document level.

### Embeddings

8. **pgvector co-located with relational data** allows joining `WHERE project_id = ?` filters with similarity search in a single SQL query. Avoids the dual-store coordination penalty of a separate vector DB.
9. **Embedding model is part of the ingestion contract**, not the storage layer. Swapping embedding models (e.g., OpenAI → Voyage AI → Cohere) is a re-embedding migration, not a storage change.

### Audio and transcripts

10. **Audio lives in object storage with a tiering policy** (per PRD: 0–30 days hot, 30–365 cold, 365+ auto-delete unless pinned). Transcripts live indefinitely in object storage (cheap, primary record).
11. **Signed URLs** front audio access; clients never get raw bucket access.

### Cost

12. **Storage cost dominated by audio** at scale. Tiering keeps it tractable; aggressive deletion of stale untouched audio is the safety valve.
13. **Egress is the variable to watch.** Cloudflare R2 has zero egress fees, which is why R2 is the preferred audio bucket if Supabase Storage costs become unfavorable. Module boundary supports the swap.

### Cross-machine / cross-device

14. **Push-to-cloud is the sync model.** iOS writes to cloud; web reads from cloud. No iOS-to-web direct path.
15. **Will's cross-machine dev workflow** is unaffected — the codebase syncs via GitHub, the data plane is the same Supabase project from any machine.

### Module boundaries (deep modules per PRD)

16. **`SpineStore`** is the structured-record CRUD module. Wraps Supabase Postgres. Vendor swap is one-module.
17. **`TrueLineStore`** is the versioned-document module. Wraps object storage + Postgres metadata. Vendor swap is one-module.
18. **`SourceIngestionPipeline`** owns the document-shaped synthesis output. Writes both blob and metadata in one transactional flow.
19. **`RAGRetriever`** wraps pgvector queries. Embedding-vendor swap and vector-store swap both go through this module.
20. **`AudioStore`** wraps object storage + tiering lifecycle. R2 vs. Supabase Storage swap is one-module.

## Open Questions

- **Supabase project topology**: single project for MVP, or per-environment (dev/staging/prod) projects? Single is fine at MVP; revisit before productization.
- **R2 vs. Supabase Storage for audio specifically**: the egress cost picture favors R2 once scale grows. Defer the call until first real usage data; the module boundary preserves the swap.
- **Embedding provider**: OpenAI vs. Voyage AI vs. Cohere vs. self-hosted. Defer to the first ingestion-pipeline issue. Voyage is a strong candidate (Anthropic-recommended); pin the choice when that issue lands.
- **Backup and disaster recovery**: Supabase point-in-time recovery covers Postgres; object storage durability is provider-guaranteed. A user-facing export path is Phase 2.

## Notes

The architectural shape locked here is: **prose lives as blobs, metadata lives in Postgres, embeddings live alongside metadata, audio lives in object storage on a tier ladder.** Everything the agent edits as prose is first-class document. Everything the UI queries is first-class row. Embeddings are an index on Sources. Audio is a tiered blob.

Each shape on the substrate that fits it. One provider managing most of it. Module boundaries protecting every swap.
