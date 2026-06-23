import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockZadd, mockZcard, mockZremrangebyscore, mockZrange, mockExpire } = vi.hoisted(() => ({
  mockZadd: vi.fn().mockResolvedValue(1),
  mockZcard: vi.fn().mockResolvedValue(0),
  mockZremrangebyscore: vi.fn().mockResolvedValue(0),
  mockZrange: vi.fn().mockResolvedValue([]),
  mockExpire: vi.fn().mockResolvedValue(1),
}));

vi.mock("../_shared/redis.ts", () => ({
  redisEnabled: true,
  redis: {
    zadd: mockZadd,
    zcard: mockZcard,
    zremrangebyscore: mockZremrangebyscore,
    zrange: mockZrange,
    expire: mockExpire,
  },
}));

import { checkRateLimit, RATE_LIMITS, createRateLimitResponse, rateLimit } from "../_shared/rate-limit.ts";

describe("rate-limit", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should allow request when under limit", async () => {
    mockZcard.mockResolvedValueOnce(0);
    const result = await checkRateLimit("user-1", "execute-trade");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(9);
    expect(result.limit).toBe(10);
    expect(mockZadd).toHaveBeenCalled();
    expect(mockExpire).toHaveBeenCalled();
  });

  it("should block request when at limit", async () => {
    mockZcard.mockResolvedValueOnce(20);
    mockZrange.mockResolvedValueOnce([{ score: 1_700_000_000_000, member: "test" }]);
    const result = await checkRateLimit("user-1", "execute-trade");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.limit).toBe(10);
    expect(mockZadd).not.toHaveBeenCalled();
  });

  it("should return correct limits for execute-trade", async () => {
    expect(RATE_LIMITS["execute-trade"].maxRequests).toBe(10);
    expect(RATE_LIMITS["execute-trade"].windowMs).toBe(60_000);
  });

  it("should return correct limits for blitz-matchmake", async () => {
    expect(RATE_LIMITS["blitz-matchmake"].maxRequests).toBe(5);
  });

  it("should return correct limits for ai-analyze", async () => {
    expect(RATE_LIMITS["ai-analyze"].maxRequests).toBe(10);
  });

  it("should create 429 response with correct format", () => {
    const result = { allowed: false, remaining: 0, resetAt: Date.now() + 42_000, limit: 20 };
    const response = createRateLimitResponse(result);
    expect(response.status).toBe(429);
    const headers = response.headers;
    expect(headers.get("X-RateLimit-Limit")).toBe("20");
    expect(headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(headers.get("Retry-After")).toBeDefined();
  });

  it("should return 429 via rateLimit() middleware when blocked", async () => {
    mockZcard.mockResolvedValueOnce(20);
    mockZrange.mockResolvedValueOnce([{ score: 1_700_000_000_000, member: "test" }]);
    const response = await rateLimit("user-1", "execute-trade");
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
    const body = await response!.json();
    expect(body.error).toBe("Rate limit exceeded");
    expect(body.retry_after).toBeGreaterThanOrEqual(1);
    expect(body.limit).toBe(10);
  });

  it("should return null via rateLimit() middleware when allowed", async () => {
    mockZcard.mockResolvedValueOnce(0);
    const response = await rateLimit("user-1", "execute-trade");
    expect(response).toBeNull();
  });

  it("should clean old entries from sorted set", async () => {
    mockZcard.mockResolvedValueOnce(5);
    await checkRateLimit("user-1", "execute-trade");
    expect(mockZremrangebyscore).toHaveBeenCalledWith(
      "rl:exec:user-1:execute-trade",
      0,
      expect.any(Number),
    );
  });
});

describe("rate-limit fail-open", () => {
  it("should allow request when Redis is disabled", async () => {
    vi.resetModules();
    vi.doMock("../_shared/redis.ts", () => ({
      redisEnabled: false,
      redis: {},
    }));
    const { checkRateLimit: checkDisabled } = await import("../_shared/rate-limit.ts");
    const result = await checkDisabled("user-1", "execute-trade");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(10);
  });
});
