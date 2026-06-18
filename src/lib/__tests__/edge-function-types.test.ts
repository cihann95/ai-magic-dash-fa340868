import { describe, it, expect } from "vitest";
// Type-only module — just verify it compiles and types are correct
import type {
  AiAnalyzeResponse,
  AiStrategyResponse,
  DailyBriefResponse,
  NewsFeedResponse,
  ExecuteTradeResponse,
  PositionDisplay,
} from "@/lib/edge-function-types";

describe("edge-function-types", () => {
  it("AiAnalyzeResponse has analysis and optional error", () => {
    const resp: AiAnalyzeResponse = { analysis: "Buy BTC" };
    expect(resp.analysis).toBe("Buy BTC");
    expect(resp.error).toBeUndefined();
  });

  it("AiStrategyResponse has suggestion and optional error", () => {
    const resp: AiStrategyResponse = { suggestion: "Hold" };
    expect(resp.suggestion).toBe("Hold");
  });

  it("DailyBriefResponse has content and optional error", () => {
    const resp: DailyBriefResponse = { content: "Today's brief" };
    expect(resp.content).toBe("Today's brief");
  });

  it("NewsFeedResponse has items array", () => {
    const resp: NewsFeedResponse = {
      items: [
        {
          title: "BTC surges",
          source: "CoinDesk",
          url: "https://example.com",
          published_at: new Date().toISOString(),
          sentiment: "bullish",
        },
      ],
    };
    expect(resp.items).toHaveLength(1);
    expect(resp.items[0].sentiment).toBe("bullish");
  });

  it("ExecuteTradeResponse has price and optional fields", () => {
    const resp: ExecuteTradeResponse = {
      price: 60000,
      balance: 40000,
      pnl: 500,
      achievements: ["first_trade"],
    };
    expect(resp.price).toBe(60000);
    expect(resp.achievements).toContain("first_trade");
  });

  it("PositionDisplay extends DbPosition with optional pending", () => {
    const pos: PositionDisplay = {
      id: "pos-1",
      user_id: "user-1",
      symbol: "BTCUSD",
      side: "long",
      qty: 1,
      entry_price: 60000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      pending: true,
    };
    expect(pos.pending).toBe(true);
    expect(pos.symbol).toBe("BTCUSD");
  });
});
