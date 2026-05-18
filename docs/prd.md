# Writer OS — Product Requirements Document

**Status**: Draft v0.1
**Date**: 2026-05-06
**Source**: Synthesized from grill-me session covering product vision, architecture, voice stack, spine model, build approach.

---

## Problem Statement

I'm a writer. My best thinking happens away from my laptop — on walks, in nature, in physical conditions where a screen and keyboard are the wrong tools. The tightest arguments and cleanest framework decisions emerge when I'm walking and talking through ideas aloud, ideally with a partner who challenges me, pushes me to articulate, and helps hold the through-line of long-running thinking.

I've tried using frontier model applications (Claude, ChatGPT, etc.) for this. They're great in the moment — but the experience is a void. You enter, have a conversation, and exit. The next session starts cold. The model has no memory of what was discussed last time, no awareness of the project's evolving structure, no sense of what's settled and what's still open. The interfaces are also laptop-bound. Even voice modes assume sitting at a screen.

The core problem: there's an enormous gap between "having a great thinking conversation with an LLM" and "actually moving a long-running writing project forward." The void is the absence of *infrastructure surrounding the experience* — memory, continuity, organization, artifact generation, the structural skeleton that lets sessions build on each other instead of fragmenting into isolated knowledge islands.

A second friction: capturing ideas mid-day. A thought arrives reading an article — by the time I'm ready to use it, I've forgotten where to file it. Frontier model apps don't solve this either: no triage layer, no place to dump and have the system organize for me later.

I want a thinking partner that:

1. Lives where I think — in my pocket, on walks, voice-first, AirPods-friendly
2. Maintains a canonical thread per project so every session continues the previous one without me re-priming
3. Captures things I dump (links, PDFs, brain-dumps) and files them automatically into the right project
4. Generates the actual artifacts — outlines, drafts, scratchpad entries — as direct output of conversations, not just summaries
5. Has a desk-side counterpart for work that genuinely belongs at a desk (refining, editing, reviewing)
6. Stays out of my way as much as possible — never asks me to manually update context, never makes me organize files

## Solution

**Writer OS** is a voice-first thinking partner with persistent project memory and a two-surface UX matched to the writer's two cognitive modes:

- **iOS app**: voice-first, walk-shaped, push-to-talk over AirPods, designed for in-motion thinking
- **Web app** (Phase 1.5): desk-side editing surface, lightweight markdown editor, primary review home for inbox + sessions + sources

Both surfaces read and write the same backend "spine" — a single source-of-truth data architecture maintained by an agent that:

- Consolidates each session asynchronously into a canonical project narrative ("TrueLine")
- Tracks unresolved questions explicitly ("OpenQuestions") so the project never loses sight of what's not yet decided
- Triages captured items (URLs, PDFs, voice memos, text dumps) from a single Inbox into the right project, with two-tier confidence (auto-file when sure, propose when ambiguous)
- Generates artifacts (outlines, drafts, scratchpad entries) as direct session outputs, attached to specific Articles within a Project
- Pre-bakes the next session's conversation starter so resuming is instant — no cold start
- Surfaces project health (out-of-sync indicators) when something needs attention without being noisy

The voice loop pipelines best-in-class components: Apple Speech (on-device, free, offline-capable) handles transcription. Claude Sonnet 4.6 (streaming) handles the conversational brain. ElevenLabs (streaming) handles voice output. Heavy consolidation runs asynchronously between sessions on Claude Sonnet 4.6 or Opus 4.7.

The data model has one source of truth (an agent-owned layer of structured documents and database records), and the user-facing surfaces are clean projections of that source — never exposing the agent's internal scaffolding, frameworks, or maintenance documents.

The agent's craft is informed by deep writing-craft principles (clarity per Albrighton, stickiness per the Heath brothers, pedagogical structure per Fitzpatrick & Hunt, economy per Strunk & White) baked into base behavior. A future Mentor system will let users select genre-specific craft profiles, with a hard rule: Mentors inform craft, not ideology. The user's voice and worldview remain inviolate.

## User Stories

### Voice session (iOS, walks)

1. As a writer on a walk, I want to start a thinking session with a single tap, so that I don't break my flow finding the right screen.
2. As a writer on a walk, I want to begin by saying "continue work on Project X" or "let's outline article Y," so that I never have to navigate menus to set context.
3. As a writer on a walk, I want the agent to greet me with a pre-baked conversation starter that picks up where my last session ended, so that I never have to re-prime context manually.
4. As a writer on a walk, I want to toggle the microphone on and off with a single tap (or AirPods press), so that I can pause and gather my thoughts without the system clipping me or auto-stopping.
5. As a writer on a walk, I want to interrupt the agent mid-response by tapping the mic to start talking, so that I retain control of the conversation's flow.
6. As a writer on a walk, I want the agent to be honest when it needs time to think ("let me sit with that") rather than stalling silently, so that I trust what's happening on the other end.
7. As a writer on a walk, I want to control the playback speed of the agent's voice, so that I can listen at the same pace I listen to podcasts.
8. As a writer on a walk, I want to dial the agent's verbosity (curt ↔ talkative), so that responses match my preference for getting to the point.
9. As a writer on a walk, I want my session to be transcribed live and stored, so that I can review what was said later.
10. As a writer on a walk, I want my session audio to be recorded by default but easily disableable per-session, so that I have control over what gets stored.
11. As a writer on a walk, I want to mid-session pivot the topic without restarting, so that the agent follows my thinking organically.
12. As a writer on a walk, I want the agent to generate concrete artifacts (an outline, a draft section) during/after the session, so that the conversation produces tangible output.
13. As a writer on a walk, I want the session to end cleanly when I say "wrap up" or after a long silence, so that I don't have to remember to manually close it.
14. As a writer on a walk, I want confidence that even if I lose cell signal, the conversation transcript and audio are captured locally, so that I don't lose work to network conditions.
15. As a writer on a walk, I want the iOS app to use AirPods press events as the primary toggle, so that my hand stays in my pocket.

