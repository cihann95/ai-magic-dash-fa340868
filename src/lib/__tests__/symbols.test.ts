import { describe, it, expect, vi } from "vitest";
import {
  SYMBOLS,
  ASSET_LABELS,
  findSymbol,
  formatPrice,
  isMarketOpen,
  isStale,
  STALE_THRESHOLD_MS,
  type AssetClass,
} from "@/lib/symbols";

describe("symbols", () => {
  describe("SYMBOLS", () => {
    it("contains entries for all asset classes", () => {
      const classes = new Set(SYMBOLS.map((s) => s.asset_class));
      expect(classes.has("crypto")).toBe(true);
      expect(classes.has("stocks")).toBe(true);
      expect(classes.has("forex")).toBe(true);
      expect(classes.has("commodities")).toBe(true);
      expect(classes.has("indices")).toBe(true);
      expect(classes.has("etf")).toBe(true);
    });

    it("each symbol has required fields", () => {
      for (const s of SYMBOLS) {
        expect(s.symbol).toBeTruthy();
        expect(s.tv).toBeTruthy();
        expect(s.name).toBeTruthy();
        expect(s.asset_class).toBeTruthy();
      }
    });

    it("crypto symbols have binance tickers and are market_open", () => {
      const cryptos = SYMBOLS.filter((s) => s.asset_class === "crypto");
      for (const c of cryptos) {
        expect(c.binance).toBeTruthy();
        expect(c.market_open).toBe(true);
      }
    });

    it("stock symbols have yahoo tickers", () => {
      const stocks = SYMBOLS.filter((s) => s.asset_class === "stocks");
      for (const s of stocks) {
        expect(s.yahoo).toBeTruthy();
      }
    });
  });

  describe("ASSET_LABELS", () => {
    it("has labels for all asset classes in both languages", () => {
      const classes: AssetClass[] = ["crypto", "stocks", "forex", "commodities", "indices", "etf"];
      for (const cls of classes) {
        expect(ASSET_LABELS[cls]).toBeDefined();
        expect(ASSET_LABELS[cls].tr).toBeTruthy();
        expect(ASSET_LABELS[cls].en).toBeTruthy();
      }
    });
  });

  describe("findSymbol()", () => {
    it("finds a symbol by its code", () => {
      const btc = findSymbol("BTCUSD");
      expect(btc).toBeDefined();
      expect(btc!.name).toBe("Bitcoin");
      expect(btc!.asset_class).toBe("crypto");
    });

    it("returns undefined for unknown symbol", () => {
      expect(findSymbol("FAKECOIN")).toBeUndefined();
    });

    it("finds stocks", () => {
      const aapl = findSymbol("AAPL");
      expect(aapl).toBeDefined();
      expect(aapl!.name).toBe("Apple Inc.");
    });
  });

  describe("formatPrice()", () => {
    it("returns dash for null/undefined/NaN", () => {
      expect(formatPrice(null)).toBe("—");
      expect(formatPrice(undefined)).toBe("—");
      expect(formatPrice(NaN)).toBe("—");
    });

    it("formats prices < 5 with 4 decimal places", () => {
      const result = formatPrice(1.23456);
      expect(result).toContain("1.2346");
    });

    it("formats prices >= 5 with 2 decimal places", () => {
      const result = formatPrice(60000.5);
      expect(result).toContain("60,000.50");
    });

    it("formats small forex prices", () => {
      const result = formatPrice(0.8543);
      expect(result).toContain("0.8543");
    });
  });

  describe("isMarketOpen()", () => {
    it("returns true for crypto (market_open=true)", () => {
      const btc = findSymbol("BTCUSD")!;
      expect(isMarketOpen(btc)).toBe(true);
    });

    it("returns true for forex (market_open=true)", () => {
      const eur = findSymbol("EURUSD")!;
      expect(isMarketOpen(eur)).toBe(true);
    });

    it("returns false for stocks on weekends", () => {
      const aapl = findSymbol("AAPL")!;
      // Mock a Saturday
      const satDate = new Date("2026-06-20T15:00:00Z"); // Saturday 15:00 UTC
      vi.useFakeTimers({ now: satDate });
      expect(isMarketOpen(aapl)).toBe(false);
      vi.useRealTimers();
    });

    it("returns true for stocks during market hours (weekdays 13-21 UTC)", () => {
      const aapl = findSymbol("AAPL")!;
      // Mock a Monday 15:00 UTC
      const monDate = new Date("2026-06-22T15:00:00Z"); // Monday
      vi.useFakeTimers({ now: monDate });
      expect(isMarketOpen(aapl)).toBe(true);
      vi.useRealTimers();
    });

    it("returns false for stocks outside market hours", () => {
      const aapl = findSymbol("AAPL")!;
      // Mock a Monday 12:00 UTC (before 13:00 open)
      const earlyDate = new Date("2026-06-22T12:00:00Z");
      vi.useFakeTimers({ now: earlyDate });
      expect(isMarketOpen(aapl)).toBe(false);
      vi.useRealTimers();
    });
  });

  describe("isStale()", () => {
    it("returns true for null/undefined", () => {
      expect(isStale(null)).toBe(true);
      expect(isStale(undefined)).toBe(true);
    });

    it("returns true for old timestamps", () => {
      const old = new Date(Date.now() - STALE_THRESHOLD_MS - 1000).toISOString();
      expect(isStale(old)).toBe(true);
    });

    it("returns false for recent timestamps", () => {
      const recent = new Date(Date.now() - 1000).toISOString();
      expect(isStale(recent)).toBe(false);
    });
  });
});
