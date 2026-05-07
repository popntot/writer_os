export interface RetryOptions {
  maxRetries: number;
  retryBudgetMs: number;
}

const BASE_DELAY_MS = 25;
const JITTER_MS = 25;

export async function withRetry<T>(
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