### Capture (mid-day, ad-hoc)

16. As a writer reading an article on my phone, I want to share it directly to Writer OS via the iOS share sheet, so that capture takes one tap.
17. As a writer with a sudden idea, I want to dump text or voice into the Inbox without categorizing first, so that capture is friction-free.
18. As a writer who saved a PDF, I want to drop it into the Inbox and have it processed automatically, so that I don't have to file it myself.
19. As a writer with a quick voice thought, I want to record a short voice memo from anywhere and have it land in the Inbox, transcribed and embedded, so that I can capture in-the-moment thoughts.
20. As a writer at the desk, I want to drag-drop content into the Inbox on web, so that desk-side capture is equally easy.
21. As a writer, I want the Inbox to never demand I categorize at deposit time, so that capture is never a friction point.

### Triage (the Inbox doing its job)

22. As a writer, I want the Inbox to automatically file items I've captured into the right Project when the agent is confident, so that I don't have to organize.
23. As a writer, I want the Inbox to propose a destination when the agent is unsure, so that I can confirm or reassign with one tap.
24. As a writer, I want items the agent can't classify to be flagged as "needs project assignment," so that they don't disappear into a black hole.
25. As a writer, I want a 7-day audit window where recent auto-files are surfaced, so that I can catch misroutes before they pollute project memory.
26. As a writer, I want stale Inbox items (untouched for 30 days) to auto-archive into a recoverable "stale" pile, so that the Inbox doesn't become a graveyard.
27. As a writer, I want the agent to explain its triage reasoning ("filed under Project X because it relates to themes Y and Z"), so that I trust its decisions and can correct when wrong.

### Project navigation and review (web, desk)

28. As a writer at the desk, I want a hub view of all my Projects with status indicators, so that I can see what's active and what needs attention.
29. As a writer at the desk, I want to open a Project and see its TrueLine, Articles, Sources, Sessions, and OpenQuestions in one organized view, so that the project is legible at a glance.
30. As a writer at the desk, I want to read the agent's TrueLine without seeing the agent's internal scaffolding, so that I see only what's relevant to me.
31. As a writer at the desk, I want to read past Sessions' transcripts and the agent's session summaries, so that I can review what was said and what came of it.
32. As a writer at the desk, I want to see what each Session contributed to the TrueLine, so that I can audit the agent's consolidation work.
33. As a writer at the desk, I want to delete a Session if I no longer want its raw record, with TrueLine impact preserved, so that I can clean clutter without losing accumulated thinking.
34. As a writer at the desk, I want to see the OpenQuestions list and mark questions resolved (with a resolution note), so that I can close out unresolved threads.
35. As a writer at the desk, I want to see all Sources in a Project, click through to read original or cached content, and review the agent's summary, so that I can navigate my project's inputs.
36. As a writer at the desk, I want a clear "out of sync" indicator on Projects that need attention, so that I know when something requires action.

### Editing (web)

37. As a writer at the desk, I want to edit Article drafts in a clean markdown editor, so that I can refine prose without rich-text complexity.
38. As a writer at the desk, I want to edit Article outlines, so that I can restructure as my thinking evolves.
39. As a writer at the desk, I want a per-Article scratchpad for raw thoughts not yet attached to the draft, so that I have a place to dump without polluting the draft.
40. As a writer at the desk, I want explicit save (Cmd-S, button) rather than auto-save, so that the agent gets a clean post-edit signal.
41. As a writer at the desk, I want my edits to trigger a light reconciliation pass without blocking my work, so that the spine stays consistent without friction.
42. As a writer at the desk, I want to be warned if I try to edit an Article that has an active iOS voice session running, so that conflicts don't silently corrupt content.

### Memory and continuity (the differentiator)

43. As a writer, I want the agent to maintain a canonical "TrueLine" per Project that captures decisions, frameworks, and the through-line of my thinking, so that work compounds session over session.
44. As a writer, I want the agent to consolidate each session asynchronously after it ends, so that the spine stays fresh without slowing the conversation.
45. As a writer, I want to manually trigger consolidation if I want to wrap up early, so that I have control when needed.
46. As a writer, I want consolidation failures to be surfaced (not hidden), so that I can trust the spine isn't silently rotting.
47. As a writer, I want the next session's conversation starter to be pre-baked by the consolidation pass, so that resuming is instant.
48. As a writer, I want the agent to surface OpenQuestions explicitly, so that the project always knows what's not yet decided.

