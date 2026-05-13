# ConsolidationWorker — Locked Interface

**Status:** locked at module-interface depth review (2026-05-06). Concrete TypeScript signatures will land in `packages/shared-types` once the monorepo is scaffolded.

**Module priority:** High (per [`docs/prd.md`](../prd.md) §"Modules"; fixture-driven tests per §"Modules to test for v0.1").

## Responsibility

Post-session, asynchronous consolidation. Reads a completed Session's transcript + project context, runs the heavy LLM pass, and commits the four consolidation outputs (per PRD §"Consolidation loop"):

1. **TrueLine delta** — new versioned TrueLine via `TrueLineStore.applyDelta`.
2. **OpenQuestions delta** — opens new ones, resolves prior ones via OpenQuestionsStore.
3. **Artifacts** — outline / draft-section / scratchpad entries via ArtifactGenerator (depends on session target).
4. **Next-session conversation starter** — pre-baked, stored on the spine.

Source citations referenced in the new TrueLine are also indexed (out-of-band, on the citation index module). Mid-flow "light incremental" extraction during a live session is **not** this module — it lives in ConversationOrchestrator and is consumed here as session input.

## Domain types

```ts
type SessionId = string;
type OpenQuestionId = string;
type ArtifactRef = { kind: "outline" | "draft-section" | "scratchpad-entry"; id: string };
type DocumentRef = string;            // opaque pointer into the document store

type ConsolidationTrigger =
  | "session-end"        // automatic, when the session ended naturally
  | "manual"             // user pressed "sync now" mid-session or after end
  | "retry-auto"         // backoff retry from a prior failure
  | "retry-manual";      // user pressed retry from a failed status

type ConsolidationStatus =
  | { state: "not-started" }
  | { state: "queued";      queuedAt: Date;     trigger: ConsolidationTrigger }
  | { state: "in-progress"; startedAt: Date;    trigger: ConsolidationTrigger }
  | { state: "completed";   completedAt: Date;  result: ConsolidationResult }
  | { state: "failed";      failedAt: Date;     error: string;
                            retriesRemaining: number; nextRetryAt: Date | null };

interface ConsolidationResult {
  sessionId: SessionId;
  trueLineVersion: TrueLineVersion;       // post-consolidation TrueLine version;
                                          // equals prior version if no material delta
  openQuestionsOpened: OpenQuestionId[];
  openQuestionsResolved: OpenQuestionId[];
  artifactsGenerated: ArtifactRef[];
  nextSessionStarterRef: DocumentRef;
  contributionSummary: string;            // same string passed to TrueLineStore.applyDelta
  completedAt: Date;
}
```

## Interface

```ts
interface ConsolidationWorker {
  // Enqueue consolidation for a session. Idempotent:
  // - calling on a session already queued/in-progress returns existing status
  // - calling on a completed session returns the completed status (no re-run)
  // - calling on a failed session returns the failed status; use retry() to re-enqueue
  enqueue(
    sessionId: SessionId,
    trigger: ConsolidationTrigger,
  ): Promise<ConsolidationStatus>;

  // Read current consolidation status for a session.
  // Used by: API session-detail view, OutOfSyncDetector (rule 1: pending > 5min),
  // ConversationOrchestrator session-start (race handling on previous session).
  getStatus(sessionId: SessionId): Promise<ConsolidationStatus>;

  // Re-enqueue a failed consolidation. Allowed only from "failed" state;
  // returns the failed status unchanged otherwise. Trigger is "retry-manual".
  retry(sessionId: SessionId): Promise<ConsolidationStatus>;

  // The work function. Invoked by the queue runtime in production; called
  // directly by fixture-driven tests. Idempotent: re-running on a completed
  // session returns the prior ConsolidationResult without re-doing the work.
  // Throws on failure; the queue runtime catches, records the failure,
  // schedules backoff retry per the retry policy.
  processSession(sessionId: SessionId): Promise<ConsolidationResult>;
}
```

## What this interface hides

- **Queue substrate.** Cloudflare Queues vs Durable Objects vs Cron triggers — chosen at the runtime layer, not visible here.
- **LLM choreography.** Whether consolidation is one LLM pass or several (TrueLine pass + OpenQuestions pass + artifact pass + starter pass), prompt design, model selection (Sonnet 4.6 default, Opus 4.7 for high-complexity projects per PRD §"Voice loop"), token budgeting.
- **Write ordering and atomicity.** The order in which TrueLine, OpenQuestions, Artifacts, next-starter, and session.consolidation_status get written, and how partial-failure states are recovered. Internal.
- **Idempotency mechanism.** Per-session lock + completion check vs append-only event log vs CAS — implementation choice.
- **Backoff schedule.** Retry counts, delays, terminal-failure threshold.
- **Race-merge mechanics.** Two consolidations queued back-to-back for the same Project naturally merge because consolidation N+1 reads the TrueLine state produced by consolidation N. The interface does not need a `merge` primitive.
- **Mid-flow extraction handoff.** ConversationOrchestrator stores live extractions on the session record during the session; processSession reads them as input. The handoff shape is internal to the session model.

## What this interface does *not* do (deliberately separated)

- **No mid-session light extraction.** Owned by ConversationOrchestrator (per PRD §"Consolidation loop": "light incremental during sessions").
- **No "sync now" UI logic.** The API endpoint translates the user action into `enqueue(sessionId, "manual")`.
- **No status broadcast / push.** SSE or WebSocket notifications for "consolidation done" live in the API layer if/when needed; callers poll `getStatus` until then.
- **No cancellation.** No `cancel(sessionId)`. MVP does not expose cancellation; if a consolidation is misbehaving, fix forward via retry or session deletion.
- **No content access.** The result returns refs and a version number; the caller fetches content through TrueLineStore, ArtifactGenerator (or an ArtifactStore), and the next-starter store. Keeps the result lean and avoids redundant data plumbing.

