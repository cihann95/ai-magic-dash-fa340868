/**
 * Mock Data Factories
 *
 * Reusable factory functions for creating test data that matches
 * Supabase table Row types and edge function request/response shapes.
 *
 * Each factory produces realistic defaults with optional overrides.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── Counter for unique IDs ─────────────────────────────────────────────────

let _counter = 0;

/** Reset the internal counter (call in beforeEach if needed). */
export function resetCounter(): void {
  _counter = 0;
}

/** Generate a unique ID with optional prefix. */
export function uid(prefix = "test"): string {
  return `${prefix}-${++_counter}-${Date.now().toString(36)}`;
}

// ─── Blitz Room ─────────────────────────────────────────────────────────────

export interface MockBlitzRoom {
  id: string;
  created_at: string;
  created_by: string | null;
  ends_at: string | null;
  entry_fee: number;
  fee_collected: number;
  invite_code: string | null;
  max_players: number;
  mode: "public" | "private";
  pot: number;
  start_price: number | null;
  starts_at: string | null;
  status: "waiting" | "active" | "settling" | "finished" | "cancelled";
  symbol: string;
  updated_at: string;
  winner_id: string | null;
}

/** Create a mock blitz room with realistic defaults. */
export function createMockRoom(overrides: Partial<MockBlitzRoom> = {}): MockBlitzRoom {
  const now = new Date().toISOString();
  return {
    id: uid("room"),
    created_at: now,
    created_by: uid("user"),
    ends_at: null,
    entry_fee: 10,
    fee_collected: 0,
    invite_code: null,
    max_players: 8,
    mode: "public",
    pot: 0,
    start_price: null,
    starts_at: new Date(Date.now() + 30_000).toISOString(),
    status: "waiting",
    symbol: "BTC/USD",
    updated_at: now,
    winner_id: null,
    ...overrides,
  };
}

/** Create an active room (status=active, start_price set). */
export function createActiveRoom(overrides: Partial<MockBlitzRoom> = {}): MockBlitzRoom {
  return createMockRoom({
    status: "active",
    start_price: 60_000,
    pot: 80,
    fee_collected: 4,
    ...overrides,
  });
}

/** Create a finished room. */
export function createFinishedRoom(overrides: Partial<MockBlitzRoom> = {}): MockBlitzRoom {
  return createMockRoom({
    status: "finished",
    start_price: 60_000,
    ends_at: new Date().toISOString(),
    winner_id: uid("user"),
    ...overrides,
  });
}

// ─── Blitz Participant ──────────────────────────────────────────────────────

export interface MockBlitzParticipant {
  id: string;
  created_at: string;
  final_balance: number | null;
  final_pnl: number | null;
  joined_at: string;
  rank: number | null;
  room_id: string;
  user_id: string;
}

export function createMockParticipant(overrides: Partial<MockBlitzParticipant> = {}): MockBlitzParticipant {
  const now = new Date().toISOString();
  return {
    id: uid("part"),
    created_at: now,
    final_balance: null,
    final_pnl: null,
    joined_at: now,
    rank: null,
    room_id: uid("room"),
    user_id: uid("user"),
    ...overrides,
  };
}

// ─── Blitz Order ────────────────────────────────────────────────────────────

export interface MockBlitzOrder {
  id: string;
  amount: number;
  closed_at: string | null;
  created_at: string;
  entry_price: number;
  exit_price: number | null;
  opened_at: string;
  pnl: number | null;
  room_id: string;
  side: "long" | "short";
  user_id: string;
}

export function createMockOrder(overrides: Partial<MockBlitzOrder> = {}): MockBlitzOrder {
  const now = new Date().toISOString();
  return {
    id: uid("order"),
    amount: 100,
    closed_at: null,
    created_at: now,
    entry_price: 60_000,
    exit_price: null,
    opened_at: now,
    pnl: null,
    room_id: uid("room"),
    side: "long",
    user_id: uid("user"),
    ...overrides,
  };
}

// ─── Profile ────────────────────────────────────────────────────────────────

export interface MockProfile {
  id: string;
  real_balance: number;
  display_name: string;
  [key: string]: unknown;
}

export function createMockProfile(overrides: Partial<MockProfile> = {}): MockProfile {
  return {
    id: uid("user"),
    real_balance: 1000,
    display_name: "TestPlayer",
    ...overrides,
  };
}