### Artifact generation (the Express phase)

49. As a writer, I want the agent to generate an outline file when I work through one in a session, committed to the right Article, so that the conversation produces a concrete deliverable.
50. As a writer, I want the agent to generate or update a draft when I draft aloud, so that I have tangible prose output from sessions.
51. As a writer, I want the agent to generate scratchpad entries from exploratory sessions, so that even unstructured thinking produces searchable artifacts.
52. As a writer, I want session-target context ("today I want to work on the outline for X") to direct what artifact gets produced, so that the agent's output matches my intent.

### Sources (inputs)

53. As a writer, I want to add Sources via URL, PDF, text dump, voice memo, or book reference, so that all my inputs live in one system.
54. As a writer, I want Sources to be summarized by the agent into a short user-facing summary, so that I can scan my project's inputs quickly.
55. As a writer, I want Sources to be embedded and indexed for semantic retrieval, so that the agent can pull relevant chunks during conversations without my prompting.
56. As a writer, I want the agent to cite Sources when it uses them in a response, with a clickable reference, so that I can verify and trace claims.
57. As a writer, I want Sources I've added to be cached (not just linked), so that link rot doesn't lose the content.

### Settings and control

58. As a writer, I want to choose the agent's voice (which ElevenLabs voice), so that I can pick what's pleasant for me on a walk.
59. As a writer, I want to set the default verbosity and speech speed, so that the agent matches my preferences without per-session adjustment.
60. As a writer, I want to set the default audio retention policy, so that I control storage and privacy.
61. As a writer, I want to disable session recording globally for projects with sensitive content, so that I have IP control.

### Build / development workflow (delegated cycle)

Per [ADR-0005](adr/0005-subscription-funded-local-harness.md), the build runs on a local, subscription-funded harness with Will at the keyboard for every cycle. These stories describe that delegated-cycle pattern, not an autonomous cloud loop.

62. As the developer, I want issues to be specified with explicit acceptance tests and scope boundaries, so that Codex can ship them without judgment calls and Claude Code can review against a concrete contract.
63. As the developer, I want Claude Code to review every Codex PR before merge, so that architectural drift is caught early.
64. As the developer, I want the loop to fail loud (in-session escalation to me) when issues can't be resolved automatically, so that progress isn't silently stalled.
65. As the developer, I want a single AGENTS.md at repo root that both Claude and Codex read before any work, so that context stays consistent across tools.
66. As the developer, I want observability into the cycle (which issues shipped, which got stuck, which PRs are in review, where Claude Code took over from Codex), so that I can self-calibrate the harness over time.

## Implementation Decisions

### High-level architecture

- **Repository**: monorepo on private GitHub. Top-level groups: `apps/ios`, `apps/web`, `packages/api`, `packages/shared-types`, `packages/prompts`, `infra/`, `docs/`, `.sandcastle/`.
- **Build orchestration**: Turborepo + pnpm workspaces.
- **Backend hosting**: Cloudflare Workers for API; Fly.io as alternative if stateful services become necessary.
- **Database + storage**: Supabase — Postgres for structured records, pgvector for embeddings, Storage for blobs. Single managed service.
- **Web hosting**: Cloudflare Pages or Vercel.
- **iOS distribution**: TestFlight at MVP.
- **AI orchestration (build harness)**: Local `parallel-planner-with-review` pattern on Will's Mac — Claude Code (Opus 4.7, high effort) plans + reviews; Codex CLI (GPT-5.4) implements first pass. Subscription-funded, no cloud sandbox. See [ADR-0005](adr/0005-subscription-funded-local-harness.md).

### Spine model

- **Project** is the spine entity. Five first-class children:
  - **Articles**: deliverables (article, draft, outline, scratchpad-per-article)
  - **Sources**: ingested inputs (URL, PDF, text, voice memo, book reference at MVP)
  - **Sessions**: historical record of every thinking session (transcript + audio + agent summary)
  - **TrueLine**: singular canonical narrative per Project, agent-maintained, versioned
  - **OpenQuestions**: structured list of unresolved threads with rationale links into TrueLine
- TrueLine has two views in storage: a full append-only history and a current-state document (the version injected into live conversation context, capped at ~5-10k tokens).
- Decisions and frameworks live as named sections inside TrueLine, not as separate top-level entities.

### Data architecture

- **One source of truth, two views.** The agent layer is the canonical store; the user-facing interface layer is a projection that strips the agent's internal scaffolding (frameworks, maintenance docs, internal synthesis). Not two stores syncing.
- **Document-shaped agent layer**: TrueLine, source synthesis docs, framework notes are markdown documents in object storage, organized per-Project. Agent reads and rewrites in its native idiom.
- **Structured DB layer**: Project / Article / Source / Session / OpenQuestion records in Postgres for queryable metadata.
- **Embeddings**: pgvector in the same Postgres for semantic retrieval.
- **iOS local state**: SwiftData cache for offline-read of recent projects and sessions; writes queued during offline.
- **Web is thin client**: standard caching only, every read/write hits the backend.

