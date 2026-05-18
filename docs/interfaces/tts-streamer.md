# TTSStreamer — Locked Interface

**Status:** locked at issue-claim-time review for #8 (2026-05-08). Concrete TypeScript signatures land in `packages/tts` (new workspace package) when #8 is implemented.

**Module priority:** Low (per [`docs/prd.md`](../prd.md) §"Modules"). Reviewed lazily here, mirroring the LLMClient depth — lighter than the High-priority interface docs by design.

## Responsibility

ElevenLabs streaming TTS wrapper. Streaming-first; backoff on transient errors; usage callback per call. Domain-agnostic — no Writer-OS-specific text shaping, no client-side audio playback, no SSE plumbing to clients. Those concerns live in the callers (the `/sessions/:id/turn` route assembles the SSE envelope; iOS owns playback).

The wrapper exists so callers don't redo HTTP/WebSocket plumbing per site, and so the ElevenLabs API surface and pricing math are bounded to one place. Backend-only — the API key never reaches an iOS client.

## Domain types

```ts
type AudioFormat = "mp3_44100_128" | "pcm_16000" | (string & {});

interface SynthesizeOptions {
  // Either a fixed string (non-streaming input) or an async iterable that
  // yields text deltas as upstream LLM tokens arrive (streaming input).
  // The wrapper handles phrase buffering internally — callers may push
  // tokens as small as one character.
  text: string | AsyncIterable<string>;
  voiceId?: string;          // default: client's defaultVoiceId
  format?: AudioFormat;       // default "mp3_44100_128"
  metadata?: { sessionId?: string };
}

interface TTSUsageEvent {
  voiceId: string;            // resolved ElevenLabs voice id
  charactersUsed: number;
  costUsd: number;            // computed from per-tier rate
  durationMs: number;          // wall clock from first text in to last audio out
}

interface TTSResult {
  audio: Uint8Array;           // assembled audio body
  usage: TTSUsageEvent;
}

interface TTSStream extends AsyncIterable<Uint8Array> {
  // Async-iterates audio chunks as they arrive. Each chunk is a contiguous
  // fragment in the requested format — caller concatenates / plays as it
  // arrives. Chunks are not aligned on frame/sample boundaries; the format
  // is responsible for that (mp3 frames are self-synchronizing; pcm is raw).
  // Also exposes a single promise that resolves with the assembled result
  // once the stream ends. Consumers can use either path.
  done: Promise<TTSResult>;
}
```

## Interface

```ts
interface TTSStreamer {
  // Non-streaming. Awaits the full audio body. Convenience wrapper over stream().
  synthesize(opts: SynthesizeOptions): Promise<TTSResult>;

  // Streaming. Yields audio chunks. The `done` promise resolves with the same
  // shape `synthesize` would return.
  stream(opts: SynthesizeOptions): TTSStream;
}

interface TTSStreamerConfig {
  apiKey: string;              // ELEVENLABS_API_KEY at construction
  defaultVoiceId?: string;      // default the project's chosen MVP voice
  defaultFormat?: AudioFormat;  // default "mp3_44100_128"
  maxRetries?: number;          // default 3
  retryBudgetMs?: number;       // default 30_000
  pricePerCharUsd?: number;     // default the project's contracted ElevenLabs rate
  onUsage?: (event: TTSUsageEvent) => void;
}

function createTTSStreamer(config: TTSStreamerConfig): TTSStreamer;
```

## What this interface hides

