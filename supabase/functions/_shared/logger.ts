/**
 * Structured JSON Logger for Edge Functions
 *
 * Produces single-line JSON log entries parsable by log aggregation tools.
 * Integrates with `log_observability()` RPC for persistent storage.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   import { logger } from "../_shared/logger.ts";
 *
 *   logger.info("Room settled", { roomId, potAmount });
 *   logger.warn("Rate limit approaching", { remaining: 3 });
 *   logger.error("Settlement failed", { roomId, error: err.message });
 *
 * ── Log Levels ──────────────────────────────────────────────────────────────
 *
 *   DEBUG (0)  — Verbose diagnostics, enabled only in development
 *   INFO  (1)  — Normal operational messages (default)
 *   WARN  (2)  — Something unexpected but non-critical
 *   ERROR (3)  — A failure that needs investigation
 *
 * Level is configured via `LOG_LEVEL` env var (default: "INFO").
 * "SILENT" disables all output.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ---------------------------------------------------------------------------
// Log Levels
// ---------------------------------------------------------------------------

export const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 99,
} as const;

export type LogLevelName = keyof typeof LogLevel;

const LEVEL_NAMES: Record<number, string> = {
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.INFO]: "INFO",
  [LogLevel.WARN]: "WARN",
  [LogLevel.ERROR]: "ERROR",
};

const LEVEL_VALUES: Record<string, number> = {
  DEBUG: LogLevel.DEBUG,
  INFO: LogLevel.INFO,
  WARN: LogLevel.WARN,
  ERROR: LogLevel.ERROR,
  SILENT: LogLevel.SILENT,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read `LOG_LEVEL` env var and parse to numeric level.
 * Defaults to INFO if unset or invalid.
 */
function resolveLogLevel(): number {
  const raw = Deno.env.get("LOG_LEVEL")?.toUpperCase().trim() ?? "INFO";
  return LEVEL_VALUES[raw] ?? LogLevel.INFO;
}

/**
 * Build a JSON log entry with required fields.
 */
function buildEntry(
  level: number,
  message: string,
  metadata?: Record<string, unknown>,
) {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level: LEVEL_NAMES[level] ?? "UNKNOWN",
    message,
  };

  // Include function name from a naming convention or Deno context
  // Edge Functions can set `logger.functionName = "my-function"` at startup.
  if (buildEntry.functionName) {
    entry.function = buildEntry.functionName;
  }

  if (metadata && Object.keys(metadata).length > 0) {
    entry.metadata = metadata;
  }

  return entry;
}

// Allow setting function name per-request
buildEntry.functionName = "";

// ---------------------------------------------------------------------------
// Logger Interface
// ---------------------------------------------------------------------------

export interface Logger {
  readonly level: number;

  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;

  /** Create a child logger with enriched metadata (e.g. per-request state). */
  child(defaults: Record<string, unknown>): Logger;

  /** Set the function name for all subsequent log entries. */
  withFunctionName(name: string): Logger;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

function createLogger(
  level: number,
  defaults: Record<string, unknown> = {},
): Logger {
  const log = (lvl: number, message: string, metadata?: Record<string, unknown>) => {
    if (lvl < level) return; // below threshold → skip

    const entry = buildEntry(lvl, message, {
      ...defaults,
      ...metadata,
    });

    // Write to stdout as single JSON line
    console.log(JSON.stringify(entry));

    // Flush to log_observability RPC for ERROR and WARN
    // (callers must pass the admin client separately for async flush)
  };

  return {
    get level() {
      return level;
    },

    debug: (msg, meta?) => log(LogLevel.DEBUG, msg, meta),
    info: (msg, meta?) => log(LogLevel.INFO, msg, meta),
    warn: (msg, meta?) => log(LogLevel.WARN, msg, meta),
    error: (msg, meta?) => log(LogLevel.ERROR, msg, meta),

    child: (extraDefaults) =>
      createLogger(level, { ...defaults, ...extraDefaults }),

    withFunctionName: (name) => {
      buildEntry.functionName = name;
      return createLogger(level, { ...defaults, function: name });
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

const level = resolveLogLevel();

/**
 * Singleton structured logger — imported once at module load time.
 *
 * Usage:
 *   import { logger } from "../_shared/logger.ts";
 *   logger.info("Started");
 */
export const logger: Logger = createLogger(level);

/**
 * Convenience: log an error with structured metadata and persist to
 * `log_observability` RPC.
 *
 * @param admin Authenticated Supabase client (service-role).
 * @param eventName  The `p_event` value stored in observability.
 * @param message    Human-readable description.
 * @param meta       Additional structured metadata.
 */
export async function logObservability(
  admin: { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> },
  eventName: string,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  logger.info(message, { ...meta, observabilityEvent: eventName });

  try {
    await admin.rpc("log_observability", {
      p_event: eventName,
      p_details: JSON.stringify({
        message,
        timestamp: new Date().toISOString(),
        ...meta,
      }),
    });
  } catch (err) {
    logger.warn("log_observability RPC failed", {
      event: eventName,
      error: String(err),
    });
  }
}

/**
 * Re-initialize the logger with a new log level (useful for tests).
 */
export function setLogLevel(name: LogLevelName): void {
  const newLevel = LEVEL_VALUES[name];
  if (newLevel !== undefined) {
    // Mutate the singleton's behaviour by replacing the level.
    // This is a lightweight approach — for production, prefer env var.
    Object.defineProperty(logger, "level", { value: newLevel });
  }
}
