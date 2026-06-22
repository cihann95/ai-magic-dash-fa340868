#!/usr/bin/env tsx

const SUPABASE_URL = process.env.SUPABASE_URL;
const VERCEL_URL = process.env.VERCEL_URL || "http://localhost:8080";

interface TestResult {
  name: string;
  status: "pass" | "fail";
  httpCode: number;
  durationMs: number;
  error?: string;
}

const results: TestResult[] = [];

async function test(name: string, url: string, options: RequestInit = {}, expectedCodes: number[] = [200]): Promise<void> {
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(10000),
    });
    const durationMs = Date.now() - start;
    const passed = expectedCodes.includes(resp.status);
    results.push({
      name,
      status: passed ? "pass" : "fail",
      httpCode: resp.status,
      durationMs,
      error: passed ? undefined : `Expected ${expectedCodes.join(" or ")}, got ${resp.status}`,
    });
    console.log(`${passed ? "✅" : "❌"} ${name}: HTTP ${resp.status} (${durationMs}ms)`);
  } catch (err) {
    const durationMs = Date.now() - start;
    results.push({
      name,
      status: "fail",
      httpCode: 0,
      durationMs,
      error: String(err),
    });
    console.log(`❌ ${name}: ${err} (${durationMs}ms)`);
  }
}

async function main() {
  console.log("🧪 Running smoke tests...\n");

  // Test 1: Vercel homepage
  await test("Vercel Homepage", `${VERCEL_URL}/`, {}, [200]);

  // Test 2: Health endpoint
  if (SUPABASE_URL) {
    await test("Health Endpoint", `${SUPABASE_URL}/functions/v1/health`, {}, [200, 503]);

    // Test 3: Price feed (public, should return 200 or data)
    await test("Price Feed (Public)", `${SUPABASE_URL}/functions/v1/price-feed`, {}, [200, 401]);

    // Test 4: Execute trade (auth required, should return 401)
    await test("Execute Trade (Auth Required)", `${SUPABASE_URL}/functions/v1/execute-trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }, [401]);
  } else {
    console.log("⚠️ SUPABASE_URL not set, skipping edge function tests\n");
  }

  // Summary
  const passed = results.filter((r) => r.status === "pass").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const total = results.length;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ Passed: ${passed}/${total}`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}/${total}`);
    console.log("\nFailed tests:");
    results
      .filter((r) => r.status === "fail")
      .forEach((r) => console.log(`  - ${r.name}: ${r.error}`));
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  process.exit(failed > 0 ? 1 : 0);
}

main();
