import { createLLMClient, type LLMClient } from "@writer-os/llm";
import type { Env } from "./env.js";

export function createLLMForWorker(env: Env): LLMClient {
  return createLLMClient({ apiKey: env.ANTHROPIC_API_KEY });
}
