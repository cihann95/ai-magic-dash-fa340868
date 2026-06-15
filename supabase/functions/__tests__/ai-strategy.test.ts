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

vi.stubGlobal("fetch", mockFetch);

vi.stubGlobal("Deno", {
  env: {
    get: vi.fn((key: string) => {
      if (key === "SUPABASE_URL") return "https://test.supabase.co";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-role-key";
      if (key === "LOVABLE_API_KEY") return "test-lovable-key";
      return undefined;
    }),
  },
  serve: vi.fn(),
});

import { StrategyRequestSchema } from "../ai-strategy/index.ts";

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