#!/usr/bin/env -S npx tsx
/**
 * Wait for a local HTTP server to become ready.
 *
 * Usage:  npx tsx scripts/wait-for-server.ts [URL]
 * Default URL: http://localhost:5173
 *
 * Retries GET requests every 2 seconds for up to 60 seconds.
 * Exits 0 when server responds with 2xx/3xx, exits 1 on timeout.
 */

const url = process.argv[2] || "http://localhost:5173";
const TIMEOUT_MS = 60_000;
const INTERVAL_MS = 2_000;

const start = Date.now();

while (Date.now() - start < TIMEOUT_MS) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      console.log(`Server ready at ${url} (status ${res.status})`);
      process.exit(0);
    }
    // non-2xx — still try again
  } catch {
    // connection refused — expected during startup
  }
  await new Promise((r) => setTimeout(r, INTERVAL_MS));
}

console.error(`Timeout after ${TIMEOUT_MS / 1000}s waiting for ${url}`);
process.exit(1);
