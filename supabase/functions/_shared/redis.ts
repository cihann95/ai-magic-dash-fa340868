// Upstash Redis adapter — thin wrapper over the official @upstash/redis
// HTTP client. REST-based → no persistent TCP sockets → zero connection
// leaks across Deno cold starts. Public API preserved so existing call
// sites do not change.
//
// == Timeout ==
// All operations carry a hard 3 s deadline via AbortController + Promise.race.
// When the deadline fires the caller receives the configured fallback value
// (fail-open) and the underlying request is abandoned.
//
// == Error classes ==
// RedisConnectionError — Redis unavailable / network failure.
// RedisTimeoutError   — Operation did not complete within 3 s.
// RedisCommandError   — Command reached Redis but was rejected.

import { Redis, errors } from "https://esm.sh/@upstash/redis@1.34.3";

const { UpstashError } = errors;

const URL = Deno.env.get("UPSTASH_REDIS_REST_URL");
const TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

export const redisEnabled = !!(URL && TOKEN);

// ─── Error types ────────────────────────────────────────────────────────────

export class RedisConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedisConnectionError";
  }
}

export class RedisTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedisTimeoutError";
  }
}

export class RedisCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedisCommandError";
  }
}

// ─── Constants ──────────────────────────────────────────────────────────────

const REDIS_TIMEOUT_MS = 3_000;

// ─── Client initialisation ──────────────────────────────────────────────────

const client: Redis | null = redisEnabled
  ? new Redis({ url: URL!, token: TOKEN!, automaticDeserialization: false })
  : null;

// ─── Safe wrapper ───────────────────────────────────────────────────────────
// Every public method drains through `safe()` so that:
//   • A disabled / missing Redis client returns the fallback immediately.
//   • Every operation has a hard 3 s deadline via AbortController.
//   • Errors are categorised and logged as structured JSON.
//   • The fallback value is always returned → fail-open.

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!client) return fallback;
  const controller = new AbortController();
  let timeoutId: number | undefined;
  try {
    timeoutId = setTimeout(() => controller.abort(), REDIS_TIMEOUT_MS);
    return await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener(
          "abort",
          () => {
            reject(
              new RedisTimeoutError(
                `Redis operation timed out after ${REDIS_TIMEOUT_MS}ms`,
              ),
            );
          },
          { once: true },
        );
      }),
    ]);
  } catch (e) {
    if (e instanceof RedisTimeoutError) {
      console.error(
        JSON.stringify({
          event: "redis_timeout",
          duration_ms: REDIS_TIMEOUT_MS,
        }),
      );
    } else if (e instanceof UpstashError) {
      console.error(
        JSON.stringify({ event: "redis_command_error", error: e.message }),
      );
    } else if (
      e instanceof TypeError ||
      (e instanceof Error && e.message?.toLowerCase().includes("fetch"))
    ) {
      console.error(
        JSON.stringify({
          event: "redis_connection_error",
          error: (e as Error).message,
        }),
      );
    } else {
      console.error(
        JSON.stringify({
          event: "redis_error",
          type: "unknown",
          error: (e as Error).message,
        }),
      );
    }
    return fallback;
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Health check ───────────────────────────────────────────────────────────

export async function redisHealthCheck(): Promise<{
  ok: boolean;
  latency: number;
}> {
  if (!client) return { ok: false, latency: -1 };
  const start = performance.now();
  const result = await safe(() => client!.ping(), null);
  return { ok: result !== null, latency: performance.now() - start };
}

// ─── Public API ─────────────────────────────────────────────────────────────
// All operations preserve their existing signatures and fail-open semantics.
// Call-sites do not need to change.

export const redis = {
  set: (k: string, v: string | number, ttl?: number) =>
    safe(
      () =>
        ttl
          ? client!.set(k, String(v), { ex: ttl })
          : client!.set(k, String(v)),
      null,
    ),

  // SETNX with TTL — returns true if key was set (i.e. not previously present).
  setNxEx: (k: string, v: string, ttl: number) =>
    safe(
      () =>
        client!.set(k, v, { ex: ttl, nx: true }).then((res) => res === "OK"),
      true,
    ),

  get: (k: string) =>
    safe(() => client!.get<string>(k), null as string | null),

  del: (...keys: string[]) =>
    safe(() => client!.del(...keys) as Promise<number>, 0),

  hset: (k: string, field: string, v: string | number) =>
    safe(() => client!.hset(k, { [field]: String(v) }), 0),

  hsetAll: (k: string, obj: Record<string, string | number>) => {
    const stringified: Record<string, string> = {};
    for (const [f, v] of Object.entries(obj)) stringified[f] = String(v);
    return safe(() => client!.hset(k, stringified), 0);
  },

  hget: (k: string, field: string) =>
    safe(() => client!.hget<string>(k, field), null as string | null),

  hgetall: (k: string) =>
    safe(
      () =>
        client!.hgetall<Record<string, string>>(k).then((r) => r ?? {}),
      {} as Record<string, string>,
    ),

  hdel: (k: string, ...fields: string[]) =>
    safe(() => client!.hdel(k, ...fields), 0),

  sadd: (k: string, ...members: string[]) =>
    safe(() => client!.sadd(k, members as [string, ...string[]]), 0),

  smembers: (k: string) =>
    safe(() => client!.smembers(k) as Promise<string[]>, [] as string[]),

  srem: (k: string, ...members: string[]) =>
    safe(() => client!.srem(k, ...members), 0),

  rpush: (k: string, ...values: string[]) =>
    safe(() => client!.rpush(k, ...values), 0),

  lpop: (k: string) =>
    safe(() => client!.lpop<string>(k), null as string | null),

  lrem: (k: string, count: number, value: string) =>
    safe(() => client!.lrem(k, count, value), 0),

  lrange: (k: string, start: number, stop: number) =>
    safe(
      () => client!.lrange(k, start, stop) as Promise<string[]>,
      [] as string[],
    ),

  expire: (k: string, seconds: number) =>
    safe(() => client!.expire(k, seconds), 0),

  // Sorted set operations (for rate limiting, leaderboards, etc.)
  zadd: (k: string, score: number, member: string) =>
    safe(() => client!.zadd(k, { score, member }), 0),

  zremrangebyscore: (k: string, min: number, max: number) =>
    safe(() => client!.zremrangebyscore(k, min, max), 0),

  zcard: (k: string) =>
    safe(() => client!.zcard(k), 0),

  zrange: (
    k: string,
    start: number,
    stop: number,
    opts?: { withScores?: boolean },
  ) =>
    safe(
      () =>
        opts?.withScores
          ? client!.zrange(k, start, stop, {
              withScores: true,
            }) as Promise<Array<{ score: number; member: string }>>
          : client!.zrange(k, start, stop) as Promise<string[]>,
      opts?.withScores
        ? ([] as Array<{ score: number; member: string }>)
        : ([] as string[]),
    ),
};
