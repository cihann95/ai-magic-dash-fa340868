import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup } from "@testing-library/react";

// Hoisted mocks
const mockSelect = vi.hoisted(() => vi.fn().mockResolvedValue({ data: [], error: null }));
const mockOn = vi.hoisted(() => vi.fn());
const mockSubscribe = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
    })),
    channel: vi.fn(() => {
      const mockChannelObj = {
        on: mockOn,
        subscribe: mockSubscribe,
      };
      mockOn.mockReturnValue(mockChannelObj);
      mockSubscribe.mockReturnValue(mockChannelObj);
      return mockChannelObj;
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/lib/binanceStream", () => ({
  startBinanceStream: vi.fn(() => vi.fn()),
}));

import { useLivePrice, useLivePrices } from "@/hooks/useLivePrices";

describe("useLivePrice (single symbol)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockSelect.mockResolvedValue({ data: [], error: null });
    // Reset singleton state
    if (typeof window !== "undefined") {
      delete (window as Record<string, unknown>).__price_state;
    }
  });

  afterEach(async () => {
    if (typeof window !== "undefined") {
      delete (window as Record<string, unknown>).__price_state;
    }
    await cleanup();
  });

  it("returns null when no symbol provided", () => {
    const { result } = renderHook(() => useLivePrice());
    expect(result.current).toBeNull();
  });

  it("returns null for unknown symbol initially", () => {
    const { result } = renderHook(() => useLivePrice("BTCUSD"));
    expect(result.current).toBeNull();
  });
});

describe("useLivePrices (multiple symbols)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelect.mockReset();
    mockSelect.mockResolvedValue({ data: [], error: null });
    if (typeof window !== "undefined") {
      delete (window as Record<string, unknown>).__price_state;
    }
  });

  afterEach(async () => {
    if (typeof window !== "undefined") {
      delete (window as Record<string, unknown>).__price_state;
    }
    await cleanup();
  });

  it("returns empty object for empty symbols array", () => {
    const { result } = renderHook(() => useLivePrices([]));
    expect(result.current).toEqual({});
  });
});