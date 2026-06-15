/**
 * Test Utils — Compilation & Smoke Tests
 *
 * Verifies that all test-utils exports compile correctly and
 * produce expected shapes at runtime.
 *
 * Run: npx vitest run src/test-utils/
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  // Factories
  uid,
  resetCounter,
  createMockRoom,
  createActiveRoom,
  createFinishedRoom,
  createMockParticipant,
  createMockOrder,
  createMockProfile,
  createMockUser,
  createMockAuthTokenResponse,
  createTickOrderSuccess,
  createMatchmakeResponse,
  createRpcResponse,
  createErrorResponse,
  createRedisOk,
  createRedisValue,
  createRedisCount,
  createSpectatorEvent,
  createParticipants,
  createOrders,
  // Mocks
  createSupabaseMocks,
  createRedisMocks,
  createConsoleSpy,
  setupFakeTimers,
  // Health check
  isServerHealthy,
} from "@/test-utils";

// ─── Factory Tests ──────────────────────────────────────────────────────────

describe("test-utils: factories", () => {
  beforeEach(() => {
    resetCounter();
  });

  describe("uid()", () => {
    it("generates unique IDs", () => {
      const a = uid("test");
      const b = uid("test");
      expect(a).not.toBe(b);
    });

    it("uses custom prefix", () => {
      const id = uid("room");
      expect(id).toMatch(/^room-/);
    });
  });

  describe("createMockRoom()", () => {
    it("returns valid room shape", () => {
      const room = createMockRoom();
      expect(room).toHaveProperty("id");
      expect(room).toHaveProperty("status");
      expect(room).toHaveProperty("symbol");
      expect(room).toHaveProperty("entry_fee");
      expect(room).toHaveProperty("mode");
      expect(room).toHaveProperty("max_players");
      expect(room).toHaveProperty("pot");
    });

    it("applies overrides", () => {
      const room = createMockRoom({ symbol: "ETH/USD", entry_fee: 50 });
      expect(room.symbol).toBe("ETH/USD");
      expect(room.entry_fee).toBe(50);
    });
  });

  describe("createActiveRoom()", () => {
    it("has active status and start_price", () => {
      const room = createActiveRoom();
      expect(room.status).toBe("active");
      expect(room.start_price).toBe(60_000);
    });
  });

  describe("createFinishedRoom()", () => {
    it("has finished status and winner", () => {
      const room = createFinishedRoom();
      expect(room.status).toBe("finished");
      expect(room.winner_id).toBeTruthy();
    });
  });

  describe("createMockParticipant()", () => {
    it("returns valid participant shape", () => {
      const p = createMockParticipant();
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("room_id");
      expect(p).toHaveProperty("user_id");
      expect(p).toHaveProperty("joined_at");
    });
  });

  describe("createMockOrder()", () => {
    it("returns valid order shape", () => {
      const o = createMockOrder();
      expect(o).toHaveProperty("id");
      expect(o).toHaveProperty("amount");
      expect(o).toHaveProperty("entry_price");
      expect(o).toHaveProperty("side");
      expect(o).toHaveProperty("room_id");
      expect(o).toHaveProperty("user_id");
    });

    it("applies overrides", () => {
      const o = createMockOrder({ side: "short", amount: 200 });
      expect(o.side).toBe("short");
      expect(o.amount).toBe(200);
    });
  });

  describe("createMockProfile()", () => {
    it("returns valid profile shape", () => {
      const p = createMockProfile();
      expect(p).toHaveProperty("id");
      expect(p).toHaveProperty("real_balance");
      expect(p).toHaveProperty("display_name");
      expect(typeof p.real_balance).toBe("number");
    });
  });

  describe("createMockUser()", () => {
    it("returns valid user shape", () => {
      const u = createMockUser();
      expect(u).toHaveProperty("id");
      expect(u).toHaveProperty("email");
      expect(u).toHaveProperty("aud", "authenticated");
      expect(u).toHaveProperty("role", "authenticated");
      expect(u.email).toContain("@");
    });
  });

  describe("createMockAuthTokenResponse()", () => {
    it("returns valid token response", () => {
      const res = createMockAuthTokenResponse();
      expect(res).toHaveProperty("access_token");
      expect(res).toHaveProperty("token_type", "bearer");
      expect(res).toHaveProperty("expires_in");
      expect(res).toHaveProperty("refresh_token");
      expect(res).toHaveProperty("user");
      expect(res.user).toHaveProperty("id");
    });
  });

  describe("Edge Function response factories", () => {
    it("createTickOrderSuccess returns valid shape", () => {
      const res = createTickOrderSuccess();
      expect(res).toHaveProperty("id");
      expect(res).toHaveProperty("status", "pending");
    });

    it("createMatchmakeResponse returns valid shape", () => {
      const res = createMatchmakeResponse();
      expect(res).toHaveProperty("success", true);
      expect(res).toHaveProperty("mode");
    });
  });

  describe("Supabase response factories", () => {
    it("createRpcResponse wraps data with null error", () => {
      const res = createRpcResponse({ count: 42 });
      expect(res).toEqual({ data: { count: 42 }, error: null });
    });

    it("createErrorResponse wraps error with null data", () => {
      const res = createErrorResponse("not found", "PGRST116");
      expect(res.data).toBeNull();
      expect(res.error).toHaveProperty("message", "not found");
      expect(res.error).toHaveProperty("code", "PGRST116");
    });
  });

  describe("Redis response factories", () => {
    it("createRedisOk returns OK result", () => {
      expect(createRedisOk()).toEqual({ result: "OK" });
    });

    it("createRedisValue returns value", () => {
      expect(createRedisValue("hello")).toEqual({ result: "hello" });
      expect(createRedisValue(null)).toEqual({ result: null });
    });

    it("createRedisCount returns count", () => {
      expect(createRedisCount(5)).toEqual({ result: 5 });
    });
  });

  describe("createSpectatorEvent()", () => {
    it("returns valid event shape", () => {
      const e = createSpectatorEvent();
      expect(e).toHaveProperty("type");
      expect(e).toHaveProperty("username");
      expect(e).toHaveProperty("user_id");
      expect(e).toHaveProperty("timestamp");
      expect(e).toHaveProperty("id");
    });
  });

  describe("Batch factories", () => {
    it("createParticipants generates N participants", () => {
      const room = createMockRoom();
      const parts = createParticipants(4, room.id);
      expect(parts).toHaveLength(4);
      parts.forEach((p) => expect(p.room_id).toBe(room.id));
    });

    it("createOrders generates N orders", () => {
      const room = createMockRoom();
      const orders = createOrders(3, room.id);
      expect(orders).toHaveLength(3);
      orders.forEach((o) => expect(o.room_id).toBe(room.id));
    });
  });
});

// ─── Mock Tests ─────────────────────────────────────────────────────────────

describe("test-utils: mocks", () => {
  describe("createSupabaseMocks()", () => {
    it("provides chainable from().select().single()", async () => {
      const mocks = createSupabaseMocks();
      const result = await mocks.supabase
        .from("blitz_rooms")
        .select()
        .single();

      expect(mocks.mockFrom).toHaveBeenCalledWith("blitz_rooms");
      expect(result).toEqual({ data: null, error: null });
    });

    it("provides working channel mock", () => {
      const mocks = createSupabaseMocks();
      const channel = mocks.supabase.channel("test-channel");

      expect(mocks.mockChannel).toHaveBeenCalledWith("test-channel");
      expect(channel.on).toBeDefined();
      expect(channel.subscribe).toBeDefined();
    });

    it("provides working rpc mock", async () => {
      const mocks = createSupabaseMocks();
      const result = await mocks.supabase.rpc("my_function", { param: "value" });

      expect(mocks.mockRpc).toHaveBeenCalledWith("my_function", { param: "value" });
      expect(result).toEqual({ data: null, error: null });
    });
  });

  describe("createRedisMocks()", () => {
    it("creates enabled redis mock by default", () => {
      const mocks = createRedisMocks();
      expect(mocks.redisEnabled).toBe(true);
      expect(typeof mocks.redis.get).toBe("function");
      expect(typeof mocks.redis.set).toBe("function");
      expect(typeof mocks.redis.del).toBe("function");
    });

    it("creates disabled redis mock", () => {
      const mocks = createRedisMocks(false);
      expect(mocks.redisEnabled).toBe(false);
    });

    it("redis methods return correct shapes", async () => {
      const mocks = createRedisMocks();
      expect(await mocks.redis.set("k", "v")).toBeNull();
      expect(await mocks.redis.get("k")).toBeNull();
      expect(await mocks.redis.del("k")).toBe(0);
      expect(await mocks.redis.hgetall("k")).toEqual({});
      expect(await mocks.redis.smembers("k")).toEqual([]);
    });
  });

  describe("createConsoleSpy()", () => {
    it("captures console output", () => {
      const spy = createConsoleSpy();
      console.warn("test warning");
      console.error("test error");

      expect(spy.warn).toHaveBeenCalledWith("test warning");
      expect(spy.error).toHaveBeenCalledWith("test error");

      spy.restoreAll();
    });
  });

  describe("setupFakeTimers()", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("advances time", async () => {
      const timers = setupFakeTimers(1_000_000);
      const callback = vi.fn();
      setTimeout(callback, 500);

      expect(callback).not.toHaveBeenCalled();
      await timers.advance(500);
      expect(callback).toHaveBeenCalledOnce();

      timers.cleanup();
    });
  });
});

// ─── Health Check Tests ─────────────────────────────────────────────────────

describe("test-utils: health-check", () => {
  it("isServerHealthy returns false for unreachable server", async () => {
    const healthy = await isServerHealthy("http://127.0.0.1:99999", { timeout: 500 });
    expect(healthy).toBe(false);
  });
});
