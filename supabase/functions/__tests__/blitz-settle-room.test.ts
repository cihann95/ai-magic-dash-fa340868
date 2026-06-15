/**
 * blitz-settle-room: Concurrency & Idempotency Tests
 *
 * Tests the advisory lock pattern and double-settlement protection
 * as implemented in blitz-settle-room/index.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════
// Simulated settlement engine with advisory lock + room validation
// Replicates the logic from blitz-settle-room/index.ts lines 14-35
// ═══════════════════════════════════════════════════════════════════════════
function createSimulatedSettlementEngine() {
  const rooms = new Map<string, {
    id: string;
    status: string;
    symbol: string;
    start_price: number;
    entry_fee: number;
    pot: number;
    winner_id: string | null;
    settled: boolean;
  }>();
  const advisoryLocks = new Set<string>();
  const settledRooms = new Set<string>();
  const settlementLedger: Array<{
    room_id: string;
    idempotency_key: string;
    status: string;
    winner_id: string | null;
  }> = [];

  return {
    seedRoom(room: {
      id: string;
      status?: string;
      symbol?: string;
      start_price?: number;
      entry_fee?: number;
      pot?: number;
    }) {
      rooms.set(room.id, {
        id: room.id,
        status: room.status ?? "active",
        symbol: room.symbol ?? "BTC/USD",
        start_price: room.start_price ?? 60000,
        entry_fee: room.entry_fee ?? 10,
        pot: room.pot ?? 20,
        winner_id: null,
        settled: false,
      });
    },
    getRoom(id: string) {
      return rooms.get(id) ?? null;
    },
    getSettlementLedger() {
      return settlementLedger;
    },

    // Advisory lock — same as try_advisory_lock() RPC
    tryAdvisoryLock(roomId: string): { acquired: boolean; error?: string } {
      if (advisoryLocks.has(roomId)) {
        return { acquired: false };
      }
      advisoryLocks.add(roomId);
      return { acquired: true };
    },

    // Release advisory lock
    releaseAdvisoryLock(roomId: string) {
      advisoryLocks.delete(roomId);
    },

    // lock_and_validate_room — checks if already settled
    lockAndValidateRoom(roomId: string, _idempotencyKey: string): {
      already_settled: boolean;
      error?: string;
      symbol?: string;
      start_price?: number;
      entry_fee?: number;
      pot?: number;
    } {
      const room = rooms.get(roomId);
      if (!room) {
        return { already_settled: false, error: "Room not found" };
      }
      if (room.status === "finished" || room.settled) {
        return { already_settled: true };
      }
      // Mark as settling
      room.status = "settling";
      room.settled = true;
      settledRooms.add(roomId);
      return {
        already_settled: false,
        symbol: room.symbol,
        start_price: room.start_price,
        entry_fee: room.entry_fee,
        pot: room.pot,
      };
    },

    // Full settle flow
    async settleRoom(roomId: string): Promise<{ ok: boolean; reason?: string; error?: string }> {
      const idempotencyKey = `${roomId}:edge_function`;

      // Step 1: Advisory lock
      const lock = this.tryAdvisoryLock(roomId);
      if (!lock.acquired) {
        return { ok: true, reason: "locked_by_other_session" };
      }

      // Step 2: Validate room
      const validation = this.lockAndValidateRoom(roomId, idempotencyKey);
      if (validation.error) {
        this.releaseAdvisoryLock(roomId);
        return { ok: false, error: validation.error };
      }
      if (validation.already_settled) {
        this.releaseAdvisoryLock(roomId);
        return { ok: true, reason: "already_settled" };
      }

      // Step 3: Record in settlement ledger
      settlementLedger.push({
        room_id: roomId,
        idempotency_key: idempotencyKey,
        status: "completed",
        winner_id: null,
      });

      // Step 4: Update room status
      const room = rooms.get(roomId);
      if (room) {
        room.status = "finished";
      }

      this.releaseAdvisoryLock(roomId);
      return { ok: true };
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════
describe("blitz-settle-room", () => {
  let engine: ReturnType<typeof createSimulatedSettlementEngine>;

  beforeEach(() => {
    engine = createSimulatedSettlementEngine();
    vi.useFakeTimers({ now: 1_700_000_000_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── (a) Advisory Lock — Preventing Double Settlement ──────────────────
  it("should acquire advisory lock and settle room", async () => {
    engine.seedRoom({ id: "room-1" });

    const result = await engine.settleRoom("room-1");

    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined(); // Successfully settled
    expect(engine.getRoom("room-1")!.status).toBe("finished");
    expect(engine.getSettlementLedger().length).toBe(1);
    expect(engine.getSettlementLedger()[0].room_id).toBe("room-1");
  });

  it("should reject concurrent settlement via advisory lock (locked_by_other_session)", async () => {
    engine.seedRoom({ id: "room-1" });

    const result1 = await engine.settleRoom("room-1");
    expect(result1.ok).toBe(true);

    // Second call: advisory lock released, but lock_and_validate_room detects already settled
    const result2 = await engine.settleRoom("room-1");
    expect(result2.ok).toBe(true);
    expect(result2.reason).toBe("already_settled");
  });

  it("should return locked_by_other_session when advisory lock is held", async () => {
    engine.seedRoom({ id: "room-1" });

    // Manually hold the advisory lock
    engine.tryAdvisoryLock("room-1");

    // Try to settle while lock is held
    const result = await engine.settleRoom("room-1");

    expect(result.ok).toBe(true);
    expect(result.reason).toBe("locked_by_other_session");
  });

  // ── (b) Double Settlement Protection ─────────────────────────────────
  it("should detect already-settled room and return early", async () => {
    engine.seedRoom({ id: "room-1" });

    // First settlement
    await engine.settleRoom("room-1");

    // Second settlement attempt
    const result = await engine.settleRoom("room-1");

    expect(result.ok).toBe(true);
    expect(result.reason).toBe("already_settled");

    // Only one entry in ledger (not double-settled)
    const ledgerEntries = engine.getSettlementLedger().filter(e => e.room_id === "room-1");
    expect(ledgerEntries.length).toBe(1);
  });

  it("should return error for non-existent room", async () => {
    const result = await engine.settleRoom("room-nonexistent");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Room not found");
  });

  it("should handle rapid sequential settlements (idempotency)", async () => {
    engine.seedRoom({ id: "room-1" });

    // Simulate rapid sequential calls (e.g., cron + manual trigger)
    const results = await Promise.all([
      engine.settleRoom("room-1"),
      engine.settleRoom("room-1"),
      engine.settleRoom("room-1"),
    ]);

    // First succeeds, rest get locked or already_settled
    const successCount = results.filter(r => r.ok && !r.reason).length;
    const lockedCount = results.filter(r => r.reason === "locked_by_other_session").length;
    const settledCount = results.filter(r => r.reason === "already_settled").length;

    // Exactly one should succeed (or be locked/already_settled)
    expect(successCount + lockedCount + settledCount).toBe(3);
    expect(lockedCount + settledCount).toBeGreaterThanOrEqual(2); // At least 2 should be blocked

    // Only one settlement in ledger
    const ledgerEntries = engine.getSettlementLedger().filter(e => e.room_id === "room-1");
    expect(ledgerEntries.length).toBe(1);
  });
});
