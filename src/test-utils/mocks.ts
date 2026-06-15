/**
 * Reusable Test Mocks
 *
 * Provides pre-built mock implementations for:
 * - Supabase client (from, channel, rpc, removeChannel)
 * - Edge Function HTTP responses
 * - Redis response shapes (matching `_shared/redis.ts`)
 *
 * Usage with vi.hoisted + vi.mock:
 * ```ts
 * import { createSupabaseMocks } from "@/test-utils/mocks";
 *
 * const mocks = createSupabaseMocks();
 * vi.mock("@/integrations/supabase/client", () => ({
 *   supabase: mocks.supabase,
 * }));
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { vi } from "vitest";

// ─── Supabase Client Mock ───────────────────────────────────────────────────

export interface SupabaseMocks {
  /** `supabase.from(table)` mock — chainable with .select(), .single(), etc. */
  mockFrom: ReturnType<typeof vi.fn>;
  /** `supabase.channel(name)` mock — returns channel object with .on(), .subscribe(), etc. */
  mockChannel: ReturnType<typeof vi.fn>;
  /** `supabase.removeChannel(channel)` mock */
  mockRemoveChannel: ReturnType<typeof vi.fn>;
  /** `supabase.rpc(fn, params)` mock */
  mockRpc: ReturnType<typeof vi.fn>;
  /** `supabase.auth.*` mocks */
  mockAuth: {
    signInWithPassword: ReturnType<typeof vi.fn>;
    signUp: ReturnType<typeof vi.fn>;
    signOut: ReturnType<typeof vi.fn>;
    getUser: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
  };
  /** Channel object mock — returned by mockChannel() */
  mockChannelObj: Record<string, ReturnType<typeof vi.fn>>;

  /** The complete supabase object for use in vi.mock */
  supabase: {
    from: ReturnType<typeof vi.fn>;
    channel: ReturnType<typeof vi.fn>;
    removeChannel: ReturnType<typeof vi.fn>;
    rpc: ReturnType<typeof vi.fn>;
    auth: {
      signInWithPassword: ReturnType<typeof vi.fn>;
      signUp: ReturnType<typeof vi.fn>;
      signOut: ReturnType<typeof vi.fn>;
      getUser: ReturnType<typeof vi.fn>;
      getSession: ReturnType<typeof vi.fn>;
    };
  };
  /** Individual spies for advanced assertions */
  mockSelect: ReturnType<typeof vi.fn>;
  mockSingle: ReturnType<typeof vi.fn>;
  mockOn: ReturnType<typeof vi.fn>;
  mockSubscribe: ReturnType<typeof vi.fn>;
  mockTrack: ReturnType<typeof vi.fn>;
  mockPresenceState: ReturnType<typeof vi.fn>;
}

/**
 * Create a complete set of Supabase client mocks.
 *
 * All mocks are chained correctly (e.g. `.from().select().single()` works).
 * Call `clearAllMocks()` between tests to reset state.
 */
