import Anthropic from "@anthropic-ai/sdk";
import { computeCostUsd } from "./cost.js";
import { withRetry } from "./retry.js";
import type {
  ChatOptions,
  ChatResult,
  LLMClient,
  LLMClientConfig,
  LLMStream,
  Model,
  UsageEvent,
} from "./types.js";

export type {
  ChatMessage,
  ChatOptions,
  ChatResult,
  LLMClient,
  LLMClientConfig,
  LLMStream,
  Model,
  TextBlock,
  UsageEvent,
} from "./types.js";
export { computeCostUsd } from "./cost.js";

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

type TextEmitter = (text: string) => void;

const DEFAULT_MODEL: Model = "sonnet-4-6";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BUDGET_MS = 30_000;

export function createLLMClient(config: LLMClientConfig): LLMClient {
  const client = new Anthropic({ apiKey: config.apiKey });
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBudgetMs = config.retryBudgetMs ?? DEFAULT_RETRY_BUDGET_MS;

  function stream(opts: ChatOptions): LLMStream {
    return createStream(async (emitText) => {
      const result = await withRetry(
        () => executeStream(client, config, opts, emitText),
        { maxRetries, retryBudgetMs },
      );
      config.onUsage?.(result.usage);
      return result;
    });
  }

  return {
    chat: async (opts: ChatOptions): Promise<ChatResult> => stream(opts).done,
    stream,
  };
}

function createStream(run: (emitText: TextEmitter) => Promise<ChatResult>): LLMStream {
  const deltas: string[] = [];
  const waiters: Array<() => void> = [];
  let complete = false;
  let streamError: unknown;

  const notify = (): void => {
    for (const waiter of waiters.splice(0)) {
      waiter();
    }
  };

  const done = (async (): Promise<ChatResult> => {
    try {
      return await run((text) => {
        deltas.push(text);
        notify();
      });
    } catch (error) {
      streamError = error;
      throw error;
    } finally {
      complete = true;
      notify();
    }
  })();

  return {
    done,
    [Symbol.asyncIterator](): AsyncIterator<string> {
      let index = 0;

      return {
        async next(): Promise<IteratorResult<string>> {
          while (index >= deltas.length) {
            if (streamError) {
              throw streamError;
            }

            if (complete) {
              return { done: true, value: undefined };
            }

            await new Promise<void>((resolve) => {
              waiters.push(resolve);
            });
          }

          const value = deltas[index];
          if (value === undefined) {
            throw new Error("LLM stream delta was unexpectedly missing");
          }

          index += 1;
          return { done: false, value };
        },
      };
    },
  };
}

async function executeStream(
  client: unknown,
  config: LLMClientConfig,
  opts: ChatOptions,
  emitText: TextEmitter,
): Promise<ChatResult> {
  const startedAt = Date.now();
  const resolvedModel = resolveModel(opts.model ?? config.defaultModel ?? DEFAULT_MODEL);
  const sdkStream = await Promise.resolve(
    getMessagesStream(client)(buildRequest(opts, resolvedModel)),
  );
  const emittedText: string[] = [];
  let usage: TokenUsage = emptyUsage();

  for await (const event of toAsyncIterable(sdkStream)) {
    const textDelta = extractTextDelta(event);

    if (textDelta !== undefined) {
      emittedText.push(textDelta);
      emitText(textDelta);
    }

    usage = mergeUsage(usage, extractUsage(event));
  }

  const finalMessage = await getFinalMessage(sdkStream);
  usage = mergeUsage(usage, extractUsage(finalMessage));

  const finalText = extractContentText(finalMessage);
  const text = finalText.length > 0 ? finalText : emittedText.join("");
  const durationMs = Date.now() - startedAt;
  const usageEvent: UsageEvent = {
    model: resolvedModel,
    ...usage,
    costUsd: computeCostUsd(resolvedModel, usage),
    durationMs,
  };

  return { text, usage: usageEvent };
}

