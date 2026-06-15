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

vi.stubGlobal("fetch", mockFetch);

vi.stubGlobal("Deno", {
  env: {
    get: vi.fn((key: string) => {
      if (key === "SUPABASE_URL") return "https://test.supabase.co";
      if (key === "SUPABASE_SERVICE_ROLE_KEY") return "test-service-role-key";
      return undefined;
    }),
  },
  serve: vi.fn(),
});

import { RiskMonitorRequestSchema } from "../ai-risk-monitor/index.ts";

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
      const input = [];
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