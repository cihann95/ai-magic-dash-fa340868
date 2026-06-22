import { logger } from "./logger.ts";

interface ObservabilityEntry {
  functionName: string;
  errorCode?: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export async function logToObservability(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> },
  entry: ObservabilityEntry,
): Promise<void> {
  const { functionName, errorCode, durationMs, metadata } = entry;

  logger.error(`${functionName} error`, { errorCode, durationMs, ...metadata });

  try {
    await admin.rpc("log_observability", {
      p_event: functionName,
      p_details: JSON.stringify({
        error_code: errorCode,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
        ...metadata,
      }),
    });
  } catch (err) {
    logger.warn("log_observability RPC failed", {
      function: functionName,
      error: String(err),
    });
  }
}

export function createTimer() {
  const start = Date.now();
  return {
    elapsed: () => Date.now() - start,
  };
}
