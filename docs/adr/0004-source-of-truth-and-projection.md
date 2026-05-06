# ADR-0004: One Source of Truth + Interface Projection (Not Dual Data Architecture)

**Status**: Accepted
**Date**: 2026-05-06
**Deciders**: Will (founder/PM)
**Supersedes**: —
**Related**: PRD §"Data architecture", PRD §"Spine model"; ADR-0003 (physical storage, complementary to this ADR's logical-organization decision)

---

## Context

The Writer OS agent maintains a substantial body of structured prose to do its job: TrueLine narratives, framework notes, internal synthesis docs, the next-session conversation starter, the agent's reasoning scratch behind triage decisions. Some of this is content the user explicitly wants surfaced (TrueLine, source summaries, OpenQuestions). Some is the agent's working scaffolding (intermediate framework notes, internal synthesis the user shouldn't have to read).

There is a tempting architecture that would treat the agent's working layer and the user-facing layer as **two stores that sync to each other** — the agent has its docs, the UI has its docs, and a sync mechanism keeps them aligned. This is wrong.

A two-store-with-sync architecture compounds three failure modes:

1. **Sync drift.** Two stores will diverge. Reconciling them becomes the dominant operational and code-complexity tax.
2. **Duplication of authority.** When an artifact has two homes, a bug in either home creates a corruption that requires deciding which home was right.
3. **Surface-level UI design constraints leaking into agent design.** If the UI store dictates shape, the agent has to translate; if the agent dictates shape, the UI shows scaffolding the user shouldn't see.

The right architecture is **one canonical store, two views**. The agent layer is the source of truth. The user-facing layer is a *projection* derived from the agent layer at read time, with the agent's internal scaffolding stripped. Not two stores. One store, with two presentation contracts.

This ADR is paired with ADR-0003. ADR-0003 decides *where bytes live* (cloud-first hybrid: Postgres + pgvector + object storage). ADR-0004 decides *how the agent's data is organized into a logical hierarchy of authority* (one canonical agent layer, projections to UI).

## Decision

Writer OS adopts a **one-source-of-truth + interface-projection** data architecture:

- **The agent layer is canonical.** All authoritative content — TrueLine, OpenQuestions, source synthesis, framework notes, internal scaffolding — lives in one logical layer. There is no separate "UI store" with its own copy.
- **The user-facing layer is a projection.** When the UI requests a Project's TrueLine, an Article, a Source summary, or any other user-visible artifact, the API layer projects from the canonical store. The projection strips agent-internal scaffolding (frameworks the user didn't ask for, maintenance docs, internal synthesis the user shouldn't see) and exposes only the user-facing surface.
- **No agent-to-UI sync mechanism exists.** No background job copies content from agent layer to UI layer. The "sync" between agent state and UI state is a read-time projection, computed on demand.
- **Writes flow only into the canonical layer.** UI writes (e.g., user edits an Article draft on the web editor) write to the canonical layer; the agent reads from the same place; no separate UI-write queue.
- **The projection contract is explicit and versioned.** What the agent stores vs. what the UI sees is a defined surface, owned by API-layer code. Changing the projection is a code change, not a data migration.

This applies uniformly across all artifact types: Projects, Articles (outline / draft / scratchpad), Sources, Sessions, OpenQuestions, TrueLine versions, Inbox items.

## Alternatives Considered

### Alternative A: Dual data architecture with sync
Two stores: an agent-private working layer and a user-facing UI layer. A sync process copies the user-relevant subset from the agent layer to the UI layer.

**Rejected.** Sync is the wrong primitive for this problem. The agent and UI consume the same underlying truth — they differ only in what subset they're allowed to see. Sync introduces drift, duplicates authority, and forces a permanent reconciliation engineering load. Projection-on-read is strictly simpler, strictly more correct, and strictly cheaper.

### Alternative B: Two stores with shared canonical IDs (federation, not sync)
Two stores that don't sync but reference each other by ID; UI joins across them at read time.

**Rejected.** This is just the two-store architecture with the sync problem renamed as a "join problem." Same drift surface, same duplicate authority, same operational tax. Worse, federated joins across two storage systems are slower and harder to reason about than one store with a projection function.

### Alternative C: UI-layer-as-canonical, agent reads UI shape
Invert the relationship: the UI's shape is canonical, the agent reads UI documents and treats them as input.

**Rejected.** The agent is the system that does the reasoning, the consolidation, and the long-context maintenance. Forcing the agent to work in UI shape would constrain its reasoning to the user-presentation surface and lose the agent's ability to maintain the scaffolding it needs to work effectively. The agent's working idiom (richer than UI surface) is the right canonical shape.

### Alternative D: Event-sourced shared log, both layers as projections
Events as the single source of truth; both agent state and UI state are derived from the event log.

**Considered, deferred.** Event sourcing has real merits for an agent system (auditability, time travel, replay). It is also a substantial architectural commitment with operational and conceptual overhead that is hard to justify at MVP scale. The current decision (one canonical store, projections to UI) does not preclude moving to event sourcing later — the projection contract is the same shape regardless of the underlying store. **Revisit at productization** if audit and replay become product requirements.

## Consequences

### Architecture

1. **One write path per artifact**, not two. UI writes (user edits an Article) and agent writes (consolidation produces a TrueLine delta) both target the canonical layer.
2. **Projection is a function**, not a process. The UI projection of a Project is computed at API request time, not stored as a separate artifact. No projection cache to invalidate at MVP (cache layer can land later if performance demands it; the projection contract supports it transparently).
3. **The agent stores what it needs to think**, not what the UI needs to render. Agent-internal scaffolding (working framework notes, intermediate synthesis, the next-session-starter pre-bake content) lives at the canonical layer alongside user-visible content; the projection filters at the API boundary.
4. **The API layer owns the projection contract.** Concrete implementation: per-artifact projection functions in `packages/api`, typed against a single shared schema (`packages/shared-types`). Shape changes go through code review.

### Module boundaries

5. **`SpineStore` returns canonical shape.** Internal-only. Not exposed directly to clients.
6. **`TrueLineStore.read(projectId)` returns the canonical TrueLine document.** The API endpoint that serves "GET /projects/:id/trueline" calls `TrueLineStore.read` and runs it through the TrueLine projection function before returning to the client.
7. **Projection functions are unit-testable.** Given a canonical artifact (with scaffolding included), the projection function returns the user-facing artifact (scaffolding stripped). Pure function; trivial to test.
8. **No "UI repository" abstraction.** There is no `UITrueLineRepository`, `UIArticleRepository`, etc. Adding one is a code smell — it would imply a UI-private store, which this ADR forbids.

### Edits

9. **User edits write to the canonical layer.** When a user saves an Article draft on web, the write is a canonical-layer mutation against `SpineStore`. The agent reads from the same place on the next session.
10. **Edit-without-reconcile** is one of the five out-of-sync indicators (per PRD §"Out-of-sync detection"). When a user edits content that contradicts the current TrueLine, a reconciliation pass is queued. The user-edit content is canonical; the reconciliation aligns the TrueLine to the new canonical state.
11. **Race between agent write and user write** during an active session: the agent waits or merges. PRD specifies the agent acknowledges (*"still wrapping up our last walk, give me a moment"*) and merges. Merge logic is `ConsolidationWorker`'s problem, not a sync engine's.

### What the user never sees

12. **Agent scaffolding never leaks.** Internal framework notes, the next-session-starter content, the agent's reasoning behind triage decisions — none of these are exposed via the standard projection. (Triage reasoning *is* exposed by design, per PRD §"Inbox triage", but as a deliberately-projected field, not as an accidental leak.)
13. **The user can audit when they want to.** A future "show me the agent's working layer for this Project" debug surface is possible — but not exposed by default, and not via a separate store; it's a debug projection of the same canonical state.

### Migrations and shape changes

14. **Shape changes happen in two places coherently**: the canonical schema (a database migration) and the projection function (a code change). Both ship together. There is never a migration that updates two stores.
15. **Shape changes don't require sync engine reconciliation.** Backfill if needed; project the new shape; ship.

### Cross-cutting

16. **OpenQuestions, Sources, Sessions, Inbox items** all follow the same canonical-and-projection pattern. The architecture is uniform across artifact types — no per-type exception.
17. **Test surface**: integration tests assert the projection contract (given canonical state X, the API returns user-facing state Y). Property tests assert invariants (no scaffolding field ever appears in projected output).

## Open Questions

- **Performance ceiling for projection-on-read**: at what scale does the projection function need a cache layer? Defer until measured; the contract supports a cache transparently.
- **User-controlled visibility**: would a power user ever want to see the agent's full working layer for a Project? Not at MVP. If introduced later, it's a debug projection, not a separate store.
- **Event sourcing migration path**: if audit/replay becomes a product requirement, what's the cost of moving from "store of canonical state" to "log of events that produces canonical state"? The projection contract survives the move; the SpineStore implementation changes underneath.

## Notes

The mental model: **the agent has one workspace. The user has one window onto it.** The window is shaped by code, not maintained by sync.

This is the data architecture decision that, more than any other, determines whether the system stays simple as it grows. Two-store-with-sync architectures collapse under their own weight in a small number of years. One-store-with-projection architectures stay clean for as long as the projection contract is well-tended.

The cost of getting this right at the start is trivial. The cost of fixing it later is enormous. That is why this is an ADR.
