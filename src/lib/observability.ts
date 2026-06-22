import * as Sentry from "@sentry/react";

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  service: string;
  event: string;
  level: LogLevel;
  metadata?: Record<string, unknown>;
  durationMs?: number;
}

const isDev = typeof import.meta !== "undefined"
  ? import.meta.env.MODE === "development"
  : typeof process !== "undefined" && process.env.NODE_ENV === "development";

const sentryDsn = typeof import.meta !== "undefined"
  ? import.meta.env.VITE_SENTRY_DSN
  : undefined;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: typeof import.meta !== "undefined" ? import.meta.env.MODE : "production",
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.5,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    enabled: !isDev,
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    Sentry.captureException(event.reason, { tags: { source: "unhandledrejection" } });
    console.error("[unhandledrejection]", event.reason);
  });

  window.addEventListener("error", (event) => {
    if (event.error && !event.error.__sentry__) {
      Sentry.captureException(event.error, { tags: { source: "global-error" } });
    }
  });
}

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

  error: (service: string, event: string, metadata?: Record<string, unknown>) => {
    log({ service, event, level: "error", metadata });
    Sentry.withScope((scope) => {
      scope.setTag("service", service);
      scope.setTag("event", event);
      if (metadata) scope.setExtras(metadata);
      Sentry.captureMessage(`${service}: ${event}`, "error");
    });
  },

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
        Sentry.withScope((scope) => {
          scope.setTag("service", service);
          scope.setTag("event", event);
          scope.setExtra("durationMs", durationMs);
          Sentry.captureException(err);
        });
        throw err;
      });
  },

  captureException: (error: Error, context?: { service?: string; event?: string; metadata?: Record<string, unknown> }) => {
    Sentry.withScope((scope) => {
      if (context?.service) scope.setTag("service", context.service);
      if (context?.event) scope.setTag("event", context.event);
      if (context?.metadata) scope.setExtras(context.metadata);
      Sentry.captureException(error);
    });
  },
};

export type { LogLevel, LogEntry };
