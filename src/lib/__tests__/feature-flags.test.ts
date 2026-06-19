import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasFeature, getFeatureFlags } from "@/lib/feature-flags";

describe("feature-flags", () => {

  beforeEach(() => {
    vi.resetModules();
  });

  describe("hasFeature()", () => {
    it("reads the current env var value", () => {
      // The .env file sets VITE_ANA_SAHNE_ENABLED=true, so it reads as true
      const envVal = import.meta.env.VITE_ANA_SAHNE_ENABLED;
      expect(hasFeature("ana-sahne")).toBe(envVal === "true");
    });

    it("returns false when env var is 'false'", () => {
      vi.stubEnv("VITE_ANA_SAHNE_ENABLED", "false");
      expect(hasFeature("ana-sahne")).toBe(false);
    });

    it("returns false when env var is empty string", () => {
      vi.stubEnv("VITE_ANA_SAHNE_ENABLED", "");
      expect(hasFeature("ana-sahne")).toBe(false);
    });

    it("returns true when env var is 'true'", () => {
      vi.stubEnv("VITE_ANA_SAHNE_ENABLED", "true");
      expect(hasFeature("ana-sahne")).toBe(true);
    });

    it("is case-sensitive - 'TRUE' returns false", () => {
      vi.stubEnv("VITE_ANA_SAHNE_ENABLED", "TRUE");
      expect(hasFeature("ana-sahne")).toBe(false);
    });
  });

  describe("getFeatureFlags()", () => {
    it("returns all flags as false by default", () => {
      const flags = getFeatureFlags();
      expect(flags.anaSahne).toBe(false);
    });

    it("returns anaSahne=true when env var is set", () => {
      vi.stubEnv("VITE_ANA_SAHNE_ENABLED", "true");
      const flags = getFeatureFlags();
      expect(flags.anaSahne).toBe(true);
    });
  });
});