export function createSupabaseMocks(): SupabaseMocks {
  const mockSelect = vi.fn();
  const mockSingle = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockUpsert = vi.fn();
  const mockMaybeSingle = vi.fn();
  const mockOrder = vi.fn();
  const mockLimit = vi.fn();
  const mockFilter = vi.fn();
  const mockEq = vi.fn();

  // Chain: select → single/maybeSingle
  mockSelect.mockReturnValue({ single: mockSingle, maybeSingle: mockMaybeSingle });
  mockSingle.mockResolvedValue({ data: null, error: null });
  mockMaybeSingle.mockResolvedValue({ data: null, error: null });

  // Chain: insert/update/delete/upsert → select → single
  mockInsert.mockReturnValue({ select: () => ({ single: mockSingle }) });
  mockUpdate.mockReturnValue({ select: () => ({ single: mockSingle }) });
  mockDelete.mockReturnValue({ select: () => ({ single: mockSingle }) });
  mockUpsert.mockReturnValue({ select: () => ({ single: mockSingle }) });

  // Chain: order/limit/filter/eq → single
  mockOrder.mockReturnValue({ single: mockSingle, limit: mockLimit });
  mockLimit.mockReturnValue({ single: mockSingle });
  mockFilter.mockReturnValue({ single: mockSingle });
  mockEq.mockReturnValue({ single: mockSingle });

  // from() returns chainable query builder
  const mockFrom = vi.fn(() => ({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    upsert: mockUpsert,
    order: mockOrder,
    limit: mockLimit,
    filter: mockFilter,
    eq: mockEq,
  }));

  // Channel mock
  const mockOn = vi.fn();
  const mockSubscribe = vi.fn();
  const mockSend = vi.fn();
  const mockTrack = vi.fn();
  const mockPresenceState = vi.fn(() => ({}));

  const mockChannelObj: Record<string, ReturnType<typeof vi.fn>> = {
    on: mockOn,
    subscribe: mockSubscribe,
    send: mockSend,
    track: mockTrack,
    presenceState: mockPresenceState,
  };
  mockOn.mockReturnValue(mockChannelObj);
  mockSubscribe.mockReturnValue(mockChannelObj);

  const mockChannel = vi.fn(() => mockChannelObj);
  const mockRemoveChannel = vi.fn();

  // RPC mock
  const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });

  // Auth mocks
  const mockAuth = {
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    }),
    signUp: vi.fn().mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({ error: null }),
    getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  };

  const supabase = {
    from: mockFrom,
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
    rpc: mockRpc,
    auth: mockAuth,
  };

  return {
    mockFrom,
    mockChannel,
    mockRemoveChannel,
    mockRpc,
    mockAuth,
    mockChannelObj,
    supabase,
    // Directly expose commonly-used lower-level mocks
    mockSelect,
    mockSingle,
    mockOn,
    mockSubscribe,
    mockTrack,
    mockPresenceState,
    // Lower-level mocks grouped for advanced usage
    _inner: {
      mockSelect,
      mockSingle,
      mockInsert,
      mockUpdate,
      mockDelete,
      mockUpsert,
      mockMaybeSingle,
      mockOn,
      mockSubscribe,
      mockSend,
      mockTrack,
      mockPresenceState,
      mockOrder,
      mockLimit,
      mockFilter,
      mockEq,
    },
  } as SupabaseMocks;
}

// ─── Edge Function Response Mocks ───────────────────────────────────────────

export interface EdgeFunctionMocks {
  /** Mock fetch to intercept edge function calls */
  mockFetch: ReturnType<typeof vi.fn>;
  /** Set up default successful responses */
  mockSuccess: () => void;
  /** Set up error responses */
  mockError: (status: number, message: string) => void;
  /** Set up timeout responses */
  mockTimeout: () => void;
}

/**
 * Create mocks for edge function HTTP calls.
 *
 * Intercepts `globalThis.fetch` and returns canned responses
 * for known edge function paths.
 */