### Voice loop

- **STT**: Apple Speech framework (on-device, free, offline). Cloud Whisper as paid premium fallback if quality testing surfaces issues — Phase 2 escape valve.
- **LLM (conversational)**: Claude Sonnet 4.6 via Anthropic API, streaming.
- **TTS**: ElevenLabs streaming. AVSpeechSynthesizer as free fallback option.
- **Heavy consolidation**: Claude Sonnet 4.6 (or Opus 4.7 for high-complexity projects), async, post-session.
- **Latency budget**: ~700-1200ms end-of-utterance to first audible token. Honest-latency UX (agent verbalizes thinking pauses) handles overruns gracefully.
- **PTT model**: tap-on / tap-off toggle, not push-and-hold. AirPods press as primary trigger via `MPRemoteCommandCenter`. Screen tap as fallback.
- **Barge-in**: tapping mic during agent speech interrupts agent immediately.
- **Realtime voice models (e.g., gpt-realtime, Gemini Live) explicitly rejected for MVP** in favor of pipelined frontier text + TTS, because sustained reasoning quality and long-context coherence are the differentiator and realtime voice models trade these for latency.

### Consolidation loop

- **Hybrid**: light incremental during sessions (agent extracts material facts mid-flow); heavy consolidation post-session (async).
- **End triggers**: "wrap up" cue from user, or N-minute silence (default N=15), or user-initiated "sync now."
- **Consolidation outputs**:
  - TrueLine delta committed (versioned, tagged with source session)
  - OpenQuestions opened/resolved
  - Artifacts generated (outline, draft section, scratchpad — depending on session target)
  - Next-session conversation starter pre-baked and stored on the spine
  - Source citations indexed into TrueLine where used
- **Failure handling**: failed consolidations surface as out-of-sync indicators on the project card. User can retry; agent retries on a backoff schedule.
- **Race handling**: starting a new session on a Project before its previous consolidation completes — agent acknowledges ("still wrapping up our last walk, give me a moment") and merges.

### Inbox triage

- **Single deposit surface**, accepts: text, URL, PDF, image (OCR deferred), voice memo, share-sheet content, drag-drop on web.
- **Async triage**, ~30s-5min after deposit.
- **Two-tier confidence model**:
  - High confidence → auto-file as Source under best-match Project
  - Low confidence → propose destination, await user confirmation
  - No-match → flag "needs project assignment" (offers create-new or assign-to-existing)
- **Audit window**: 7 days after auto-file, surface as a digest for batch review on web.
- **Stale handling**: 30-day no-match items archive to recoverable "stale" pile.
- **Reasoning surfaced**: every triage decision shows the agent's rationale.
- **Single deposit pathway**: all Sources enter via Inbox triage. No direct-attach shortcut on web; consistent capture flow ensures the agent always gets the triage moment.

### Source ingestion (MVP types)

- **URL**: fetch HTML, readability-parse to clean text, cache full content for link-rot insurance, summarize, chunk into ~800-token segments with overlap, embed each chunk into pgvector.
- **PDF**: extract text via PDF parser. No OCR for scanned PDFs at MVP. Same summarize + chunk + embed pipeline as URL.
- **Text dump / quote**: store, summarize if >500 words, embed.
- **Voice memo**: transcribe via Apple Speech, summarize, embed.
- **Book reference**: title + author + optional notes. No full-text indexing.
- **User-facing per-source**: title, type icon, original link or cached content, agent's user-facing summary, first-encountered timestamp, last-referenced timestamp, click-through to full content.
- **Agent-internal per-source**: full extracted text, chunked + embedded representations, extended synthesis document, citation graph linking back to TrueLine entries that reference the source.

### Sessions

- **Audio capture**: on by default, per-session toggle visible in app, global default in settings.
- **Transcription**: live during session, speaker-segmented (user vs. agent), Apple Speech.
- **Audio storage tiering**: 0-30 days hot, 30-365 days cold, 365+ auto-delete unless user-pinned. Opus codec for compression.
- **Transcript storage**: indefinite retention (cheap, primary record).
- **Deletion semantics**: deleting a Session removes the record (transcript + audio); TrueLine impact is preserved (synthesized knowledge stays).
- **Per-Session metadata**: start/end timestamps, duration, project ref, target article ref (optional), audio ref, transcript ref, consolidation status, post-consolidation summary, optional location tag (off by default).

### Out-of-sync detection

The agent flags a Project as out-of-sync when any of the following are true:

1. Pending consolidation > 5 minutes after session end (failure or retry needed)
2. Edit-without-reconcile (user-edited content contradicts current TrueLine, no reconciliation pass run yet)
3. Inbox triage backlog > 7 unfiled items in audit window past 7 days
4. Stale project (no session in N days, default N=14, AND open OpenQuestions exist)
5. Source drift (cached source content has changed since ingestion)

