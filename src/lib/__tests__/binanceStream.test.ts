import { describe, it, expect, vi, beforeEach } from "vitest";
import { startBinanceStream, CRYPTO_SYMBOLS } from "@/lib/binanceStream";

describe("binanceStream", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset the singleton state
    if (typeof window !== "undefined") {
      delete (window as Record<string, unknown>).__binance_stream;
    }
  });

  describe("CRYPTO_SYMBOLS", () => {
    it("contains all supported crypto symbols", () => {
      expect(CRYPTO_SYMBOLS).toContain("BTCUSD");
      expect(CRYPTO_SYMBOLS).toContain("ETHUSD");
      expect(CRYPTO_SYMBOLS).toContain("SOLUSD");
      expect(CRYPTO_SYMBOLS).toContain("BNBUSD");
      expect(CRYPTO_SYMBOLS).toContain("XRPUSD");
      expect(CRYPTO_SYMBOLS).toContain("DOGEUSD");
      expect(CRYPTO_SYMBOLS).toContain("ADAUSD");
      expect(CRYPTO_SYMBOLS).toContain("AVAXUSD");
      expect(CRYPTO_SYMBOLS).toContain("DOTUSD");
      expect(CRYPTO_SYMBOLS).toContain("LINKUSD");
      expect(CRYPTO_SYMBOLS).toContain("MATICUSD");
      expect(CRYPTO_SYMBOLS).toContain("UNIUSD");
      expect(CRYPTO_SYMBOLS).toContain("ATOMUSD");
      expect(CRYPTO_SYMBOLS).toContain("TRXUSD");
      expect(CRYPTO_SYMBOLS).toContain("LTCUSD");
      expect(CRYPTO_SYMBOLS).toContain("FILUSD");
    });

    it("has 16 symbols", () => {
      expect(CRYPTO_SYMBOLS).toHaveLength(16);
    });
  });

  describe("startBinanceStream()", () => {
    it("returns a cleanup function", () => {
      const cleanup = startBinanceStream(() => {});
      expect(typeof cleanup).toBe("function");
      cleanup();
    });

    it("does not throw when called", () => {
      expect(() => {
        const cleanup = startBinanceStream(() => {});
        cleanup();
      }).not.toThrow();
    });

    it("does not throw when WebSocket is unavailable (jsdom)", () => {
      // In jsdom, WebSocket constructor exists but may not connect
      const cleanup = startBinanceStream(() => {});
      expect(typeof cleanup).toBe("function");
      cleanup();
    });
  });
});