export function createEdgeFunctionMocks(): EdgeFunctionMocks {
  const mockFetch = vi.fn();

  const mockSuccess = () => {
    mockFetch.mockImplementation(async (url: string | Request, _init?: RequestInit) => {
      const path = typeof url === "string" ? url : url.url;

      // blitz-tick-order success
      if (path.includes("/functions/v1/blitz-tick-order")) {
        return new Response(JSON.stringify({ id: "order-mock-1", status: "pending" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      // blitz-matchmake success
      if (path.includes("/functions/v1/blitz-matchmake")) {
        return new Response(JSON.stringify({ success: true, mode: "cancel" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      // Default: not mocked
      return new Response(JSON.stringify({ error: "not mocked" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    });
  };

  const mockError = (status: number, message: string) => {
    mockFetch.mockImplementation(async () => {
      return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "content-type": "application/json" },
      });
    });
  };

  const mockTimeout = () => {
    mockFetch.mockImplementation(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });
  };

  // Install globally
  globalThis.fetch = mockFetch as typeof fetch;

  return { mockFetch, mockSuccess, mockError, mockTimeout };
}

// ─── Redis Response Mocks ───────────────────────────────────────────────────
// These match the shapes returned by `supabase/functions/_shared/redis.ts`

export interface RedisMocks {
  /** Mock redis object matching _shared/redis.ts API */
  redis: {
    set: ReturnType<typeof vi.fn>;
    setNxEx: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    hset: ReturnType<typeof vi.fn>;
    hsetAll: ReturnType<typeof vi.fn>;
    hget: ReturnType<typeof vi.fn>;
    hgetall: ReturnType<typeof vi.fn>;
    hdel: ReturnType<typeof vi.fn>;
    sadd: ReturnType<typeof vi.fn>;
    smembers: ReturnType<typeof vi.fn>;
    srem: ReturnType<typeof vi.fn>;
    rpush: ReturnType<typeof vi.fn>;
    lpop: ReturnType<typeof vi.fn>;
    lrem: ReturnType<typeof vi.fn>;
    lrange: ReturnType<typeof vi.fn>;
    expire: ReturnType<typeof vi.fn>;
  };
  /** Whether redis is "enabled" in the mock */
  redisEnabled: boolean;
}

/**
 * Create a mock Redis client matching `_shared/redis.ts` response shapes.
 *
 * All methods return the same types as the real redis adapter:
 * - `set()` → `null` (success) or `"OK"`
 * - `get()` → `string | null`
 * - `del()` → `number`
 * - `hget()` → `string | null`
 * - `hgetall()` → `Record<string, string>`
 * - etc.
 */
export function createRedisMocks(enabled = true): RedisMocks {
  return {
    redisEnabled: enabled,
    redis: {
      set: vi.fn().mockResolvedValue(null),
      setNxEx: vi.fn().mockResolvedValue(true),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(0),
      hset: vi.fn().mockResolvedValue(0),
      hsetAll: vi.fn().mockResolvedValue(0),
      hget: vi.fn().mockResolvedValue(null),
      hgetall: vi.fn().mockResolvedValue({}),
      hdel: vi.fn().mockResolvedValue(0),
      sadd: vi.fn().mockResolvedValue(0),
      smembers: vi.fn().mockResolvedValue([]),
      srem: vi.fn().mockResolvedValue(0),
      rpush: vi.fn().mockResolvedValue(0),
      lpop: vi.fn().mockResolvedValue(null),
      lrem: vi.fn().mockResolvedValue(0),
      lrange: vi.fn().mockResolvedValue([]),
      expire: vi.fn().mockResolvedValue(0),
    },
  };
}

// ─── Fetch Mock (Generic) ───────────────────────────────────────────────────

/**
 * Create a simple fetch mock for testing HTTP calls.
 *
 * Returns a mock function that can be configured with `.mockResolvedValue()`
 * or `.mockRejectedValue()`.
 */
export function createFetchMock(): ReturnType<typeof vi.fn> {
  const mock = vi.fn();
  globalThis.fetch = mock as typeof fetch;
  return mock;
}

// ─── Console Spy ────────────────────────────────────────────────────────────

export interface ConsoleSpy {
  /** Spy on console.warn */
  warn: ReturnType<typeof vi.spyOn>;
  /** Spy on console.error */
  error: ReturnType<typeof vi.spyOn>;
  /** Spy on console.log */
  log: ReturnType<typeof vi.spyOn>;
  /** Restore all spies */
  restoreAll: () => void;
}

/**
 * Create console spies for capturing log output in tests.
 *
 * @example
 * ```ts
 * const spy = createConsoleSpy();
 * await someFunction();
 * expect(spy.warn).toHaveBeenCalledWith("expected message");
 * spy.restoreAll();
 * ```
 */
export function createConsoleSpy(): ConsoleSpy {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const log = vi.spyOn(console, "log").mockImplementation(() => {});

  return {
    warn,
    error,
    log,
    restoreAll: () => {
      warn.mockRestore();
      error.mockRestore();
      log.mockRestore();
    },
  };
}

// ─── Fake Timer Helpers ─────────────────────────────────────────────────────

/**
 * Setup fake timers with a fixed starting time.
 * Returns helpers for advancing time.
 */
export function setupFakeTimers(startMs = 1_000_000) {
  vi.useFakeTimers({ now: startMs });

  return {
    /** Advance time by ms milliseconds */
    advance: async (ms: number) => {
      vi.advanceTimersByTime(ms);
    },
    /** Advance time async (for promise resolution) */
    advanceAsync: async (ms: number) => {
      await vi.advanceTimersByTimeAsync(ms);
    },
    /** Restore real timers */
    cleanup: () => {
      vi.useRealTimers();
    },
  };
}
