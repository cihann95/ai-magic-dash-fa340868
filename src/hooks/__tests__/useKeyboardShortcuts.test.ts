import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

function pressKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent("keydown", { key, ...opts });
  window.dispatchEvent(event);
}

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await cleanup();
  });

  it("navigates to home on g then h", () => {
    renderHook(() => useKeyboardShortcuts());
    pressKey("g");
    act(() => { vi.advanceTimersByTime(100); });
    pressKey("h");
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("navigates to portfolio on g then p", () => {
    renderHook(() => useKeyboardShortcuts());
    pressKey("g");
    act(() => { vi.advanceTimersByTime(100); });
    pressKey("p");
    expect(mockNavigate).toHaveBeenCalledWith("/portfolio");
  });

  it("navigates to insights on g then i", () => {
    renderHook(() => useKeyboardShortcuts());
    pressKey("g");
    act(() => { vi.advanceTimersByTime(100); });
    pressKey("i");
    expect(mockNavigate).toHaveBeenCalledWith("/insights");
  });

  it("navigates to journal on g then j", () => {
    renderHook(() => useKeyboardShortcuts());
    pressKey("g");
    act(() => { vi.advanceTimersByTime(100); });
    pressKey("j");
    expect(mockNavigate).toHaveBeenCalledWith("/journal");
  });

  it("dispatches show-shortcuts-help on ?", () => {
    const handler = vi.fn();
    window.addEventListener("show-shortcuts-help", handler);
    renderHook(() => useKeyboardShortcuts());
    pressKey("?");
    expect(handler).toHaveBeenCalled();
    window.removeEventListener("show-shortcuts-help", handler);
  });

  it("ignores keydown when typing in input", () => {
    renderHook(() => useKeyboardShortcuts());
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    // Dispatch on the input element so event.target is the input (bubbles to window)
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
    act(() => { vi.advanceTimersByTime(100); });
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true }));

    expect(mockNavigate).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("ignores keydown when Ctrl modifier is held", () => {
    renderHook(() => useKeyboardShortcuts());
    pressKey("g", { ctrlKey: true });
    act(() => { vi.advanceTimersByTime(100); });
    pressKey("h", { ctrlKey: true });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("resets pending g after timeout", () => {
    renderHook(() => useKeyboardShortcuts());
    pressKey("g");
    act(() => { vi.advanceTimersByTime(900); }); // > 800ms timeout
    pressKey("h");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("navigates to coach on g then c", () => {
    renderHook(() => useKeyboardShortcuts());
    pressKey("g");
    act(() => { vi.advanceTimersByTime(100); });
    pressKey("c");
    expect(mockNavigate).toHaveBeenCalledWith("/coach");
  });

  it("navigates to settings on g then s", () => {
    renderHook(() => useKeyboardShortcuts());
    pressKey("g");
    act(() => { vi.advanceTimersByTime(100); });
    pressKey("s");
    expect(mockNavigate).toHaveBeenCalledWith("/settings");
  });
});
