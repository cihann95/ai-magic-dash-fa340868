/**
 * Shared Health Check Logic for Edge Functions
 *
 * Returns a standardised JSON health response indicating service status
 * and dependency health (Redis, DB).
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   import { handleHealthCheck } from "../_shared/health.ts";
 *   import { corsHeaders } from "../_shared/cors.ts";
 *
 *   Deno.serve(async (req) => {
 *     const url = new URL(req.url);
 *     if (url.pathname === "/health") {
 *       return handleHealthCheck(req, { checkRedis: true });
 *     }
 *     // ... normal handler ...
 *   });
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Track function start time for uptime calculation
const START_TIME = Date.now();

/** Minimum shape needed for a Redis health ping. */
interface _RedisLike {
  ping(): Promise<string | null>;
}

/** Health check options. */
export interface HealthCheckOptions {
  /** Ping Redis and report connectivity. */
  checkRedis?: boolean;
  /** Custom dependency checks keyed by name. */
  dependencies?: Record<string, () => Promise<boolean>>;
  /** Function name for the health response. */
  functionName?: string;
}

/** Single dependency status entry. */
interface DependencyStatus {
  status: "ok" | "degraded";
  latency_ms?: number;
}

/** Health check response body. */
export interface HealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  uptime_seconds: number;
  function?: string;
  dependencies?: Record<string, DependencyStatus>;
}

/**
 * Handle a health check request.
 *
 * Returns a 200 Response with status info when healthy, or 503 when degraded.
 * Call from the request handler when `req.url` matches `/health`.
 *
 * @example
 *   return await handleHealthCheck(req, { checkRedis: true });
 */
export async function handleHealthCheck(
  req: Request,
  options: HealthCheckOptions = {},
): Promise<Response> {
  const body: HealthResponse = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor((Date.now() - START_TIME) / 1000),
    function: options.functionName,
  };

  const deps: Record<string, DependencyStatus> = {};
  let degraded = false;

  // ── Redis check ──────────────────────────────────────────────────────
  if (options.checkRedis) {
    const start = Date.now();
    try {
      const { redis, redisEnabled } = await import("../_shared/redis.ts");
      if (redisEnabled) {
        const result = await redis.ping();
        deps.redis = {
          status: result === "PONG" || result === "pong" || result !== null ? "ok" : "degraded",
          latency_ms: Date.now() - start,
        };
        if (deps.redis.status !== "ok") degraded = true;
      } else {
        deps.redis = { status: "ok", latency_ms: 0 };
      }
    } catch {
      deps.redis = { status: "degraded" };
      degraded = true;
    }
  }

  // ── Custom dependencies ─────────────────────────────────────────────
  if (options.dependencies) {
    for (const [name, check] of Object.entries(options.dependencies)) {
      const start = Date.now();
      try {
        const ok = await check();
        deps[name] = {
          status: ok ? "ok" : "degraded",
          latency_ms: Date.now() - start,
        };
        if (!ok) degraded = true;
      } catch {
        deps[name] = { status: "degraded" };
        degraded = true;
      }
    }
  }

  if (Object.keys(deps).length > 0) {
    body.dependencies = deps;
  }

  if (degraded) {
    body.status = "degraded";
  }

  const statusCode = degraded ? 503 : 200;

  return new Response(JSON.stringify(body, null, 2), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