Display: subtle indicator on Project card; click-through to detail view explaining factor + recommended action.

### Mentor system

- **MVP**: base agent encodes general good-writing principles (Albrighton clarity, Heath stickiness, Fitzpatrick & Hunt pedagogical structure, Strunk & White economy) as default behavior. No formal Mentor library.
- **MVP**: agent is *genre-aware* — asks or infers project type and adjusts craft support accordingly.
- **Phase 2**: formal Mentor library, user-selectable per Project, scoped to **craft** (structure, sentence rhetoric, narrative pacing, argument patterns), **not ideology**.
- **Hard principle (ADR candidate)**: Mentors inform craft, not ideology. The user's voice and worldview remain inviolate. Mentors are described in craft terms ("argument scaffolding," "sentence cadence") not author-identity terms ("write like X"). Mentors are honest about their craft scope and never propagate ideological framing. Implementation: avoid wholesale ingestion of copyrighted books — encode principles in system prompts plus curated knowledge bases (interviews, public talks, public-domain or fair-use snippets, the user's own notes).
- **Bias audit feature** (Phase 2): user can ask the agent "did any framing slip in from your training/Mentors?" — agent introspects and surfaces risks.

### UI principles

- **Lightweight, swappable**. Token-based design system (CSS custom properties / Tailwind theme).
- **System fonts at MVP**. No custom typography. Swap when branding develops.
- **Component-first architecture**. Each visible piece is a named component with a clean interface.
- **Neutral aesthetic baseline**. Linear pre-2022 and pre-redesign Notion as visual references.
- **iOS uses SwiftUI defaults** — `Form`, `List`, `NavigationStack`, native typography. Don't fight the platform.
- **Markdown editor on web** (Tiptap or CodeMirror 6). No rich text at MVP.
- **Explicit save** (Cmd-S, button), not auto-save — agent gets a clean post-edit signal.

### Agent-internal artifact craft (Pocock-derived moves)

