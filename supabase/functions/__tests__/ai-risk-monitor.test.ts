import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * ai-risk-monitor Zod validation tests
 *
 * Since the edge function uses Deno.serve() and ESM URL imports,
 * we extract the schema locally for testing without importing the module.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Schema extracted from supabase/functions/ai-risk-monitor/index.ts
// ═══════════════════════════════════════════════════════════════════════════
const RiskMonitorRequestSchema = z.object({}).strict();

describe("ai-risk-monitor Zod validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("RiskMonitorRequestSchema", () => {
    it("should accept empty input (strict empty object)", () => {
      const input = {};
      const result = RiskMonitorRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({});
      }
    });

    it("should reject any extra fields (strict mode)", () => {
      const input = { extra: "field" };
      const result = RiskMonitorRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject non-empty object", () => {
      const input = { test: true };
      const result = RiskMonitorRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject array input", () => {
      const input: unknown[] = [];
      const result = RiskMonitorRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject string input", () => {
      const input = "test";
      const result = RiskMonitorRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject null input", () => {
      const input = null;
      const result = RiskMonitorRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });
});