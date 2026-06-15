import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * ai-analyze Zod validation tests
 *
 * Since the edge function uses Deno.serve() and ESM URL imports,
 * we extract the schema locally for testing without importing the module.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Schema extracted from supabase/functions/ai-analyze/index.ts
// ═══════════════════════════════════════════════════════════════════════════
const AnalyzeRequestSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9.-]{1,16}$/, "Geçersiz sembol formatı"),
  asset_class: z.string().regex(/^[a-z]{1,16}$/).optional(),
  language: z.enum(["tr", "en"]).default("tr"),
});

describe("ai-analyze Zod validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("AnalyzeRequestSchema", () => {
    it("should accept valid input with all fields", () => {
      const input = {
        symbol: "BTCUSDT",
        asset_class: "crypto",
        language: "tr",
      };
      const result = AnalyzeRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.symbol).toBe("BTCUSDT");
        expect(result.data.asset_class).toBe("crypto");
        expect(result.data.language).toBe("tr");
      }
    });

    it("should accept valid input with only required symbol", () => {
      const input = { symbol: "ETHUSDT" };
      const result = AnalyzeRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.symbol).toBe("ETHUSDT");
        expect(result.data.asset_class).toBeUndefined();
        expect(result.data.language).toBe("tr");
      }
    });

    it("should accept valid input with language en", () => {
      const input = { symbol: "AAPL", language: "en" };
      const result = AnalyzeRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe("en");
      }
    });

    it("should reject missing symbol", () => {
      const input = { asset_class: "crypto" };
      const result = AnalyzeRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toBeDefined();
      }
    });

    it("should reject invalid symbol format (lowercase)", () => {
      const input = { symbol: "btcusdt" };
      const result = AnalyzeRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid symbol format (special chars)", () => {
      const input = { symbol: "BTC@USDT" };
      const result = AnalyzeRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject symbol too long", () => {
      const input = { symbol: "A".repeat(17) };
      const result = AnalyzeRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid asset_class format (uppercase)", () => {
      const input = { symbol: "BTCUSDT", asset_class: "CRYPTO" };
      const result = AnalyzeRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid language", () => {
      const input = { symbol: "BTCUSDT", language: "fr" };
      const result = AnalyzeRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject empty body", () => {
      const result = AnalyzeRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});