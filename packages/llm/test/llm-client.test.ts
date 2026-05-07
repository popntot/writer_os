import { describe, expect, test, vi, beforeEach } from "vitest";
import { computeCostUsd, createLLMClient } from "../src/index.js";

const anthropic = vi.hoisted(() => ({
  configs: [] as unknown[],
  stream: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation((config: unknown) => {
    anthropic.configs.push(config);
    return {
      messages: {
        stream: anthropic.stream,
      },
    };
  }),
}));

interface MockStreamOptions {
  events?: unknown[];
  finalMessage?: unknown;
}

const usage = {
  input_tokens: 1_000,
  output_tokens: 100,
  cache_creation_input_tokens: 10,
  cache_read_input_tokens: 20,
};

beforeEach(() => {
  anthropic.configs.length = 0;
  anthropic.stream.mockReset();
});

describe("LLMClient", () => {
  test("chat() returns text and usage with text from concatenated content blocks", async () => {
    anthropic.stream.mockReturnValue(
      mockStream({
        finalMessage: {
          content: [
            { type: "text", text: "Hello" },
            { type: "text", text: ", writer." },
          ],
          usage,
        },
      }),
    );

    const client = createLLMClient({ apiKey: "test-key" });
    const result = await client.chat({
      messages: [{ role: "user", content: "Say hello" }],
    });

    expect(anthropic.stream).toHaveBeenCalledWith({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: "Say hello" }],
    });
    expect(result).toEqual({
      text: "Hello, writer.",
      usage: {
        model: "claude-sonnet-4-6",
        inputTokens: 1_000,
        outputTokens: 100,
        cacheCreationInputTokens: 10,
        cacheReadInputTokens: 20,
        costUsd: computeCostUsd("claude-sonnet-4-6", {
          inputTokens: 1_000,
          outputTokens: 100,
          cacheCreationInputTokens: 10,
          cacheReadInputTokens: 20,
        }),
        durationMs: expect.any(Number),
      },
    });
  });

  test("stream() async-iterates text deltas and done resolves ChatResult", async () => {
    anthropic.stream.mockReturnValue(
      mockStream({
        events: [
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: "One" },
          },
          {
            type: "content_block_delta",
            delta: { type: "text_delta", text: " two" },
          },
        ],
        finalMessage: {
          content: [{ type: "text", text: "One two" }],
          usage,
        },
      }),
    );

    const client = createLLMClient({ apiKey: "test-key" });
    const stream = client.stream({
      messages: [{ role: "user", content: "Count" }],
    });
    const deltas: string[] = [];

    for await (const delta of stream) {
      deltas.push(delta);
    }

    await expect(stream.done).resolves.toMatchObject({
      text: "One two",
      usage: {
        model: "claude-sonnet-4-6",
        inputTokens: 1_000,
        outputTokens: 100,
        cacheCreationInputTokens: 10,
        cacheReadInputTokens: 20,
      },
    });
    expect(deltas).toEqual(["One", " two"]);
  });

  test("429 retries and then succeeds", async () => {
    anthropic.stream
      .mockImplementationOnce(() => {
        throw Object.assign(new Error("rate limited"), { status: 429 });
      })
      .mockReturnValueOnce(successStream());

    const client = createLLMClient({
      apiKey: "test-key",
      maxRetries: 1,
      retryBudgetMs: 1_000,
    });

    await expect(
      client.chat({ messages: [{ role: "user", content: "Retry" }] }),
    ).resolves.toMatchObject({ text: "Success" });
    expect(anthropic.stream).toHaveBeenCalledTimes(2);
  });

  test("500 retries and then succeeds", async () => {
    anthropic.stream
      .mockImplementationOnce(() => {
        throw Object.assign(new Error("server error"), { status: 500 });
      })
      .mockReturnValueOnce(successStream());

    const client = createLLMClient({
      apiKey: "test-key",
      maxRetries: 1,
      retryBudgetMs: 1_000,
    });

    await expect(
      client.chat({ messages: [{ role: "user", content: "Retry" }] }),
    ).resolves.toMatchObject({ text: "Success" });
    expect(anthropic.stream).toHaveBeenCalledTimes(2);
  });

  test("404 does not retry and throws on the first attempt", async () => {
    const notFound = Object.assign(new Error("not found"), { status: 404 });
    anthropic.stream.mockImplementationOnce(() => {
      throw notFound;
    });

    const client = createLLMClient({
      apiKey: "test-key",
      maxRetries: 3,
      retryBudgetMs: 1_000,
    });

    await expect(
      client.chat({ messages: [{ role: "user", content: "No retry" }] }),
    ).rejects.toThrow("not found");
    expect(anthropic.stream).toHaveBeenCalledTimes(1);
  });

  test("retries cap at maxRetries", async () => {
    anthropic.stream.mockImplementation(() => {
      throw Object.assign(new Error("rate limited"), { status: 429 });
    });

    const client = createLLMClient({
      apiKey: "test-key",
      maxRetries: 2,
      retryBudgetMs: 1_000,
    });

    await expect(
      client.chat({ messages: [{ role: "user", content: "Retry cap" }] }),
    ).rejects.toThrow("rate limited");
    expect(anthropic.stream).toHaveBeenCalledTimes(3);
  });

  test("onUsage fires exactly once per successful call", async () => {
    const onUsage = vi.fn();
    anthropic.stream
      .mockImplementationOnce(() => {
        throw Object.assign(new Error("rate limited"), { status: 429 });
      })
      .mockReturnValueOnce(successStream());

    const client = createLLMClient({
      apiKey: "test-key",
      maxRetries: 1,
      retryBudgetMs: 1_000,
      onUsage,
    });

    await client.chat({ messages: [{ role: "user", content: "Usage" }] });

    expect(anthropic.stream).toHaveBeenCalledTimes(2);
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "claude-sonnet-4-6",
        inputTokens: 1_000,
        outputTokens: 100,
      }),
    );
  });

  test("computeCostUsd returns the expected sonnet-4-6 snapshot", () => {
    expect(
      computeCostUsd("sonnet-4-6", {
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheCreationInputTokens: 10_000,
        cacheReadInputTokens: 50_000,
      }),
    ).toBe(4.5525);
  });
});

function successStream(): AsyncIterable<unknown> & {
  finalMessage(): Promise<unknown>;
} {
  return mockStream({
    finalMessage: {
      content: [{ type: "text", text: "Success" }],
      usage,
    },
  });
}

function mockStream(options: MockStreamOptions): AsyncIterable<unknown> & {
  finalMessage(): Promise<unknown>;
} {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
      for (const event of options.events ?? []) {
        yield event;
      }
    },
    async finalMessage(): Promise<unknown> {
      return options.finalMessage;
    },
  };
}
