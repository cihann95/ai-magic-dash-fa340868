import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

// ─── Hoisted mocks ───
const { mockRpc } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mockRpc,
  },
}));

import { useAnalytics } from "@/hooks/useAnalytics";

// ─── Tests ────────────────────────────────────────────────────
describe("useAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await cleanup();
  });

  it("Test M — tracks analytics event with correct arguments", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useAnalytics());

    await act(async () => {
      await result.current.track("blitz_created", { room_id: "xyz" });
    });

    expect(mockRpc).toHaveBeenCalledWith("insert_analytics_event", {
      _event_type: "blitz_created",
      _payload: { room_id: "xyz" },
    });
  });

  it("Test N — does not throw when analytics fails (fire-and-forget)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockRpc.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useAnalytics());

    await act(async () => {
      await expect(
        result.current.track("blitz_created"),
      ).resolves.toBeUndefined();
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "analytics: failed to track",
      "blitz_created",
    );

    warnSpy.mockRestore();
  });

  it("defaults payload to empty object when not provided", async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useAnalytics());

    await act(async () => {
      await result.current.track("ana_sahne_viewed");
    });

    expect(mockRpc).toHaveBeenCalledWith("insert_analytics_event", {
      _event_type: "ana_sahne_viewed",
      _payload: {},
    });
  });
});
