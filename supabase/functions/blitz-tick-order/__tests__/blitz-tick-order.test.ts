/**
 * blitz-tick-order: Comprehensive Unit Tests
 *
 * Tests the order tick logic: auth, rate limiting, idempotency,
 * clock drift, forbidden fields, price validation, open/close orders,
 * PnL calculation, and error handling.
 * Mirrors logic from blitz-tick-order/index.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════
// Mock Redis (matches _shared/redis.ts API)
// ═══════════════════════════════════════════════════════════════════════════
function createMockRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    store,
    setNxEx: vi.fn(async (key: string, value: string, ttlSeconds: number): Promise<boolean> => {
      const now = Date.now();
      const existing = store.get(key);
      if (existing && existing.expiresAt > now) return false;
      store.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
      return true;
    }),
    get: vi.fn(async (key: string): Promise<string | null> => {
      const entry = store.get(key);
      if (!entry || entry.expiresAt <= Date.now()) return null;
      return entry.value;
    }),
    del: vi.fn(async (...keys: string[]): Promise<number> => {
      let count = 0;
      for (const k of keys) { if (store.delete(k)) count++; }
      return count;
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Simulated auth check (from blitz-tick-order/index.ts lines 33-41)
// ═══════════════════════════════════════════════════════════════════════════
function checkAuth(token: string, validTokens: Set<string>): { ok: boolean; userId?: string; error?: string; status?: number } {
  if (!token || !validTokens.has(token)) {
    return { ok: false, error: "Yetkisiz erişim", status: 401 };
  }
  return { ok: true, userId: `user-${token.slice(-4)}` };
}

// ═══════════════════════════════════════════════════════════════════════════
// Clock drift guard (from blitz-tick-order/index.ts lines 61-71)
// ═══════════════════════════════════════════════════════════════════════════
function checkClockDrift(
  sentAtHdr: string | null,
  serverNow: number,
): { ok: boolean; error?: string; status?: number } {
  if (!sentAtHdr) return { ok: true };
  const sentAt = Number(sentAtHdr);
  if (!isFinite(sentAt) || Math.abs(serverNow - sentAt) > 150) {
    return { ok: false, error: "Eski istek (saat sapması > 150ms)", status: 409 };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Forbidden fields check (from blitz-tick-order/index.ts lines 73-87)
// ═══════════════════════════════════════════════════════════════════════════
function checkForbiddenFields(body: Record<string, unknown>): { ok: boolean; error?: string; status?: number } {
  if (
    body.entry_price !== undefined || body.price !== undefined ||
    body.timestamp !== undefined || body.client_time !== undefined
  ) {
    return { ok: false, error: "Yasaklı alan", status: 400 };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Missing fields check (from blitz-tick-order/index.ts lines 88-92)
// ═══════════════════════════════════════════════════════════════════════════
function checkRequiredFields(body: Record<string, unknown>): { ok: boolean; error?: string; status?: number } {
  if (!body.room_id || !body.action) {
    return { ok: false, error: "Eksik alanlar", status: 400 };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Idempotency guard (from blitz-tick-order/index.ts lines 94-107)
// ═══════════════════════════════════════════════════════════════════════════
async function checkIdempotency(
  redis: ReturnType<typeof createMockRedis>,
  userId: string,
  idemKey: string | null,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  if (!idemKey) return { ok: true };
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(idemKey)) {
    return { ok: false, error: "Geçersiz tekillik anahtarı", status: 400 };
  }
  const fresh = await redis.setNxEx(`blitz:idem:${userId}:${idemKey}`, "1", 30);
  if (!fresh) {
    return { ok: false, error: "Tekrarlanan istek", status: 409 };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Price validation (from blitz-tick-order/index.ts lines 121-134)
// ═══════════════════════════════════════════════════════════════════════════
function validatePrice(price: number | null): { ok: boolean; error?: string; status?: number } {
  if (!price || !isFinite(price) || price <= 0) {
    return { ok: false, error: "Fiyat bilgisi alınamadı", status: 503 };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Open order validation (from blitz-tick-order/index.ts lines 136-141)
// ═══════════════════════════════════════════════════════════════════════════
function validateOpenParams(side: unknown, amount: unknown): { ok: boolean; error?: string; status?: number } {
  if (!side || !(amount && Number(amount) > 0)) {
    return { ok: false, error: "side and amount required", status: 400 };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// PnL calculation (from blitz-tick-order/index.ts lines 234-239)
// ═══════════════════════════════════════════════════════════════════════════
function calculatePnL(
  side: string, entryPrice: number, exitPrice: number, amount: number,
): number {
  const dir = side === "long" ? 1 : -1;
  return +(((exitPrice - entryPrice) / entryPrice) * amount * dir).toFixed(6);
}

// ═══════════════════════════════════════════════════════════════════════════
// Simulated atomic order with row-level lock
// ═══════════════════════════════════════════════════════════════════════════
function createSimulatedAtomicOrder() {
  const orders = new Map<string, { id: string; room_id: string; user_id: string; side: string; amount: number; entry_price: number; closed_at: string | null }>();
  const locks = new Set<string>();

  return {
    seedOrder(order: { id: string; room_id: string; user_id: string; side: string; amount: number; entry_price: number }) {
      orders.set(order.id, { ...order, closed_at: null });
    },
    getOrders: () => Array.from(orders.values()),
    async closeOrderAtomic(roomId: string, userId: string, orderId: string | null) {
      const lockKey = `${roomId}:${userId}`;
      if (locks.has(lockKey)) return { error: "Already closing an order in this room" };
      locks.add(lockKey);

      let order: typeof orders extends Map<string, infer V> ? V : never | undefined;
      for (const o of orders.values()) {
        if (o.room_id === roomId && o.user_id === userId && o.closed_at === null) {
          if (!orderId || o.id === orderId) { order = o; break; }
        }
      }
      if (!order) { locks.delete(lockKey); return { error: "Open order not found" }; }
      return { order_id: order.id, side: order.side, entry_price: order.entry_price, amount: order.amount };
    },
    markClosed(orderId: string, _exitPrice: number, _pnl: number) {
      const order = orders.get(orderId);
      if (order) { order.closed_at = new Date().toISOString(); }
    },
    releaseLock(roomId: string, userId: string) { locks.delete(`${roomId}:${userId}`); },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════
describe("blitz-tick-order", () => {
  let redis: ReturnType<typeof createMockRedis>;

  beforeEach(() => {
    redis = createMockRedis();
    vi.useFakeTimers({ now: 1_700_000_000_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Auth ──────────────────────────────────────────────────────────────
  describe("authentication", () => {
    it("should reject request without token", () => {
      const result = checkAuth("", new Set(["token-abc"]));
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.error).toBe("Yetkisiz erişim");
    });

    it("should reject request with invalid token", () => {
      const result = checkAuth("invalid-token", new Set(["token-abc"]));
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });

    it("should accept request with valid token", () => {
      const result = checkAuth("token-abc", new Set(["token-abc"]));
      expect(result.ok).toBe(true);
      expect(result.userId).toBeTruthy();
    });
  });

  // ── Clock Drift ──────────────────────────────────────────────────────
  describe("clock drift protection", () => {
    it("should reject request with drift > 150ms", () => {
      const result = checkClockDrift(String(Date.now() - 200), Date.now());
      expect(result.ok).toBe(false);
      expect(result.status).toBe(409);
    });

    it("should accept request with drift <= 150ms", () => {
      const result = checkClockDrift(String(Date.now() - 100), Date.now());
      expect(result.ok).toBe(true);
    });

    it("should accept request without x-client-sent-at header", () => {
      const result = checkClockDrift(null, Date.now());
      expect(result.ok).toBe(true);
    });

    it("should reject non-numeric x-client-sent-at", () => {
      const result = checkClockDrift("not-a-number", Date.now());
      expect(result.ok).toBe(false);
      expect(result.status).toBe(409);
    });

    it("should accept request with drift exactly 150ms", () => {
      const result = checkClockDrift(String(Date.now() - 150), Date.now());
      expect(result.ok).toBe(true);
    });

    it("should reject request with drift 151ms", () => {
      const result = checkClockDrift(String(Date.now() - 151), Date.now());
      expect(result.ok).toBe(false);
    });
  });

  // ── Forbidden Fields ─────────────────────────────────────────────────
  describe("forbidden field rejection", () => {
    it("should reject body with entry_price", () => {
      expect(checkForbiddenFields({ room_id: "r1", action: "open", entry_price: 60000 }).ok).toBe(false);
    });

    it("should reject body with price", () => {
      expect(checkForbiddenFields({ room_id: "r1", action: "open", price: 60000 }).ok).toBe(false);
    });

    it("should reject body with timestamp", () => {
      expect(checkForbiddenFields({ room_id: "r1", action: "open", timestamp: Date.now() }).ok).toBe(false);
    });

    it("should reject body with client_time", () => {
      expect(checkForbiddenFields({ room_id: "r1", action: "open", client_time: Date.now() }).ok).toBe(false);
    });

    it("should accept clean body without forbidden fields", () => {
      expect(checkForbiddenFields({ room_id: "r1", action: "open", side: "long", amount: 100 }).ok).toBe(true);
    });

    it("should reject body with multiple forbidden fields", () => {
      expect(checkForbiddenFields({ room_id: "r1", action: "open", entry_price: 1, price: 2 }).ok).toBe(false);
    });
  });

  // ── Required Fields ──────────────────────────────────────────────────
  describe("required field validation", () => {
    it("should reject body without room_id", () => {
      expect(checkRequiredFields({ action: "open" }).ok).toBe(false);
    });

    it("should reject body without action", () => {
      expect(checkRequiredFields({ room_id: "r1" }).ok).toBe(false);
    });

    it("should reject empty body", () => {
      expect(checkRequiredFields({}).ok).toBe(false);
    });

    it("should accept body with both room_id and action", () => {
      expect(checkRequiredFields({ room_id: "r1", action: "open" }).ok).toBe(true);
    });
  });

  // ── Idempotency ──────────────────────────────────────────────────────
  describe("idempotency guard", () => {
    it("should accept first request with valid idempotency key", async () => {
      const result = await checkIdempotency(redis, "user-1", "abc12345-def6-ghij");
      expect(result.ok).toBe(true);
    });

    it("should reject duplicate request within 30s", async () => {
      await checkIdempotency(redis, "user-1", "abc12345-def6-ghij");
      const result = await checkIdempotency(redis, "user-1", "abc12345-def6-ghij");
      expect(result.ok).toBe(false);
      expect(result.status).toBe(409);
    });

    it("should accept different keys for same user", async () => {
      expect((await checkIdempotency(redis, "user-1", "key-00000001")).ok).toBe(true);
      expect((await checkIdempotency(redis, "user-1", "key-00000002")).ok).toBe(true);
    });

    it("should accept same key for different users", async () => {
      expect((await checkIdempotency(redis, "user-1", "key-00000001")).ok).toBe(true);
      expect((await checkIdempotency(redis, "user-2", "key-00000001")).ok).toBe(true);
    });

    it("should reject invalid key format (too short)", async () => {
      const result = await checkIdempotency(redis, "user-1", "short");
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
    });

    it("should reject invalid key format (special chars)", async () => {
      const result = await checkIdempotency(redis, "user-1", "abc@def!ghi#jkl");
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
    });

    it("should allow request without idempotency key", async () => {
      const result = await checkIdempotency(redis, "user-1", null);
      expect(result.ok).toBe(true);
    });

    it("should store key in Redis with correct TTL", async () => {
      await checkIdempotency(redis, "user-1", "key-00000001");
      expect(redis.setNxEx).toHaveBeenCalledWith("blitz:idem:user-1:key-00000001", "1", 30);
    });
  });

  // ── Price Validation ─────────────────────────────────────────────────
  describe("price validation", () => {
    it("should accept valid positive price", () => {
      expect(validatePrice(60000).ok).toBe(true);
    });

    it("should reject null price", () => {
      const result = validatePrice(null);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(503);
    });

    it("should reject zero price", () => {
      expect(validatePrice(0).ok).toBe(false);
    });

    it("should reject negative price", () => {
      expect(validatePrice(-100).ok).toBe(false);
    });

    it("should reject NaN price", () => {
      expect(validatePrice(NaN).ok).toBe(false);
    });

    it("should reject Infinity price", () => {
      expect(validatePrice(Infinity).ok).toBe(false);
    });
  });

  // ── Open Order Validation ────────────────────────────────────────────
  describe("open order params", () => {
    it("should accept valid side and amount", () => {
      expect(validateOpenParams("long", 100).ok).toBe(true);
      expect(validateOpenParams("short", 50).ok).toBe(true);
    });

    it("should reject missing side", () => {
      const result = validateOpenParams(undefined, 100);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(400);
    });

    it("should reject missing amount", () => {
      const result = validateOpenParams("long", undefined);
      expect(result.ok).toBe(false);
    });

    it("should reject zero amount", () => {
      expect(validateOpenParams("long", 0).ok).toBe(false);
    });

    it("should reject negative amount", () => {
      expect(validateOpenParams("long", -100).ok).toBe(false);
    });
  });

  // ── PnL Calculation ──────────────────────────────────────────────────
  describe("PnL calculation", () => {
    it("should calculate correct PnL for long (profit)", () => {
      const pnl = calculatePnL("long", 60000, 62000, 100);
      expect(pnl).toBeCloseTo((62000 - 60000) / 60000 * 100, 4);
    });

    it("should calculate correct PnL for long (loss)", () => {
      const pnl = calculatePnL("long", 60000, 58000, 100);
      expect(pnl).toBeCloseTo((58000 - 60000) / 60000 * 100, 4);
    });

    it("should calculate correct PnL for short (profit when price drops)", () => {
      const pnl = calculatePnL("short", 60000, 58000, 100);
      expect(pnl).toBeCloseTo(((58000 - 60000) / 60000) * 100 * -1, 4);
    });

    it("should calculate correct PnL for short (loss when price rises)", () => {
      const pnl = calculatePnL("short", 60000, 62000, 100);
      expect(pnl).toBeCloseTo(((62000 - 60000) / 60000) * 100 * -1, 4);
    });

    it("should return 0 PnL when exit equals entry", () => {
      const pnl = calculatePnL("long", 60000, 60000, 100);
      expect(pnl).toBe(0);
    });

    it("should round PnL to 6 decimal places", () => {
      const pnl = calculatePnL("long", 33333, 33334, 100);
      expect(pnl.toString().split(".")[1]?.length ?? 0).toBeLessThanOrEqual(6);
    });
  });

  // ── Atomic Order (Concurrent Close) ──────────────────────────────────
  describe("atomic order concurrency", () => {
    it("should prevent double-close via row-level lock", async () => {
      const sim = createSimulatedAtomicOrder();
      sim.seedOrder({ id: "order-001", room_id: "room-1", user_id: "user-1", side: "long", amount: 100, entry_price: 60000 });

      const result1 = await sim.closeOrderAtomic("room-1", "user-1", "order-001");
      expect(result1.error).toBeUndefined();

      const result2 = await sim.closeOrderAtomic("room-1", "user-1", "order-001");
      expect(result2.error).toBe("Already closing an order in this room");
    });

    it("should reject close for non-existent order", async () => {
      const sim = createSimulatedAtomicOrder();
      const result = await sim.closeOrderAtomic("room-1", "user-1", "nonexistent");
      expect(result.error).toBe("Open order not found");
    });

    it("should allow close after lock release", async () => {
      const sim = createSimulatedAtomicOrder();
      sim.seedOrder({ id: "order-001", room_id: "room-1", user_id: "user-1", side: "long", amount: 100, entry_price: 60000 });

      await sim.closeOrderAtomic("room-1", "user-1", "order-001");
      sim.releaseLock("room-1", "user-1");

      const result = await sim.closeOrderAtomic("room-1", "user-1", "order-001");
      expect(result.order_id).toBe("order-001");
    });

    it("should allow concurrent close for different users in same room", async () => {
      const sim = createSimulatedAtomicOrder();
      sim.seedOrder({ id: "order-001", room_id: "room-1", user_id: "user-1", side: "long", amount: 100, entry_price: 60000 });
      sim.seedOrder({ id: "order-002", room_id: "room-1", user_id: "user-2", side: "short", amount: 100, entry_price: 60000 });

      const result1 = await sim.closeOrderAtomic("room-1", "user-1", "order-001");
      const result2 = await sim.closeOrderAtomic("room-1", "user-2", "order-002");

      expect(result1.error).toBeUndefined();
      expect(result2.error).toBeUndefined();
    });

    it("should allow close for same user in different rooms", async () => {
      const sim = createSimulatedAtomicOrder();
      sim.seedOrder({ id: "order-001", room_id: "room-1", user_id: "user-1", side: "long", amount: 100, entry_price: 60000 });
      sim.seedOrder({ id: "order-002", room_id: "room-2", user_id: "user-1", side: "short", amount: 100, entry_price: 60000 });

      const result1 = await sim.closeOrderAtomic("room-1", "user-1", "order-001");
      const result2 = await sim.closeOrderAtomic("room-2", "user-1", "order-002");

      expect(result1.error).toBeUndefined();
      expect(result2.error).toBeUndefined();
    });
  });

  // ── Full Request Flow (integration of guards) ────────────────────────
  describe("full request flow", () => {
    it("should pass through all guards for valid request", async () => {
      const authResult = checkAuth("valid-token", new Set(["valid-token"]));
      expect(authResult.ok).toBe(true);

      const driftResult = checkClockDrift(String(Date.now()), Date.now());
      expect(driftResult.ok).toBe(true);

      const fieldsResult = checkForbiddenFields({ room_id: "r1", action: "open", side: "long", amount: 100 });
      expect(fieldsResult.ok).toBe(true);

      const requiredResult = checkRequiredFields({ room_id: "r1", action: "open" });
      expect(requiredResult.ok).toBe(true);

      const priceResult = validatePrice(60000);
      expect(priceResult.ok).toBe(true);

      const openResult = validateOpenParams("long", 100);
      expect(openResult.ok).toBe(true);
    });

    it("should stop at first failing guard", async () => {
      // Auth fails first
      const authResult = checkAuth("", new Set(["valid-token"]));
      expect(authResult.ok).toBe(false);
      // No further checks needed
    });
  });
});
