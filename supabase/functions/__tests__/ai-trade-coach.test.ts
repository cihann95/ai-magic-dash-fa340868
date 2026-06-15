import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * ai-trade-coach Zod validation tests
 *
 * Since the edge function uses Deno.serve() and ESM URL imports,
 * we extract the schema locally for testing without importing the module.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Schema extracted from supabase/functions/ai-trade-coach/index.ts
// ═══════════════════════════════════════════════════════════════════════════
const TradeCoachRequestSchema = z.object({
  user_id: z.string().uuid().optional(),
});

describe("ai-trade-coach Zod validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("TradeCoachRequestSchema", () => {
    it("should accept valid input with user_id", () => {
      const input = { user_id: "123e4567-e89b-12d3-a456-426614174000" };
      const result = TradeCoachRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.user_id).toBe("123e4567-e89b-12d3-a456-426614174000");
      }
    });

    it("should accept empty input (user_id optional)", () => {
      const input = {};
      const result = TradeCoachRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.user_id).toBeUndefined();
      }
    });

    it("should reject invalid UUID format", () => {
      const input = { user_id: "not-a-uuid" };
      const result = TradeCoachRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid UUID (too short)", () => {
      const input = { user_id: "123" };
      const result = TradeCoachRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid UUID (wrong format)", () => {
      const input = { user_id: "123e4567-e89b-12d3-a456-42661417400" };
      const result = TradeCoachRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject non-string user_id", () => {
      const input = { user_id: 123 };
      const result = TradeCoachRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});