# ADR-0006: Agent-Internal Artifact Craft (Pocock-Derived Moves)

**Status**: Accepted
**Date**: 2026-05-12
**Deciders**: Will (founder/PM)
**Supersedes**: —
**Related**: ADR-0004 (one source of truth + interface projection), PRD §"Consolidation loop", PRD §"Source ingestion", PRD §"Honesty principles", `docs/interfaces/consolidation-worker.md`, `docs/interfaces/source-ingestion-pipeline.md`

---

## Context

ADR-0004 split the data architecture into two layers: a **canonical agent layer** (where the agent reads and rewrites in its native idiom — TrueLine, source synthesis docs, framework notes) and a **user-facing interface layer** (the projection that strips agent scaffolding). The agent layer is where the brain lives. Until now, the PRD has named the *principles* the brain should encode (Albrighton clarity, Heath stickiness, Fitzpatrick & Hunt pedagogical structure, Strunk & White economy) but not the *operational moves* — i.e., what the agent should actually do when it sits down to write a TrueLine delta or a source synthesis doc.

Matt Pocock's recently published writing skills (`writing-fragments`, `writing-shape`, `writing-beats`, `edit-article`) provide concrete operational frameworks for the missing how-to layer. Each skill encodes a discrete craft phase:

- **writing-fragments** — heterogeneous-noticings capture; bar is "is this good writing?" not "is this self-contained?"; novelist's-diary mental model; append-only, `---` separator, no taxonomy.
- **writing-shape** — 2–3 candidate openings (each implies a different thesis), paragraph-by-paragraph growth, format-arguments out loud (prose vs list vs callout vs table vs quote vs code), pile-as-quarry-not-script.
- **writing-beats** — beat-by-beat journey; beat sized by what it needs; "this is two beats glued together" diagnosis; journey ends when complete, not when pile is empty.
- **edit-article** — information-as-DAG; sections respect dependencies; 240-char paragraph cap.

The question this ADR resolves: **adopt these moves as the contract for agent-internal artifact construction, or leave them unstandardized.**

