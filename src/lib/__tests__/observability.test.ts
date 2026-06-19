import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { observability } from "@/lib/observability";

describe("observability", () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    debug: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("info()", () => {
    it("formats the prefix correctly for info level", () => {
      observability.info("test-service", "test-event");
      expect(consoleSpy.log).not.toHaveBeenCalled();
      expect(consoleSpy.warn).not.toHaveBeenCalled();
      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it("calls warn or error for warn/error levels regardless of isDev", () => {
      observability.warn("svc", "w");
      expect(consoleSpy.warn).toHaveBeenCalledWith("[svc] w");
      observability.error("svc", "e");
      expect(consoleSpy.error).toHaveBeenCalledWith("[svc] e");
    });
  });

  describe("warn()", () => {
    it("logs warnings to console.warn", () => {
      observability.warn("test-service", "warning-event");
      expect(consoleSpy.warn).toHaveBeenCalledWith("[test-service] warning-event");
    });

    it("includes metadata when provided", () => {
      observability.warn("test-service", "warning-event", { detail: 42 });
      expect(consoleSpy.warn).toHaveBeenCalledWith("[test-service] warning-event", { detail: 42 });
    });
  });

  describe("error()", () => {
    it("logs errors to console.error", () => {
      observability.error("test-service", "error-event");
      expect(consoleSpy.error).toHaveBeenCalledWith("[test-service] error-event");
    });

    it("includes metadata when provided", () => {
      observability.error("test-service", "error-event", { stack: "trace" });
      expect(consoleSpy.error).toHaveBeenCalledWith("[test-service] error-event", { stack: "trace" });
    });
  });

  describe("debug()", () => {
    it("does not log debug messages in non-dev mode", () => {
      observability.debug("test-service", "debug-event");
      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });
  });

  describe("timed()", () => {
    it("resolves without error on successful function", async () => {
      await expect(
        observability.timed("svc", "event", async () => {})
      ).resolves.toBeUndefined();
    });

    it("rejects with the original error on failed function", async () => {
      await expect(
        observability.timed("svc", "event", async () => {
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");
    });

    it("logs error on rejected promise", async () => {
      await expect(
        observability.timed("svc", "event", async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow();

      expect(consoleSpy.error).toHaveBeenCalledWith(
        "[svc] event",
        expect.objectContaining({
          error: "Error: fail",
          durationMs: expect.any(Number),
        })
      );
    });
  });
});
