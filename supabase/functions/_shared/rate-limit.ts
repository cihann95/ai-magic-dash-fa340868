import { redis, redisEnabled } from "./redis.ts";

const ONE_MINUTE_MS = 60 * 1000;

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  "execute-trade": { windowMs: ONE_MINUTE_MS, maxRequests: 20, keyPrefix: "rl:exec" },
  "blitz-tick-order": { windowMs: ONE_MINUTE_MS, maxRequests: 30, keyPrefix: "rl:blitz-tick" },
  "blitz-matchmake": { windowMs: ONE_MINUTE_MS, maxRequests: 10, keyPrefix: "rl:blitz-match" },
  "ai-analyze": { windowMs: ONE_MINUTE_MS, maxRequests: 15, keyPrefix: "rl:ai" },
  "ai-strategy": { windowMs: ONE_MINUTE_MS, maxRequests: 15, keyPrefix: "rl:ai" },
  "ai-chat": { windowMs: ONE_MINUTE_MS, maxRequests: 15, keyPrefix: "rl:ai" },
  "ai-trade-coach": { windowMs: ONE_MINUTE_MS, maxRequests: 15, keyPrefix: "rl:ai" },
  "ai-risk-monitor": { windowMs: ONE_MINUTE_MS, maxRequests: 15, keyPrefix: "rl:ai" },
};

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: ONE_MINUTE_MS,
  maxRequests: 30,
  keyPrefix: "rl:default",
};

export async function checkRateLimit(
  userId: string,
  route: string,
): Promise<RateLimitResult> {
  if (!redisEnabled) {
    const config = RATE_LIMITS[route] ?? DEFAULT_CONFIG;
    return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs, limit: config.maxRequests };
  }

  const config = RATE_LIMITS[route] ?? DEFAULT_CONFIG;
  const key = `${config.keyPrefix}:${userId}:${route}`;
  const now = Date.now();
  const windowStart = now - config.windowMs;

  try {
    await redis.zremrangebyscore(key, 0, windowStart);
    const count = await redis.zcard(key);

    if (count >= config.maxRequests) {
      const oldest = await redis.zrange(key, 0, 0, { withScores: true });
      const oldestScore = oldest.length > 0 ? oldest[0].score : now;
      const resetAt = oldestScore + config.windowMs;
      return { allowed: false, remaining: 0, resetAt, limit: config.maxRequests };
    }

    const member = `${now}:${Math.random().toString(36).slice(2, 9)}`;
    await redis.zadd(key, now, member);
    await redis.expire(key, Math.ceil(config.windowMs / 1000) + 10);

    return { allowed: true, remaining: config.maxRequests - count - 1, resetAt: now + config.windowMs, limit: config.maxRequests };
  } catch (error) {
    console.error("Rate limit check failed (fail-open):", (error as Error).message);
    return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs, limit: config.maxRequests };
  }
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function createRateLimitResponse(result: RateLimitResult): Response {
  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded",
      retry_after: retryAfterSeconds,
      limit: result.limit,
      remaining: result.remaining,
    }),
    {
      status: 429,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
        "Retry-After": String(retryAfterSeconds),
      },
    },
  );
}

export function addRateLimitHeaders(response: Response, result: RateLimitResult): Response {
  const newHeaders = new Headers(response.headers);
  newHeaders.set("X-RateLimit-Limit", String(result.limit));
  newHeaders.set("X-RateLimit-Remaining", String(result.remaining));
  newHeaders.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: newHeaders });
}

export async function rateLimit(userId: string, route: string): Promise<Response | null> {
  const result = await checkRateLimit(userId, route);
  if (!result.allowed) return createRateLimitResponse(result);
  return null;
}
