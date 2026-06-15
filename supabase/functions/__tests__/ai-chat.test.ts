import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

/**
 * ai-chat Zod validation tests
 *
 * Since the edge function uses Deno.serve() and ESM URL imports,
 * we extract the schema locally for testing without importing the module.
 */

// ═══════════════════════════════════════════════════════════════════════════
// Schema extracted from supabase/functions/ai-chat/index.ts
// ═══════════════════════════════════════════════════════════════════════════
const SYMBOL_RE = /^[A-Z0-9.-]{1,16}$/;
const MAX_MESSAGES = 20;
const MAX_MSG_LEN = 4000;

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(MAX_MSG_LEN),
});

const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema).min(1).max(MAX_MESSAGES),
  language: z.enum(["tr", "en"]).default("tr"),
  context_symbol: z.string().regex(SYMBOL_RE).optional(),
});

describe("ai-chat Zod validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("ChatMessageSchema", () => {
    it("should accept valid user message", () => {
      const input = { role: "user", content: "Hello, how are you?" };
      const result = ChatMessageSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept valid assistant message", () => {
      const input = { role: "assistant", content: "I'm doing well!" };
      const result = ChatMessageSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should accept valid system message", () => {
      const input = { role: "system", content: "You are a helpful assistant." };
      const result = ChatMessageSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it("should reject empty content", () => {
      const input = { role: "user", content: "" };
      const result = ChatMessageSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject content too long", () => {
      const input = { role: "user", content: "a".repeat(4001) };
      const result = ChatMessageSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid role", () => {
      const input = { role: "invalid", content: "test" };
      const result = ChatMessageSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe("ChatRequestSchema", () => {
    it("should accept valid input with messages array", () => {
      const input = {
        messages: [
          { role: "user", content: "Hello" },
          { role: "assistant", content: "Hi there!" },
        ],
        language: "tr",
      };
      const result = ChatRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messages).toHaveLength(2);
        expect(result.data.language).toBe("tr");
      }
    });

    it("should accept valid input with context_symbol", () => {
      const input = {
        messages: [{ role: "user", content: "Analyze BTC" }],
        language: "en",
        context_symbol: "BTCUSDT",
      };
      const result = ChatRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.context_symbol).toBe("BTCUSDT");
      }
    });

    it("should accept minimal valid input", () => {
      const input = { messages: [{ role: "user", content: "Hi" }] };
      const result = ChatRequestSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.language).toBe("tr");
      }
    });

    it("should reject empty messages array", () => {
      const input = { messages: [] };
      const result = ChatRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject too many messages", () => {
      const messages = Array(21).fill({ role: "user", content: "test" });
      const input = { messages };
      const result = ChatRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid message in array", () => {
      const input = {
        messages: [
          { role: "user", content: "valid" },
          { role: "user", content: "" },
        ],
      };
      const result = ChatRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid context_symbol format", () => {
      const input = {
        messages: [{ role: "user", content: "test" }],
        context_symbol: "btcusdt",
      };
      const result = ChatRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject invalid language", () => {
      const input = {
        messages: [{ role: "user", content: "test" }],
        language: "fr",
      };
      const result = ChatRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject missing messages", () => {
      const input = { language: "tr" };
      const result = ChatRequestSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("should reject empty body", () => {
      const result = ChatRequestSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});