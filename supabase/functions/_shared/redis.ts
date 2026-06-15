// Upstash Redis adapter — thin wrapper over the official @upstash/redis
// HTTP client. REST-based → no persistent TCP sockets → zero connection
// leaks across Deno cold starts. Public API preserved so existing call
// sites do not change.
import { Redis } from "https://esm.sh/@upstash/redis@1.34.3";

const URL = Deno.env.get("UPSTASH_REDIS_REST_URL");
const TOKEN = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

export const redisEnabled = !!(URL && TOKEN);

const client: Redis | null = redisEnabled
  ? new Redis({ url: URL!, token: TOKEN!, automaticDeserialization: false })
  : null;

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  if (!client) return fallback;
  try {
    return await fn();
  } catch (e) {
    console.error("redis error", (e as Error).message);
    return fallback;
  }
}

export const redis = {
  set: (k: string, v: string | number, ttl?: number) =>
    safe(
      () => ttl ? client!.set(k, String(v), { ex: ttl }) : client!.set(k, String(v)),
      null,
    ),
  // SETNX with TTL — returns true if key was set (i.e. not previously present).
  setNxEx: async (k: string, v: string, ttl: number): Promise<boolean> => {
    if (!client) return true; // fail-open when redis disabled
    try {
      const res = await client.set(k, v, { ex: ttl, nx: true });
      return res === "OK";
    } catch (e) {
      console.error("redis setNxEx error", (e as Error).message);
      return true;
    }
  },
  get: (k: string) => safe(() => client!.get<string>(k), null as string | null),
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
  hgetall: async (k: string): Promise<Record<string, string>> => {
    if (!client) return {};
    try {
      const res = await client.hgetall<Record<string, string>>(k);
      return res ?? {};
    } catch {
      return {};
    }
  },
  hdel: (k: string, ...fields: string[]) =>
    safe(() => client!.hdel(k, ...fields), 0),
  sadd: (k: string, ...members: string[]) =>
    safe(() => client!.sadd(k, ...members), 0),
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
    safe(() => client!.lrange(k, start, stop) as Promise<string[]>, [] as string[]),
  expire: (k: string, seconds: number) =>
    safe(() => client!.expire(k, seconds), 0),
  // Sorted set operations (for rate limiting, leaderboards, etc.)
  zadd: (k: string, score: number, member: string) =>
    safe(() => client!.zadd(k, { score, member }), 0),
  zremrangebyscore: (k: string, min: number, max: number) =>
    safe(() => client!.zremrangebyscore(k, min, max), 0),
  zcard: (k: string) =>
    safe(() => client!.zcard(k), 0),
  zrange: (k: string, start: number, stop: number, opts?: { withScores?: boolean }) =>
    safe(
      () => opts?.withScores
        ? client!.zrangeWithScores(k, start, stop) as Promise<Array<{ score: number; member: string }>>
        : client!.zrange(k, start, stop) as Promise<string[]>,
      opts?.withScores ? [] as Array<{ score: number; member: string }> : [] as string[],
    ),
};
