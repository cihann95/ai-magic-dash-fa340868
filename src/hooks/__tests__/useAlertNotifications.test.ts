import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { createSupabaseMocks as _createSupabaseMocks } from "@/test-utils/mocks";

// Mock AppContext
const mockUser = { id: "user-1", email: "test@example.com" };
vi.mock("@/contexts/AppContext", () => ({
  useApp: () => ({
    user: mockUser,
    lang: "en",
  }),
}));

// Mock toast
const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({
  toast: (...args: unknown[]) => toastSpy(...args),
}));

// Mock supabase
const {
  mockChannel,
  mockOn,
  mockSubscribe,
  mockRemoveChannel,
} = vi.hoisted(() => {
  const mockOn = vi.fn();
  const mockSubscribe = vi.fn();
  const mockRemoveChannel = vi.fn();
  const mockChannelObj = { on: mockOn, subscribe: mockSubscribe };
  mockOn.mockReturnValue(mockChannelObj);
  mockSubscribe.mockReturnValue(mockChannelObj);

  return {
    mockChannel: vi.fn(() => mockChannelObj),
    mockOn,
    mockSubscribe,
    mockRemoveChannel,
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  },
}));

import { useAlertNotifications } from "@/hooks/useAlertNotifications";

describe("useAlertNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOn.mockReturnValue({ on: mockOn, subscribe: mockSubscribe });
    mockSubscribe.mockReturnValue({ on: mockOn, subscribe: mockSubscribe });
  });

  afterEach(async () => {
    await cleanup();
  });

  it("subscribes to price_alerts channel for the user", () => {
    renderHook(() => useAlertNotifications());

    expect(mockChannel).toHaveBeenCalledWith("price_alerts_user");
    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "UPDATE",
        table: "price_alerts",
        filter: "user_id=eq.user-1",
      }),
      expect.any(Function)
    );
  });

  it("cleans up channel on unmount", () => {
    const { unmount } = renderHook(() => useAlertNotifications());
    unmount();
    expect(mockRemoveChannel).toHaveBeenCalled();
  });

  it("shows toast when triggered alert is received", () => {
    renderHook(() => useAlertNotifications());

    // Get the callback registered via .on()
    const onCall = mockOn.mock.calls.find(
      (call) => call[0] === "postgres_changes"
    );
    expect(onCall).toBeDefined();

    // Simulate a triggered alert
    const callback = onCall![2];
    act(() => {
      callback({
        new: {
          triggered: true,
          symbol: "BTCUSD",
          direction: "above",
          target_price: 70000,
        },
      });
    });

    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining("Price Alert"),
      })
    );
  });

  it("does not show toast for non-triggered alerts", () => {
    renderHook(() => useAlertNotifications());

    const onCall = mockOn.mock.calls.find(
      (call) => call[0] === "postgres_changes"
    );
    const callback = onCall![2];

    act(() => {
      callback({
        new: {
          triggered: false,
          symbol: "BTCUSD",
          direction: "above",
          target_price: 70000,
        },
      });
    });

    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("sets up postgres_changes subscription with correct filter", () => {
    renderHook(() => useAlertNotifications());

    expect(mockOn).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        event: "UPDATE",
        table: "price_alerts",
        filter: "user_id=eq.user-1",
      }),
      expect.any(Function)
    );
  });
});
