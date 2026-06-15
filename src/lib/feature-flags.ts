/**
 * Feature Flag System
 *
 * Centralized, typed feature flag management for client-side features.
 * All flags default to `false` for safety — a feature is only active when its
 * environment variable is explicitly set to `"true"`.
 *
 * ── Adding a new flag ────────────────────────────────────────────────────
 *
 * 1. Add the flag name (kebab-case) to the `FeatureFlag` union type below.
 * 2. Add a corresponding boolean property to the `FeatureFlags` interface.
 * 3. Add the env-var check in `hasFeature()` and the property in `getFeatureFlags()`.
 * 4. Set the env var as `VITE_YOUR_FLAG_ENABLED=true` in `.env` / `.env.example`.
 *
 *    Example:
 *      FeatureFlag:        'my-new-feature'
 *      Env var:            VITE_MY_NEW_FEATURE_ENABLED
 *      Vite type decl:     readonly VITE_MY_NEW_FEATURE_ENABLED?: string;
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** All known feature flags — add new flags here (kebab-case). */
export type FeatureFlag = "ana-sahne";

/** Boolean map of every flag — one property per flag (camelCase). */
export interface FeatureFlags {
  anaSahne: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a kebab-case flag name to the corresponding `VITE_*_ENABLED` env-var
 * key.  E.g. `"ana-sahne"` → `"VITE_ANA_SAHNE_ENABLED"`.
 */
function toEnvKey(name: FeatureFlag): string {
  const screaming = name.replace(/-/g, "_").toUpperCase();
  return `VITE_${screaming}_ENABLED`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a single feature flag is enabled.
 *
 * @param name – The kebab-case flag identifier (e.g. `'ana-sahne'`).
 * @returns `true` when the corresponding `VITE_*_ENABLED` env var is exactly
 *          the string `"true"`.  Returns `false` for any other value or when
 *          the env var is not set at all (safe default).
 *
 * @example
 *   if (hasFeature('ana-sahne')) {
 *     // render Ana Sahne section
 *   }
 */
export function hasFeature(name: FeatureFlag): boolean {
  return import.meta.env[toEnvKey(name)] === "true";
}

/**
 * Get the state of **all** known feature flags at once.
 *
 * @returns A `FeatureFlags` object where every property is `true` when the
 *          corresponding env var is `"true"`, or `false` otherwise.
 *
 * @example
 *   const flags = getFeatureFlags();
 *   if (flags.anaSahne) { ... }
 */
export function getFeatureFlags(): FeatureFlags {
  return {
    anaSahne: hasFeature("ana-sahne"),
  };
}
