/**
 * Feature Flag & Subscription System
 *
 * Environment-based flags (kebab-case) + runtime subscription-powered flags.
 * All flags default to `false` or `0` for safety — a feature is only active
 * when the corresponding flag says so.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Known env-var feature flags (kebab-case). */
export type FeatureFlag = "ana-sahne";

/** All env flags + computed subscription flags. */
export interface FeatureFlags {
  anaSahne: boolean;
  isPremium: boolean;
  isTrial: boolean;
  trialDaysLeft: number;
  maxDailyAnalysis: number;
  allowedThemes: string[];
}

export interface SubscriptionInfo {
  plan: "free" | "pro" | "elite";
  trialEndsAt: string | null;
  currentPeriodEndsAt: string | null;
  stripeSubscriptionId: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toEnvKey(name: FeatureFlag): string {
  const screaming = name.replace(/-/g, "_").toUpperCase();
  return `VITE_${screaming}_ENABLED`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function hasFeature(name: FeatureFlag): boolean {
  return import.meta.env[toEnvKey(name)] === "true";
}

export function getFeatureFlags(): FeatureFlags {
  return {
    anaSahne: hasFeature("ana-sahne"),
    isPremium: false,
    isTrial: false,
    trialDaysLeft: 0,
    maxDailyAnalysis: 5,
    allowedThemes: ["dark", "light"],
  };
}

/** Compute feature flags from subscription data. */
export function computeSubscriptionFlags(
  sub: SubscriptionInfo | null,
): Pick<FeatureFlags, "isPremium" | "isTrial" | "trialDaysLeft" | "maxDailyAnalysis" | "allowedThemes"> {
  if (!sub || sub.plan === "free") {
    const trialEnd = sub?.trialEndsAt ? new Date(sub.trialEndsAt) : null;
    const now = new Date();
    const isTrial = trialEnd !== null && trialEnd > now;
    const trialDaysLeft = isTrial ? Math.max(0, Math.ceil((trialEnd!.getTime() - now.getTime()) / 86400000)) : 0;
    return {
      isPremium: false,
      isTrial,
      trialDaysLeft,
      maxDailyAnalysis: isTrial ? 9999 : 5,
      allowedThemes: ["dark", "light"],
    };
  }

  return {
    isPremium: true,
    isTrial: false,
    trialDaysLeft: 0,
    maxDailyAnalysis: 9999,
    allowedThemes: ["dark", "light", "gold"],
  };
}
