#!/usr/bin/env -S deno run -A
// Hard Audit Crash-Tests runner.
// Starts _mock_server.ts, waits for PORT, runs all 3 audit scripts,
// captures logs under .omo/evidence/hard-audit/.

import { ensureDir } from "jsr:@std/fs@1";

// Simple decoder wrapper (hoisted before usage)
class TextDecoderDecoder {
  private decoder = new TextDecoder();
  decode(data: Uint8Array, options?: { stream?: boolean }): string {
    return this.decoder.decode(data, options);
  }
}

const EVIDENCE_DIR = ".omo/evidence/hard-audit";
const MOCK_SERVER = "scripts/audit/_mock_server.ts";
const SCRIPTS: { label: string; file: string; out: string }[] = [
  {
    label: "CRSH-001",
    file: "scripts/audit/redis-leak-probe.ts",
    out: `${EVIDENCE_DIR}/crsh-001-leak.log`,
  },
  {
    label: "CRSH-002",
    file: "scripts/audit/concurrency-bomb.ts",
    out: `${EVIDENCE_DIR}/crsh-002-bomb.log`,
  },
  {
    label: "CRSH-003",
    file: "scripts/audit/arbitrage-exploit.ts",
    out: `${EVIDENCE_DIR}/crsh-003-exploit.log`,
  },
];

// ─── Start mock server ──────────────────────────────────────────────────────

console.log("=".repeat(70));
console.log("HARD TECHNICAL AUDIT — CRASH TEST RUNNER");
console.log("=".repeat(70));
console.log();
console.log("[runner] starting mock server...");

const mockProc = new Deno.Command(Deno.execPath(), {
  args: ["run", "-A", MOCK_SERVER],
  stdout: "piped",
  stderr: "piped",
  stdin: "null",
}).spawn();

// Read PORT from mock server stdout
let mockPort = 0;
const reader = mockProc.stdout.getReader();
const decoder = new TextDecoderDecoder();
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    console.log(`[mock] ${text.trim()}`);
    const m = text.match(/PORT=(\d+)/);
    if (m) { mockPort = Number(m[1]); break; }
  }
} finally {
  reader.releaseLock();
}

if (!mockPort) {
  console.error("[runner] FAILED to get mock server port");
  mockProc.kill("SIGTERM");
  Deno.exit(1);
}

const BASE_URL = `http://127.0.0.1:${mockPort}`;
console.log(`[runner] mock server ready at ${BASE_URL}`);
console.log();

// ─── Run each script ────────────────────────────────────────────────────────

await ensureDir(EVIDENCE_DIR);

let passed = 0;
let failed = 0;
const results: { id: string; status: "PASS" | "FAIL"; exitCode: number }[] = [];

for (const { label, file, out } of SCRIPTS) {
  console.log(`${'─'.repeat(70)}`);
  console.log(`[runner] >>> ${label}: ${file}`);
  console.log(`[runner]     output → ${out}`);
  console.log();

  // Build env for the audit script
  const env: Record<string, string> = {
    SUPABASE_URL: BASE_URL,
    SUPABASE_ANON_KEY: "mock-anon-key-for-testing",
    SUPABASE_SERVICE_ROLE_KEY: "mock-sr-key-for-testing",
    SUPABASE_PUBLISHABLE_KEY: "mock-anon-key-for-testing",
    UPSTASH_REDIS_REST_URL: `${BASE_URL}/upstash`,
    UPSTASH_REDIS_REST_TOKEN: "mock-upstash-token",
    TEST_USER_JWT: `mock-jwt-${label}`,
    PARALLEL: "10", // reduce parallel count for speed in mock
  };

  const runProc = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", file],
    env: { ...env },
    stdout: "piped",
    stderr: "piped",
  }).spawn();

  const [runStatus, runOutput] = await Promise.all([
    runProc.status,
    runProc.output(),
  ]);

  const stdoutText = new TextDecoder().decode(runOutput.stdout);
  const stderrText = new TextDecoder().decode(runOutput.stderr);

  // Write evidence log (combine stdout + stderr)
  const logContent = [
    `# ${label} — ${file}`,
    `# TIMESTAMP: ${new Date().toISOString()}`,
    `# EXIT CODE: ${runStatus.code}`,
    `# ENV: MOCK_MODE=true SUPABASE_URL=${BASE_URL}`,
    `#`.repeat(60),
    stdoutText,
    stderrText ? `\n--- STDERR ---\n${stderrText}` : "",
  ].join("\n");
  await Deno.writeTextFile(out, logContent);

  const ok = runStatus.success;
  if (ok) passed++; else failed++;
  results.push({ id: label, status: ok ? "PASS" : "FAIL", exitCode: runStatus.code });

  console.log(stdoutText);
  if (stderrText) console.error(`[stderr]\n${stderrText}`);
  console.log(`[runner] <<< ${label}: exit=${runStatus.code} ${ok ? "✅ PASS" : "❌ FAIL"}`);
  console.log();
}

// ─── Cleanup mock server ────────────────────────────────────────────────────
console.log("[runner] shutting down mock server...");
try { mockProc.kill("SIGTERM"); } catch { /* already terminated */ }
await mockProc.status.catch(() => {});

// ─── Summary ────────────────────────────────────────────────────────────────
console.log("=".repeat(70));
console.log("SUMMARY");
console.log("=".repeat(70));
for (const r of results) {
  const icon = r.status === "PASS" ? "✅" : "❌";
  console.log(`  ${icon} ${r.id}: ${r.status} (exit ${r.exitCode})`);
}
console.log();
console.log(`  PASSED: ${passed}/${results.length}`);
console.log(`  FAILED: ${failed}/${results.length}`);

// Generate summary.md
const summaryMd = `# Hard Technical Audit — Summary

**Date:** ${new Date().toISOString()}
**Mode:** Mock (sandbox) — all external services simulated

| Test ID | Objective | Status | Exit Code | Key Metric |
|---------|-----------|--------|-----------|------------|
${results.map((r) => `| ${r.id} | ${getDescription(r.id)} | ${r.status} | ${r.exitCode} | ${getMetric(r.id)} |`).join("\n")}

## Evidence Files
${results.map((r) => `- \`${SCRIPTS.find((s) => s.label === r.id)!.out}\``).join("\n")}

## Verdict
**${failed === 0 ? "✅ ALL TESTS PASSED" : "❌ SOME TESTS FAILED"}**
`;

await Deno.writeTextFile(`${EVIDENCE_DIR}/summary.md`, summaryMd);
console.log(`\n[runner] summary written to ${EVIDENCE_DIR}/summary.md`);

Deno.exit(failed > 0 ? 1 : 0);

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDescription(id: string): string {
  switch (id) {
    case "CRSH-001": return "Redis connection-leak probe — 0 leaked connections after burst";
    case "CRSH-002": return "Concurrency bombardment — 0 deadlocks, p95 < 800ms, 0 orphan opens";
    case "CRSH-003": return "Exploit & idempotency — stale-time 409, body-injection 400, idempotency dedup";
    default: return "";
  }
}

function getMetric(id: string): string {
  switch (id) {
    case "CRSH-001": return "DBSIZE drift ≤ 2";
    case "CRSH-002": return "p95 / deadlocks / orphan opens";
    case "CRSH-003": return "Pass rate across A/B/C scenarios";
    default: return "";
  }
}
