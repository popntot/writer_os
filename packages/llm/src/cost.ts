import type { UsageEvent } from "./types.js";

interface ModelRates {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

type UsageForCost = Pick<
  UsageEvent,
  | "inputTokens"
  | "outputTokens"
  | "cacheCreationInputTokens"
  | "cacheReadInputTokens"
>;

// TODO: Update these rates against current Anthropic pricing before production use.
const RATES: Record<string, ModelRates> = {
  "sonnet-4-6": {
    input: 3,
    output: 15,
    cacheWrite: 3.75,
    cacheRead: 0.3,
  },
  "opus-4-7": {
    input: 15,
    output: 75,
    cacheWrite: 18.75,
    cacheRead: 1.5,
  },
};

export function computeCostUsd(model: string, usage: UsageForCost): number {
  const rate = RATES[toRateKey(model)];

  if (!rate) {
    return 0;
  }

  return (
    (usage.inputTokens * rate.input +
      usage.outputTokens * rate.output +
      usage.cacheCreationInputTokens * rate.cacheWrite +
      usage.cacheReadInputTokens * rate.cacheRead) /
    1_000_000
  );
}

function toRateKey(model: string): string {
  if (model === "claude-sonnet-4-6") {
    return "sonnet-4-6";
  }

  if (model === "claude-opus-4-7") {
    return "opus-4-7";
  }

  return model;
}
