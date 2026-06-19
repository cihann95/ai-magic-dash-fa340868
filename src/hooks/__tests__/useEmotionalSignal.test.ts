import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act as _act, cleanup, waitFor as _waitFor } from "@testing-library/react";
import { useEmotionalSignal, recordTrade, detectSignal, logEmotion } from "@/hooks/useEmotionalSignal";

const { mockFrom } = vi.hoisted(() => {
  const mockFrom = vi.fn().mockReturnValue({
    insert: vi.fn().mockResolvedValue({ error: null }),
  });
  return { mockFrom };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
  },
}));

describe("useEmotionalSignal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(async () => {
    vi.useRealTimers();
    localStorage.clear();
    await cleanup();
  });

  describe("recordTrade()", () => {
    it("records a trade to localStorage", () => {
      recordTrade(100);
      const raw = localStorage.getItem("lumen_recent_trades_v1");
      expect(raw).toBeTruthy();
      const trades = JSON.parse(raw!);
      expect(trades).toHaveLength(1);
      expect(trades[0].total).toBe(100);
    });

    it("marks last trade as closed when closed=true", () => {
      recordTrade(100);
      recordTrade(200, true);
      const trades = JSON.parse(localStorage.getItem("lumen_recent_trades_v1")!);
      expect(trades[0].closed_ts).toBeDefined();
    });

    it("stores absolute value of total", () => {
      recordTrade(-500);
      const trades = JSON.parse(localStorage.getItem("lumen_recent_trades_v1")!);
      expect(trades[0].total).toBe(500);
    });

    it("limits stored trades to MAX_TRADES (20)", () => {
      for (let i = 0; i < 25; i++) {
        recordTrade(i * 10);
      }
      const trades = JSON.parse(localStorage.getItem("lumen_recent_trades_v1")!);
      expect(trades.length).toBeLessThanOrEqual(20);
    });
  });

  describe("detectSignal()", () => {
    it("returns null when no trades recorded", () => {
      expect(detectSignal(100)).toBeNull();
    });

    it("returns 'rapid_fire' when 3+ trades in 5 minutes", () => {
      const now = Date.now();
      const trades = [
        { ts: now - 60000, total: 100 },
        { ts: now - 30000, total: 200 },
        { ts: now - 10000, total: 300 },
      ];
      localStorage.setItem("lumen_recent_trades_v1", JSON.stringify(trades));
      expect(detectSignal(50)).toBe("rapid_fire");
    });

    it("returns 'reactive' when last trade closed <60s ago", () => {
      const now = Date.now();
      const trades = [
        { ts: now - 120000, total: 100, closed_ts: now - 30000 },
      ];
      localStorage.setItem("lumen_recent_trades_v1", JSON.stringify(trades));
      expect(detectSignal(50)).toBe("reactive");
    });

    it("returns 'oversize' when prospective > 3x median", () => {
      const now = Date.now();
      const trades = Array.from({ length: 10 }, (_, i) => ({
        ts: now - 600_000 - i * 60_000,
        total: 100 + i * 10,
      }));
      localStorage.setItem("lumen_recent_trades_v1", JSON.stringify(trades));
      expect(detectSignal(500)).toBe("oversize");
    });

    it("returns null when prospective is within normal range", () => {
      const now = Date.now();
      const trades = Array.from({ length: 10 }, (_, i) => ({
        ts: now - 600_000 - i * 60_000,
        total: 100 + i * 10,
      }));
      localStorage.setItem("lumen_recent_trades_v1", JSON.stringify(trades));
      expect(detectSignal(100)).toBeNull();
    });

    it("ignores old trades (>5 min) for rapid_fire", () => {
      const now = Date.now();
      const trades = [
        { ts: now - 400000, total: 100 },
        { ts: now - 350000, total: 200 },
        { ts: now - 310000, total: 300 },
      ];
      localStorage.setItem("lumen_recent_trades_v1", JSON.stringify(trades));
      expect(detectSignal(50)).not.toBe("rapid_fire");
    });
  });

  describe("logEmotion()", () => {
    it("calls supabase insert with correct params", async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValueOnce({ insert: mockInsert });

      await logEmotion({
        userId: "user-1",
        signalType: "rapid_fire",
        mood: "anxious",
        symbol: "BTCUSD",
        tradeId: "trade-1",
      });

      expect(mockFrom).toHaveBeenCalledWith("emotional_logs");
      expect(mockInsert).toHaveBeenCalledWith({
        user_id: "user-1",
        signal_type: "rapid_fire",
        mood: "anxious",
        symbol: "BTCUSD",
        trade_id: "trade-1",
      });
    });

    it("does not throw on failure", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockFrom.mockImplementationOnce(() => {
        throw new Error("DB error");
      });

      await expect(
        logEmotion({ userId: "user-1", signalType: "test", mood: null })
      ).resolves.not.toThrow();

      warnSpy.mockRestore();
    });
  });

  describe("useEmotionalSignal hook", () => {
    it("returns null initially when no trades", () => {
      const { result } = renderHook(() => useEmotionalSignal(100));
      expect(result.current).toBeNull();
    });

    it("returns signal based on trade history", () => {
      const now = Date.now();
      const trades = [
        { ts: now - 60000, total: 100 },
        { ts: now - 30000, total: 200 },
        { ts: now - 10000, total: 300 },
      ];
      localStorage.setItem("lumen_recent_trades_v1", JSON.stringify(trades));

      const { result } = renderHook(() => useEmotionalSignal(50));
      expect(result.current).toBe("rapid_fire");
    });

    it("updates when prospectiveTotal changes", () => {
      const now = Date.now();
      // All trades >5min old to avoid rapid_fire trigger
      const trades = Array.from({ length: 10 }, (_, i) => ({
        ts: now - 400000 - i * 10000,
        total: 100,
      }));
      localStorage.setItem("lumen_recent_trades_v1", JSON.stringify(trades));

      const { result, rerender } = renderHook(
        ({ total }) => useEmotionalSignal(total),
        { initialProps: { total: 100 } }
      );
      expect(result.current).toBeNull();

      rerender({ total: 500 });
      expect(result.current).toBe("oversize");
    });
  });
});
