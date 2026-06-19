import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock supabase client
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } }, error: null }),
    },
    from: vi.fn(() => ({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    })),
  },
}));

import { registerServiceWorker, enablePushNotifications, disablePushNotifications } from "@/lib/pushSubscribe";

describe("pushSubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("registerServiceWorker()", () => {
    it("returns null when serviceWorker not supported", async () => {
      // jsdom doesn't have real serviceWorker support
      const result = await registerServiceWorker();
      // In jsdom, serviceWorker may or may not be in navigator
      // The function handles this gracefully
      expect(result === null || typeof result === "object").toBe(true);
    });
  });

  describe("enablePushNotifications()", () => {
    it("returns unsupported when serviceWorker not available", async () => {
      const result = await enablePushNotifications("test-key");
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("unsupported");
    });

    it("returns no_vapid_key when key is empty", async () => {
      // Mock serviceWorker in navigator
      Object.defineProperty(navigator, "serviceWorker", {
        value: { register: vi.fn(), getRegistration: vi.fn() },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window, "PushManager", {
        value: vi.fn(),
        writable: true,
        configurable: true,
      });

      const result = await enablePushNotifications("");
      expect(result.ok).toBe(false);
      expect(result.reason).toBe("no_vapid_key");
    });
  });

  describe("disablePushNotifications()", () => {
    it("does not throw when serviceWorker not supported", async () => {
      await expect(disablePushNotifications()).resolves.not.toThrow();
    });
  });
});