## Why these calls and not others

| Call | Caller(s) | Why it must be on this interface |
|---|---|---|
| `enqueue` | API "session ended" handler; API "sync now" handler | The single production trigger; must be idempotent so duplicate triggers (network retries, double-tap) don't double-run. |
| `getStatus` | Session detail view; OutOfSyncDetector; ConversationOrchestrator at session start | Read path for status; supports race handling and out-of-sync rule 1 without exposing queue internals. |
| `retry` | API "retry" handler (user-initiated from a failed-status UI) | Distinct from `enqueue` so the impl can validate "only from failed" and so telemetry distinguishes user-initiated retries. |
| `processSession` | Queue runtime (production); fixture-driven tests | The work function. Exposed for tests because the test boundary per PRD is "transcript fixture in → consolidation outputs out." |

## Invariants (fixture-tested + property-tested)

1. **Idempotent enqueue.** `enqueue` on a session in any state other than `not-started` or `failed` is a no-op (returns current status without changing anything).
2. **Idempotent processSession.** `processSession` on a completed session returns the cached `ConsolidationResult` without re-running the LLM, re-applying a TrueLine delta, or re-creating OpenQuestions / artifacts.
3. **Monotonic TrueLine.** If `processSession` writes a delta, `result.trueLineVersion === priorTrueLineVersion + 1`. If it writes nothing, `result.trueLineVersion === priorTrueLineVersion`. No skipping.
4. **No phantom OpenQuestions.** Every `OpenQuestionId` in `openQuestionsOpened` resolves via OpenQuestionsStore. Every id in `openQuestionsResolved` was open before this consolidation and is closed after.
5. **Artifact targeting.** `artifactsGenerated` is non-empty only when the session had a target (article id). Untargeted "open exploration" sessions produce TrueLine + OpenQuestions + next-starter only.
6. **Status transitions.** `not-started → queued → in-progress → completed | failed`, and `failed → queued (via retry) → in-progress → completed | failed`. No other transitions.
7. **Failure visibility.** A failed consolidation surfaces via `getStatus` (state: "failed"); the OutOfSyncDetector picks it up via rule 1 (pending > 5min). No silent swallow.

## Fixture-driven test shape (per PRD §"Testing Decisions")

Hand-crafted session transcripts of varied shapes — short walks, long walks, walks with topic pivots, walks ending mid-sentence, walks with no material content — feed into `processSession(sessionId)` against a seeded SpineStore + TrueLineStore + OpenQuestionsStore. Assertions are on the `ConsolidationResult` shape and the post-call state of the dependent stores. Fixtures become the regression suite as the prompt and consolidation logic evolve.

## Deferred

- `cancel(sessionId)` — only if the user gains the ability to cancel an in-flight consolidation.
- Streaming progress / SSE — only if the UI needs sub-status visibility beyond "queued / in-progress / completed."
- `processIncremental(sessionId)` for mid-flow heavy passes — only if the hybrid model needs heavier-than-light mid-session work, which the PRD does not currently require.
- Per-Project consolidation queue depth limits — only if multi-session bursts cause queue pressure in practice.

## Craft contract (per ADR-0006)

The TrueLine delta and the post-session summary are agent-internal artifacts and are constructed using the Pocock-derived moves pinned in [ADR-0006](../adr/0006-agent-internal-craft-moves.md). The interface doesn't enforce these — they live in the consolidation system prompt under `packages/prompts` — but the test fixtures assert their structural shape.

- **Mid-session light consolidation** uses the **fragment framework**. The mid-flow fact-capture buffer is append-only, `\n---\n` separator, no headings inside fragments, no taxonomy at capture time. Heterogeneous by design.
- **The TrueLine delta** is constructed with **shape moves**: pile-as-quarry from the session transcript + relevant retrieved Sources + the current TrueLine; at internal branching decisions (framing the delta, picking which fragments survive) the prompt generates 2–3 candidates with different implied theses and the decider pass picks one with a logged rationale (captured in `contributionSummary` on the TrueLineStore write).
- **Compaction of the current-state TrueLine document** (if a write would push the doc past the ~5–10k-token cap) uses **DAG-of-information**: dependency-respecting section ordering, ruthless pruning of items that no longer have downstream dependents. The compaction is a deliberate craft pass, not a truncation.
- **Re-read-before-write** is mandatory. Immediately before calling `TrueLineStore.applyDelta`, the worker re-reads the current TrueLine and merges its delta into the just-read state. If the version changed between the consolidation's planning phase and its commit, the worker retries from the merge step (bounded retries; on exhaustion, fail and surface via `getStatus`).
- **240-char paragraph cap** as default for TrueLine prose. Override only with a deliberate craft reason.

Fixture-driven test extensions (per "Fixture-driven test shape" above):

- A **"two-beats-glued-together"** session — assert the consolidation splits it into two distinct TrueLine entries, not one over-long paragraph.
- A **"stale-TrueLine-mid-consolidation"** scenario — seed an out-of-band TrueLine write during the consolidation's planning phase, assert re-read-before-write fires and either merges successfully or surfaces as failed via `getStatus`.
- A **"fragment-buffer-mid-session"** trace — assert the mid-session capture retains `---` separators and does not impose taxonomy (no headings, no tags).
