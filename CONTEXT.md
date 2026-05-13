# Writer OS — Project Context

Shared language for talking about the Writer OS build. Two domains coexist here: the **product** (a voice-first thinking partner for writers) and the **development process** (how Will, Claude Code, and Codex CLI ship it together). Terms below cover both. See `docs/prd.md` for product detail and `docs/adr/` for locked decisions.

## Language

### Development process

**Delegated cycle**:
A build cycle where Claude Code plans + reviews and Codex CLI implements the first pass, with Will at the keyboard for product/architectural decisions. The steady-state mode per ADR-0005.
_Avoid_: "AFK cycle" (retired — was overloaded with autonomous-aspiration meaning)

**Plan / Implement / Review**:
The three distinct activities in a cycle, not two. **Plan** = Claude Code writing the codex:rescue prompt. **Implement** = Codex producing the first diff (always Codex, never Claude on first pass). **Review** = Claude Code reading diff + running tests, with three rule-based outcomes (pass / small fix-forward ≤1 file or ≤20 lines / re-prompt Codex; 3-pass budget per slice).
_Avoid_: treating "review" as a single activity — it spans sign-off, small edits, and full takeover.

**Claude took over**:
A named event in the session log, fired when Claude Code substantively implements after Codex's pass budget is exhausted. The harness's self-calibration signal — frequent occurrence means the delegation prompt is the bug, not Codex.

**In-session escalation**:
The default mechanism when Claude Code hits a decision Will needs to make: surface in chat with options + recommendation, wait. No PR label, no formal block.

**Async escalation**:
Reserved fallback when Will has explicitly stepped away. Label PR `ready-for-human`, write a formal `## Escalation` block, stop.

**Locked interface**:
A module's public surface, pinned in `docs/interfaces/<module>.md`, treated as the API contract. Codex must not alter signatures without a paired doc update; conflict with implementation reality is an escalation trigger, not a quiet override.

**Lazy interface lock**:
For medium/low-priority modules, the interface is reviewed and pinned at issue-claim time rather than upfront. High-priority modules (TrueLineStore, ConsolidationWorker, InboxTriageEngine, SourceIngestionPipeline) were locked before slicing.

**Fix-forward**:
Repairing a failing Codex pass on the same branch — either Claude editing directly (small) or re-prompting Codex (anything larger). Escalation is for decisions, not code quality.

**Paid-key blocker**:
A slice that cannot proceed without provisioning a paid API key (Anthropic, ElevenLabs) or paid infrastructure (Apple Developer, Supabase Pro). Surfaced in the session log with lead time before the slice claims the dependency.

**Session log**:
`docs/session-log.md`, reverse-chronological human-readable trail of what shipped, decisions pinned, blockers, and the next pickup. The continuity mechanism across machines and sessions; complements GitHub Issues/PRs.

### Agent-internal craft (per ADR-0006)

**Fragment**:
A piece of agent-readable noticing — claim, vignette, half-thought, quoted snippet, list-by-feel — that may survive into a later structured form. Bar: "is this a useful future-self memory?" not "is this polished prose?" Heterogeneous by design; no taxonomy at capture time. Used in mid-session capture, extended source synthesis, framework notes.
_Avoid_: "note," "snippet," "blurb" — those imply structure or polish the fragment doesn't promise.

**Fragment buffer**:
The append-only document where fragments accumulate. `\n---\n` separator between fragments, no headings inside the body, no tags. Mid-session capture writes here; heavy consolidation reads here.

**Shape pass**:
The craft pass that turns a fragment pile into a narrative document — TrueLine delta, framework note. Two distinguishing moves: (1) 2–3 candidate framings at branching decisions before picking one with a logged rationale; (2) paragraph-by-paragraph growth asking "what does the next reader need to hear next?"
_Avoid_: "summarization" — summarization compresses; shape pass recomposes.

**Pile-as-quarry**:
The agent's mental model when consolidating: session transcripts + retrieved Sources + existing fragments are raw material to mine, paraphrase, split, recombine. Output reads as one voice; verbatim copying is reserved for quotation. The opposite of a script.

**Re-read-before-write**:
Mandatory discipline for any agent-internal artifact write. The writer reads the current state immediately before committing and merges its delta into the just-read state. Conflicts surface as out-of-sync indicators, not silent overwrites.

**Compaction (DAG-of-information)**:
The craft pass that keeps the current-state TrueLine document under its token cap (~5–10k). Section order respects information dependencies; items without downstream dependents get pruned ruthlessly. Distinct from truncation — compaction is a deliberate craft move.

### Product

**Project**:
The spine entity — a long-running piece of writing work. Holds five first-class children: Articles, Sources, Sessions, TrueLine, OpenQuestions.

