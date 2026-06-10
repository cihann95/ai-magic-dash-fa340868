import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

// ─── Hoisted mocks (vi.hoisted ensures availability in vi.mock factory) ───
const {
  mockRemoveChannel,
  mockSubscribe,
  mockOn,
  mockSend,
  mockChannelObj,
  mockChannel,
  mockFrom,
} = vi.hoisted(() => {
  const mockRemoveChannel = vi.fn();
  const mockSubscribe = vi.fn();
  const mockOn = vi.fn();
  const mockSend = vi.fn();

  const mockChannelObj: Record<string, ReturnType<typeof vi.fn>> = {
    on: mockOn,
    subscribe: mockSubscribe,
    send: mockSend,
  };
  mockOn.mockReturnValue(mockChannelObj);
  mockSubscribe.mockReturnValue(mockChannelObj);

  const mockFrom = vi.fn();
  const mockChannel = vi.fn(() => mockChannelObj);

  return {
    mockRemoveChannel,
    mockSubscribe,
    mockOn,
    mockSend,
    mockChannelObj,
    mockChannel,
    mockFrom,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

import { useSpectatorBroadcast } from "@/hooks/useSpectatorBroadcast";

// ─── Tests ────────────────────────────────────────────────────
describe("useSpectatorBroadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-bind return values cleared by some mock implementations
    mockOn.mockReturnValue(mockChannelObj);
    mockSubscribe.mockReturnValue(mockChannelObj);
    vi.useFakeTimers({ now: 1_000_000 });
  });

  afterEach(async () => {
    vi.useRealTimers();
    await cleanup();
  });

  // ── Test I: Emoji rate limiting ─────────────────────────────
  it("Test I — throttles emoji at 333ms (~3/5 succeed)", async () => {
    const { result } = renderHook(() =>
      useSpectatorBroadcast({
        roomId: "room-1",
        userId: "user-1",
        username: "Player1",
      }),
    );

    // Attempt 5 emoji sends within ~1 second
    // t=0ms: first succeeds, second blocked
    expect(result.current.sendEmoji("🔥")).toBe(true);
    expect(result.current.sendEmoji("💯")).toBe(false);

    // t=350ms: third succeeds (350 >= 333)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(result.current.sendEmoji("🎉")).toBe(true);

    // t=700ms: fourth succeeds, fifth blocked
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(result.current.sendEmoji("🔥")).toBe(true);
    expect(result.current.sendEmoji("💯")).toBe(false);

    // Only 3 channel.send() calls total
    expect(mockSend).toHaveBeenCalledTimes(3);
  });

  // ── Test J: Chat rate limiting ──────────────────────────────
  it("Test J — enforces 2-second chat rate limit", async () => {
    const { result } = renderHook(() =>
      useSpectatorBroadcast({
        roomId: "room-1",
        userId: "user-1",
        username: "Player1",
      }),
    );

    // First chat sends
    expect(result.current.sendChat("Hello")).toBe(true);
    // Second immediately blocked (same tick)
    expect(result.current.sendChat("World")).toBe(false);

    // Advance 2 seconds
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Third sends after cooldown
    expect(result.current.sendChat("After delay")).toBe(true);
  });

  // ── Test K: Broadcast reconnect ────────────────────────────
  it("Test K — reconnects after CHANNEL_ERROR", async () => {
    let subscribeCb: ((status: string) => void) | undefined;

    mockSubscribe.mockImplementation(
      (cb: (status: string) => void) => {
        subscribeCb = cb;
        return mockChannelObj;
      },
    );

    const { result } = renderHook(() =>
      useSpectatorBroadcast({ roomId: "room-1" }),
    );

    // Initially disconnected
    expect(result.current.isConnected).toBe(false);

    // Simulate successful subscription
    await act(async () => {
      subscribeCb?.("SUBSCRIBED");
    });
    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();

    // Simulate channel error → disconnect
    await act(async () => {
      subscribeCb?.("CHANNEL_ERROR");
    });
    expect(result.current.isConnected).toBe(false);
    expect(result.current.error).toBe("Broadcast connection failed");

    // Simulate re-subscription → reconnected
    await act(async () => {
      subscribeCb?.("SUBSCRIBED");
    });
    expect(result.current.isConnected).toBe(true);
  });

  // ── Test L: Chat message cap ───────────────────────────────
  it("Test L — caps chat at 50 messages, evicting oldest 10", async () => {
    let broadcastHandler:
      | ((payload: { payload: Record<string, unknown> }) => void)
      | undefined;

    mockOn.mockImplementation(
      (
        event: string,
        filter: { event: string },
        handler: (payload: { payload: Record<string, unknown> }) => void,
      ) => {
        if (event === "broadcast" && filter.event === "spectator_event") {
          broadcastHandler = handler;
        }
        return mockChannelObj;
      },
    );

    const { result } = renderHook(() =>
      useSpectatorBroadcast({ roomId: "room-1" }),
    );

    expect(broadcastHandler).toBeDefined();

    // Simulate receiving 60 chat broadcasts
    await act(async () => {
      for (let i = 0; i < 60; i++) {
        broadcastHandler!({
          payload: {
            type: "chat",
            text: `Message ${i}`,
            username: "User",
            user_id: "user-1",
            timestamp: 1_000_000 + i,
            id: `msg-${i}`,
          },
        });
      }
    });

    // Only 50 stored
    expect(result.current.chatMessages).toHaveLength(50);

    // Oldest 10 evicted (msg-0 through msg-9 gone)
    expect(result.current.chatMessages[0].id).toBe("msg-10");
    expect(result.current.chatMessages[49].id).toBe("msg-59");
  });
});