The user-facing surface (Articles, draft-sections, outlines, user-facing scratchpad entries) is **out of scope** for this ADR — those decisions belong to the ArtifactGenerator interface lock (#17), where the user-facing-craft question can be made with the artifact taxonomy in hand.

## Decision

Pocock-derived craft moves are adopted as the **contract for how the agent constructs its own internal artifacts**: TrueLine deltas, source synthesis docs (extended, agent-internal), framework notes, and the mid-session fact-capture buffer.

The moves apply as follows:

### Fragment framework (writing-fragments)

Used wherever the agent mines heterogeneous material — mid-session light consolidation, extended source synthesis docs, framework-note construction, the inbox triage rationale.

- A **fragment** is any piece of agent-readable noticing — a claim, a vignette, a half-thought, a quoted snippet, a list-by-feel — that may survive into a later structured form. Bar: "is this a useful future-self memory?" not "is this polished prose?"
- Fragment files are append-only, separated by `\n---\n`, no headings inside the body, no tags, no order beyond the order added.
- Fragments are deliberately heterogeneous. Resist the urge to taxonomize at capture time.
- The novelist's-diary metaphor is load-bearing: years of unstructured noticings that later get mined for raw material.

### Shape moves (writing-shape)

Used wherever the agent consolidates fragments into a narrative document — TrueLine deltas, framework notes, the current-state TrueLine document.

- **Pile-as-quarry, not script.** Treat session transcripts, retrieved Sources, and existing fragments as raw material to mine, paraphrase, split, recombine. The output reads as one voice. Never copy-paste verbatim unless quoting is the point.
- **Branching decisions present 2–3 candidates.** When the agent picks an opening for a TrueLine delta, a framing for a framework note, or a new section structure, generate 2–3 candidates with different implied theses. The internal "decider" pass picks one and commits the rationale. (This is the same shape as the in-session escalation move from ADR-0005 — 2–3 options + a recommendation — applied internally to brain construction.)
- **Grow paragraph-by-paragraph.** Each new paragraph in a consolidated document must earn its place by answering *"what does the next reader (likely the agent itself at a future session) need to hear next, given what comes before?"*
- **Argue format choices.** Prose vs list vs table vs callout vs code-block is a deliberate decision, not a default. Prose carries argument; lists carry parallel items; tables carry repeated structure; callouts carry asides that would otherwise derail. Encode in the consolidation prompt that the agent should pick deliberately.

### DAG-of-information (edit-article)

Used for the **current-state TrueLine document** (the ≤5–10k-token version injected into live conversation context) and for any compaction pass.

- Information has dependencies. Section order respects them. A claim that depends on a definition appears after the definition.
- The token cap on the current-state document forces ruthless dependency pruning. The compaction pass is itself a craft move, not a truncation.

### Re-read-before-write (all four skills)

This is the **mandatory discipline** for any agent-internal artifact write. ConsolidationWorker, SourceIngestionPipeline, and any other writer of agent-layer documents MUST read the current state from storage immediately before committing a delta, and MUST merge into it rather than overwrite. Conflicts surface as out-of-sync indicators per PRD §"Out-of-sync detection" rule #2, not silent overwrites.

This matters most for async consolidation: a TrueLine may have received a write from another session (or a direct user edit, once that's enabled) between the start of a consolidation pass and its commit. The locked TrueLineStore interface already encodes monotonic versioning + linearization (property-tested per `docs/interfaces/trueline-store.md` invariant #4), but the *content merge logic* lives in ConsolidationWorker and is the thing this rule constrains.

### 240-character paragraph cap

Default for all agent-internal prose. Override only when a deliberate craft reason demands it (almost never in agent-layer documents — long paragraphs hurt future-self memory). Encode as a system-prompt guideline, not a post-generation truncator.

### Beats — not adopted for agent-internal

The writing-beats skill is for reader-journey narrative work. Agent-internal artifacts are reference documents, not journeys. **Beats are not in scope for agent-internal craft.** They may be relevant for user-facing narrative-genre Articles when #17 is sliced — defer that decision.

## Alternatives Considered

### Alternative A: Leave the agent layer unstandardized; encode craft moves only at the ArtifactGenerator (user-facing) seam.
**Rejected.** The agent layer is where the most consequential writing happens — TrueLine is the project's compounding memory; source synthesis docs are what RAG retrieves from; framework notes are the project's emergent structure. Leaving these unstandardized risks the agent producing inconsistent, structure-by-vibes internal artifacts that degrade as the project grows. The user-facing layer can always be projected later from a well-crafted agent layer; the inverse is much harder.

### Alternative B: Adopt all four skills wholesale, agent-internal AND user-facing.
**Rejected for this ADR.** The user-facing decisions depend on the artifact taxonomy that will be finalized at #17 (ArtifactGenerator interface lock). Pinning user-facing craft now risks over-specifying ahead of the implementation seam. Defer.

### Alternative C: Adopt only the fragment framework; leave shape/edit moves to base-prompt vibes.
**Rejected.** Fragments without a shape pass produce a permanent pile, not a memory. The TrueLine's whole value is that it *is* shaped — consolidated, dependency-ordered, ruthlessly compacted. Half the contract isn't enough.

### Alternative D: Treat Pocock skills as inspiration but write our own framework from scratch.
**Rejected by cost-benefit.** The Pocock moves are already operationalized at the right grain for system-prompt encoding. Rewriting them in our own terminology gains nothing and loses the lineage. Will's standing instruction is SME-informed development; treating an SME's published framework as the starting point is the SME-informed move.

## Consequences

### Interface contracts

1. **ConsolidationWorker** is the primary site of these moves. Update `docs/interfaces/consolidation-worker.md` with a "Craft contract" section pinning: fragment framework for mid-session capture, shape moves for the consolidated TrueLine delta, re-read-before-write as mandatory, DAG-of-information for any compaction.
2. **SourceIngestionPipeline** uses the fragment framework for the agent-internal extended synthesis doc per Source. Update `docs/interfaces/source-ingestion-pipeline.md` accordingly. The user-facing short summary is *not* constrained by these moves — it's a different artifact with a different consumer.
3. **TrueLineStore** is unchanged. It stores content opaquely; the craft moves are about how content is constructed, not how it's stored.

### System prompts

4. The base agent's consolidation system prompt (lives in `packages/prompts` per PRD §"High-level architecture") encodes the four moves. The prompt is the operational locus; the ADR is the rationale.
5. The mid-session light-consolidation prompt encodes the fragment framework specifically and explicitly disclaims structure: "capture, do not classify."

### Schema

6. **No schema changes required.** Fragment files and synthesis docs live in the document-shaped agent layer (object storage), not as structured DB rows. Their craft contract is content-level, not schema-level.

### Test discipline

7. Fixture-driven tests for ConsolidationWorker (per PRD §"Testing Decisions") gain new fixtures: a "two-beats-glued-together" session (the consolidation should split it), a "stale-TrueLine-mid-consolidation" scenario (re-read-before-write must surface the conflict), a "fragment-buffer-mid-session" trace (heterogeneity preserved, no premature taxonomy).
8. **Do not test prose quality.** Per PRD §"What makes a good test for this system": LLM output is variable. Test the orchestration — did the agent produce 2–3 candidates at branch points, did re-read fire before write, did the output respect the 240-char cap, did the fragment buffer keep `---` separators.

### Deferred

9. **User-facing artifact craft (ArtifactGenerator)** — decided at #17 interface lock.
10. **Genre profiles (argument-shape vs narrative-beats vs other)** — decided when Phase 2 Mentors are designed, or earlier if #17 surfaces a real fork.
11. **Bias audit (per ADR-0001)** — operates on the agent layer; the craft moves above don't change its scope.

## Open Questions

- **Fragment-buffer lifecycle.** Mid-session fragments live where, exactly? Session-scoped in memory? Persisted to a per-session blob? Probably the latter so a crash mid-walk doesn't lose them — but the lifecycle isn't specified in the existing ConsolidationWorker interface. Surface at #9 implementation time.
- **Compaction trigger for the current-state TrueLine.** Token cap is 5–10k. What fires the compaction pass — a hard token count, a version-count threshold, or post-consolidation always? Probably "post-consolidation always, with a cap check that may collapse to a no-op." Decide at #9.
- **Conflict UX when re-read-before-write surfaces a divergence.** Currently spec'd to flag out-of-sync. Whether the agent auto-merges (preferred for trivial conflicts) or always punts to the user (preferred for substantive ones) needs a rule. Probably a confidence-tier model like Inbox triage — but defer until the conflict scenarios are real.

## Notes

The decision at the heart of this ADR: **the agent's craft for building its own memory is consequential enough to pin operationally, not just principially.** The principles named in the PRD (Albrighton, Heath, Fitzpatrick, Strunk) tell the agent *what good looks like*. The Pocock moves tell the agent *what to do with its hands when it sits down to write.*

Will's hypothesis driving this scope: the leverage is on the brain side, not the user-facing side. Validate or revise at #9 (ConsolidationWorker implementation) — if the moves prove load-bearing for TrueLine quality, this ADR holds. If they prove neutral or counterproductive, revisit and supersede.
