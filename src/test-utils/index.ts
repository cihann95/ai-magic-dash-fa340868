/**
 * Test Utilities — Barrel Export
 *
 * Central import point for all test helpers:
 *
 * ```ts
 * import {
 *   createSupabaseMocks,
 *   createMockRoom,
 *   waitForServer,
 * } from "@/test-utils";
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── Factories ──────────────────────────────────────────────────────────────
export {
  resetCounter,
  uid,
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
  // Types
  type MockBlitzRoom,
  type MockBlitzParticipant,
  type MockBlitzOrder,
  type MockProfile,
  type MockUser,
  type MockAuthTokenResponse,
  type TickOrderSuccessResponse,
  type TickOrderDuplicateResponse,
  type TickOrderStaleResponse,
  type MatchmakeResponse,
  type SupabaseRpcResponse,
  type SupabaseErrorResponse,
  type RedisOkResponse,
  type RedisNullResponse,
  type RedisCountResponse,
  type SpectatorEvent,
} from "./factories";

// ─── Mocks ──────────────────────────────────────────────────────────────────
export {
  createSupabaseMocks,
  createEdgeFunctionMocks,
  createRedisMocks,
  createFetchMock,
  createConsoleSpy,
  setupFakeTimers,
  type SupabaseMocks,
  type EdgeFunctionMocks,
  type RedisMocks,
  type ConsoleSpy,
} from "./mocks";

// ─── Health Check ───────────────────────────────────────────────────────────
export {
  waitForServer,
  isServerHealthy,
  pingEndpoint,
  type HealthCheckOptions,
} from "./health-check";
