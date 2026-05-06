# InboxTriageEngine — Locked Interface

**Status:** locked at module-interface depth review (2026-05-06). Concrete TypeScript signatures will land in `packages/shared-types` once the monorepo is scaffolded.

**Module priority:** High (per [`docs/prd.md`](../prd.md) §"Modules"; integration-tested per §"Testing Decisions").

## Responsibility

The single deposit-and-dispatch surface for everything captured into Writer OS. Per PRD §"Inbox triage", every Source enters via this engine — there is no direct-attach shortcut. Owns:

1. **Deposit** — accept content of any supported type from any capture surface.
2. **Triage** — async LLM classification + project matching with two-tier confidence.
3. **Dispatch** — high-confidence auto-file; low-confidence proposal; no-match flag.
4. **User actions** — confirm / override destination, recover from stale.
5. **Sweeps** — audit-window expiry (7d), stale archival (30d).
6. **Reasoning persistence** — every decision stores agent rationale for surfacing to the user.

## Domain types

```ts
type InboxItemId = string;
type ProjectId = string;
type SourceId = string;

type RawContent =
  | { type: "url";            url: string }
  | { type: "pdf";            blobRef: string; filename?: string }
  | { type: "text";           body: string; suppliedTitle?: string }
  | { type: "voice-memo";     audioRef: string; durationMs: number }
  | { type: "image";          imageRef: string }                // accepted; OCR deferred per PRD
  | { type: "book-reference"; title: string; author: string; notes?: string };

// Same union shape as `SourceIngestionPipeline.RawContent` — the two are one type.
// (Will live in `packages/shared-types` when the monorepo is scaffolded.)

type CaptureSurface =
  | "ios-share-sheet"
  | "ios-app-dump"
  | "ios-voice-memo"
  | "web-drag-drop"
  | "web-paste"
  | "web-book-form";    // structured-input form for book references

type InboxItemStatus =
  | "captured"           // deposited; ingestion and/or triage in flight
  | "triage-failed"      // triage attempts exhausted; agent_reasoning holds error
  | "triaged-auto"       // high-confidence auto-filed; in 7-day audit window
  | "triaged-pending"    // low-confidence proposal OR no-match; awaiting user
  | "filed"              // audit window expired OR user confirmed
  | "stale";             // 30-day no-action; recoverable

type TriageDecision =
  | { kind: "auto-filed"; projectId: ProjectId; sourceId: SourceId;
                          confidence: number; reasoning: string }
  | { kind: "proposed";   projectId: ProjectId;
                          confidence: number; reasoning: string }
  | { kind: "no-match";   reasoning: string };

interface InboxItem {
  id: InboxItemId;
  rawContentRef: string;                    // pointer to original blob/text
  contentType: RawContent["type"];
  captureSurface: CaptureSurface;
  status: InboxItemStatus;
  decision: TriageDecision | null;          // null until triage runs
  proposedProjectId: ProjectId | null;      // mirrors decision for query convenience
  resolvedProjectId: ProjectId | null;      // set on filed
  sourceId: SourceId | null;                // set when a Source record exists
  agentReasoning: string | null;            // mirrors decision.reasoning
  depositedAt: Date;
  triagedAt: Date | null;
  filedAt: Date | null;
  lastActionAt: Date;                       // for stale-sweep math
}
```

## Interface