**TrueLine**:
The canonical, agent-maintained narrative per Project. Versioned, append-only history plus a current-state document. The thing that makes sessions compound instead of fragment.

**OpenQuestion**:
A structured, unresolved thread on a Project, with rationale links into TrueLine. Surfaces explicitly so the project always knows what's not yet decided.

**Article**:
A deliverable inside a Project (article, draft, outline, per-article scratchpad). The target unit for artifact generation.

**Source**:
An ingested input — URL, PDF, text dump, voice memo, or book reference. Summarized, embedded, citation-graph-linked back to TrueLine entries that reference it.

**Session**:
A single thinking conversation (transcript + audio + post-consolidation summary). Audio is on by default, per-session toggleable. Deletion preserves TrueLine impact.

**Inbox**:
The single-deposit triage surface. Accepts anything; agent classifies async, auto-files when confident, proposes when not, flags when no match.

**Spine**:
Loose term for "the canonical store" — Projects + their children, in both the document-shaped agent layer and the structured DB layer (Postgres + pgvector). One source of truth, two views (interface projection strips agent scaffolding from the user-facing view).

**Mentor**:
A user-selectable craft profile (Phase 2). Inviolate rule per ADR-0001: Mentors inform **craft**, not **ideology**.

**Honest-latency UX**:
The voice loop's contract that the agent verbalizes thinking pauses ("let me sit with that") instead of stalling silently. Behavioral rule encoded in the base system prompt, not a library call.

**Real-walk smoke test (#10)**:
GO/NO-GO gate after slices #2 through #9. Will takes a real walk on the live app; NO-GO means fix the failing slice before any accretion. Distinct from v0.1 success criterion (4 walks/week × 4 weeks).

**v0.1 success criterion**:
4+ thinking walks per week on the app for 4 consecutive weeks, without Will forcing himself. Triggers the productization validation; failure means the design is wrong before the build is.

## Relationships

- A **Project** has many **Articles**, **Sources**, **Sessions**, and **OpenQuestions**, and exactly one **TrueLine**.
- A **Session** produces a **TrueLine** delta (via the ConsolidationWorker) and may produce **OpenQuestions** and **Article** artifacts.
- An **Inbox** item, once triaged, becomes a **Source** under a **Project**.
- A **delegated cycle** ships one **issue**, which closes via one PR; the **session log** entry summarises the cycle.
- A **locked interface** binds Codex's implementation across slices; a contradiction between locked interface and implementation reality is an **in-session escalation** trigger.
- **Mid-session capture** writes **fragments** to a per-session **fragment buffer**; the **ConsolidationWorker** runs a **shape pass** over them (treating the buffer as **pile-as-quarry**) to produce a **TrueLine delta**, which is committed via **re-read-before-write**.
- **Compaction** runs post-consolidation when a **TrueLine** write would push the current-state document past the token cap; it's a craft pass, not a truncation.

## Example dialogue

> **Will:** "On the next slice, can Claude just write the InboxTriageEngine directly? Codex has been slow on the embedding work."
>
> **Claude:** "Per ADR-0005 and the harness three-outcome rule, Codex always takes the first implement pass — if Codex burns 3 passes and the diff still doesn't pass review, I take over and we log a 'Claude took over' event. That keeps the self-calibration signal honest. If you want to short-circuit because the InboxTriageEngine's locked interface is shaky, that's an in-session escalation — surface it and we either re-lock the interface or proceed."

## Flagged ambiguities

- **"AFK"** was historically used for two distinct meanings — (1) the local delegated-cycle pattern, (2) aspirational autonomous cloud execution. Resolved per ADR-0005: autonomous cloud is rejected, not deferred. New docs use **"delegated cycle"** for the local pattern and don't use "AFK" at all. Existing session-log entries are left alone as historical record.
- **"Review"** was used for sign-off, small edits, and full takeover — three different activities with different cost profiles. Resolved per the harness three-outcome rule.
- **"Spine"** is loose — it covers both the agent layer (markdown docs in object storage) and the structured DB layer. Kept loose intentionally because both are "the canonical store" per ADR-0004 (one source of truth, two views). When precision matters, say "agent layer" or "DB layer" explicitly.
- **PRD vs ADRs vs locked-interface docs vs issue ACs — authority order.** Unresolved. Surfaced 2026-05-12 (session-log "PRD delta" TODO from session 3 + #7 storage-split deviation in session 5 both show drift). Not pinning a hierarchy now — premature for the build's current scope. Revisit if a contradiction bites a slice (a hierarchy debate is cheap to have once it's needed and expensive to have ahead of time).
