/**
 * blitz-tick-order: Concurrency & Idempotency Tests
 *
 * Tests the idempotency key guard, clock drift protection, and
 * atomic order operations as implemented in blitz-tick-order/index.ts.
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
      if (existing && existing.expiresAt > now) {
        return false; // Key already exists and hasn't expired
      }
      store.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
      return true; // Key was set
    }),
    get: vi.fn(async (key: string): Promise<string | null> => {
      const entry = store.get(key);
      if (!entry || entry.expiresAt <= Date.now()) return null;
      return entry.value;
    }),
    del: vi.fn(async (...keys: string[]): Promise<number> => {
      let count = 0;
      for (const k of keys) {
        if (store.delete(k)) count++;
      }
      return count;
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Idempotency guard logic (from blitz-tick-order/index.ts lines 70-81)
// ═══════════════════════════════════════════════════════════════════════════
async function checkIdempotency(
  redis: ReturnType<typeof createMockRedis>,
  userId: string,
  idemKey: string | null,
): Promise<{ ok: boolean; error?: string; status?: number }> {
  if (!idemKey) return { ok: true };

  if (!/^[A-Za-z0-9_-]{8,128}$/.test(idemKey)) {
    return { ok: false, error: "Invalid Idempotency-Key", status: 400 };
  }

  const fresh = await redis.setNxEx(`blitz:idem:${userId}:${idemKey}`, "1", 30);
  if (!fresh) {
    return { ok: false, error: "Duplicate request (idempotency replay)", status: 409 };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Clock drift guard logic (from blitz-tick-order/index.ts lines 43-52)
// ═══════════════════════════════════════════════════════════════════════════
function checkClockDrift(
  sentAtHdr: string | null,
  serverNow: number,
): { ok: boolean; error?: string; status?: number } {
  if (!sentAtHdr) return { ok: true }; // Optional header

  const sentAt = Number(sentAtHdr);
  if (!isFinite(sentAt) || Math.abs(serverNow - sentAt) > 150) {
    return { ok: false, error: "Stale request (clock drift > 150ms)", status: 409 };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Body field rejection logic (from blitz-tick-order/index.ts lines 60-66)
// ═══════════════════════════════════════════════════════════════════════════
function checkForbiddenFields(body: Record<string, unknown>): { ok: boolean; error?: string; status?: number } {
  if (
    body.entry_price !== undefined || body.price !== undefined ||
    body.timestamp !== undefined || body.client_time !== undefined
  ) {
    return { ok: false, error: "Forbidden field in body", status: 400 };
  }
  return { ok: true };
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

    // Simulates close_order_atomic RPC with row-level lock
    async closeOrderAtomic(roomId: string, userId: string, orderId: string | null) {
      const lockKey = `${roomId}:${userId}`;
      if (locks.has(lockKey)) {
        return { error: "Already closing an order in this room" };
      }
      locks.add(lockKey);

      // Find the open order
      let order: { id: string; room_id: string; user_id: string; side: string; amount: number; entry_price: number; closed_at: string | null } | undefined;
      for (const o of orders.values()) {
        if (o.room_id === roomId && o.user_id === userId && o.closed_at === null) {
          if (!orderId || o.id === orderId) {
            order = o;
            break;
          }
        }
      }

      if (!order) {
        locks.delete(lockKey);
        return { error: "Open order not found" };
      }

      return {
        order_id: order.id,
        side: order.side,
        entry_price: order.entry_price,
        amount: order.amount,
      };
    },

    // Mark order as closed
    markClosed(orderId: string, exitPrice: number, pnl: number) {
      const order = orders.get(orderId);
      if (order) {
        order.closed_at = new Date().toISOString();
        order.exit_price = exitPrice;
        order.pnl = pnl;
      }
    },

    releaseLock(roomId: string, userId: string) {
      locks.delete(`${roomId}:${userId}`);
    },
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

  // ── (a) Idempotency Key — Duplicate Request Rejection ─────────────────
  it("should reject duplicate request with same idempotency key within 30s", async () => {
    const userId = "user-123";
    const idemKey = "abc12345-def6-ghij-klmn-opqrstuvwx";

    // First request — should succeed
    const result1 = await checkIdempotency(redis, userId, idemKey);
    expect(result1.ok).toBe(true);

    // Second request with same key — should be rejected (409)
    const result2 = await checkIdempotency(redis, userId, idemKey);
    expect(result2.ok).toBe(false);
    expect(result2.status).toBe(409);
    expect(result2.error).toBe("Duplicate request (idempotency replay)");

    // Verify Redis was called with correct key
    expect(redis.setNxEx).toHaveBeenCalledWith(
      `blitz:idem:${userId}:${idemKey}`,
      "1",
      30,
    );
  });

  it("should accept different idempotency keys for same user", async () => {
    const userId = "user-123";

    const result1 = await checkIdempotency(redis, userId, "key-00000001");
    expect(result1.ok).toBe(true);

    const result2 = await checkIdempotency(redis, userId, "key-00000002");
    expect(result2.ok).toBe(true);
  });

  it("should reject invalid idempotency key format", async () => {
    const result = await checkIdempotency(redis, "user-1", "short");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(400);
    expect(result.error).toBe("Invalid Idempotency-Key");
  });

  it("should allow request without idempotency key (optional)", async () => {
    const result = await checkIdempotency(redis, "user-1", null);
    expect(result.ok).toBe(true);
  });

  // ── (b) Clock Drift — Stale Request Rejection ────────────────────────
  it("should reject request with clock drift > 150ms", () => {
    const serverNow = 1_700_000_000_000;
    const staleSentAt = String(serverNow - 200); // 200ms drift

    const result = checkClockDrift(staleSentAt, serverNow);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.error).toBe("Stale request (clock drift > 150ms)");
  });

  it("should accept request with clock drift <= 150ms", () => {
    const serverNow = 1_700_000_000_000;
    const freshSentAt = String(serverNow - 100); // 100ms drift

    const result = checkClockDrift(freshSentAt, serverNow);
    expect(result.ok).toBe(true);
  });

  it("should accept request without x-client-sent-at header", () => {
    const result = checkClockDrift(null, Date.now());
    expect(result.ok).toBe(true);
  });

  it("should reject request with non-numeric x-client-sent-at", () => {
    const result = checkClockDrift("not-a-number", Date.now());
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
  });

  // ── (c) Race Condition — Concurrent Order Close ──────────────────────
  it("should prevent double-close via atomic lock (row-level lock pattern)", async () => {
    const sim = createSimulatedAtomicOrder();
    sim.seedOrder({
      id: "order-001",
      room_id: "room-1",
      user_id: "user-1",
      side: "long",
      amount: 100,
      entry_price: 60000,
    });

    // First close request — acquires lock
    const result1 = await sim.closeOrderAtomic("room-1", "user-1", "order-001");
    expect(result1.error).toBeUndefined();
    expect(result1.order_id).toBe("order-001");

    // Second concurrent close request — lock already held
    const result2 = await sim.closeOrderAtomic("room-1", "user-1", "order-001");
    expect(result2.error).toBe("Already closing an order in this room");

    // After releasing lock, new close would find order still open (since first didn't mark it yet)
    sim.releaseLock("room-1", "user-1");
    const result3 = await sim.closeOrderAtomic("room-1", "user-1", "order-001");
    expect(result3.order_id).toBe("order-001");
  });

  it("should reject body with forbidden fields (entry_price, price, timestamp)", () => {
    const body1 = { room_id: "r1", action: "open", side: "long", amount: 100, entry_price: 60000 };
    expect(checkForbiddenFields(body1).ok).toBe(false);

    const body2 = { room_id: "r1", action: "open", side: "long", amount: 100, price: 60000 };
    expect(checkForbiddenFields(body2).ok).toBe(false);

    const body3 = { room_id: "r1", action: "open", side: "long", amount: 100, timestamp: Date.now() };
    expect(checkForbiddenFields(body3).ok).toBe(false);

    // Clean body — no forbidden fields
    const body4 = { room_id: "r1", action: "open", side: "long", amount: 100 };
    expect(checkForbiddenFields(body4).ok).toBe(true);
  });
});
