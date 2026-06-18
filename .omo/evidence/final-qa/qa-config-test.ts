/**
 * QA Scenario 1: config.ts - ConfigError graceful degradation
 *
 * Tests:
 * 1. Production mode with empty env vars → no crash, degraded config
 * 2. isConfigValid() returns false when required vars are empty
 * 3. Development mode still throws ConfigError
 */

// ── Test 1: Production mode (no NODE_ENV set) ─────────────────────────────
console.log("=== Test 1: Production mode with empty env vars ===");

// Clear all required vars
Deno.env.set("SUPABASE_URL", "");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "");
Deno.env.set("SUPABASE_ANON_KEY", "");
Deno.env.set("OPENROUTER_API_KEY", "");
Deno.env.delete("NODE_ENV"); // ensure production mode

try {
  const { config, isConfigValid } = await import(
    new URL("../../supabase/functions/_shared/config.ts", import.meta.url).href
  );

  console.log("✓ No crash: config loaded successfully");
  console.log("  supabaseUrl:", JSON.stringify(config.supabaseUrl));
  console.log("  supabaseServiceRoleKey:", JSON.stringify(config.supabaseServiceRoleKey));

  // Verify degraded state
  if (config.supabaseUrl === "") {
    console.log("✓ Degraded: supabaseUrl is empty string");
  } else {
    console.log("✗ FAIL: supabaseUrl should be empty, got:", config.supabaseUrl);
    Deno.exit(1);
  }

  if (config.supabaseServiceRoleKey === "") {
    console.log("✓ Degraded: supabaseServiceRoleKey is empty string");
  } else {
    console.log("✗ FAIL: supabaseServiceRoleKey should be empty");
    Deno.exit(1);
  }

  if (config.supabaseAnonKey === "") {
    console.log("✓ Degraded: supabaseAnonKey is empty string");
  } else {
    console.log("✗ FAIL: supabaseAnonKey should be empty");
    Deno.exit(1);
  }

  if (config.openrouterApiKey === "") {
    console.log("✓ Degraded: openrouterApiKey is empty string");
  } else {
    console.log("✗ FAIL: openrouterApiKey should be empty");
    Deno.exit(1);
  }

  // ── Test 2: isConfigValid ───────────────────────────────────────────────
  console.log("\n=== Test 2: isConfigValid() ===");

  const valid = isConfigValid();
  if (valid === false) {
    console.log("✓ isConfigValid() returns false (expected with empty vars)");
  } else {
    console.log("✗ FAIL: isConfigValid() should return false, got:", valid);
    Deno.exit(1);
  }

  console.log("\n✓ Test 1 & 2 PASSED: Production mode degrades gracefully");
} catch (err) {
  console.log("✗ FAIL: Unexpected crash in production mode:", err.message);
  Deno.exit(1);
}

// ── Test 3: Development mode ──────────────────────────────────────────────
console.log("\n=== Test 3: Development mode throws ConfigError ===");

Deno.env.set("NODE_ENV", "development");
// Vars are still empty from above

// Need to clear module cache to force re-evaluation
const configUrl = new URL("../../supabase/functions/_shared/config.ts", import.meta.url).href;
const configKey = Deno.env.get("SUPABASE_URL") ?? "";

try {
  // Import a fresh copy — Deno caches by URL, so use a cache-busting import
  const devModule = await import(
    `${configUrl}?cachebust=${Date.now()}`
  );

  // If we get here without error, check if the config is valid
  console.log("✗ FAIL: Dev mode should have thrown ConfigError, but imported successfully");
  console.log("  supabaseUrl:", JSON.stringify(devModule.config.supabaseUrl));
  Deno.exit(1);
} catch (err) {
  if (err instanceof Error && err.name === "ConfigError") {
    console.log("✓ ConfigError thrown in development mode:", err.message);
    console.log("✓ Test 3 PASSED: Development mode fails fast with ConfigError");
  } else {
    console.log("✗ FAIL: Expected ConfigError but got:", err.constructor?.name ?? typeof err, "-", err.message ?? err);
    Deno.exit(1);
  }
}

console.log("\n========================================");
console.log("✓ ALL TESTS PASSED (Task 1 - config.ts)");
console.log("========================================");
