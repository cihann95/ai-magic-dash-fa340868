import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useIsMobile } from "@/hooks/use-mobile";

describe("useIsMobile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanup();
  });

  it("returns false when window width is >= 768", () => {
    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true, configurable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when window width is < 768", () => {
    Object.defineProperty(window, "innerWidth", { value: 500, writable: true, configurable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("returns false initially when width is exactly 768 (not less than)", () => {
    Object.defineProperty(window, "innerWidth", { value: 768, writable: true, configurable: true });
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("responds to matchMedia changes", () => {
    let changeHandler: (() => void) | undefined;
    const addEventListenerSpy = vi.fn((event: string, handler: () => void) => {
      if (event === "change") changeHandler = handler;
    });
    const removeEventListenerSpy = vi.fn();

    Object.defineProperty(window, "matchMedia", {
      value: (query: string) => ({
        matches: false,
        media: query,
        addEventListener: addEventListenerSpy,
        removeEventListener: removeEventListenerSpy,
      }),
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, "innerWidth", { value: 1024, writable: true, configurable: true });

    const { result, unmount } = renderHook(() => useIsMobile());

    expect(addEventListenerSpy).toHaveBeenCalledWith("change", expect.any(Function));

    // Simulate viewport change
    Object.defineProperty(window, "innerWidth", { value: 500, writable: true, configurable: true });
    act(() => {
      changeHandler?.();
    });

    expect(result.current).toBe(true);

    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalled();
  });
});
