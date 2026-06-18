import { describe, it, expect } from "vitest";
import { t, formatViewerCount } from "@/lib/i18n";

describe("i18n", () => {
  describe("t()", () => {
    it("returns Turkish translations for lang 'tr'", () => {
      const tr = t("tr");
      expect(tr.markets).toBe("Piyasalar");
      expect(tr.portfolio).toBe("Portföy");
      expect(tr.signin).toBe("Giriş Yap");
      expect(tr.buy).toBe("Satın Al");
      expect(tr.sell).toBe("Sat");
    });

    it("returns English translations for lang 'en'", () => {
      const en = t("en");
      expect(en.markets).toBe("Markets");
      expect(en.portfolio).toBe("Portfolio");
      expect(en.signin).toBe("Sign In");
      expect(en.buy).toBe("Buy");
      expect(en.sell).toBe("Sell");
    });

    it("contains all required translation keys", () => {
      const tr = t("tr");
      const en = t("en");
      const keys = Object.keys(tr);
      expect(keys.length).toBeGreaterThan(50);
      for (const key of keys) {
        expect(en).toHaveProperty(key);
      }
    });
  });

  describe("formatViewerCount()", () => {
    it("formats numbers below 1000 as-is", () => {
      expect(formatViewerCount(0)).toBe("0");
      expect(formatViewerCount(1)).toBe("1");
      expect(formatViewerCount(42)).toBe("42");
      expect(formatViewerCount(999)).toBe("999");
    });

    it("formats 1000+ as K notation", () => {
      expect(formatViewerCount(1000)).toBe("1.0K");
      expect(formatViewerCount(1500)).toBe("1.5K");
      expect(formatViewerCount(10000)).toBe("10.0K");
      expect(formatViewerCount(123456)).toBe("123.5K");
    });
  });
});
