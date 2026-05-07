# LLMClient — Locked Interface

**Status:** locked at issue-claim-time review for #6 (2026-05-07). Concrete TypeScript signatures land in `packages/llm` (new workspace package) when #6 is implemented.

**Module priority:** Low (per [`docs/prd.md`](../prd.md) §"Modules"). Reviewed lazily here rather than in the upfront depth-review pass for High-priority modules. Lighter than the High-priority interface docs by design.

## Responsibility

Anthropic API wrapper. Streaming-first; backoff on transient errors; usage callback per call. Domain-agnostic — no Writer-OS-specific prompt shaping, no message persistence, no project context assembly. Those concerns live in the callers (ConversationOrchestrator for live turns, ConsolidationWorker for post-session passes, ArtifactGenerator for outputs).

The wrapper exists so callers don't redo retry/usage/streaming boilerplate per site, and so the SDK version is bounded to one place. Backend-only — the API key never reaches an iOS client.

## Domain types

```ts
type Model = "sonnet-4-6" | "opus-4-7" | (string & {});

interface TextBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };  // pass-through to Anthropic prompt caching
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string | TextBlock[];
}

interface ChatOptions {
  model?: Model;                          // default: client's defaultModel ("sonnet-4-6")
  system?: string | TextBlock[];
  messages: ChatMessage[];
  maxTokens?: number;                     // default 4096
  temperature?: number;                   // default Anthropic's
  metadata?: { userId?: string };
}

interface UsageEvent {
  model: string;                          // resolved Anthropic model id
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUsd: number;                        // computed from per-model rates
  durationMs: number;
}

interface ChatResult {
  text: string;                           // assembled assistant text
  usage: UsageEvent;
}

interface LLMStream extends AsyncIterable<string> {
  // Async-iterates text deltas as they arrive from the API.
  // Also exposes a single promise that resolves with the full assembled
  // result once the stream ends. Consumers can use either path.
  done: Promise<ChatResult>;
}
```

## Interface

```ts
interface LLMClient {
  // Non-streaming. Awaits the full response. Convenience wrapper over stream().
  chat(opts: ChatOptions): Promise<ChatResult>;

  // Streaming. Yields text deltas. The `done` promise resolves with the same
  // shape `chat` would return.
  stream(opts: ChatOptions): LLMStream;
}

interface LLMClientConfig {
  apiKey: string;                          // ANTHROPIC_API_KEY at construction
  defaultModel?: Model;                    // default "sonnet-4-6"
  maxRetries?: number;                     // default 3
  retryBudgetMs?: number;                  // default 30_000
  onUsage?: (event: UsageEvent) => void;   // fires after every successful call
}

function createLLMClient(config: LLMClientConfig): LLMClient;
```

## What this interface hides

- **SDK version.** Whichever `@anthropic-ai/sdk` version is pinned in `packages/llm`, callers never import it. If we ever migrate to a different vendor (we won't at MVP, but ADR-0003 anticipates seams), this is the swap point.
- **Retry policy.** Exponential backoff with jitter on 429 / 5xx / network errors. Configurable via `maxRetries` and `retryBudgetMs`; default suitable for interactive turns. Non-retriable errors (4xx other than 429) surface immediately.
- **Cost computation.** Per-model rates baked into the wrapper, applied on every successful call. Callers receive a `costUsd` they can log or aggregate without knowing rates.
- **Streaming primitive.** Internally everything is `messages.stream()`; `chat()` is a thin drainer. Single code path for retries and usage extraction.
- **Token-usage extraction.** Anthropic returns usage on the final `message_stop` event for streams and on the response for non-streams. The wrapper normalizes both into `UsageEvent`.

## What this interface does *not* do (deliberately separated)

- **No prompt construction.** Callers pass `messages` and `system` ready-to-send. ConversationOrchestrator owns the live-turn assembly (TrueLine + recent transcript + RAG chunks); ConsolidationWorker owns the consolidation prompt. Those concerns sit above this layer.
- **No persistence.** No DB writes for transcripts, sessions, or usage rows. `onUsage` is the single egress for cost data; what the caller does with it (log line, ledger row, none) is the caller's choice.
- **No tool use, no vision, no batch, no files API.** Out of scope for #6. Add when a caller needs them.
- **No SSE plumbing to clients.** The `/turn` endpoint in #6 returns plain text — the Worker awaits `done` and serves the assembled string. Exposing the stream to clients is a later slice.
- **No conversation memory.** Stateless; every call sends the full message history the caller supplies. Conversation state lives in the orchestrator, not here.
- **No prompt caching policy.** Caching is opt-in by the caller via `cache_control` markers on `TextBlock`s. The wrapper passes them through; it does not decide what to cache.
- **No mentor selection.** Mentor system prompts and persona shaping (Phase 2 per PRD) are caller-side concerns.

## Why these calls and not others

| Call | Caller(s) at MVP | Why it must be on the client |
|---|---|---|
| `chat` | `/sessions/:id/turn` (#6), ConsolidationWorker (#9), ArtifactGenerator (#17) | Non-streaming convenience; covers callers that just need a final string. |
| `stream` | ConversationOrchestrator (live voice turns, post-#6) | Streaming is required for honest-latency UX; `chat` is built on top of `stream`. |
| `onUsage` callback | Anyone wanting cost-per-turn telemetry | Cleaner than wrapping every call site; lets a single ledger consume from many callers. |

PRD sketch had `complete(prompt, opts)` as a third method. Dropped — Anthropic's API is messages-based; a single-string `complete` is a legacy pattern. Use `chat` with one user message.

## Invariants (property-tested where the wrapper isn't pure-pass-through)

1. `chat(opts)` and `stream(opts).done` return semantically equivalent `ChatResult`s for the same input (streaming is just a different surface).
2. `onUsage` fires exactly once per successful call (whether `chat` or `stream`), never on retried-then-succeeded attempts in addition.
3. Retries respect both `maxRetries` and `retryBudgetMs` — whichever cap hits first stops retrying.
4. A 4xx error other than 429 surfaces on the first attempt; no retries.
5. `costUsd` for a call equals `inputTokens * inputRate + outputTokens * outputRate + cacheCreationInputTokens * cacheCreateRate + cacheReadInputTokens * cacheReadRate` for the resolved model.

## Deferred

- **Tool use.** Add when an agent needs structured outputs (likely InboxTriageEngine for classification, depending on accuracy of plain-text routing).
- **Vision / files / batch / citations.** Add when a caller needs them.
- **Streaming SSE through the Worker.** Lands when `/sessions/:id/turn` upgrades to SSE in a later slice.
- **Concurrency limit / token-bucket rate limiter.** Anthropic's per-org limits are generous enough that client-side rate limiting isn't worth it pre-#10. Add if production hits ceilings.
- **Multi-vendor support.** ADR-0003 calls this out as a future seam; no plan to act on it at MVP.
- **Cost-cap circuit breaker.** A daily/per-project ceiling that short-circuits calls. Belongs above this layer (the LLMClient itself doesn't know what a "project" is); the orchestrator or a budget service consumes `onUsage` and chooses whether to call again.
