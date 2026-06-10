type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  service: string;
  event: string;
  level: LogLevel;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

const isDev = typeof process !== "undefined" && process.env.NODE_ENV === "development";

function log(entry: LogEntry): void {
  const prefix = `[${entry.service}] ${entry.event}`;
  switch (entry.level) {
    case "error":
      if (entry.metadata) console.error(prefix, entry.metadata);
      else console.error(prefix);
      break;
    case "warn":
      if (entry.metadata) console.warn(prefix, entry.metadata);
      else console.warn(prefix);
      break;
    case "debug":
      if (isDev) {
        if (entry.metadata) console.debug(prefix, entry.metadata);
        else console.debug(prefix);
      }
      break;
    default:
      if (isDev) {
        if (entry.metadata) console.log(prefix, entry.metadata);
        else console.log(prefix);
      }
      break;
  }
}

export const observability = {
  info: (service: string, event: string, metadata?: Record<string, unknown>) =>
    log({ service, event, level: "info", metadata }),

  warn: (service: string, event: string, metadata?: Record<string, unknown>) =>
    log({ service, event, level: "warn", metadata }),

  error: (service: string, event: string, metadata?: Record<string, unknown>) =>
    log({ service, event, level: "error", metadata }),

  debug: (service: string, event: string, metadata?: Record<string, unknown>) =>
    log({ service, event, level: "debug", metadata }),

  timed: (service: string, event: string, fn: () => Promise<void>): Promise<void> => {
    const start = performance.now();
    return fn()
      .then(() => {
        const durationMs = Math.round(performance.now() - start);
        log({ service, event, level: "info", metadata: { durationMs }, durationMs });
      })
      .catch((err) => {
        const durationMs = Math.round(performance.now() - start);
        log({ service, event, level: "error", metadata: { error: String(err), durationMs }, durationMs });
        throw err;
      });
  },
};

export type { LogLevel, LogEntry };
