export type Model = "sonnet-4-6" | "opus-4-7" | (string & {});

export interface TextBlock {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | TextBlock[];
}

export interface ChatOptions {
  model?: Model;
  system?: string | TextBlock[];
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  metadata?: { userId?: string };
}

export interface UsageEvent {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUsd: number;
  durationMs: number;
}

export interface ChatResult {
  text: string;
  usage: UsageEvent;
}

export interface LLMStream extends AsyncIterable<string> {
  done: Promise<ChatResult>;
}

export interface LLMClient {
  chat(opts: ChatOptions): Promise<ChatResult>;
  stream(opts: ChatOptions): LLMStream;
}

export interface LLMClientConfig {
  apiKey: string;
  defaultModel?: Model;
  maxRetries?: number;
  retryBudgetMs?: number;
  onUsage?: (event: UsageEvent) => void;
}
