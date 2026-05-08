import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTTSStreamer } from "../src/index.js";

interface MockResponse {
  ok: boolean;
  status: number;
  body: AsyncIterable<Uint8Array> | null;
}

const okResponse = (chunks: number[][]): MockResponse => ({
  ok: true,
  status: 200,
  body: audioBody(chunks),
});

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.spyOn(Math, "random").mockReturnValue(0);
});

describe("TTSStreamer", () => {
  test("synthesize() and stream().done return equivalent TTSResult shapes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse([[1], [2]]))
      .mockResolvedValueOnce(okResponse([[1], [2]]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createTTSStreamer({
      apiKey: "test-key",
      pricePerCharUsd: 0.001,
    });

    const synthesizeResult = await client.synthesize({ text: "Hello." });
    const stream = client.stream({ text: "Hello." });
    const streamedChunks: Uint8Array[] = [];

    for await (const chunk of stream) {
      streamedChunks.push(chunk);
    }

    await expect(stream.done).resolves.toEqual({
      audio: new Uint8Array([1, 2]),
      usage: expect.objectContaining({
        voiceId: "21m00Tcm4TlvDq8ikWAM",
        charactersUsed: 6,
        costUsd: 0.006,
        durationMs: expect.any(Number),
      }),
    });
    expect(synthesizeResult).toEqual({
      audio: new Uint8Array([1, 2]),
      usage: expect.objectContaining({
        voiceId: "21m00Tcm4TlvDq8ikWAM",
        charactersUsed: 6,
        costUsd: 0.006,
        durationMs: expect.any(Number),
      }),
    });
    expect(streamedChunks).toEqual([new Uint8Array([1]), new Uint8Array([2])]);
  });

  test("POSTs to ElevenLabs with default voice, format, and required headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([[9]]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createTTSStreamer({ apiKey: "test-key" });
    await client.synthesize({ text: "Read this." });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream",
      expect.objectContaining({
        method: "POST",
        headers: {
          "xi-api-key": "test-key",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: "Read this.",
          output_format: "mp3_44100_128",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  test("onUsage fires exactly once per successful call after retries", async () => {
    const onUsage = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, body: null })
      .mockResolvedValueOnce(okResponse([[1]]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createTTSStreamer({
      apiKey: "test-key",
      maxRetries: 1,
      retryBudgetMs: 1_000,
      onUsage,
    });

    await client.synthesize({ text: "Retry." });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        charactersUsed: 6,
      }),
    );
  });

  test("429 retries twice then succeeds on the third call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, body: null })
      .mockResolvedValueOnce({ ok: false, status: 429, body: null })
      .mockResolvedValueOnce(okResponse([[1]]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createTTSStreamer({
      apiKey: "test-key",
      maxRetries: 2,
      retryBudgetMs: 1_000,
    });

    const result = await client.synthesize({ text: "Retry." });

    expect(result.audio).toEqual(new Uint8Array([1]));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test("retries stop at maxRetries and retryBudgetMs", async () => {
    const maxRetriesFetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, body: null });
    vi.stubGlobal("fetch", maxRetriesFetch);

    const maxRetriesClient = createTTSStreamer({
      apiKey: "test-key",
      maxRetries: 2,
      retryBudgetMs: 1_000,
    });

    await expect(maxRetriesClient.synthesize({ text: "Retry." })).rejects.toThrow(
      "status 500",
    );
    expect(maxRetriesFetch).toHaveBeenCalledTimes(3);

    const budgetFetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429, body: null });
    vi.stubGlobal("fetch", budgetFetch);

    const budgetClient = createTTSStreamer({
      apiKey: "test-key",
      maxRetries: 3,
      retryBudgetMs: 1,
    });

    await expect(budgetClient.synthesize({ text: "Retry." })).rejects.toThrow(
      "status 429",
    );
    expect(budgetFetch).toHaveBeenCalledTimes(1);
  });

  test("4xx other than 429 surfaces without retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, body: null });
    vi.stubGlobal("fetch", fetchMock);

    const client = createTTSStreamer({
      apiKey: "test-key",
      maxRetries: 3,
      retryBudgetMs: 1_000,
    });

    await expect(client.synthesize({ text: "Missing." })).rejects.toThrow(
      "status 404",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("costUsd equals charactersUsed times pricePerCharUsd", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([[1]]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createTTSStreamer({
      apiKey: "test-key",
      pricePerCharUsd: 0.5,
    });

    const result = await client.synthesize({ text: "four" });

    expect(result.usage.charactersUsed).toBe(4);
    expect(result.usage.costUsd).toBe(2);
  });

  test("async text input phrase-buffers tokens and counts normalized sent characters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okResponse([[1]]))
      .mockResolvedValueOnce(okResponse([[2]]));
    vi.stubGlobal("fetch", fetchMock);

    const client = createTTSStreamer({
      apiKey: "test-key",
      pricePerCharUsd: 0.01,
    });

    const result = await client.synthesize({
      text: textDeltas(["Hel", "lo", ", ", "writer"]),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requestText(fetchMock, 0)).toBe("Hello,");
    expect(requestText(fetchMock, 1)).toBe("writer");
    expect(result.audio).toEqual(new Uint8Array([1, 2]));
    expect(result.usage.charactersUsed).toBe(12);
    expect(result.usage.costUsd).toBe(0.12);
  });

  test("aborting the consumer cancels in-flight fetch and rejects done", async () => {
    let observedSignal: AbortSignal | undefined;
    const fetchMock = vi.fn().mockImplementation(
      async (_url: string, init: RequestInit): Promise<MockResponse> => {
        observedSignal = init.signal instanceof AbortSignal ? init.signal : undefined;
        return {
          ok: true,
          status: 200,
          body: abortableBody(() => observedSignal),
        };
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createTTSStreamer({ apiKey: "test-key" });
    const stream = client.stream({ text: "Long sentence." });
    const iterator = stream[Symbol.asyncIterator]();
    const done = expect(stream.done).rejects.toThrow("TTS stream aborted");

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: new Uint8Array([1]),
    });
    await iterator.return?.();

    expect(observedSignal?.aborted).toBe(true);
    await done;
  });
});

async function* audioBody(chunks: number[][]): AsyncIterable<Uint8Array> {
  for (const chunk of chunks) {
    yield new Uint8Array(chunk);
  }
}

async function* abortableBody(
  getSignal: () => AbortSignal | undefined,
): AsyncIterable<Uint8Array> {
  yield new Uint8Array([1]);

  await new Promise<never>((_resolve, reject) => {
    const signal = getSignal();
    if (!signal) {
      reject(new Error("missing abort signal"));
      return;
    }

    signal.addEventListener(
      "abort",
      () => {
        reject(new Error("request aborted"));
      },
      { once: true },
    );
  });
}

async function* textDeltas(deltas: string[]): AsyncIterable<string> {
  for (const delta of deltas) {
    yield delta;
  }
}

function requestText(fetchMock: ReturnType<typeof vi.fn>, index: number): string {
  const call = fetchMock.mock.calls[index];
  if (call === undefined) {
    throw new Error(`missing fetch call ${index}`);
  }

  const init = call[1] as RequestInit | undefined;
  if (typeof init?.body !== "string") {
    throw new Error(`missing JSON body for fetch call ${index}`);
  }

  const body = JSON.parse(init.body) as { text?: unknown };
  if (typeof body.text !== "string") {
    throw new Error(`missing text for fetch call ${index}`);
  }

  return body.text;
}