```ts
interface InboxTriageEngine {
  // --- Deposit ----------------------------------------------------------------

  // Synchronous from caller's view. Persists the raw content reference,
  // creates the inbox item in "captured", enqueues ingestion + triage.
  // Returns immediately with the item id and current status.
  deposit(input: {
    rawContent: RawContent;
    captureSurface: CaptureSurface;
    capturedAt?: Date;                      // defaults to now; offline queues pass past timestamps
  }): Promise<{ itemId: InboxItemId; status: InboxItemStatus }>;

  // --- Read -------------------------------------------------------------------

  getItem(itemId: InboxItemId): Promise<InboxItem>;

  // Items in "triaged-pending" — awaiting user confirmation or assignment.
  // This is the InboxTriageView's primary list.
  listPending(): Promise<InboxItem[]>;

  // Items in "triaged-auto" deposited within the last 7 days.
  // The web audit-digest read path. `now` is injected for testability.
  listAuditWindow(now: Date): Promise<InboxItem[]>;

  // Items in "stale" — recoverable pile.
  listStale(): Promise<InboxItem[]>;

  // --- User actions -----------------------------------------------------------

  // Single method covers three flows:
  //   1. User accepts a "proposed" decision (projectId === decision.projectId).
  //   2. User overrides a "proposed" or "no-match" decision (projectId !== proposed).
  //   3. User rejects/redirects an auto-file during the audit window.
  // Side effects:
  //   - Creates or re-attaches the Source record under projectId.
  //   - Sets status → "filed", filedAt = now, resolvedProjectId = projectId.
  // Idempotent: confirming an already-filed item with the same projectId is a no-op.
  confirmDestination(
    itemId: InboxItemId,
    projectId: ProjectId,
  ): Promise<InboxItem>;

  // Move a stale item back to "triaged-pending" so the user (or a re-triage)
  // can act on it. Implementation may optionally re-trigger triageItem.
  // Allowed only from "stale".
  recoverFromStale(itemId: InboxItemId): Promise<InboxItem>;

  // --- Worker / runtime / sweeps ---------------------------------------------

  // The triage work function. Invoked by the queue runtime in production;
  // called directly by integration tests with stubbed LLM + real DB.
  // Performs the action implied by the decision (auto-file creates the Source).
  // Idempotent: re-running on a triaged item returns the prior decision.
  // On exhausted retries, transitions item to "triage-failed".
  triageItem(itemId: InboxItemId): Promise<TriageDecision>;

  // Periodic sweep. Transitions "triaged-auto" items whose depositedAt + 7d < now
  // to "filed". Runs hourly or so; `now` injected for testability.
  // Returns the ids transitioned, for telemetry.
  runAuditWindowSweep(now: Date): Promise<{ filed: InboxItemId[] }>;

  // Periodic sweep. Transitions "triaged-pending" items whose lastActionAt + 30d < now
  // to "stale". Same shape as audit sweep.
  runStaleSweep(now: Date): Promise<{ archived: InboxItemId[] }>;
}
```

## What this interface hides

- **Ingestion coordination.** SourceIngestionPipeline runs between deposit and triage (URL fetch, PDF parse, voice transcribe, summarize, chunk, embed). The engine waits on it internally; callers see only `captured → triaged-*`.
- **Source-record creation.** When and how a `sources` row is created (at high-conf auto-file, at user confirmation, or at ingestion time with a null project_id) is internal. Per [ADR-0004](../adr/0004-source-of-truth-and-projection.md), there is one write path; this engine owns it for the inbox→source transition.
- **LLM triage choreography.** Single classification + matching pass vs multi-pass (classify type → match projects → score confidence), prompt design, model selection, embedding-based candidate retrieval.
- **Confidence-tier thresholds.** The numeric cutoff between "auto-file" and "propose" is internal and tunable; callers only see the `kind` field of the decision.
- **Queue substrate.** Cloudflare Queues vs Durable Objects vs Cron — runtime choice, not exposed.
- **Retry + backoff schedule.** Triage retries on transient failure; max-retries threshold transitions to `triage-failed`. All internal.
- **Stale / audit cadence.** Sweep frequency (hourly? per-deposit-tick?) is a runtime concern; `now` injection is the only test seam.

## What this interface does *not* do (deliberately separated)

- **No direct-attach shortcut.** Per PRD §"Inbox triage": all Sources enter via this engine. There is no `attachSourceDirectly(projectId, source)` method.
- **No project creation.** When the user picks "create new project" for a no-match item, the API handler calls `SpineStore.createProject` first, then `confirmDestination(itemId, newProjectId)`. Two-step composition; not collapsed here.
- **No bulk operations.** Per PRD §"Out of Scope" line 407: bulk Inbox operations are deferred. `confirmDestination` is per-item.
- **No discard/delete.** PRD does not specify a discard action. If/when added, it surfaces as a separate method, not as a confirmDestination overload.
- **No status broadcast / push.** SSE notifications for "triage done" can land in the API layer when the UX needs them; callers poll `getStatus` (via `getItem`) until then.
- **No image OCR.** Image type is accepted at deposit but not processed; sits indefinitely in `captured` until OCR ships. This is a PRD-acknowledged deferral.

## Why these calls and not others

