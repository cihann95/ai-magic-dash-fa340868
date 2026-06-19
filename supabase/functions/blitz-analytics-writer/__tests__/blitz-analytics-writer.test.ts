/**
 * blitz-analytics-writer: Comprehensive Unit Tests
 *
 * Tests the analytics flush logic: auth (service role + cron),
 * staging table read, analytics table insert, flush flag update,
 * error handling, and edge cases.
 * Mirrors logic from blitz-analytics-writer/index.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ═══════════════════════════════════════════════════════════════════════════
// Simulated Supabase client for analytics-writer
// ═══════════════════════════════════════════════════════════════════════════
function createSimulatedSupabase() {
  const stagingEvents: Array<{
    id: string; event_type: string; room_id: string | null;
    user_id: string | null; payload: Record<string, unknown>;
    server_timestamp: string | null; created_at: string; flushed: boolean;
  }> = [];
  const analyticsEvents: Array<{
    event_type: string; room_id: string | null;
    user_id: string | null; payload: Record<string, unknown>;
    server_timestamp: string | null; created_at: string;
  }> = [];
  let idCounter = 0;

  return {
    // Seed staging events
    seedStagingEvent(e: { event_type: string; room_id?: string; user_id?: string; payload?: Record<string, unknown> }) {
      const id = `evt-${++idCounter}`;
      stagingEvents.push({
        id, event_type: e.event_type, room_id: e.room_id ?? null,
        user_id: e.user_id ?? null, payload: e.payload ?? {},
        server_timestamp: new Date().toISOString(), created_at: new Date().toISOString(),
        flushed: false,
      });
      return id;
    },

    // Read unflushed events from staging
    async fetchUnflushed(): Promise<{ data: typeof stagingEvents | null; error: Error | null }> {
      const unflushed = stagingEvents.filter(e => !e.flushed).sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 500);
      return { data: unflushed.length > 0 ? unflushed : null, error: null };
    },

    // Insert into analytics_events
    async insertAnalytics(events: typeof analyticsEvents): Promise<{ error: Error | null }> {
      analyticsEvents.push(...events);
      return { error: null };
    },

    // Insert with error (for testing error paths)
    async insertAnalyticsFailing(_events: typeof analyticsEvents): Promise<{ error: Error | null }> {
      return { error: new Error("Insert failed") };
    },

    // Mark events as flushed
    async markFlushed(ids: string[]): Promise<{ error: Error | null }> {
      for (const id of ids) {
        const evt = stagingEvents.find(e => e.id === id);
        if (evt) evt.flushed = true;
      }
      return { error: null };
    },

    // Mark flushed with error
    async markFlushedFailing(_ids: string[]): Promise<{ error: Error | null }> {
      return { error: new Error("Update failed") };
    },

    getStagingEvents() { return stagingEvents; },
    getAnalyticsEvents() { return analyticsEvents; },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Auth check logic (from blitz-analytics-writer/index.ts lines 25-38)
// ═══════════════════════════════════════════════════════════════════════════
function checkAuth(
  authHdr: string, cronToken: string,
  serviceRoleKey: string,
  verifyCronSecret: (token: string) => boolean,
): { ok: boolean; error?: string; status?: number } {
  const isServiceRole = authHdr === `Bearer ${serviceRoleKey}`;
  let isCron = false;
  if (!isServiceRole && cronToken) {
    isCron = verifyCronSecret(cronToken);
  }
  if (!isServiceRole && !isCron) {
    return { ok: false, error: "Yetkisiz erişim", status: 401 };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Flush logic (from blitz-analytics-writer/index.ts lines 40-84)
// ═══════════════════════════════════════════════════════════════════════════
interface StagingEvent {
  id: string; event_type: string; room_id: string | null;
  user_id: string | null; payload: Record<string, unknown>;
  server_timestamp: string | null; created_at: string;
}

async function flushAnalytics(
  db: ReturnType<typeof createSimulatedSupabase>,
): Promise<{ flushed: number; error?: string; status?: number }> {
  const { data: rows, error: fetchErr } = await db.fetchUnflushed();
  if (fetchErr) throw fetchErr;
  if (!rows || rows.length === 0) {
    return { flushed: 0 };
  }

  const inserts = (rows as StagingEvent[]).map((r) => ({
    event_type: r.event_type, room_id: r.room_id, user_id: r.user_id,
    payload: r.payload, server_timestamp: r.server_timestamp, created_at: r.created_at,
  }));

  const { error: insertErr } = await db.insertAnalytics(inserts);
  if (insertErr) throw insertErr;

  const ids = (rows as StagingEvent[]).map((r) => r.id);
  const { error: updateErr } = await db.markFlushed(ids);
  if (updateErr) throw updateErr;

  return { flushed: rows.length };
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════
describe("blitz-analytics-writer", () => {
  let db: ReturnType<typeof createSimulatedSupabase>;

  beforeEach(() => {
    db = createSimulatedSupabase();
    vi.useFakeTimers({ now: 1_700_000_000_000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Auth ──────────────────────────────────────────────────────────────
  describe("authentication", () => {
    it("should accept service role token", () => {
      const result = checkAuth("Bearer service-key-123", "", "service-key-123", () => false);
      expect(result.ok).toBe(true);
    });

    it("should accept valid cron token", () => {
      const result = checkAuth("", "cron-secret-abc", "service-key-123", (t) => t === "cron-secret-abc");
      expect(result.ok).toBe(true);
    });

    it("should reject without any auth", () => {
      const result = checkAuth("", "", "service-key-123", () => false);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.error).toBe("Yetkisiz erişim");
    });

    it("should reject invalid cron token", () => {
      const result = checkAuth("", "wrong-cron", "service-key-123", (t) => t === "correct-cron");
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });

    it("should reject invalid service role token", () => {
      const result = checkAuth("Bearer wrong-key", "", "service-key-123", () => false);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
    });

    it("should prefer service role over cron", () => {
      const result = checkAuth("Bearer service-key-123", "cron-secret", "service-key-123", () => false);
      expect(result.ok).toBe(true);
    });
  });

  // ── Flush Logic ──────────────────────────────────────────────────────
  describe("flush logic", () => {
    it("should flush unflushed events to analytics table", async () => {
      db.seedStagingEvent({ event_type: "blitz_finished", room_id: "room-1" });
      db.seedStagingEvent({ event_type: "blitz_started", room_id: "room-2" });

      const result = await flushAnalytics(db);

      expect(result.flushed).toBe(2);
      expect(db.getAnalyticsEvents()).toHaveLength(2);
      expect(db.getStagingEvents().every(e => e.flushed)).toBe(true);
    });

    it("should return flushed: 0 when no unflushed events", async () => {
      const result = await flushAnalytics(db);
      expect(result.flushed).toBe(0);
      expect(db.getAnalyticsEvents()).toHaveLength(0);
    });

    it("should not re-flush already flushed events", async () => {
      const _id = db.seedStagingEvent({ event_type: "blitz_finished" });

      // First flush
      await flushAnalytics(db);
      expect(db.getAnalyticsEvents()).toHaveLength(1);

      // Second flush — no new events
      const result = await flushAnalytics(db);
      expect(result.flushed).toBe(0);
      expect(db.getAnalyticsEvents()).toHaveLength(1);
    });

    it("should preserve event data during flush", async () => {
      db.seedStagingEvent({
        event_type: "blitz_finished",
        room_id: "room-1",
        user_id: "user-1",
        payload: { symbol: "BTC/USD", prize: 190 },
      });

      await flushAnalytics(db);

      const analytics = db.getAnalyticsEvents();
      expect(analytics[0]).toMatchObject({
        event_type: "blitz_finished",
        room_id: "room-1",
        user_id: "user-1",
        payload: { symbol: "BTC/USD", prize: 190 },
      });
    });

    it("should handle null room_id and user_id", async () => {
      db.seedStagingEvent({ event_type: "system_event" });

      await flushAnalytics(db);

      const analytics = db.getAnalyticsEvents();
      expect(analytics[0].room_id).toBeNull();
      expect(analytics[0].user_id).toBeNull();
    });

    it("should flush events in creation order", async () => {
      db.seedStagingEvent({ event_type: "first" });
      db.seedStagingEvent({ event_type: "second" });
      db.seedStagingEvent({ event_type: "third" });

      await flushAnalytics(db);

      const analytics = db.getAnalyticsEvents();
      expect(analytics.map(e => e.event_type)).toEqual(["first", "second", "third"]);
    });

    it("should limit to 500 events per flush", async () => {
      // Seed 501 events
      for (let i = 0; i < 501; i++) {
        db.seedStagingEvent({ event_type: `event-${i}` });
      }

      const result = await flushAnalytics(db);
      expect(result.flushed).toBe(500);
      expect(db.getAnalyticsEvents()).toHaveLength(500);
      // One event should remain unflushed
      expect(db.getStagingEvents().filter(e => !e.flushed)).toHaveLength(1);
    });
  });

  // ── Error Handling ────────────────────────────────────────────────────
  describe("error handling", () => {
    it("should throw on fetch error", async () => {
      const failingDb = {
        ...db,
        fetchUnflushed: async () => ({ data: null, error: new Error("DB connection lost") }),
      };

      await expect(flushAnalytics(failingDb as any)).rejects.toThrow("DB connection lost");
    });

    it("should throw on insert error", async () => {
      db.seedStagingEvent({ event_type: "test" });

      const failingDb = {
        ...db,
        insertAnalytics: async () => ({ error: new Error("Insert constraint violation") }),
      };

      await expect(flushAnalytics(failingDb as any)).rejects.toThrow("Insert constraint violation");
    });

    it("should throw on update error", async () => {
      db.seedStagingEvent({ event_type: "test" });

      const failingDb = {
        ...db,
        markFlushed: async () => ({ error: new Error("Update failed") }),
      };

      await expect(flushAnalytics(failingDb as any)).rejects.toThrow("Update failed");
    });

    it("should handle empty staging table gracefully", async () => {
      const result = await flushAnalytics(db);
      expect(result.flushed).toBe(0);
    });
  });

  // ── Edge Cases ────────────────────────────────────────────────────────
  describe("edge cases", () => {
    it("should handle event with empty payload", async () => {
      db.seedStagingEvent({ event_type: "test", payload: {} });

      await flushAnalytics(db);

      expect(db.getAnalyticsEvents()[0].payload).toEqual({});
    });

    it("should handle event with complex nested payload", async () => {
      const complexPayload = {
        nested: { deep: { value: 42 } },
        array: [1, 2, 3],
        string: "test",
      };
      db.seedStagingEvent({ event_type: "test", payload: complexPayload });

      await flushAnalytics(db);

      expect(db.getAnalyticsEvents()[0].payload).toEqual(complexPayload);
    });

    it("should handle concurrent flush attempts (both may read same events without DB lock)", async () => {
      db.seedStagingEvent({ event_type: "event-1" });
      db.seedStagingEvent({ event_type: "event-2" });

      const [result1, result2] = await Promise.all([
        flushAnalytics(db),
        flushAnalytics(db),
      ]);

      // Without DB-level locking, both flushes may process the same events.
      // The important thing is no crash and data integrity is maintained.
      expect(result1.flushed + result2.flushed).toBeGreaterThanOrEqual(2);
      expect(db.getAnalyticsEvents().length).toBeGreaterThanOrEqual(2);
      expect(db.getStagingEvents().every(e => e.flushed)).toBe(true);
    });

    it("should handle many events efficiently", async () => {
      for (let i = 0; i < 100; i++) {
        db.seedStagingEvent({ event_type: `event-${i}`, room_id: `room-${i}` });
      }

      const result = await flushAnalytics(db);

      expect(result.flushed).toBe(100);
      expect(db.getAnalyticsEvents()).toHaveLength(100);
      expect(db.getStagingEvents().every(e => e.flushed)).toBe(true);
    });

    it("should handle mix of flushed and unflushed events", async () => {
      // Seed and flush some events
      db.seedStagingEvent({ event_type: "old-event" });
      await flushAnalytics(db);

      // Seed new events
      db.seedStagingEvent({ event_type: "new-event-1" });
      db.seedStagingEvent({ event_type: "new-event-2" });

      const result = await flushAnalytics(db);

      expect(result.flushed).toBe(2);
      expect(db.getAnalyticsEvents()).toHaveLength(3); // 1 old + 2 new
    });
  });

  // ── Data Mapping ──────────────────────────────────────────────────────
  describe("data mapping", () => {
    it("should map staging event fields correctly to analytics event", async () => {
      db.seedStagingEvent({
        event_type: "blitz_finished",
        room_id: "room-123",
        user_id: "user-456",
        payload: { key: "value" },
      });

      await flushAnalytics(db);

      const analytics = db.getAnalyticsEvents()[0];
      expect(analytics).toHaveProperty("event_type", "blitz_finished");
      expect(analytics).toHaveProperty("room_id", "room-123");
      expect(analytics).toHaveProperty("user_id", "user-456");
      expect(analytics).toHaveProperty("payload");
      expect(analytics).toHaveProperty("server_timestamp");
      expect(analytics).toHaveProperty("created_at");
    });

    it("should not include id or flushed field in analytics insert", async () => {
      db.seedStagingEvent({ event_type: "test" });

      await flushAnalytics(db);

      const analytics = db.getAnalyticsEvents()[0];
      expect(analytics).not.toHaveProperty("id");
      expect(analytics).not.toHaveProperty("flushed");
    });
  });
});
