import { describe, it, expect } from "vitest";
import { ConfigError } from "@/lib/config";

describe("config", () => {
  describe("ConfigError", () => {
    it("is an instance of Error", () => {
      const err = new ConfigError("VITE_SUPABASE_URL");
      expect(err).toBeInstanceOf(Error);
    });

    it("has name 'ConfigError'", () => {
      const err = new ConfigError("VITE_SUPABASE_URL");
      expect(err.name).toBe("ConfigError");
    });

    it("includes variable name in message", () => {
      const err = new ConfigError("VITE_SUPABASE_URL");
      expect(err.message).toBe("VITE_SUPABASE_URL is required but not set");
    });
  });

  describe("frontendConfig (module load)", () => {
    it("can be imported without throwing when env vars are set", async () => {
      const { frontendConfig } = await import("@/lib/config");
      expect(frontendConfig).toBeDefined();
      expect(typeof frontendConfig.supabaseUrl).toBe("string");
      expect(typeof frontendConfig.supabasePublishableKey).toBe("string");
      expect(typeof frontendConfig.anaSahneEnabled).toBe("boolean");
      expect(typeof frontendConfig.vapidPublicKey).toBe("string");
      expect(typeof frontendConfig.sentryDsn).toBe("string");
    });

    it("has anaSahneEnabled as boolean", async () => {
      const { frontendConfig } = await import("@/lib/config");
      expect(typeof frontendConfig.anaSahneEnabled).toBe("boolean");
    });

    it("config object is frozen", async () => {
      const { frontendConfig } = await import("@/lib/config");
      expect(Object.isFrozen(frontendConfig)).toBe(true);
    });
  });
});
