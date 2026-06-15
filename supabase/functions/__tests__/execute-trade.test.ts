/**
 * execute-trade: Concurrency & Idempotency Tests
 *
 * Tests the stale-price rejection and concurrent trade race conditions
 * as implemented in supabase/functions/execute-trade/index.ts.
 *
 * Since the edge function uses Deno.serve() and ESM URL imports,
 * we simulate the exact handler logic with mocks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════
// Constants extracted from execute-trade/index.ts
// ═══════════════════════════════════════════════════════════════════════════
const STALE_MS = 5 * 60 * 1000; // 5 minutes
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ASSET_CLASSES = new Set(["crypto", "stocks", "forex", "commodities", "indices", "etf"]);

// ═══════════════════════════════════════════════════════════════════════════
// Stale price check logic (from execute-trade/index.ts lines 113-126)
// ═══════════════════════════════════════════════════════════════════════════
function checkStalePrice(priceRow: { price: number; updated_at: string }): { ok: boolean; error?: string } {
  const priceAge = Date.now() - new Date(priceRow.updated_at).getTime();
  if (priceAge > STALE_MS) {
    return { ok: false, error: `Fiyat verisi güncel değil (${Math.round(priceAge / 1000)}s eski).` };
  }
  const price = Number(priceRow.price);
  if (!isFinite(price) || price <= 0) {
    return { ok: false, error: "Geçersiz fiyat verisi" };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Simulated concurrent position-close WITHOUT locking (vulnerable pattern)
// ═══════════════════════════════════════════════════════════════════════════
function createSimulatedClosePosition() {
  const positions = new Map<string, { id: string; entry_price: number; quantity: number; side: string; user_id: string }>();
  const closedPositions = new Set<string>();
  let balance = 10000;
  const trades: Array<{ position_id: string; pnl: number }> = [];

  return {
    seedPosition(pos: { id: string; entry_price: number; quantity: number; side: string; user_id: string }) {
      positions.set(pos.id, { ...pos });
    },
    getBalance: () => balance,
    getTrades: () => trades,
    getClosedPositions: () => closedPositions,

    async closePosition(positionId: string, currentPrice: number) {
      const pos = positions.get(positionId);
      if (!pos) return { ok: false as const, error: "Pozisyon bulunamadı" };

      await new Promise((r) => setTimeout(r, 0));

      const entry = pos.entry_price;
      const qty = pos.quantity;
      const pnl = pos.side === "long" ? (currentPrice - entry) * qty : (entry - currentPrice) * qty;
      const roundedPnl = Number(pnl.toFixed(2));

      balance = Number((balance + Number((entry * qty).toFixed(2)) + roundedPnl).toFixed(2));
      positions.delete(positionId);
      closedPositions.add(positionId);
      trades.push({ position_id: positionId, pnl: roundedPnl });

      return { ok: true as const, balance, pnl: roundedPnl };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Simulated concurrent position-close WITH optimistic locking (fixed pattern)
// Uses closed_at field as atomic lock — mirrors execute-trade/index.ts fix.
// ═══════════════════════════════════════════════════════════════════════════
function createSimulatedClosePositionWithLock() {
  const positions = new Map<string, { id: string; entry_price: number; quantity: number; side: string; user_id: string; closed_at: string | null }>();
  let balance = 10000;
  const trades: Array<{ position_id: string; pnl: number }> = [];

  return {
    seedPosition(pos: { id: string; entry_price: number; quantity: number; side: string; user_id: string }) {
      positions.set(pos.id, { ...pos, closed_at: null });
    },
    getBalance: () => balance,
    getTrades: () => trades,

    async closePosition(positionId: string, currentPrice: number) {
      const pos = positions.get(positionId);
      if (!pos) return { ok: false as const, error: "Pozisyon bulunamadı" };
      if (pos.closed_at !== null) return { ok: false as const, error: "Pozisyon zaten kapatılmış" };

      // Atomic optimistic lock: only first writer succeeds
      await new Promise((r) => setTimeout(r, 0));
      if (pos.closed_at !== null) return { ok: false as const, error: "Pozisyon kapatılamadı (race condition)" };
      pos.closed_at = new Date().toISOString();

      const entry = pos.entry_price;
      const qty = pos.quantity;
      const pnl = pos.side === "long" ? (currentPrice - entry) * qty : (entry - currentPrice) * qty;
      const roundedPnl = Number(pnl.toFixed(2));

      balance = Number((balance + Number((entry * qty).toFixed(2)) + roundedPnl).toFixed(2));
      trades.push({ position_id: positionId, pnl: roundedPnl });

      return { ok: true as const, balance, pnl: roundedPnl };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Request validation logic (from execute-trade/index.ts lines 64-108)
// ═══════════════════════════════════════════════════════════════════════════
function parsePublicTradeRequest(payload: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Geçersiz işlem parametreleri" };
  }
  const raw = payload as Record<string, unknown>;
  if (raw.copied_from != null || raw.leader_user_id != null) {
    return { ok: false, error: "Kopya işlem alanları istemciden gönderilemez" };
  }
  const symbol = typeof raw.symbol === "string" ? raw.symbol.trim().toUpperCase() : "";
  const asset_class = typeof raw.asset_class === "string" ? raw.asset_class.trim().toLowerCase() : "";
  const side = raw.side;
  const quantity = Number(raw.quantity);
  const position_id = typeof raw.position_id === "string" ? raw.position_id.trim() : undefined;

  if (!symbol || symbol.length > 24) return { ok: false, error: "Geçersiz sembol" };
  if (!ALLOWED_ASSET_CLASSES.has(asset_class)) return { ok: false, error: "Geçersiz varlık sınıfı" };
  if (side !== "buy" && side !== "sell") return { ok: false, error: "Geçersiz işlem yönü" };
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100000000) {
    return { ok: false, error: "Geçersiz miktar" };
  }
  if (position_id && !UUID_RE.test(position_id)) return { ok: false, error: "Geçersiz pozisyon kimliği" };

  return { ok: true, data: { symbol, asset_class, side, quantity, position_id } };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════
describe("execute-trade", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_700_000_000_000 }); // Fixed time for deterministic tests
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── (a) Idempotency / Stale Price ─────────────────────────────────────
  it("should reject stale price (>5min old)", () => {
    const now = Date.now();
    const staleTime = new Date(now - STALE_MS - 1000).toISOString(); // 5min 1s ago

    const result = checkStalePrice({ price: 60000, updated_at: staleTime });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Fiyat verisi güncel değil/);
    expect(result.error).toMatch(/\d+s eski/);
  });

  it("should accept fresh price (<5min old)", () => {
    const now = Date.now();
    const freshTime = new Date(now - 60_000).toISOString(); // 1 min ago

    const result = checkStalePrice({ price: 60000, updated_at: freshTime });

    expect(result.ok).toBe(true);
  });

  it("should reject exactly stale boundary (5min + 1ms)", () => {
    const now = Date.now();
    const boundaryTime = new Date(now - STALE_MS - 1).toISOString();

    const result = checkStalePrice({ price: 60000, updated_at: boundaryTime });

    expect(result.ok).toBe(false);
  });

  it("should accept exactly fresh boundary (5min - 1ms)", () => {
    const now = Date.now();
    const boundaryTime = new Date(now - STALE_MS + 1).toISOString();

    const result = checkStalePrice({ price: 60000, updated_at: boundaryTime });

    expect(result.ok).toBe(true);
  });

  it("should reject invalid price values (zero, negative, NaN)", () => {
    const now = Date.now();
    const freshTime = new Date(now - 1000).toISOString();

    expect(checkStalePrice({ price: 0, updated_at: freshTime }).ok).toBe(false);
    expect(checkStalePrice({ price: -100, updated_at: freshTime }).ok).toBe(false);
    expect(checkStalePrice({ price: NaN, updated_at: freshTime }).ok).toBe(false);
  });

  // ── (b) Race Condition — Concurrent Position Close ────────────────────
  it("should allow duplicate close on same position (race condition vulnerability)", async () => {
    const sim = createSimulatedClosePosition();
    sim.seedPosition({
      id: "pos-001",
      entry_price: 100,
      quantity: 10,
      side: "long",
      user_id: "user-1",
    });

    const initialBalance = sim.getBalance();

    const p1 = sim.closePosition("pos-001", 110);
    const p2 = sim.closePosition("pos-001", 110);

    vi.advanceTimersByTime(1);

    const [result1, result2] = await Promise.all([p1, p2]);

    expect(result1.ok).toBe(true);
    expect(result2.ok).toBe(true);

    // Balance double-credited: 2 * (entry(1000) + pnl(100)) = 2200
    expect(sim.getBalance()).toBe(initialBalance + 2200);
    expect(sim.getTrades().length).toBe(2);
  });

  it("should prevent double-credit with optimistic locking (race condition fix)", async () => {
    const sim = createSimulatedClosePositionWithLock();
    sim.seedPosition({
      id: "pos-002",
      entry_price: 100,
      quantity: 10,
      side: "long",
      user_id: "user-1",
    });

    const initialBalance = sim.getBalance();

    const p1 = sim.closePosition("pos-002", 110);
    const p2 = sim.closePosition("pos-002", 110);

    vi.advanceTimersByTime(1);

    const [result1, result2] = await Promise.all([p1, p2]);

    const successCount = [result1, result2].filter((r) => r.ok).length;
    expect(successCount).toBe(1);

    // Balance credited only once: entry(1000) + pnl(100) = 1100
    expect(sim.getBalance()).toBe(initialBalance + 1100);
    expect(sim.getTrades().length).toBe(1);

    const failedResult = result1.ok ? result2 : result1;
    expect(failedResult.ok).toBe(false);
    expect((failedResult as { ok: false; error: string }).error).toBe("Pozisyon kapatılamadı (race condition)");
  });

  it("should validate request payload (asset class whitelist, UUID format)", () => {
    // Valid request
    const valid = parsePublicTradeRequest({
      symbol: "BTC/USD",
      asset_class: "crypto",
      side: "buy",
      quantity: 1,
    });
    expect(valid.ok).toBe(true);

    // Invalid asset class
    const invalidAsset = parsePublicTradeRequest({
      symbol: "BTC/USD",
      asset_class: "nft",
      side: "buy",
      quantity: 1,
    });
    expect(invalidAsset.ok).toBe(false);
    expect((invalidAsset as { ok: false; error: string }).error).toBe("Geçersiz varlık sınıfı");

    // Invalid position_id (not UUID)
    const invalidUuid = parsePublicTradeRequest({
      symbol: "BTC/USD",
      asset_class: "crypto",
      side: "buy",
      quantity: 1,
      position_id: "not-a-uuid",
    });
    expect(invalidUuid.ok).toBe(false);
    expect((invalidUuid as { ok: false; error: string }).error).toBe("Geçersiz pozisyon kimliği");

    // Client-supplied copy fields rejected
    const copyFields = parsePublicTradeRequest({
      symbol: "BTC/USD",
      asset_class: "crypto",
      side: "buy",
      quantity: 1,
      copied_from: "some-trade-id",
    });
    expect(copyFields.ok).toBe(false);
  });
});
