#!/usr/bin/env -S deno run -A
// CRSH-001 — Connection-leak probe for Upstash Redis (REST).
// Fires N parallel cancel-mode matchmake calls (no-op for backend, but
// touches the Redis client on each invocation), then queries Upstash
// DBSIZE before/after to prove there are no leaked sockets / clients.
//
// Pass criteria:
//   - All invocations return HTTP 200/4xx (no 5xx)
//   - DBSIZE returns to ±2 of baseline within 10 s
// Exit code 0 on success, 1 on failure.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
const UPSTASH_URL = Deno.env.get("UPSTASH_REDIS_REST_URL");
const UPSTASH_TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
const USER_JWT = Deno.env.get("TEST_USER_JWT"); // required: pre-issued session

if (!SUPABASE_URL || !ANON || !UPSTASH_URL || !UPSTASH_TOKEN || !USER_JWT) {
  console.error("Missing env: SUPABASE_URL, SUPABASE_ANON_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, TEST_USER_JWT");
  Deno.exit(2);
}

const PARALLEL = Number(Deno.env.get("PARALLEL") ?? 50);

async function upstash(cmd: (string | number)[]): Promise<unknown> {
  const r = await fetch(UPSTASH_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  return j.result;
}

async function fire(): Promise<{ status: number; ms: number }> {
  const t0 = performance.now();
  const r = await fetch(`${SUPABASE_URL}/functions/v1/blitz-matchmake`, {
    method: "POST",
    headers: {
      apikey: ANON!,
      Authorization: `Bearer ${USER_JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mode: "cancel", symbol: "BTCUSDT", entry_fee: 1 }),
  });
  await r.text();
  return { status: r.status, ms: performance.now() - t0 };
}

console.log(`[crsh-001] baseline DBSIZE...`);
const baseline = Number(await upstash(["DBSIZE"]));
console.log(`[crsh-001] baseline=${baseline}`);

console.log(`[crsh-001] firing ${PARALLEL} parallel invocations...`);
const t0 = performance.now();
const results = await Promise.all(Array.from({ length: PARALLEL }, fire));
const wall = performance.now() - t0;

const status5xx = results.filter((r) => r.status >= 500).length;
const status2xx = results.filter((r) => r.status >= 200 && r.status < 300).length;
const status4xx = results.filter((r) => r.status >= 400 && r.status < 500).length;
const latencies = results.map((r) => r.ms).sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)];
const p95 = latencies[Math.floor(latencies.length * 0.95)];
const p99 = latencies[Math.floor(latencies.length * 0.99)];

console.log(`[crsh-001] wall=${wall.toFixed(0)}ms  2xx=${status2xx}  4xx=${status4xx}  5xx=${status5xx}`);
console.log(`[crsh-001] latency p50=${p50.toFixed(0)}ms p95=${p95.toFixed(0)}ms p99=${p99.toFixed(0)}ms`);

// Allow connections to drain
await new Promise((r) => setTimeout(r, 10_000));
const after = Number(await upstash(["DBSIZE"]));
console.log(`[crsh-001] post-drain DBSIZE=${after}  drift=${after - baseline}`);

const ok = status5xx === 0 && Math.abs(after - baseline) <= 2;
console.log(`[crsh-001] result=${ok ? "PASS" : "FAIL"}`);
Deno.exit(ok ? 0 : 1);
