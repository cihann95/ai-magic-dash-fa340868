import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateClient, mockAuthGetUser, mockRateLimit, mockFetch } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
  mockAuthGetUser: vi.fn(),
  mockRateLimit: vi.fn().mockResolvedValue(null),
  mockFetch: vi.fn(),
}));

vi.mock("https://esm.sh/@supabase/supabase-js@2.45.0", () => ({
  createClient: mockCreateClient,
}));

vi.mock("../_shared/rate-limit.ts", () => ({
  rateLimit: mockRateLimit,
}));

vi.mock("../_shared/blitz-types.ts", () => ({
  Admin: vi.fn(),
}));

vi.stubGlobal("fetch", mockFetch);

vi.stubGlobal("Deno", {
  env: {
    get: vi.fn((key: string) => {
      if (key === "SUPABASE_URL") return "https://test.supabase.co";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-role-key";
      if (key === "SUPABASE_ANON_KEY") return "test-anon-key";
      if (key === "LOVABLE_API_KEY") return "test-lovable-key";
      return undefined;
    }),
  },
  serve: vi.fn(),
});

import { TradeCoachRequestSchema } from "../ai-trade-coach/index.ts";

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