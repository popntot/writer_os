export type AudioFormat = "mp3_44100_128" | "pcm_16000" | (string & {});

export interface SynthesizeOptions {
  text: string | AsyncIterable<string>;
  voiceId?: string;
  format?: AudioFormat;
  metadata?: { sessionId?: string };
}

export interface TTSUsageEvent {
  voiceId: string;
  charactersUsed: number;
  costUsd: number;
  durationMs: number;
}

export interface TTSResult {
  audio: Uint8Array;
  usage: TTSUsageEvent;
}

export interface TTSStream extends AsyncIterable<Uint8Array> {
  done: Promise<TTSResult>;
}

export interface TTSStreamer {
  synthesize(opts: SynthesizeOptions): Promise<TTSResult>;
  stream(opts: SynthesizeOptions): TTSStream;
}

export interface TTSStreamerConfig {
  apiKey: string;
  defaultVoiceId?: string;
  defaultFormat?: AudioFormat;
  maxRetries?: number;
  retryBudgetMs?: number;
  pricePerCharUsd?: number;
  onUsage?: (event: TTSUsageEvent) => void;
}

interface RetryOptions {
  maxRetries: number;
  retryBudgetMs: number;
}

type AudioEmitter = (chunk: Uint8Array) => void;

const ELEVENLABS_STREAM_URL =
  "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DEFAULT_FORMAT: AudioFormat = "mp3_44100_128";
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BUDGET_MS = 30_000;
const DEFAULT_PRICE_PER_CHAR_USD = 0.00018;
const PHRASE_LENGTH_CAP = 200;
const BASE_DELAY_MS = 25;
const JITTER_MS = 25;

export function createTTSStreamer(config: TTSStreamerConfig): TTSStreamer {
  const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryBudgetMs = config.retryBudgetMs ?? DEFAULT_RETRY_BUDGET_MS;
  const pricePerCharUsd =
    config.pricePerCharUsd ?? DEFAULT_PRICE_PER_CHAR_USD;

  function stream(opts: SynthesizeOptions): TTSStream {
    return createStream(async (emitAudio, signal) => {
      const result = await executeStream(
        config,
        opts,
        { maxRetries, retryBudgetMs },
        pricePerCharUsd,
        emitAudio,
        signal,
      );
      config.onUsage?.(result.usage);
      return result;
    });
  }

  return {
    synthesize: async (opts: SynthesizeOptions): Promise<TTSResult> =>
      stream(opts).done,
    stream,
  };
}