// ─── User (Auth) ────────────────────────────────────────────────────────────

export interface MockUser {
  id: string;
  email: string;
  aud: string;
  role: string;
  confirmed_at: string;
}

export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
    id: uid("user"),
    email: `test-${uid("user")}@example.com`,
    aud: "authenticated",
    role: "authenticated",
    confirmed_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Auth Token Response ────────────────────────────────────────────────────

export interface MockAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  user: MockUser;
}

export function createMockAuthTokenResponse(
  overrides: Partial<MockAuthTokenResponse> = {},
): MockAuthTokenResponse {
  const user = createMockUser(overrides.user);
  return {
    access_token: `mock-jwt-${user.id}`,
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "mock-refresh-token",
    user,
    ...overrides,
  };
}

// ─── Edge Function Responses ────────────────────────────────────────────────

/** Response shape for blitz-tick-order success. */
export interface TickOrderSuccessResponse {
  id: string;
  status: "pending";
}

/** Response shape for blitz-tick-order idempotent duplicate. */
export interface TickOrderDuplicateResponse {
  error: string;
  key: string;
}

/** Response shape for blitz-tick-order stale timestamp. */
export interface TickOrderStaleResponse {
  error: string;
  drift_ms: number;
}

/** Response shape for blitz-matchmake. */
export interface MatchmakeResponse {
  success: boolean;
  mode: string;
}

export function createTickOrderSuccess(overrides: Partial<TickOrderSuccessResponse> = {}): TickOrderSuccessResponse {
  return { id: uid("order"), status: "pending", ...overrides };
}

export function createMatchmakeResponse(overrides: Partial<MatchmakeResponse> = {}): MatchmakeResponse {
  return { success: true, mode: "cancel", ...overrides };
}

// ─── Supabase RPC Response ─────────────────────────────────────────────────

export interface SupabaseRpcResponse<T = unknown> {
  data: T;
  error: null;
}

export interface SupabaseErrorResponse {
  data: null;
  error: { message: string; code?: string; details?: string };
}

export function createRpcResponse<T>(data: T): SupabaseRpcResponse<T> {
  return { data, error: null };
}

export function createErrorResponse(
  message: string,
  code?: string,
): SupabaseErrorResponse {
  return { data: null, error: { message, code } };
}

// ─── Redis Response Shapes ──────────────────────────────────────────────────
// These match the shapes used by _shared/redis.ts consumers

export interface RedisOkResponse {
  result: "OK";
}

export interface RedisNullResponse {
  result: null;
}

export interface RedisCountResponse {
  result: number;
}

export function createRedisOk(): RedisOkResponse {
  return { result: "OK" };
}

export function createRedisValue(value: string | null): { result: string | null } {
  return { result: value };
}

export function createRedisCount(count: number): RedisCountResponse {
  return { result: count };
}

// ─── Spectator Broadcast Event ──────────────────────────────────────────────

export interface SpectatorEvent {
  type: "chat" | "emoji";
  text?: string;
  emoji?: string;
  username: string;
  user_id: string;
  timestamp: number;
  id: string;
}

export function createSpectatorEvent(overrides: Partial<SpectatorEvent> = {}): SpectatorEvent {
  return {
    type: "chat",
    text: "Hello!",
    username: "TestPlayer",
    user_id: uid("user"),
    timestamp: Date.now(),
    id: uid("msg"),
    ...overrides,
  };
}

// ─── Batch Factories ────────────────────────────────────────────────────────

/** Create N participants for a room. */
export function createParticipants(
  count: number,
  roomId: string,
  overrides: Partial<MockBlitzParticipant> = {},
): MockBlitzParticipant[] {
  return Array.from({ length: count }, (_, i) =>
    createMockParticipant({
      room_id: roomId,
      user_id: `user-${i + 1}`,
      rank: i + 1,
      ...overrides,
    }),
  );
}

/** Create N orders for a room. */
export function createOrders(
  count: number,
  roomId: string,
  overrides: Partial<MockBlitzOrder> = {},
): MockBlitzOrder[] {
  return Array.from({ length: count }, (_, i) =>
    createMockOrder({
      room_id: roomId,
      user_id: `user-${i + 1}`,
      ...overrides,
    }),
  );
}
