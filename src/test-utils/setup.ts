/**
 * Vitest Global Setup — Mock Server Lifecycle
 *
 * Starts the Deno mock server before all tests and tears it down after.
 * Wire into vitest.config.ts via:
 *
 *   test: { globalSetup: ["./src/test-utils/setup.ts"] }
 *
 * The mock server URL is written to `process.env.MOCK_SERVER_URL` so tests
 * and edge function integrations can reference it at runtime.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { spawn, type ChildProcess } from "node:child_process";
import { waitForServer } from "./health-check";

// ─── State ──────────────────────────────────────────────────────────────────

let serverProcess: ChildProcess | null = null;
const MOCK_PORT = 3599;
const MOCK_HOST = "127.0.0.1";
const MOCK_URL = `http://${MOCK_HOST}:${MOCK_PORT}`;

// ─── Global Setup (runs once before all test files) ─────────────────────────

export async function setup() {
  // Skip if mock server already running (e.g. CI starts it externally)
  if (process.env.MOCK_SERVER_URL) {
    console.log(
      `[test-utils] MOCK_SERVER_URL already set (${process.env.MOCK_SERVER_URL}), skipping start`,
    );
    return;
  }

  console.log(`[test-utils] Starting mock server on ${MOCK_URL}...`);

  serverProcess = spawn("deno", ["run", "-A", "scripts/audit/_mock_server.ts", String(MOCK_PORT)], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, DENO_NO_PROMPT: "1" },
  });

  // Capture stdout to detect PORT= line
  serverProcess.stdout?.on("data", (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (line.startsWith("PORT=")) {
      const port = line.split("=")[1];
      process.env.MOCK_SERVER_URL = `http://${MOCK_HOST}:${port}`;
      console.log(`[test-utils] Mock server ready on port ${port}`);
    }
  });

  serverProcess.stderr?.on("data", (_chunk: Buffer) => {
    // Silently ignore stderr — mock server logs to stderr
  });

  serverProcess.on("error", (err) => {
    console.error(`[test-utils] Failed to start mock server: ${err.message}`);
  });

  serverProcess.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`[test-utils] Mock server exited with code ${code}`);
    }
    serverProcess = null;
  });

  // Wait for the server to be responsive
  const url = process.env.MOCK_SERVER_URL || MOCK_URL;
  try {
    await waitForServer(url, { timeout: 10_000, interval: 100 });
    console.log(`[test-utils] Mock server confirmed responsive at ${url}`);
  } catch (err) {
    console.error(`[test-utils] Mock server failed to become responsive: ${(err as Error).message}`);
    // Kill the process if health check fails
    serverProcess?.kill("SIGTERM");
    throw err;
  }
}

// ─── Global Teardown (runs once after all test files) ───────────────────────

export async function teardown() {
  if (!serverProcess) {
    console.log("[test-utils] No mock server process to stop");
    return;
  }

  console.log("[test-utils] Stopping mock server...");

  return new Promise<void>((resolve) => {
    serverProcess!.once("exit", () => {
      console.log("[test-utils] Mock server stopped");
      serverProcess = null;
      delete process.env.MOCK_SERVER_URL;
      resolve();
    });

    serverProcess!.kill("SIGTERM");

    // Force kill after 3 seconds
    setTimeout(() => {
      if (serverProcess) {
        console.warn("[test-utils] Force-killing mock server");
        serverProcess.kill("SIGKILL");
        serverProcess = null;
        delete process.env.MOCK_SERVER_URL;
        resolve();
      }
    }, 3_000);
  });
}
