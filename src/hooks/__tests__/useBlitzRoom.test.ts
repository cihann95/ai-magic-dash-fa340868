import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup, waitFor } from "@testing-library/react";

const {
  mockFrom,
  mockRemoveChannel,
  mockChannel,
  mockOn,
  mockSubscribe,
} = vi.hoisted(() => {
  const mockRemoveChannel = vi.fn();
  const mockOn = vi.fn();
  const mockSubscribe = vi.fn();
  const mockChannelObj = { on: mockOn, subscribe: mockSubscribe };
  mockOn.mockReturnValue(mockChannelObj);
  mockSubscribe.mockReturnValue(mockChannelObj);

  const mockFrom = vi.fn();

  const mockChannel = vi.fn(() => mockChannelObj);

  return { mockFrom, mockRemoveChannel, mockChannel, mockOn, mockSubscribe };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

import { useBlitzRoom } from "@/hooks/useBlitzRoom";

function _makeChainable(results: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  for (const [method, value] of Object.entries(results)) {
    if (typeof value === "function") {
      chain[method] = value;
    } else {
      chain[method] = vi.fn(() => value);
    }
  }
  return chain;
}

describe("useBlitzRoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOn.mockReturnValue({ on: mockOn, subscribe: mockSubscribe });
    mockSubscribe.mockReturnValue({ on: mockOn, subscribe: mockSubscribe });

    const eqResult = {
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue(eqResult),
    });
  });

  afterEach(async () => {
    await cleanup();
  });

  it("starts in loading state with null room", () => {
    const { result } = renderHook(() => useBlitzRoom("room-1"));
    expect(result.current.loading).toBe(true);
    expect(result.current.room).toBeNull();
    expect(result.current.participants).toEqual([]);
    expect(result.current.orders).toEqual([]);
  });

  it("does nothing when roomId is undefined", () => {
    const { result } = renderHook(() => useBlitzRoom(undefined));
    expect(result.current.loading).toBe(true);
    expect(result.current.room).toBeNull();
  });

  it("fetches room data and populates state", async () => {
    const mockRoom = { id: "room-1", symbol: "BTCUSD", status: "active" };
    const mockParticipants = [{ id: "p1", room_id: "room-1" }];
    const mockOrders = [{ id: "o1", room_id: "room-1" }];

    let _callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      _callCount++;
      if (table === "blitz_rooms") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockRoom, error: null }),
            }),
          }),
        };
      } else if (table === "blitz_participants") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: mockParticipants, error: null }),
          }),
        };
      } else {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: mockOrders, error: null }),
            }),
          }),
        };
      }
    });

    const { result } = renderHook(() => useBlitzRoom("room-1"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.room).toEqual(mockRoom);
    expect(result.current.participants).toHaveLength(1);
    expect(result.current.orders).toHaveLength(1);
  });

  it("subscribes to realtime channel for the room", async () => {
    const { result } = renderHook(() => useBlitzRoom("room-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockChannel).toHaveBeenCalledWith("blitz_room_room-1");
  });

  it("cleans up channel on unmount", async () => {
    const { unmount, result } = renderHook(() => useBlitzRoom("room-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it("cleans up when roomId changes", async () => {
    const { rerender, unmount, result } = renderHook(
      ({ id }) => useBlitzRoom(id),
      { initialProps: { id: "room-1" as string | undefined } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    rerender({ id: "room-2" });

    await waitFor(() => {
      expect(mockRemoveChannel).toHaveBeenCalled();
    });

    unmount();
  });
});