- **Transport choice.** ElevenLabs has both an HTTP streaming endpoint (per-call POST returning chunked audio) and a WebSocket streaming endpoint (text trickled in, audio trickled out). At MVP the wrapper uses HTTP streaming with internal phrase buffering. Swapping to WebSocket is a behind-the-seam refactor when the latency budget demands it.
- **Phrase buffering.** When `text` is an async iterable, the wrapper accumulates deltas into utterance-shaped chunks (sentence boundaries / commas / phrase breaks) and flushes those to the API. Naive per-token requests would burn quota and add request-setup overhead; flushing once per word would clip prosody. The chunking heuristic is internal.
- **Retry policy.** Exponential backoff with jitter on 429 / 5xx / network errors. Configurable via `maxRetries` and `retryBudgetMs`. Non-retriable errors (4xx other than 429) surface immediately.
- **Cost computation.** Per-character rate baked in via `pricePerCharUsd`. Callers receive `costUsd` per call without knowing the rate.
- **Voice settings.** Stability, similarity boost, style — defaults are fine for MVP. Add to config when a real preference shows up.

## What this interface does *not* do (deliberately separated)

- **No SSE envelope.** The `/sessions/:id/turn` route assembles the interleaved text+audio SSE payload that goes to the iOS client. This wrapper produces audio bytes; envelope shape is upstream.
- **No client-side playback.** iOS owns AVAudioPlayer / AVAudioEngine wiring. The wrapper outputs bytes; nobody calls back from device-side audio state.
- **No persistence.** No DB writes for audio refs, transcripts, or usage rows. `onUsage` is the single egress for cost data.
- **No voice catalog browsing.** Listing / searching / cloning voices is out of scope. The MVP uses one voice id; voice choice UX (PRD §"Settings") plugs into `defaultVoiceId` later.
- **No barge-in / interrupt.** PRD line 188 wants tapping mic to interrupt agent speech; that is iOS-side cancellation of the audio stream, not a TTSStreamer concern. The stream consumer simply stops reading and aborts the underlying request via standard `AbortController`.
- **No transcript alignment.** Mapping characters to audio timestamps (for word-by-word highlighting) is a Phase 2 concern. ElevenLabs offers timestamps on a separate endpoint; add when needed.

## Why these calls and not others

| Call | Caller(s) at MVP | Why it must be on the streamer |
|---|---|---|
| `synthesize` | Callers that need a final `Uint8Array` (e.g. session-summary audio renders, future) | Convenience wrapper. |
| `stream` | `/sessions/:id/turn` (#8) | Streaming is required for honest-latency UX. The route consumes the LLM stream → pushes deltas into the TTS stream → pulls audio chunks → emits SSE frames. |
| `onUsage` callback | Cost telemetry / per-session ledger | Cleaner than wrapping every call site. |

## Invariants

1. `synthesize(opts)` and `stream(opts).done` return semantically equivalent `TTSResult`s for the same input (streaming is just a different surface).
2. `onUsage` fires exactly once per successful call, never on retried-then-succeeded attempts in addition.
3. Retries respect both `maxRetries` and `retryBudgetMs` — whichever cap hits first stops retrying.
4. A 4xx error other than 429 surfaces on the first attempt; no retries.
5. `costUsd` for a call equals `charactersUsed * pricePerCharUsd`.
6. When `text` is a string, `charactersUsed` equals `text.length`. When `text` is an async iterable, `charactersUsed` equals the sum of all yielded delta lengths after the wrapper's pre-flight whitespace normalization (i.e., what was actually sent to the API).
7. Aborting the consumer (stop reading from the iterator, or call `AbortController.abort()` on the underlying request) cleanly cancels the in-flight ElevenLabs request and rejects `done`.

## Deferred

- **WebSocket transport.** Switch when first-audio-token latency on HTTP-streaming is the bottleneck.
- **Voice catalog endpoints.** When the user-facing voice picker (PRD §"Settings") is built.
- **Word-level timestamps.** When transcript-as-spoken highlighting becomes a feature.
- **Cost-cap circuit breaker.** Belongs above this layer, like LLMClient.
- **Multi-vendor TTS.** No second TTS at MVP; ADR-0003 anticipates seams generally.
- **AVSpeechSynthesizer fallback.** PRD line 184 mentions this as a free fallback. Implementation is iOS-side and does not consume this interface; tracked separately if it becomes a priority.