function createStream(
  run: (emitAudio: AudioEmitter, signal: AbortSignal) => Promise<TTSResult>,
): TTSStream {
  const chunks: Uint8Array[] = [];
  const waiters: Array<() => void> = [];
  const abortController = new AbortController();
  const abortError = new Error("TTS stream aborted");
  let complete = false;
  let streamError: unknown;

  const notify = (): void => {
    for (const waiter of waiters.splice(0)) {
      waiter();
    }
  };

  const abort = (): void => {
    if (!complete && !abortController.signal.aborted) {
      abortController.abort();
    }
  };

  const done = (async (): Promise<TTSResult> => {
    try {
      const result = await run((chunk) => {
        chunks.push(chunk);
        notify();
      }, abortController.signal);

      if (abortController.signal.aborted) {
        throw abortError;
      }

      return result;
    } catch (error) {
      streamError = abortController.signal.aborted ? abortError : error;
      throw streamError;
    } finally {
      complete = true;
      notify();
    }
  })();

  return {
    done,
    [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
      let index = 0;

      return {
        async next(): Promise<IteratorResult<Uint8Array>> {
          while (index >= chunks.length) {
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

          const value = chunks[index];
          if (value === undefined) {
            throw new Error("TTS stream chunk was unexpectedly missing");
          }

          index += 1;
          return { done: false, value };
        },
        async return(): Promise<IteratorResult<Uint8Array>> {
          abort();
          return { done: true, value: undefined };
        },
      };
    },
  };
}

async function executeStream(
  config: TTSStreamerConfig,
  opts: SynthesizeOptions,
  retryOptions: RetryOptions,
  pricePerCharUsd: number,
  emitAudio: AudioEmitter,
  signal: AbortSignal,
): Promise<TTSResult> {
  const startedAt = Date.now();
  const voiceId = opts.voiceId ?? config.defaultVoiceId ?? DEFAULT_VOICE_ID;
  const format = opts.format ?? config.defaultFormat ?? DEFAULT_FORMAT;
  const audioChunks: Uint8Array[] = [];
  let charactersUsed = 0;

  const synthesizePhrase = async (phrase: string): Promise<void> => {
    throwIfAborted(signal);

    const normalizedPhrase = normalizePhrase(phrase);
    if (normalizedPhrase.length === 0) {
      return;
    }

    charactersUsed += normalizedPhrase.length;
    await withRetry(
      () =>
        fetchPhrase(
          config.apiKey,
          voiceId,
          format,
          normalizedPhrase,
          emitAudio,
          audioChunks,
          signal,
        ),
      retryOptions,
    );
  };

  if (typeof opts.text === "string") {
    const text = opts.text;
    charactersUsed = text.length;
    await withRetry(
      () =>
        fetchPhrase(
          config.apiKey,
          voiceId,
          format,
          text,
          emitAudio,
          audioChunks,
          signal,
        ),
      retryOptions,
    );
  } else {
    let buffer = "";

    for await (const delta of opts.text) {
      throwIfAborted(signal);
      buffer += delta;

      if (shouldFlushPhrase(buffer)) {
        await synthesizePhrase(buffer);
        buffer = "";
      }
    }

    await synthesizePhrase(buffer);
  }

  const usage: TTSUsageEvent = {
    voiceId,
    charactersUsed,
    costUsd: charactersUsed * pricePerCharUsd,
    durationMs: Date.now() - startedAt,
  };

  return {
    audio: concatUint8Arrays(audioChunks),
    usage,
  };
}

async function fetchPhrase(
  apiKey: string,
  voiceId: string,
  format: AudioFormat,
  text: string,
  emitAudio: AudioEmitter,
  audioChunks: Uint8Array[],
  signal: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);

  try {
    const response = await fetch(`${ELEVENLABS_STREAM_URL}/${voiceId}/stream`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        output_format: format,
      }),
      signal,
    });

    if (!response.ok) {
      throw Object.assign(
        new Error(`ElevenLabs TTS request failed with status ${response.status}`),
        { status: response.status },
      );
    }

    if (!response.body) {
      return;
    }

    for await (const chunk of toAsyncIterable(response.body)) {
      throwIfAborted(signal);
      const audioChunk = toUint8Array(chunk);
      audioChunks.push(audioChunk);
      emitAudio(audioChunk);
    }
  } catch (error) {
    if (signal.aborted) {
      throw abortRequestError();
    }

    throw error;
  }
}

async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const startedAt = Date.now();
  let retryCount = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (
        !isRetriableError(error) ||
        retryCount >= options.maxRetries ||
        Date.now() - startedAt >= options.retryBudgetMs
      ) {
        throw error;
      }

      const delayMs = computeDelayMs(retryCount);
      const remainingBudgetMs =
        options.retryBudgetMs - (Date.now() - startedAt);

      if (delayMs > remainingBudgetMs) {
        throw error;
      }

      retryCount += 1;
      await sleep(delayMs);
    }
  }
}

function computeDelayMs(retryCount: number): number {
  const exponentialDelayMs = BASE_DELAY_MS * 2 ** retryCount;
  return exponentialDelayMs + Math.floor(Math.random() * JITTER_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetriableError(error: unknown): boolean {
  const status = getStatus(error);

  if (status === undefined) {
    return true;
  }

  return status === 429 || status >= 500;
}

function getStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const status = "status" in error ? error.status : undefined;
  if (typeof status === "number") {
    return status;
  }

  const statusCode = "statusCode" in error ? error.statusCode : undefined;
  if (typeof statusCode === "number") {
    return statusCode;
  }

  return undefined;
}

function shouldFlushPhrase(text: string): boolean {
  return /[.!?,]\s/.test(text) || text.length >= PHRASE_LENGTH_CAP;
}

function normalizePhrase(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortRequestError();
  }
}

function abortRequestError(): Error & { status: number } {
  return Object.assign(new Error("TTS stream aborted"), { status: 499 });
}

async function* toAsyncIterable(value: unknown): AsyncIterable<unknown> {
  if (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value
  ) {
    yield* value as AsyncIterable<unknown>;
    return;
  }

  const reader = getReader(value);
  if (!reader) {
    throw new Error("ElevenLabs response body is not readable");
  }

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        return;
      }

      yield result.value;
    }
  } finally {
    reader.releaseLock?.();
  }
}

function getReader(value: unknown): ReaderLike | undefined {
  if (typeof value !== "object" || value === null || !("getReader" in value)) {
    return undefined;
  }

  const getReaderValue = value.getReader;
  if (typeof getReaderValue !== "function") {
    return undefined;
  }

  return getReaderValue.call(value) as ReaderLike;
}

interface ReaderLike {
  read(): Promise<{ done: boolean; value: unknown }>;
  releaseLock?: () => void;
}

function toUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }

  throw new Error("ElevenLabs response chunk is not binary");
}

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}
