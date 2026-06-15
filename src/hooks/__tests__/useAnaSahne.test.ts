import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

// ─── Hoisted mocks (vi.hoisted ensures availability in vi.mock factory) ───
const {
  mockSingle,
  mockTrack,
  mockRemoveChannel,
  mockFrom,
  mockChannel,
} = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockSingle = vi.fn();
  const mockTrack = vi.fn();
  const mockPresenceState = vi.fn(() => ({}));
  const mockRemoveChannel = vi.fn();
  const mockSubscribe = vi.fn();
  const mockOn = vi.fn();
  const mockChannelObj: Record<string, ReturnType<typeof vi.fn>> = {
    on: mockOn,
    subscribe: mockSubscribe,
    track: mockTrack,
    presenceState: mockPresenceState,
  };
  mockOn.mockReturnValue(mockChannelObj);
  mockSubscribe.mockReturnValue(mockChannelObj);

  const mockFrom = vi.fn(() => ({
    select: mockSelect.mockReturnValue({
      single: mockSingle,
    }),
  }));

  const mockChannel = vi.fn(() => mockChannelObj);

  return { mockSingle, mockTrack, mockRemoveChannel, mockFrom, mockChannel };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

import { useAnaSahne } from "@/hooks/useAnaSahne";

// ─── Helpers ──────────────────────────────────────────────────
const FAKE_ROOM = {
  id: "room-1",
  symbol: "BTC/USD",
  entry_fee: 10,
  status: "active",
  mode: "public",
  max_players: 8,
  starts_at: new Date(Date.now() + 30_000).toISOString(),
  ends_at: null,
  start_price: 60000,
  pot: 80,
  fee_collected: 4,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_featured: true,
  participants: [
    {
      user_id: "",
      username: "alice",
      side: "long",
      pnl: 5.5,
      pnlPct: 9.2,
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────
describe("useAnaSahne", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await cleanup();
  });

  it("starts in loading state with null room", () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useAnaSahne());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.room).toBeNull();
  });

  it("tracks presence with anonymous user_id on mount", () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    renderHook(() => useAnaSahne());

    expect(mockTrack).toHaveBeenCalledWith({ user_id: "anonymous" });
  });

  it("calls removeChannel on unmount (cleanup)", () => {
    mockSingle.mockResolvedValue({ data: null, error: null });

    const { unmount } = renderHook(() => useAnaSahne());
    unmount();

    expect(mockRemoveChannel).toHaveBeenCalledOnce();
  });

  it("fetches room data and populates state", async () => {
    mockSingle.mockResolvedValue({ data: FAKE_ROOM, error: null });

    const { result } = renderHook(() => useAnaSahne());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.room).not.toBeNull();
    expect(result.current.room!.id).toBe("room-1");
    expect(result.current.room!.symbol).toBe("BTC/USD");
    expect(result.current.participants).toHaveLength(1);
    expect(result.current.participants[0].username).toBe("alice");
    expect(result.current.isLoading).toBe(false);
  });

  it("detects finished status", async () => {
    mockSingle.mockResolvedValue({
      data: { ...FAKE_ROOM, status: "finished" },
      error: null,
    });

    const { result } = renderHook(() => useAnaSahne());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isFinished).toBe(true);
    expect(result.current.room!.status).toBe("finished");
  });

  it("sets error when fetch fails", async () => {
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "connection refused" },
    });

    const { result } = renderHook(() => useAnaSahne());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.error).toBe("connection refused");
    expect(result.current.isLoading).toBe(false);
  });
});
