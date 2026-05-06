# ADR-0002: Pipelined Voice Stack over Realtime Voice APIs

**Status**: Accepted
**Date**: 2026-05-06
**Deciders**: Will (founder/PM)
**Supersedes**: —
**Related**: PRD §"Voice loop", PRD §"Solution"

---

## Context

Writer OS is voice-first on iOS. The user starts a thinking session with a tap, talks through ideas on a walk, hears responses through AirPods, and pivots topics organically. The voice loop runs for 10–60 minutes per session and is expected to handle long-context reasoning across an evolving Project spine (TrueLine, Sources, OpenQuestions).

The voice stack architecture is a fork in the road:

- **Realtime voice models** (OpenAI's gpt-realtime, Gemini Live, similar) take audio in and emit audio out as a single tightly-integrated model. Lowest first-token latency. Single vendor.
- **Pipelined components** (Apple Speech → Claude Sonnet 4.6 → ElevenLabs) chain three best-in-class systems through text. Higher first-token latency. Three vendors. Each component is independently best-of-breed for its task.

Voice latency, voice quality, and reasoning quality are not all simultaneously maximized in any current architecture. Realtime models are tuned for conversational fluency in ~seconds-of-context exchanges. They are not currently the SOTA for sustained, long-context reasoning over project-shaped state.

The product's differentiator is **the brain on the other end**, not the conversational latency. The user is on a walk. They are thinking. A 700ms–1200ms first-token latency is well below the threshold of "feels like talking to someone slow." A 100ms latency is irrelevant if the response is shallow.

Locking this decision before iOS work begins prevents wasted effort on a realtime integration that would have to be torn out when reasoning quality emerges as the actual constraint.

## Decision

Writer OS v0.1 ships a **pipelined voice stack** with three independent, swappable components:

- **Speech-to-text (STT)**: Apple Speech framework. On-device, free, offline-capable. Speaker-segmented transcription.
- **Conversational LLM**: Claude Sonnet 4.6 via the Anthropic API, streaming. Streaming starts as soon as the LLM emits its first tokens; downstream TTS picks up incrementally.
- **Text-to-speech (TTS)**: ElevenLabs streaming. Voice selectable from settings. AVSpeechSynthesizer available as a free fallback option for users who don't want a paid voice.

**Heavy consolidation** (post-session, async) runs on Claude Sonnet 4.6 by default, with Opus 4.7 reserved for high-complexity projects.

**Realtime voice models are explicitly rejected for v0.1** for the reasons in §"Alternatives Considered" below.

**Latency budget**: ~700–1200ms end-of-utterance to first audible token. The honest-latency UX (the agent verbalizes thinking pauses — *"let me sit with that"* — instead of stalling silently) handles overruns gracefully. Latency budget is a release-gate test, not a per-PR test.

**Component-swap discipline**: each layer is wrapped behind a deep module (`LLMClient`, `TTSStreamer`, the iOS-side `VoiceSessionController`). Swapping a vendor (Apple Speech → Whisper, ElevenLabs → another TTS, Anthropic → another LLM provider) must be a one-module change, not a cross-codebase refactor.

## Alternatives Considered

### Alternative A: Realtime voice model (gpt-realtime, Gemini Live, or equivalent)
Use a single vendor's audio-in / audio-out model as the entire voice loop.

**Rejected** for v0.1 because:

1. **Sustained reasoning quality** is the product's differentiator. Realtime voice models, in their current generation, are tuned for short-turn conversational responsiveness. They underperform frontier text models on long-context reasoning, document-grounded retrieval, and multi-turn coherence — exactly the capabilities Writer OS needs.
2. **Long-context coherence** is a hard requirement. The agent must reason against a TrueLine document, a curated set of Sources, and prior session transcripts. Realtime voice models don't yet offer the context-window or retrieval primitives that frontier text models provide.
3. **Vendor lock-in.** Realtime voice ties STT + reasoning + TTS to one vendor. The pipelined approach lets each layer be swapped independently when a better option emerges.
4. **Streaming text → TTS pipelining** already delivers acceptable latency (~700–1200ms first-token). The realtime advantage (~100–300ms first-token) is real but not load-bearing for thinking-walk UX.
5. **The base assumption may invert later**, and that's fine. If realtime voice models close the reasoning gap in a future generation, swapping in is a deep-module replacement (`ConversationOrchestrator` + `LLMClient` + `TTSStreamer` collapse into one), not a rewrite. The architecture preserves optionality.

### Alternative B: Pipelined stack with cloud Whisper instead of Apple Speech
Use OpenAI Whisper or similar cloud STT for transcription.

**Deferred to Phase 2 escape valve.** Apple Speech is on-device, free, offline, and good enough for indoor and most outdoor conditions. Cloud Whisper is the planned fallback if real-world walk-condition testing surfaces quality issues (wind, traffic noise, mumbled speech). Shipping cloud STT in v0.1 would add per-minute API cost, network dependency, and privacy surface for no validated benefit.

### Alternative C: Pipelined stack with on-device LLM (Apple Foundation Models, Llama on-device)
Use a local LLM for the conversational brain.

**Rejected** for v0.1. On-device models trade reasoning quality for latency and privacy. The product's value is the brain; degrading it to save on API cost or improve first-token latency inverts the value prop. **Phase 2 may revisit** Apple Foundation Models for fast first-token sketching while a frontier model handles the substantive response (a "fast first-token" pattern), but that's an optimization, not a v0.1 architecture call.

### Alternative D: All-Apple stack (Apple Speech + on-device LLM + AVSpeechSynthesizer)
Zero ongoing cost, fully private, no network dependency.

**Rejected** for v0.1 for the same reasoning-quality argument as Alternative C, and additionally because AVSpeechSynthesizer voice quality is significantly below ElevenLabs for sustained listening. AVSpeechSynthesizer remains a **free user-selectable fallback** for users who want zero TTS cost.

## Consequences

### Architecture

1. **Three vendor dependencies in the hot path**: Apple (STT), Anthropic (LLM), ElevenLabs (TTS). Each is wrapped behind a deep module so swap cost is bounded.
2. **Two API key surfaces**: Anthropic and ElevenLabs. Apple Speech requires no key. Keys live in `packages/api`'s secrets store (per PRD), not in iOS bundle.
3. **Streaming throughout.** LLM streams tokens; TTS streams audio chunks; iOS plays audio chunks as they arrive. No "wait for full response" anywhere in the pipeline.
4. **Interruption handling is mandatory.** Tapping the mic during agent speech must immediately cancel the active TTS stream and the in-flight LLM stream. `TTSStreamer.interrupt(streamId)` and `LLMClient` cancellation are first-class.

### Cost model

5. **Per-session cost is non-zero.** Anthropic API tokens (input + output) and ElevenLabs character-count costs accrue per session. Single-tenant MVP: Will pays directly. Productization will require BYO-key or platform-billing flow (out of scope here).
6. **Consolidation is the heavier cost line.** Post-session consolidation runs over the full session transcript plus current TrueLine — much larger context than any single conversational turn. Sonnet 4.6 default; Opus 4.7 only when warranted.

### Latency UX

7. **Honest-latency contract.** The agent must verbalize *"let me sit with that"* (or equivalent) when reasoning takes longer than the latency budget allows. Silent stalls are the failure mode this contract prevents. The base agent system prompt encodes this; this is not a library call, it's a behavioral rule.
8. **Latency tests are release gates, not per-PR tests.** Unit tests assert structure of LLM calls and orchestration; end-to-end timing tests run before TestFlight builds and gate the release if first-token p95 exceeds budget.

### Swap optionality

9. **Each layer is independently swappable** behind its module boundary. Concrete swaps that are explicitly preserved:
   - Apple Speech → cloud Whisper (Phase 2 escape valve)
   - ElevenLabs → another TTS vendor or AVSpeechSynthesizer fallback (settings toggle in v0.1)
   - Anthropic → another LLM provider (architectural insurance; no current plan to swap)
10. **Whole-stack swap to a future realtime voice model** is allowed when (a) the realtime model matches frontier text models on long-context reasoning, and (b) the cost and vendor terms are comparable. Until both are true, do not revisit this decision. When both are true, supersede this ADR with ADR-NNNN.

### Phase 2 / future

11. **Apple Foundation Models for fast first-tokens** is a Phase 2 candidate optimization (a small local model emits a holding response while the frontier LLM produces the real one). Not in scope for v0.1.
12. **Bias audit (per ADR-0001)** runs on the LLM tier; voice stack is incidental to it.

## Open Questions

- **Wind / outdoor noise quality**: Apple Speech's accuracy under real walk conditions is unvalidated. First Sandcastle-shipped issue should include a manual walk-condition test plan. If quality fails, cloud Whisper escape valve kicks in earlier than Phase 2.
- **Voice library curation**: which ElevenLabs voices are surfaced as defaults vs. all available. Settings/UX problem; Phase 1.5 design.
- **Cost ceiling**: per-session cost projection at scale isn't modeled yet. Single-tenant MVP defers this; productization requires it.

## Notes

The decision at the heart of this ADR: **the brain is the differentiator, not the latency.** Every architectural call downstream of this one — module boundaries, streaming behavior, interruption handling, the honest-latency UX rule — flows from preserving reasoning quality at the cost of an extra few hundred milliseconds.

If a future generation of realtime voice models matches frontier text reasoning, this ADR is the right thing to revisit. Until then, treat it as locked.
