import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * ai-strategy Zod validation tests
 *
 * Since the edge function uses Deno.serve() and ESM URL imports,
 * we extract the schema locally for testing without importing the module.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Schema extracted from supabase/functions/ai-strategy/index.ts
// ═══════════════════════════════════════════════════════════════════════════
const StrategyRequestSchema = z.object({
  language: z.enum(["tr", "en"]).default("tr"),
});

describe("ai-strategy Zod validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("StrategyRequestSchema", () => {
    it("should accept valid input with language tr", () => {
      const input = { language: "tr" };
      const result = StrategyRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe("tr");
      }
    });

    it("should accept valid input with language en", () => {
      const input = { language: "en" };
      const result = StrategyRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe("en");
      }
    });

    it("should accept empty input (defaults to tr)", () => {
      const input = {};
      const result = StrategyRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe("tr");
      }
    });

    it("should reject invalid language", () => {
      const input = { language: "fr" };
      const result = StrategyRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid language type", () => {
      const input = { language: 123 };
      const result = StrategyRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});