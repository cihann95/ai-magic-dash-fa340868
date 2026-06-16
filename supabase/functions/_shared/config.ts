/**
 * Edge Function Configuration Module
 *
 * Validates ALL environment variables at module load time. Throws `ConfigError`
 * immediately if any required variable is missing, giving operators an
 * unambiguous startup error instead of a cryptic runtime failure mid-request.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   import { config } from "../_shared/config.ts";
 *
 *   // config.supabaseUrl          → string (validated)
 *   // config.upstashRedisRestUrl  → string | undefined (optional)
 *   // config.vapidSubject         → string (defaults to "mailto:noreply@lumen.trade")
 *
 * ── Adding a new variable ───────────────────────────────────────────────────
 *
 * 1. Add the field to the `Config` interface below.
 * 2. Add the `Deno.env.get()` call in `loadConfig()`.
 * 3. If required: add a `ConfigError` guard.
 *    If optional: default to `undefined`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Thrown when a required environment variable is missing at startup.
 *
 * The message includes the variable name so operators can fix the issue
 * without reading source code.
 */
export class ConfigError extends Error {
  constructor(variable: string) {
    super(`${variable} is required but not set`);
    this.name = "ConfigError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Typed, validated edge-function configuration. */
export interface Config {
  /** Supabase project URL (e.g. `https://xxx.supabase.co`). Required. */
  readonly supabaseUrl: string;
  /** Supabase service-role key — full admin access, bypasses RLS. Required. */
  readonly supabaseServiceRoleKey: string;
  /** Supabase anon/public key — used by user-facing edge functions. Required. */
  readonly supabaseAnonKey: string;
  /** OpenRouter AI API key — powers all AI features. Required. */
  readonly openrouterApiKey: string;
  /** Upstash Redis REST URL — missing → Redis disabled (fail-open). Optional. */
  readonly upstashRedisRestUrl: string | undefined;
  /** Upstash Redis REST token — missing → Redis disabled (fail-open). Optional. */
  readonly upstashRedisRestToken: string | undefined;
  /** Web Push VAPID public key — missing → push notifications disabled. Optional. */
  readonly vapidPublicKey: string | undefined;
  /** Web Push VAPID private key — missing → push notifications disabled. Optional. */
  readonly vapidPrivateKey: string | undefined;
  /** VAPID contact subject. Defaults to `mailto:noreply@lumen.trade`. */
  readonly vapidSubject: string;
  /** Waiting room timeout in seconds (blitz-matchmake). Defaults to 300. Optional. */
  readonly waitingRoomTtlSeconds: string | undefined;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

function getRequired(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new ConfigError(name);
  }
  return value;
}

function getOptional(name: string): string | undefined {
  return Deno.env.get(name) || undefined;
}

/**
 * Read and validate all environment variables.
 *
 * - **Required** vars: throws `ConfigError` if missing.
 * - **Optional** vars: returns `undefined` if not set.
 * - **Defaults** applied where documented.
 *
 * @returns A frozen `Config` object.
 */
function loadConfig(): Config {
  const config = Object.freeze({
    supabaseUrl: getRequired("SUPABASE_URL"),
    supabaseServiceRoleKey: getRequired("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseAnonKey: getRequired("SUPABASE_ANON_KEY"),
    openrouterApiKey: getRequired("OPENROUTER_API_KEY"),
    upstashRedisRestUrl: getOptional("UPSTASH_REDIS_REST_URL"),
    upstashRedisRestToken: getOptional("UPSTASH_REDIS_REST_TOKEN"),
    vapidPublicKey: getOptional("VAPID_PUBLIC_KEY"),
    vapidPrivateKey: getOptional("VAPID_PRIVATE_KEY"),
    vapidSubject: getOptional("VAPID_SUBJECT") ?? "mailto:noreply@lumen.trade",
    waitingRoomTtlSeconds: getOptional("WAITING_ROOM_TTL_SECONDS"),
  }) satisfies Config;

  return config;
}

// ---------------------------------------------------------------------------
// Singleton — loaded once at module import time
// ---------------------------------------------------------------------------

/**
 * Validated edge-function configuration singleton.
 *
 * Loaded on first import.  If any required variable is missing, the import
 * itself throws a `ConfigError` — fail fast, no silent degradation.
 */
export const config: Config = loadConfig();