| Call | Caller(s) | Why on this interface |
|---|---|---|
| `deposit` | API handlers for share-sheet, drag-drop, voice-memo, in-app dump | Single entry point per the "single deposit pathway" rule. |
| `getItem` | InboxTriageView, audit-digest, status checks | Generic read; one method beats five typed reads. |
| `listPending` / `listAuditWindow` / `listStale` | InboxTriageView, audit-digest, stale-pile recovery UI | The three user-facing surfaces of the engine map to these three reads. |
| `confirmDestination` | InboxTriageView confirm button, override dropdown, audit-digest reassign | Collapses three user-intent variants into one method; the impl branches on whether the new projectId matches the proposed one. |
| `recoverFromStale` | Stale-pile recovery UI | Distinct from `confirmDestination` because it doesn't choose a destination; it just moves the item back into the pending queue. |
| `triageItem` | Queue runtime; integration tests | The work function, parallel to `ConsolidationWorker.processSession`. |
| `runAuditWindowSweep` / `runStaleSweep` | Scheduled job runner; tests with injected `now` | Periodic sweeps; per-item exposure (`markStale(itemId)`) was unnecessary because no caller actually marks individual items. |

## Invariants (integration-tested + property-tested)

1. **Deposit is total.** Every supported `RawContent` type produces an item in `captured` with a populated `rawContentRef`. No dropped deposits.
2. **Idempotent triageItem.** Re-running on a triaged item (any state ≥ `triaged-*`) returns the prior `TriageDecision` without re-invoking the LLM, re-creating a Source, or mutating status.
3. **Auto-file invariant.** A `triaged-auto` item always has a non-null `sourceId` and `decision.kind === "auto-filed"`.
4. **Filed invariant.** A `filed` item always has a non-null `resolvedProjectId`, a non-null `sourceId`, and a `filedAt`.
5. **Audit-window monotonicity.** `runAuditWindowSweep(now)` only transitions items where `depositedAt + 7d < now` AND status === `triaged-auto`. Idempotent on already-`filed` items.
6. **Stale monotonicity.** `runStaleSweep(now)` only transitions items where `lastActionAt + 30d < now` AND status === `triaged-pending`. Items in any other state are untouched.
7. **State transitions are constrained.** Allowed:
   - `captured → triaged-auto | triaged-pending | triage-failed`
   - `triage-failed → captured` (on manual or backoff retry)
   - `triaged-auto → filed` (audit sweep) | `filed` (user reassign during audit)
   - `triaged-pending → filed` (user confirm) | `stale` (sweep)
   - `stale → triaged-pending` (recovery)
   No other transitions.
8. **Reasoning visibility.** Every state ≥ `triaged-auto` has a non-null `agentReasoning`. The user can always see *why*.

## Integration test shape (per PRD §"Testing Decisions")

> Inbox → Triage → Spine commit is a cross-module loop. Test it end-to-end with stubbed LLMs and a real DB.

Each test seeds Projects + recent Sources, calls `deposit` with a hand-crafted `RawContent`, drives `triageItem` directly with a stubbed LLM that returns deterministic `TriageDecision`s, then asserts:

- The `inbox_items` row reaches the expected status.
- For auto-file: a `sources` row exists under the right `project_id`, the chunks + embeddings are present.
- For low-confidence: the proposed projectId is stored, no Source row yet.
- `confirmDestination` flips status to `filed` and either creates the Source (low-conf path) or re-attaches it (override of an auto-file).
- The reasoning string surfaces unchanged.

Sweep tests inject a synthetic `now` and assert the sweep methods only touch eligible items.

## PRD schema delta required

The PRD schema sketch (line 331) lists 5 statuses: `captured | triaged-auto | triaged-pending | filed | stale`. This interface adds **`triage-failed`** as a 6th. Rationale: parallels `ConsolidationWorker`'s failed state, gives OutOfSyncDetector a clean signal for triage-stuck items, and avoids overloading `captured` with both "ingestion-in-flight" and "triage-attempts-exhausted" semantics.

Action: amend `docs/prd.md` schema sketch in the next housekeeping commit.

## Deferred

- `discard(itemId)` — only if a user-discard surface gets designed.
- `bulkConfirm` / `bulkReassign` — explicitly out of scope per PRD.
- OCR pipeline for image deposits — accepted-but-unprocessed per PRD.
- SSE / push notifications for triage completion — only when the UX requires it.
- Per-Project triage rules ("always file X-domain items here") — none exist in PRD; would extend this interface later if added.
