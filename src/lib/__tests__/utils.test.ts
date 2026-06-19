import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("utils", () => {
  describe("cn()", () => {
    it("merges class names", () => {
      const result = cn("foo", "bar");
      expect(result).toBe("foo bar");
    });

    it("handles conditional classes", () => {
      const result = cn("base", undefined, "extra");
      expect(result).toContain("base");
      expect(result).not.toContain("hidden");
      expect(result).toContain("extra");
    });

    it("deduplicates tailwind classes", () => {
      const result = cn("p-4", "p-8");
      expect(result).toBe("p-8");
    });

    it("returns empty string for no args", () => {
      expect(cn()).toBe("");
    });

    it("handles undefined and null", () => {
      const result = cn("base", undefined, null);
      expect(result).toBe("base");
    });
  });
});