Per [ADR-0006](adr/0006-agent-internal-craft-moves.md), the agent layer's craft is operationalized — not just principled — using moves derived from Matt Pocock's writing skills. Scope: how the agent builds **its own internal artifacts** (TrueLine deltas, source synthesis docs, framework notes, mid-session fact-capture). User-facing artifact craft is deferred to the ArtifactGenerator (#17) interface lock.

- **Fragment framework** (from `writing-fragments`). Used wherever the agent mines heterogeneous material — mid-session capture, extended source synthesis, framework-note construction. Append-only, `\n---\n` separator, no taxonomy at capture time. Bar: "is this a useful future-self memory?" not "is this polished prose?" Novelist's-diary mental model.
- **Shape moves** (from `writing-shape`). Used wherever the agent consolidates fragments into a narrative document. Pile-as-quarry-not-script. At branching decisions, generate 2–3 candidate framings with different implied theses, pick one, log the rationale. Grow paragraph-by-paragraph asking *"what does the next reader (likely the agent itself next session) need to hear next?"* Argue format choices (prose vs list vs callout vs table vs quote vs code) deliberately.
- **DAG-of-information** (from `edit-article`). Used for the current-state TrueLine document (≤5–10k tokens) and any compaction pass. Section order respects dependencies. The token cap forces ruthless dependency pruning — the compaction *is* a craft pass, not a truncation.
- **Re-read-before-write** (across all four skills, **mandatory**). Any agent-internal artifact write reads the current state immediately before committing and merges into it. Conflicts surface as out-of-sync indicators (per §"Out-of-sync detection" rule #2), not silent overwrites. Load-bearing for async consolidation.
- **240-character paragraph cap** as base-agent default for agent-internal prose. Override only with a deliberate craft reason. Encoded as system-prompt guidance, not a post-truncator.
- **Beats** (from `writing-beats`) are **not** adopted for agent-internal artifacts. Beats are for reader-journey narrative; agent-internal artifacts are reference documents.

These moves live in `packages/prompts` once that workspace lands (per §"High-level architecture"). System-prompt files are the operational locus; ADR-0006 is the rationale; this section is the PRD-level summary.

### Honesty principles (encoded in system prompts)

- Get to the point — no filler, no preamble.
- Be honest about thinking time — verbalize "let me sit with that" rather than silent dead air.
- Surface triage reasoning — every auto-file shows why.
- Surface failures — consolidation errors are visible, not hidden.
- Defer to user voice — agent supports the writer's craft and worldview, doesn't impose its own.

### Build approach (delegated cycle)

Per [ADR-0005](adr/0005-subscription-funded-local-harness.md), the build runs on a local, subscription-funded harness. Cloud Sandcastle as the target runtime is rejected, not deferred.

- **Repository substrate**: `AGENTS.md` at repo root, read by all agents before any work. Encodes architecture, conventions, deep-module rules, test-as-success-criterion principle.
- **Issue contracts**: every issue specifies preconditions, expected behavior, postconditions, test list. No taste-call issues for delegated cycles; those get pre-resolved into specs by Claude Code first, or surfaced as in-session escalations.
- **Tests are success criterion**: PRs ship when test list is green. Output validated via Zod schemas where structured output applies.
- **Harness config**: local Claude Code (Opus 4.7, high effort) plans + reviews; Codex CLI (GPT-5.4) implements first pass. See [`docs/agents/harness.md`](agents/harness.md) for the three-outcome review rule and pass budget.
- **Escalation**: in-session is the default — Claude Code surfaces the decision in chat with options + recommendation. Async `ready-for-human` ritual is reserved per AGENTS.md §"Escalation."
- **Observability**: session log (`docs/session-log.md`) is the human-readable trail — what shipped, what got stuck, where Claude took over from Codex. GitHub Issues + PRs are the structured record.
- **Deep modules**: Ousterhout principle. Small public interfaces, hidden complexity. Easier for AI agents to test and swap implementations without ripping out callers.

### Modules

| Module | Layer | Responsibility | Test priority |
|---|---|---|---|
| SpineStore | Backend | CRUD across Projects, Articles, Sources, Sessions, OpenQuestions | Medium |
| TrueLineStore | Backend | Versioned read/write of canonical narrative documents | **High** |
| ConversationOrchestrator | Backend | Session lifecycle, context assembly, RAG retrieval, LLM streaming, transcript persistence, interruption handling | Medium |
| ConsolidationWorker | Backend | Post-session consolidation: TrueLine deltas, OpenQuestions, artifacts, next-session-starter | **High** |
| InboxTriageEngine | Backend | Two-tier confidence triage: classification, project matching, dispatch, audit window, stale handling | **High** |
| SourceIngestionPipeline | Backend | Per-type Source processing: URL/PDF/text/voice memo/book ref → summary + chunks + embeddings | **High** |
| RAGRetriever | Backend | Embedding query + pgvector search + ranking + dedup | Medium |
| ArtifactGenerator | Backend | Mid-session and post-session artifact creation (outline, draft, scratchpad), spine commitment | Medium |
| LLMClient | Backend | Anthropic API wrapper with streaming, retries, rate limits, cost tracking | Low |
| TTSStreamer | Backend | ElevenLabs streaming wrapper with interruption support | Low |
| AudioStore | Backend | R2/Supabase Storage with hot/cold/delete lifecycle | Low |
| OutOfSyncDetector | Backend | Five-rule evaluation of project sync status | Medium |
| VoiceSessionController | iOS | PTT toggle state machine, audio capture, AirPods press detection, backend streaming | Medium |
| APIClient | iOS / Web | Typed HTTP client generated from shared schemas | Low |
| InboxCaptureService | iOS | Share-sheet entry, in-app dump UI, offline queueing | Medium |
| ProjectsRepository | iOS | SwiftData cache + sync with backend | Medium |
| ArticleEditor | Web | Markdown editor with explicit save and conflict warning | Medium |
| InboxTriageView | Web | Pending-item list, propose/confirm/reassign actions | Low |

### Interfaces (sketch)

The exact module signatures will evolve, but the public surface intent is:

- **TrueLineStore**: `read(projectId)`, `readVersion(projectId, version)`, `applyDelta(projectId, delta, sourceSessionId)`, `currentVersion(projectId)`
- **ConversationOrchestrator**: `startSession({projectId, target})`, `processTurn(sessionId, userInput) → stream`, `endSession(sessionId)`
- **ConsolidationWorker**: `consolidate(sessionId) → ConsolidationResult`
- **InboxTriageEngine**: `deposit(item)`, `triage(itemId) → TriageProposal`, `confirmDestination(itemId, projectId)`, `markStale(itemId)`
- **SourceIngestionPipeline**: `ingest(rawSource) → ProcessedSource`
- **RAGRetriever**: `retrieve(projectId, query, k) → Chunk[]`
- **ArtifactGenerator**: `generate({sessionId, type, target})` for type ∈ outline | draft-section | scratchpad-entry | edit
- **LLMClient**: `chat(messages, opts)`, `stream(messages, opts)`, `complete(prompt, opts)`
- **TTSStreamer**: `synthesize(text) → AudioStream`, `interrupt(streamId)`
- **AudioStore**: `upload(audio) → ref`, `getSignedUrl(ref)`, `tier(ref, tier)`, `delete(ref)`
- **OutOfSyncDetector**: `evaluate(projectId) → OutOfSyncStatus`
- **VoiceSessionController**: `startSession(projectId, target?)`, `togglePTT()`, `endSession()`, observable session state

### Schema sketch (high-level only)

- **projects**: id, title, type (genre/style hint), created_at, archived_at, mentor_ref (Phase 2)
- **articles**: id, project_id, title, status, outline_doc_ref, draft_doc_ref, scratchpad_doc_ref
- **sources**: id, project_id, type, title, original_uri, cached_content_ref, summary, embedding_doc_ref, first_seen_at, last_referenced_at
- **sessions**: id, project_id, target_article_id (nullable), start_at, end_at, audio_ref, transcript_ref, consolidation_status, summary
- **open_questions**: id, project_id, text, opened_at, resolved_at (nullable), resolution_note, true_line_section_ref
- **inbox_items**: id, raw_content_ref, type, status (captured | triage-failed | triaged-auto | triaged-pending | filed | stale), proposed_project_id, agent_reasoning, deposited_at, triaged_at, filed_at
- **true_line_versions**: project_id, version, content_ref, source_session_id, committed_at
- **embeddings**: source_chunk_id, project_id, source_id, embedding, content (denormalized)

### API contract sketch

REST + JSON for the primary backend surface. Server-Sent Events for streaming chat. Endpoints:

- Project CRUD
- Session lifecycle (start, turn-stream, end, get)
- Inbox deposit + triage actions
- Source ingestion (multipart for PDFs)
- TrueLine read + version listing
- OpenQuestions CRUD
- Settings

Auth is single-tenant at MVP — magic-link login or shared secret, no user model beyond "the owner."

## Testing Decisions

### What makes a good test for this system

- **Test external behavior, not implementation details.** The InboxTriageEngine test should assert that an item with high-confidence project match auto-files into the right project — not that a specific embedding model was called or that a particular SQL query ran.
- **Don't test LLM prose quality in unit tests.** LLM output is variable. Test the *orchestration*: did the agent receive the right context? Did its output get committed to the spine? Did the artifact land at the right path? Test prose quality via separate, slower, manual or eval-style tests.
- **Stub the LLM at module boundaries.** The LLMClient is a thin wrapper; pass a fake implementation in tests for any module that depends on it. Assert the structure of what was sent to the LLM and the handling of what came back.
- **Fixture-driven tests for consolidation.** Hand-craft session transcripts of varied shapes (short walks, long walks, walks with topic pivots, walks ending mid-sentence) and assert the ConsolidationWorker produces well-formed TrueLine deltas, OpenQuestions, and artifacts. The fixtures become the regression suite.
- **Property-based testing for the spine.** TrueLineStore's versioning and concurrency invariants are well-suited to property tests — every applyDelta produces a valid version; every readVersion returns content; concurrent applies don't lose data.
- **Integration tests for cross-module loops.** Inbox → Triage → Spine commit is a cross-module loop. Test it end-to-end with stubbed LLMs and a real DB. Use Supabase's local dev setup.
- **Latency tests for the voice loop.** Not unit tests — end-to-end timing tests that assert first-token latency and total round-trip stay within budget. Run as release gates, not on every PR.

### Modules to test for v0.1

**High priority** (must have coverage before merge):

- **TrueLineStore** — versioning, concurrent applyDelta, version retrieval
- **ConsolidationWorker** — fixture-driven; verify deltas, OpenQuestions, artifacts, next-session-starter generation
- **InboxTriageEngine** — confidence-tier dispatch, audit-window logic, stale-handling
- **SourceIngestionPipeline** — per-type handlers (URL fetch + parse, PDF text extract, text dump, voice memo)

**Medium priority** (cover as bandwidth allows):

- ConversationOrchestrator — context assembly paths, RAG retrieval calls, transcript persistence
- RAGRetriever — query embedding, ranking determinism with fixture embeddings
- ArtifactGenerator — spine commitment paths (not prose quality)
- OutOfSyncDetector — each of the five rules, alone and in combination
- VoiceSessionController — state machine transitions, PTT toggle behavior
- InboxCaptureService — offline queueing, share-sheet entry
- ProjectsRepository — cache sync, conflict handling

**Low priority** (test only when something breaks):

- LLMClient — retries and error mapping (HTTP wrapper)
- TTSStreamer — chunk lifecycle (vendor wrapper)
- AudioStore — tiering transitions
- APIClient (iOS / Web) — codegen-driven, structural correctness comes from types

### Prior art

This is greenfield — no prior tests in the codebase. Reference patterns from:

- **Existing fixture-driven LLM-adjacent test patterns** for prompt orchestration boundaries
- **Anthropic's TypeScript SDK examples** for streaming response handling
- **Supabase's testing docs** for local-DB integration tests
- **shadcn/ui's component test patterns** for the web layer
- **Apple's XCTest examples** for SwiftUI state machine testing
- **Matt Pocock's `tdd` skill** for the red-green-refactor loop on each issue

## Out of Scope

### Phase 1.5 (web app, after iOS MVP validates the loop)

- Cross-project search and filtering
- TrueLine direct edit (read-only at MVP)
- Rich text editing, inline comments, version compare on Articles
- Source annotation, cross-project Source search
- In-browser audio playback for sessions (transcripts only at first ship)
- Bulk operations on Inbox
- Manually adding OpenQuestions
- Billing / team management

### Phase 2

- Mentor library (formal, user-selectable craft profiles)
- Audio file ingestion (podcasts, interviews)
- Video ingestion (YouTube, lectures)
- Image OCR (book page photos, screenshots of text)
- Book metadata lookup beyond user-entered title
- Bias audit feature
- Cloud Whisper as paid premium STT option
- Multi-user collaboration / sharing
- Publishing / export to Substack, Ghost, etc.
- iOS Apple Foundation Models integration for fast first-tokens
- Mac/iPad companion app
- Android client
- iOS continuous-listening "hands-free walk mode"
- Live transcript display on iOS during sessions (ship only if cheap)
- Multi-person walk consent / third-party audio detection
- Per-Article version history with restore

### Forever (or until productization)

- Multi-tenancy infrastructure
- BYO API key flow
- Shared projects between users
- Public API for third-party integrations
- White-label / theming for other writers

## Further Notes

### Mentor neutrality (ADR candidate)

The Mentor system principle — Mentors inform craft, not ideology — is the most consequential ethical decision in this product. It deserves a formal ADR before Mentors are designed.

- **Title**: Mentor neutrality: craft is in scope, ideology is not
- **Decision**: The Mentor system is scoped strictly to writing craft (structure, sentence rhetoric, narrative pacing, argument patterns). It does not propagate the ideological positioning, political bias, or worldview of source SMEs onto the user's work.
- **Alternatives considered**: (a) ideology-aware Mentors that match user perceived politics — rejected because it muddies the craft/belief boundary and introduces editorial responsibility on the platform; (b) no Mentors at all — rejected because the SME-informed craft layer is a real differentiator.
- **Consequences**: Mentor library is curated for craft; descriptions never frame in author-identity terms; system prompts include explicit anti-bias instructions; bias audit feature exists in Phase 2 for accountability.

### v0.1 success criterion

The user takes 4+ thinking walks per week on the app for 4 consecutive weeks without forcing themselves. If that happens, validate productization. If not, the design is wrong before it's the build that's wrong.

### Build sequencing

- **Phase 1 (v0.1)**: backend + iOS voice loop. Goal: prove the walk-thinking-partner loop works for the user.
- **Phase 1.5**: web editor on the same backend. ~2-3 weeks once Phase 1 is stable. Builds in sequence, not parallel — AI-assisted dev does best with one surface at a time.
- **Phase 2**: Mentors, expanded Sources, audio playback, productization considerations.

### Standing instruction: SME-informed development

Throughout build, recommendations should be informed by subject-matter experts and existing-product learnings, not just AI training priors. Lineages already informing decisions:

- **Sönke Ahrens** (*How to Take Smart Notes*) and Zettelkasten — on memory architecture
- **Tiago Forte** (PARA / *Building a Second Brain*) — on capture vs. configuration split
- **Cal Newport** (*Deep Work*) — on offline thinking sessions
- **Steve Krug** (*Don't Make Me Think*, *Rocket Surgery Made Easy*) — on usability testing
- **John Ousterhout** (*A Philosophy of Software Design*) — on deep modules
- **Tom Albrighton** (*How to Write Clearly*) — on clarity baked into agent
- **Chip & Dan Heath** (*Made to Stick*, *Switch*) — on stickiness baked into agent
- **Rob Fitzpatrick & Devin Hunt** (*The Workshop Survival Guide*) — on pedagogical structure
- **Strunk & White** (*The Elements of Style*) — on economy
- **Matt Pocock** — local delegated-cycle inspiration and existing skills (`to-prd`, `to-issues`, `tdd`, `improve-codebase-architecture`) for build flow

Product references already informing design:

- **Granola** — meeting/thinking-tool patterns, especially trust through transparency
- **Mem, Reflect** — memory-augmented note systems
- **Sudowrite, Lex** — LLM-augmented writing tools
- **Letta / MemGPT, Mem0, Cognee** — agent memory architectures
- **iA Writer, Ulysses, Scrivener** — writer-friendly editing UX
- **Wispr Flow** — voice capture friction model
- **Linear** — neutral, low-friction product UX

### Privacy posture

- All data encrypted at rest.
- Personal-first means single tenant; no auth UI at MVP, magic-link or shared-secret login until productization.
- Audio default-on but user-controllable per-session and globally.
- Session deletion preserves TrueLine impact (synthesized knowledge); raw transcript and audio go away.
- Multi-person walks deferred — single-user product responsibility for now.

### Manual user actions required to start the build

1. Initialize a private GitHub repo for the project
2. Run `/setup-matt-pocock-skills` to configure tracker vocabulary and triage labels
3. Set up Cloudflare account (Workers + Pages or Cloudflare Pages)
4. Set up Supabase project (Postgres + Storage + pgvector enabled)
5. Provision API keys: Anthropic, ElevenLabs, Voyage AI (or OpenAI for embeddings)
6. Confirm Apple Developer account active for TestFlight distribution
7. (Optional) Configure repo notifications for async escalation visibility

### Next deliverables after this PRD

- **AGENTS.md** at repo root (the shared substrate both Claude Code and Codex read before any work)
- **ADR-0001**: Mentor neutrality (craft, not ideology) — recorded before Phase 2 begins
- **ADR-0002**: One source of truth + interface projection (not dual data architecture) — captures the data-architecture decision
- **ADR-0003**: Cloud-first hybrid storage with document-shaped agent layer
- **ADR-0004**: Pipelined voice stack (Apple Speech + Claude + ElevenLabs) over realtime voice models
- **Local harness docs** in `AGENTS.md` and `docs/agents/harness.md`
- **Issue slicing** via `/to-issues` skill, producing tracer-bullet vertical slices