function buildRequest(opts: ChatOptions, model: string): Record<string, unknown> {
  const request: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    messages: opts.messages,
  };

  if (opts.system !== undefined) {
    request.system = opts.system;
  }

  if (opts.temperature !== undefined) {
    request.temperature = opts.temperature;
  }

  if (opts.metadata?.userId !== undefined) {
    request.metadata = { user_id: opts.metadata.userId };
  }

  return request;
}

function resolveModel(model: Model): string {
  if (model === "sonnet-4-6") {
    return "claude-sonnet-4-6";
  }

  if (model === "opus-4-7") {
    return "claude-opus-4-7";
  }

  return model;
}

function getMessagesStream(client: unknown): (request: Record<string, unknown>) => unknown {
  const messages = getProperty(client, "messages");
  const stream = getProperty(messages, "stream");

  if (typeof stream !== "function") {
    throw new Error("Anthropic messages.stream is unavailable");
  }

  return stream.bind(messages) as (request: Record<string, unknown>) => unknown;
}

function toAsyncIterable(value: unknown): AsyncIterable<unknown> {
  if (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value
  ) {
    return value as AsyncIterable<unknown>;
  }

  throw new Error("Anthropic stream is not async iterable");
}

async function getFinalMessage(sdkStream: unknown): Promise<unknown> {
  const finalMessage = getProperty(sdkStream, "finalMessage");

  if (typeof finalMessage !== "function") {
    return undefined;
  }

  return await finalMessage.call(sdkStream);
}

function extractTextDelta(event: unknown): string | undefined {
  const eventRecord = asRecord(event);
  const delta = asRecord(eventRecord?.delta);
  const deltaText = delta?.text;

  if (
    eventRecord?.type === "content_block_delta" &&
    delta?.type === "text_delta" &&
    typeof deltaText === "string"
  ) {
    return deltaText;
  }

  return undefined;
}

function extractContentText(message: unknown): string {
  const content = asRecord(message)?.content;

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      const blockRecord = asRecord(block);
      return blockRecord?.type === "text" && typeof blockRecord.text === "string"
        ? blockRecord.text
        : "";
    })
    .join("");
}

function extractUsage(value: unknown): Partial<TokenUsage> | undefined {
  const record = asRecord(value);
  const directUsage = asRecord(record?.usage);
  const messageUsage = asRecord(asRecord(record?.message)?.usage);
  const usage = directUsage ?? messageUsage;

  if (!usage) {
    return undefined;
  }

  const tokenUsage: Partial<TokenUsage> = {};
  const inputTokens = toNumber(usage.input_tokens);
  const outputTokens = toNumber(usage.output_tokens);
  const cacheCreationInputTokens = toNumber(
    usage.cache_creation_input_tokens,
  );
  const cacheReadInputTokens = toNumber(usage.cache_read_input_tokens);

  if (inputTokens !== undefined) {
    tokenUsage.inputTokens = inputTokens;
  }

  if (outputTokens !== undefined) {
    tokenUsage.outputTokens = outputTokens;
  }

  if (cacheCreationInputTokens !== undefined) {
    tokenUsage.cacheCreationInputTokens = cacheCreationInputTokens;
  }

  if (cacheReadInputTokens !== undefined) {
    tokenUsage.cacheReadInputTokens = cacheReadInputTokens;
  }

  return tokenUsage;
}

function mergeUsage(
  base: TokenUsage,
  next: Partial<TokenUsage> | undefined,
): TokenUsage {
  if (!next) {
    return base;
  }

  return {
    inputTokens: next.inputTokens ?? base.inputTokens,
    outputTokens: next.outputTokens ?? base.outputTokens,
    cacheCreationInputTokens:
      next.cacheCreationInputTokens ?? base.cacheCreationInputTokens,
    cacheReadInputTokens: next.cacheReadInputTokens ?? base.cacheReadInputTokens,
  };
}

function emptyUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };
}

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function getProperty(value: unknown, key: string): unknown {
  return asRecord(value)?.[key];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
