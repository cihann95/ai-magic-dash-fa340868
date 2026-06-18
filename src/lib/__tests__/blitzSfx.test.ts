import { describe, it, expect, vi } from "vitest";
import { blitzSfx, vibrate } from "@/lib/blitzSfx";

describe("blitzSfx", () => {
  describe("blitzSfx object", () => {
    it("has all sound methods", () => {
      expect(typeof blitzSfx.tick).toBe("function");
      expect(typeof blitzSfx.open).toBe("function");
      expect(typeof blitzSfx.close).toBe("function");
      expect(typeof blitzSfx.win).toBe("function");
      expect(typeof blitzSfx.lose).toBe("function");
      expect(typeof blitzSfx.countdown).toBe("function");
    });

    it("does not throw when called (no AudioContext in jsdom)", () => {
      expect(() => blitzSfx.tick()).not.toThrow();
      expect(() => blitzSfx.open()).not.toThrow();
      expect(() => blitzSfx.close()).not.toThrow();
      expect(() => blitzSfx.win()).not.toThrow();
      expect(() => blitzSfx.lose()).not.toThrow();
      expect(() => blitzSfx.countdown()).not.toThrow();
    });
  });

  describe("vibrate()", () => {
    it("does not throw when navigator is available", () => {
      expect(() => vibrate(100)).not.toThrow();
      expect(() => vibrate([100, 50, 100])).not.toThrow();
    });

    it("calls navigator.vibrate if available", () => {
      const vibrateSpy = vi.fn();
      Object.defineProperty(navigator, "vibrate", {
        value: vibrateSpy,
        writable: true,
        configurable: true,
      });

      vibrate(200);
      expect(vibrateSpy).toHaveBeenCalledWith(200);
    });

    it("handles array patterns", () => {
      const vibrateSpy = vi.fn();
      Object.defineProperty(navigator, "vibrate", {
        value: vibrateSpy,
        writable: true,
        configurable: true,
      });

      vibrate([100, 50, 200]);
      expect(vibrateSpy).toHaveBeenCalledWith([100, 50, 200]);
    });
  });
});
