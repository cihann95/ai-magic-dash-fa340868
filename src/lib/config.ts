/**
 * Frontend Configuration Module
 *
 * Validates all `VITE_*` environment variables at module load time.
 * Replaces raw `import.meta.env` access with a typed, validated config
 * object so missing or misconfigured vars surface immediately rather than
 * causing cryptic runtime errors.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   import { frontendConfig } from "@/lib/config";
 *
 *   // frontendConfig.supabaseUrl           → string (validated)
 *   // frontendConfig.supabasePublishableKey → string (validated)
 *   // frontendConfig.anaSahneEnabled       → boolean (parsed)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

/**
 * Thrown when a required frontend environment variable is missing.
 *
 * Includes the variable name so developers get an actionable error message.
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

/** Typed, validated frontend configuration. */
export interface FrontendConfig {
  /** Supabase project URL (e.g. `https://xxx.supabase.co`). Required. */
  readonly supabaseUrl: string;
  /** Supabase anon/publishable key — safe for browser use. Required. */
  readonly supabasePublishableKey: string;
  /** Ana Sahne section toggle — `true` to show on landing page. Defaults to `false`. */
  readonly anaSahneEnabled: boolean;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

function getRequired(name: string): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new ConfigError(name);
  }
  return value;
}

/**
 * Parse a boolean env var string into an actual boolean.
 *
 * Only the literal string `"true"` (case-insensitive) yields `true`.
 * Everything else — `undefined`, `"false"`, empty string — yields `false`.
 */
function parseBoolean(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

/**
 * Read and validate all frontend environment variables.
 *
 * - **Required** vars: throws `ConfigError` if missing or empty.
 * - **Optional** vars: parsed to appropriate types with safe defaults.
 *
 * @returns A `FrontendConfig` object.
 */
function loadFrontendConfig(): FrontendConfig {
  return Object.freeze({
    supabaseUrl: getRequired("VITE_SUPABASE_URL"),
    supabasePublishableKey: getRequired("VITE_SUPABASE_PUBLISHABLE_KEY"),
    anaSahneEnabled: parseBoolean(import.meta.env.VITE_ANA_SAHNE_ENABLED),
  }) satisfies FrontendConfig;
}

// ---------------------------------------------------------------------------
// Singleton — loaded once at module import time
// ---------------------------------------------------------------------------

/**
 * Validated frontend configuration singleton.
 *
 * Loaded on first import.  If any required variable is missing, the import
 * itself throws a `ConfigError` — fail fast in development.
 *
 * In production builds, Vite inlines env vars at build time so this module
 * will always have values — but it still validates in case of misconfigured
 * deployment (e.g. missing `.env` during build).
 */
export const frontendConfig: FrontendConfig = loadFrontendConfig();
