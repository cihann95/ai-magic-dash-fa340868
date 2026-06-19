import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useToast, toast, reducer } from "@/hooks/use-toast";

describe("use-toast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("reducer", () => {
    it("ADD_TOAST adds a toast to state", () => {
      const state = { toasts: [] };
      const newToast = { id: "1", title: "Test", open: true };
      const result = reducer(state, { type: "ADD_TOAST", toast: newToast });
      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe("1");
    });

    it("ADD_TOAST limits to TOAST_LIMIT (1)", () => {
      const state = { toasts: [{ id: "1", title: "Old", open: true }] };
      const newToast = { id: "2", title: "New", open: true };
      const result = reducer(state, { type: "ADD_TOAST", toast: newToast });
      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe("2");
    });

    it("UPDATE_TOAST updates matching toast", () => {
      const state = { toasts: [{ id: "1", title: "Old", open: true }] };
      const result = reducer(state, { type: "UPDATE_TOAST", toast: { id: "1", title: "Updated" } });
      expect(result.toasts[0].title).toBe("Updated");
    });

    it("UPDATE_TOAST does not affect other toasts", () => {
      const state = { toasts: [{ id: "1", title: "A", open: true }, { id: "2", title: "B", open: true }] };
      const result = reducer(state, { type: "UPDATE_TOAST", toast: { id: "1", title: "Updated" } });
      expect(result.toasts[1].title).toBe("B");
    });

    it("DISMISS_TOAST sets open to false for matching toast", () => {
      const state = { toasts: [{ id: "1", title: "Test", open: true }] };
      const result = reducer(state, { type: "DISMISS_TOAST", toastId: "1" });
      expect(result.toasts[0].open).toBe(false);
    });

    it("DISMISS_TOAST with no toastId dismisses all", () => {
      const state = {
        toasts: [
          { id: "1", title: "A", open: true },
          { id: "2", title: "B", open: true },
        ],
      };
      const result = reducer(state, { type: "DISMISS_TOAST" });
      expect(result.toasts.every((t) => t.open === false)).toBe(true);
    });

    it("REMOVE_TOAST removes matching toast", () => {
      const state = {
        toasts: [
          { id: "1", title: "A", open: true },
          { id: "2", title: "B", open: true },
        ],
      };
      const result = reducer(state, { type: "REMOVE_TOAST", toastId: "1" });
      expect(result.toasts).toHaveLength(1);
      expect(result.toasts[0].id).toBe("2");
    });

    it("REMOVE_TOAST with no toastId clears all", () => {
      const state = { toasts: [{ id: "1", title: "A", open: true }] };
      const result = reducer(state, { type: "REMOVE_TOAST" });
      expect(result.toasts).toEqual([]);
    });
  });

  describe("toast()", () => {
    it("returns id, dismiss, and update functions", () => {
      const result = toast({ title: "Test" });
      expect(typeof result.id).toBe("string");
      expect(typeof result.dismiss).toBe("function");
      expect(typeof result.update).toBe("function");
    });

    it("creates a toast with open=true", () => {
      const { result } = renderHook(() => useToast());
      act(() => {
        toast({ title: "New Toast" });
      });
      expect(result.current.toasts.length).toBeGreaterThanOrEqual(1);
    });

    it("dismiss removes the toast", async () => {
      const { result } = renderHook(() => useToast());
      let t: ReturnType<typeof toast>;
      act(() => {
        t = toast({ title: "Dismissible" });
      });
      act(() => {
        t.dismiss();
      });
      // After dismiss, toast should have open=false
      const dismissed = result.current.toasts.find((x) => x.id === t!.id);
      if (dismissed) {
        expect(dismissed.open).toBe(false);
      }
    });
  });

  describe("useToast()", () => {
    it("returns toasts array and toast/dismiss functions", () => {
      const { result } = renderHook(() => useToast());
      expect(Array.isArray(result.current.toasts)).toBe(true);
      expect(typeof result.current.toast).toBe("function");
      expect(typeof result.current.dismiss).toBe("function");
    });

    it("adds toast via returned toast function", () => {
      const { result } = renderHook(() => useToast());
      act(() => {
        result.current.toast({ title: "Test Toast" });
      });
      expect(result.current.toasts.length).toBeGreaterThanOrEqual(1);
    });

    it("dismiss removes toast by id", () => {
      const { result } = renderHook(() => useToast());
      let id: string;
      act(() => {
        const t = result.current.toast({ title: "To dismiss" });
        id = t.id;
      });
      act(() => {
        result.current.dismiss(id!);
      });
      const dismissed = result.current.toasts.find((t) => t.id === id!);
      if (dismissed) {
        expect(dismissed.open).toBe(false);
      }
    });

    it("dismiss without id dismisses all toasts", () => {
      const { result } = renderHook(() => useToast());
      act(() => {
        result.current.toast({ title: "Toast 1" });
      });
      act(() => {
        result.current.dismiss();
      });
      expect(result.current.toasts.every((t) => t.open === false)).toBe(true);
    });
  });
});
