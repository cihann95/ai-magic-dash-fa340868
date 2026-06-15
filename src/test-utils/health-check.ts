/**
 * Mock Server Health Check
 *
 * Verifies that the mock server (scripts/audit/_mock_server.ts) is running
 * and responsive. Used by:
 * - `src/test-utils/setup.ts` (global test setup)
 * - `scripts/test-utils/health-check.mjs` (standalone CLI)
 * - Integration tests that need a live mock server
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface HealthCheckOptions {
  /** Maximum time to wait in ms (default: 5000) */
  timeout?: number;
  /** Time between retries in ms (default: 200) */
  interval?: number;
  /** Expected status code (default: 404 — mock server returns 404 for unknown paths) */
  expectedStatus?: number;
}

/**
 * Wait for the mock server to become responsive.
 *
 * Polls the server root until it returns the expected status code.
 * Resolves when the server responds; rejects on timeout.
 *
 * @param baseUrl - The mock server base URL (e.g. `http://127.0.0.1:3547`)
 * @param opts - Health check options
 * @returns Promise that resolves when server is ready
 *
 * @example
 * ```ts
 * await waitForServer("http://127.0.0.1:3547", { timeout: 10_000 });
 * console.log("Server is ready!");
 * ```
 */
export async function waitForServer(
  baseUrl: string,
  opts: HealthCheckOptions = {},
): Promise<void> {
  const {
    timeout = 5_000,
    interval = 200,
    expectedStatus = 404,
  } = opts;

  const deadline = Date.now() + timeout;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    try {
      const resp = await fetch(baseUrl, {
        method: "GET",
        signal: AbortSignal.timeout(Math.min(interval, 1_000)),
      });
      if (resp.status === expectedStatus) {
        return; // Server is responsive
      }
      lastError = new Error(`Unexpected status: ${resp.status}`);
    } catch (err) {
      lastError = err as Error;
    }
    await sleep(interval);
  }

  throw new Error(
    `Mock server not responsive after ${timeout}ms at ${baseUrl}: ${lastError?.message}`,
  );
}

/**
 * Quick health check — returns true if server responds, false otherwise.
 * Non-throwing alternative to `waitForServer`.
 *
 * @param baseUrl - The mock server base URL
 * @param opts - Health check options (timeout defaults to 2000ms)
 */
export async function isServerHealthy(
  baseUrl: string,
  opts: HealthCheckOptions = {},
): Promise<boolean> {
  try {
    await waitForServer(baseUrl, { ...opts, timeout: opts.timeout ?? 2_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ping a specific mock server endpoint and return the response.
 * Useful for verifying specific mock endpoints are working.
 *
 * @param baseUrl - The mock server base URL
 * @param path - The endpoint path (e.g. `/auth/v1/admin/users`)
 * @param init - Optional fetch init (method, headers, body)
 */
export async function pingEndpoint(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const resp = await fetch(`${baseUrl}${path}`, init);
    const body = await resp.json().catch(() => null);
    return { ok: resp.ok, status: resp.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: { error: (err as Error).message } };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── CLI Mode ───────────────────────────────────────────────────────────────
// Run: node src/test-utils/health-check.ts http://127.0.0.1:3547

const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1]?.includes("health-check");

if (isMainModule) {
  const url = process.argv[2] || process.env.MOCK_SERVER_URL || "http://127.0.0.1:3547";
  console.log(`[health-check] Probing ${url}...`);

  try {
    await waitForServer(url, { timeout: 5_000 });
    console.log(`[health-check] OK — server is responsive at ${url}`);
    process.exit(0);
  } catch (err) {
    console.error(`[health-check] FAIL — ${(err as Error).message}`);
    process.exit(1);
  }
}
