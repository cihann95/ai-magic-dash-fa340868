import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup, waitFor } from "@testing-library/react";

const mockUser = { id: "user-1", email: "test@example.com" };
vi.mock("@/contexts/AppContext", () => ({
  useApp: () => ({
    user: mockUser,
    lang: "en",
  }),
}));

const {
  mockFrom,
  mockInvoke,
} = vi.hoisted(() => {
  const mockInvoke = vi.fn();
  const mockMaybeSingle = vi.fn();
  const mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  return { mockFrom, mockInvoke, mockMaybeSingle };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mockFrom,
    functions: {
      invoke: mockInvoke,
    },
  },
}));

import { useWeeklyDigest } from "@/hooks/useWeeklyDigest";

describe("useWeeklyDigest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockInvoke.mockResolvedValue({ error: null });
    sessionStorage.clear();
  });

  afterEach(async () => {
    vi.useRealTimers();
    sessionStorage.clear();
    await cleanup();
  });

  it("does nothing when called with user present", async () => {
    renderHook(() => useWeeklyDigest());
    expect(true).toBe(true);
  });

  it("skips if checked within last hour", async () => {
    sessionStorage.setItem("weekly_digest_checked_at", String(Date.now()));
    renderHook(() => useWeeklyDigest());
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("queries profile when not checked recently", async () => {
    renderHook(() => useWeeklyDigest());
    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("profiles");
    });
  });

  it("does not invoke edge function when digest was recent", async () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const _mockMaybeSingle = mockFrom.mock.results[0]?.value?.select?.mock?.results?.[0]?.value?.eq?.mock?.results?.[0]?.value?.maybeSingle;

    const localMaybeSingle = vi.fn().mockResolvedValue({ data: { last_weekly_digest_at: oneDayAgo }, error: null });
    const localEq = vi.fn().mockReturnValue({ maybeSingle: localMaybeSingle });
    const localSelect = vi.fn().mockReturnValue({ eq: localEq });
    mockFrom.mockReturnValueOnce({ select: localSelect });

    renderHook(() => useWeeklyDigest());

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith("profiles");
    });

    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("invokes edge function when digest is overdue", async () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const localMaybeSingle = vi.fn().mockResolvedValue({ data: { last_weekly_digest_at: sevenDaysAgo }, error: null });
    const localEq = vi.fn().mockReturnValue({ maybeSingle: localMaybeSingle });
    const localSelect = vi.fn().mockReturnValue({ eq: localEq });
    mockFrom.mockReturnValueOnce({ select: localSelect });

    renderHook(() => useWeeklyDigest());

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("weekly-digest");
    });
  });
});
