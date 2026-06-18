# Wave 1 — Config graceful degradation

## Change
Modified `supabase/functions/_shared/config.ts` to catch `ConfigError` in production.

## What changed
- `loadConfig()` body wrapped in try/catch
- In production (NODE_ENV !== "development"):
  - ConfigError is caught, a `console.error` warning is printed
  - Returns degraded Config with empty strings `""` for the 4 required vars
  - Optional vars still attempt `getOptional()` (may resolve if they happen to be set)
- In development: ConfigError still re-thrown (fail-fast)
- New `export function isConfigValid(): boolean` checks the 4 critical vars against `""`

## Key design decisions
- Using `NODE_ENV` env var (consistent with .env.example)
- Empty strings as sentinel for "missing" (simple, type-safe with `string` not `string | undefined`)
- `ConfigError` class untouched — still used by `getRequired()`
- No changes to `Config` interface, function signatures, or any other file

## Files modified
- `supabase/functions/_shared/config.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Blocks
Tasks 5-12 (edge function handlers) depend on config not crashing at import.

## Entry point for next wave
Edge function handlers should call `isConfigValid()` at request start and return a
user-facing 500 with appropriate message if it returns false.

# Wave 1 — Rate Limit 429 Headers & Logging

## Change
Enhanced `supabase/functions/_shared/rate-limit.ts` with structured 429 headers and rate limit logging.

## What changed
- `RateLimitResult` interface: Added `windowMs: number` field
- `checkRateLimit()`: All 4 return paths now include `windowMs: config.windowMs`
- `createRateLimitResponse()`: Added `X-RateLimit-Policy` header with JSON `{window: result.windowMs, max: result.limit}`
- `addRateLimitHeaders()`: Added same `X-RateLimit-Policy` header; already preserved existing headers via `new Headers(response.headers)`
- `rateLimit()`: Added structured `console.warn(JSON.stringify({event: "rate_limit_exceeded", userId, route, limit, remaining, resetAt}))` when rate limit triggered

## Key design decisions
- `windowMs` added to `RateLimitResult` (not function params) to avoid changing exported function signatures
- Log placed in `rateLimit()` (has userId/route) rather than `createRateLimitResponse()` (only has result)
- `addRateLimitHeaders()` preserves all headers via `new Headers(response.headers)` then sets rate-limit headers — unchanged logic
- CORS headers spread in `createRateLimitResponse()` kept unchanged

## Files modified
- `supabase/functions/_shared/rate-limit.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Blocks
Tasks 5-12 depend on proper rate limit headers and logging.

# Wave 1 — Body Size Limit Module

## File
`supabase/functions/_shared/body-size-limit.ts`

## What was created
- `checkBodySize(req, maxSizeBytes?)` — exported async function returning `Response | null`
- Default limit: 1 MB (1_048_576 bytes)
- Two-phase body size check:
  1. Fast path via `Content-Length` header (no body read)
  2. Fallback via `req.clone().text()` with 500 ms `AbortController` timeout
- Returns 413 with Turkish error message (`"İstek çok büyük"`), `PAYLOAD_TOO_LARGE` code, and `max_size_bytes` field
- CORS headers (`Access-Control-Allow-Origin: *`) included in 413 response

## Key decisions
- `Promise.race` with `AbortController` for timeout since `Request.text()` doesn't accept `AbortSignal` in the standard Fetch API.
- Fail-lenient on read errors/timeouts — if we can't read the body, let the request proceed.
- `Content-Length` check is synchronous — returns 413 immediately without consuming the body stream.
- Follows same module pattern as `rate-limit.ts` (CORS headers const, helper function for error response, JSDoc block header).

## Dependencies
None. Dependency-free module importable by any edge function.

# Wave 1 — Redis adapter hardening (timeout, error types, health check)

## Change
Hardened `supabase/functions/_shared/redis.ts` with connection timeout, structured error types, and health check.

## What changed
- **3 error classes exported**: `RedisConnectionError`, `RedisTimeoutError`, `RedisCommandError` (all extend `Error`, set `this.name`)
- **3 s timeout on all operations**: `safe()` wrapper uses `AbortController` + `Promise.race` — the controller's `abort` event rejects the race promise with `RedisTimeoutError`
- **Enhanced `safe()` error categorization**: catches and categorizes errors as:
  - `RedisTimeoutError` → logs `{"event":"redis_timeout","duration_ms":3000}`
  - `UpstashError` (imported from `@upstash/redis`) → logs `{"event":"redis_command_error","error":"..."}`
  - `TypeError` or message containing `"fetch"` → logs `{"event":"redis_connection_error","error":"..."}`
  - Everything else → logs `{"event":"redis_error","type":"unknown","error":"..."}`
- **`setNxEx` and `hgetall` refactored** to use `safe()` instead of inline try/catch — uniform timeout + error handling across all operations
- **`redisHealthCheck()` exported**: pings Redis, returns `{ok: boolean, latency: number}`
- All existing public API (`redis.set`, `redis.get`, etc.), `redisEnabled` flag, and fail-open semantics preserved

## Key design decisions
- `AbortController` + `Promise.race` chosen over `AbortSignal.timeout()` because the latter creates a permanently-aborted signal — unusable for per-request deadlines
- `UpstashError` imported from `errors` export of `@upstash/redis` — allows precise detection of command-level errors vs network/connection failures
- `clearTimeout(timeoutId)` in `finally` block ensures no dangling timers even when operation completes before deadline
- The internal Upstash HTTP client creates a fake success response when its signal aborts, making signal injection at the HTTP level counterproductive — so timeout is handled purely at the `safe()` wrapper level
- Error logging uses `JSON.stringify(...)` for structured output (consistent with `rate-limit.ts` pattern)

## Files modified
- `supabase/functions/_shared/redis.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Blocks
Tasks 5–12 depend on Redis operations not hanging indefinitely and on structured error logging for debugging.

# Wave 2 — execute-trade: Price stale hardening, Binance timeout, structured errors, body limit, timing

## Change
Modified `supabase/functions/execute-trade/index.ts` to harden price stale handling, add Binance API timeout, structured error responses, body size limit, and request timing logging.

## What changed
- **Import added**: `checkBodySize` from `../_shared/body-size-limit.ts`
- **Body size limit**: Called `checkBodySize(req)` after rate limit check; returns 413 if payload > 1MB
- **Binance API timeout**: `fetchBinancePrice()` now uses `AbortController` with 5s timeout via `Promise.race` pattern (signal passed to fetch, timeout clears in finally)
- **Price stale → 429**: Two price-unavailable paths now return structured errors with `code: "PRICE_UNAVAILABLE"` / `code: "PRICE_STALE"`, `retryable: true`, and HTTP 429 (not 400)
- **Structured error format**: All error responses now use `{error: string, code?: string, retryable?: boolean}` — applied to:
  - Price errors (PRICE_UNAVAILABLE, PRICE_STALE, INVALID_PRICE)
  - Market hours errors (MARKET_CLOSED)
  - Position errors (POSITION_NOT_FOUND, POSITION_ALREADY_CLOSED, LOCK_FAILED)
  - Balance errors (BALANCE_UPDATE_FAILED, INSUFFICIENT_BALANCE)
  - Auth errors (UNAUTHORIZED)
  - Validation errors (INVALID_REQUEST)
  - Internal errors (INTERNAL_ERROR)
- **Request timing**: `const start = Date.now()` at handler entry; `console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}))` logged on both success and error paths
- **Try-catch enhanced**: Main handler's existing try-catch now logs timing in catch block before returning 500

## Key design decisions
- 5s timeout on Binance fetch matches Wave 1 Redis 3s timeout pattern — prevents hanging on external API
- 429 for stale/unavailable price (not 400) signals "retry later" to clients; `retryable: true` guides exponential backoff
- `checkBodySize` called after auth/rate-limit but before JSON parse — fails fast on oversized payloads
- Structured logging uses `console.error(JSON.stringify(...))` for parseable logs (consistent with rate-limit.ts and redis.ts)
- No changes to trade execution logic, balance deduction, notifications, copy-trade fan-out, or gamification

## Files modified
- `supabase/functions/execute-trade/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Blocks
Tasks 6-12 (other edge functions) can proceed in parallel; they follow same patterns.

# Wave 1 — Reset demo account: admin check, idempotency, audit log, timing

## Change
Modified `supabase/functions/reset-demo-account/index.ts` with admin role check, idempotency, audit logging, and request timing.

## What changed
- **Request timing**: `const start = Date.now()` added after user validation; `console.error(JSON.stringify({event: "request", duration_ms: ...}))` logged before each return/error path
- **Admin role check**: Profile fetched via `admin.from("profiles").select("is_admin, demo_balance").eq("id", user.id).single()`; if `profile?.is_admin !== true`, returns 403 with `{error: "Bu işlem için yetkiniz yok", code: "NOT_ADMIN"}`
- **Idempotency check**: If `profile.demo_balance === 100000`, returns `{success: true, changes: 0}` immediately without reset operations
- **Audit logging**: After successful reset, inserts row into `analytics_events_staging` with `event_type: "demo_reset", user_id: user.id, payload: {demo_balance: 100000}`
- **Structured error**: New 403 uses `{error: string, code: string}` format

## What stayed the same
- Auth flow (401 errors)
- Reset logic (delete positions, cancel orders, restore balance)
- Success response format (`{success: true}`)
- No new dependencies

## Files modified
- `supabase/functions/reset-demo-account/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

# Wave 1 — Blitz settle room: advisory lock timeout, structured phase logging, partial participant update protection, request timing

## Change
Modified `supabase/functions/blitz-settle-room/index.ts` with advisory lock timeout, structured phase logging, per-participant try-catch, and request timing.

## What changed
- **Advisory lock timeout (5s)**: `admin.rpc("try_advisory_lock", ...)` wrapped in `Promise.race` with `AbortController` — if lock not acquired within 5s, returns 409 with `{error: "Oda şu anda başka bir işlem tarafından kilitlenmiş", code: "LOCK_BUSY", retryable: true}`
- **Structured phase logging**: Each settlement phase logs `console.error(JSON.stringify({event: "settle_phase", phase: "lock"|"validate"|"settle"|"distribute"|"cleanup", room_id}))`
- **Partial participant update protection**: Participant update loop (profiles, balances, notifications) wrapped in per-iteration try-catch — one user's failure logs error but doesn't crash the settlement
- **Request timing**: `const start = Date.now()` at handler entry; `console.error(JSON.stringify({event: "request", duration_ms: ...}))` logged before every return/error path
- **Participant error logging**: Failed participant updates log `console.error(JSON.stringify({event: "settle_participant_error", room_id, user_id, error}))`

## What stayed the same
- Settlement logic (PnL calculation, winner determination)
- Prize distribution logic
- Notification logic
- `settlement_ledger` and `analytics_events_staging` inserts
- Auth logic (service_role / cron / user)
- No new dependencies

## Key design decisions
- `AbortController` + `Promise.race` for lock timeout (consistent with Redis adapter pattern from Wave 1)
- Lock timeout returns 409 with `retryable: true` so callers can back off and retry
- Phase logging uses `console.error(JSON.stringify(...))` for structured output (consistent with rate-limit.ts and redis.ts patterns)
- Per-participant try-catch ensures settlement completes for remaining users even if one profile update fails
- Request timing logged on ALL paths (success, 401, 500) for complete observability

## Files modified
- `supabase/functions/blitz-settle-room/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

# Wave 2 — VAPID validation hardening & request timing (send-push)

## Change
Modified `supabase/functions/send-push/index.ts` with structured VAPID error codes, try-catch around JWT generation, and request timing logging.

## What changed
- **Request timing**: `const start = Date.now()` added after auth check (line 88); `console.error(JSON.stringify({event: "request", duration_ms: ...}))` logged before every return/error path (VAPID missing, user_id missing, success, catch)
- **Structured VAPID missing error**: Lines 90–95 changed from returning `{skipped: true}` with status 200 to returning 503 with `{error: "Push bildirim ayarları eksik", code: "VAPID_NOT_CONFIGURED"}`
- **Try-catch around buildVapidJWT()**: Lines 56–62 wrap the `buildVapidJWT(audience)` call; on throw, logs `{event: "vapid_jwt_error", error: e.message}` and returns -1 (caller treats it as failed push)
- **VAPID_INVALID path**: When `importVapidKey()` throws (e.g. bad pub key format), the nested catch returns -1 with structured log — caller will eventually treat as failed push (not crash)

## What stayed the same
- Push delivery logic (fetch endpoint part)
- Subscription management (push_subscriptions table)
- VAPID key format and JWT structure
- `importVapidKey()` and `b64urlToUint8()` helpers
- Handler auth logic (401 for bad service role key)
- No new dependencies

## Key design decisions
- 503 chosen over 200 for VAPID missing so callers (DB trigger) know push wasn't sent — `skipped: true` was silently accepted as success
- Timing logged before each return rather than a single point to capture all exit paths including early exits (VAPID missing, user_id missing) and catch blocks
- Nested try-catch specifically around `buildVapidJWT()` preserves the existing outer catch for fetch errors — keeps VAPID JWT errors distinct from network failures

## Files modified
- `supabase/functions/send-push/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Blocks
None. This task runs independently of other Wave 2 tasks.

# Wave 2 — Blitz matchmaking: Redis fail-open, structured errors, body limit, timing

## Change
Modified `supabase/functions/blitz-matchmake/index.ts` with Redis fail-open wrapping, structured error codes, body size limit, and request timing logging.

## What changed
- **Body size limit**: `checkBodySize(req)` already imported and called after rate limit check — returns 413 if payload > 1MB (was already present from earlier wave)
- **Request timing**: `const start = Date.now()` at handler entry; timing logged via `console.error(JSON.stringify({event: "request", duration_ms: ...}))` on ALL exit paths (cancel, insufficient balance, lock failure, room create failure, queued, opponent invalid, price unavailable, match found)
- **Structured error codes**:
  - Balance insufficient → 402 `{error: "Yetersiz bakiye", code: "INSUFFICIENT_BALANCE", available: N}`
  - Price unavailable → 503 `{error: "Sembol için fiyat bilgisi alınamadı", code: "PRICE_UNAVAILABLE"}`
  - Lock failure → 409 `{error: "Bakiye kilitleme başarısız", code: "LOCK_FAILED"}`
  - Room creation failed → 500 `{error: "...", code: "ROOM_CREATE_FAILED"}`
- **Redis fail-open wrapping**:
  - Queue operations (lrem, lpop, rpush, expire) already had try-catch from earlier wave
  - Price fetch (`redis.get(blitz:price:...)`) wrapped in try-catch — on failure, falls through to price_cache fallback
  - Room Redis ops (hsetAll, sadd, expire) wrapped in single try-catch — on failure, log warning and continue (room already created in DB)

## What stayed the same
- Matchmaking logic (quick/create_private/cancel modes)
- Balance lock/unlock logic (conditional UPDATE pattern)
- Room creation logic
- `releaseStaleBalances()` logic
- `genInviteCode()` and Redis queue key naming
- Price fallback chain (Redis → price_cache)
- No new dependencies

## Key design decisions
- Redis room ops (hsetAll/sadd/expire) wrapped in a single try-catch block rather than per-operation — these are best-effort caching for realtime subscriptions, and the room is already persisted in DB
- Price fetch wrapped in try-catch separate from the existing price_cache fallback — ensures Redis timeout/error doesn't skip the fallback chain
- Timing log added to cancel mode and final success path for complete observability
- All Redis failures logged as `console.warn(JSON.stringify({event: "redis_fail_open", ...}))` for structured log parsing

## Files modified
- `supabase/functions/blitz-matchmake/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Blocks
None. Runs in parallel with other Wave 2 tasks.

# Wave 2 — Blitz tick order: structured errors, body limit, timing, TDZ bug fix

## Change
Modified `supabase/functions/blitz-tick-order/index.ts` with structured error codes on close-order paths, timing logs on all exit paths, and fixed a temporal dead zone bug.

## What changed
- **TDZ bug fix**: Removed timing log from auth error path (line 44) — `start` variable was referenced before its `const` declaration at line 48, which would cause a `ReferenceError` on unauthorized requests
- **Structured error codes** added to close-order error responses:
  - `close_order_atomic` RPC failure → 500 `{error: ..., code: "LOCK_FAILED"}`
  - `lockResult.error` → 404 `{error: ..., code: "ORDER_NOT_FOUND"}`
  - `order_timestamp` RPC failure → 500 `{error: "Sunucu zaman damgası alınamadı", code: "TIMESTAMP_FAILED"}`
  - `blitz_orders` update failure → 500 `{error: ..., code: "CLOSE_FAILED"}`
- **Request timing** added to all close-order exit paths (lockErr, lockResult.error, tsErr, cErr, success)
- **Request timing** added to open-order success path (was previously missing)
- **Preserved**: Body size limit (`checkBodySize`), rate limit, clock drift protection, idempotency key, price fallback (Redis → price_cache), `jsonResp()` signature unchanged

## What stayed the same
- Order open/close logic (tick_order_atomic, close_order_atomic RPCs)
- Idempotency key logic (CRSH-003)
- Clock drift protection (x-client-sent-at ±150ms)
- Advisory lock / close_order_atomic RPC usage
- Price fallback chain (Redis → price_cache → 503)
- `jsonResp()` helper function signature
- No new dependencies

## Key design decisions
- Auth error path (401) has no timing log because `start` is intentionally declared after auth check — timing authenticated requests only
- Error codes chosen to be semantically distinct: `LOCK_FAILED` (RPC issue), `ORDER_NOT_FOUND` (business logic), `TIMESTAMP_FAILED` (server infra), `CLOSE_FAILED` (DB write)
- All timing logs use `console.error(JSON.stringify({event: "request", duration_ms: ...}))` for structured parsing (consistent with other edge functions)

## Files modified
- `supabase/functions/blitz-tick-order/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Blocks
None. Runs in parallel with other Wave 2 tasks.

# Wave 2 — Price Feed Partial Failure Handling & Timeouts

## Change
Modified `supabase/functions/price-feed/index.ts` to handle partial failures per symbol, add API timeouts, return failed symbols in response, and add structured request timing logs.

## What changed
- **`fetchBinance()`**: 
  - Added 5s `AbortController` timeout to the batch fetch call
  - Wrapped each symbol's processing in individual try-catch — one bad tick doesn't fail the batch
  - Empty Binance response now tracked as failures per symbol instead of silent skip
  - Returns `{ updates: PriceUpdate[], failed: Array<{symbol, error}> }`

- **`fetchYahoo()`**: 
  - Changed return type to match Binance: `{ updates, failed }`
  - Tracks failed symbols from `fetchYahooChart()` null returns

- **`fetchYahooChart()`**: 
  - Added 5s `AbortController` timeout to each individual chart fetch
  - Timeout and errors logged with structured `console.error`

- **Handler**:
  - Captures `const start = Date.now()` at entry
  - Aggregates `failed` from both Binance and Yahoo results
  - Logs `price_fetch_failures` event with failed symbols array when any fail
  - Response now includes `failed: Array<{symbol, error}>` field
  - Logs `console.error(JSON.stringify({event: "request", duration_ms: N}))` at end

## Key design decisions
- Per-symbol try-catch in Binance loop: batch fetch succeeds even if individual symbols have bad data
- 5s timeout chosen to balance reliability vs cron schedule (runs every minute)
- Empty Binance response treated as failure for all requested symbols (not silent skip)
- Yahoo chart fetch already per-symbol via `Promise.all(map)` — added timeout per request
- Structured logging pattern: `console.error(JSON.stringify({event: "...", ...}))` consistent with Wave 1
- Response shape changed from `{success, updated, crypto, yahoo, ...}` to include `failed` array
- No changes to: SYMBOLS array, upsert logic, Redis cache writing, order/alert triggering, fillOrder, auth

## Files modified
- `supabase/functions/price-feed/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Blocks
Tasks 5, 7-12 can proceed in parallel — price-feed now resilient to partial API failures.

# Wave 2 — Blitz join private: Body size limit, price fallback, TOCTOU balance lock, structured errors, timing

## Change
Modified `supabase/functions/blitz-join-private/index.ts` with body size limit, Redis→price_cache fallback for room activation, conditional UPDATE for TOCTOU balance lock protection, structured error codes, and request timing logging.

## What changed
- **Body size limit**: Imported `checkBodySize` from `../_shared/body-size-limit.ts`; called at handler entry after auth — returns 413 with `code: "PAYLOAD_TOO_LARGE"` if payload > 1MB
- **Price fallback for room activation**: When room fills up and activates, price fetch now follows Redis → price_cache chain (same pattern as blitz-matchmake lines 291-295). If both sources unavailable, returns 503 with `code: "PRICE_UNAVAILABLE"`
- **TOCTOU balance lock protection**: Changed unconditional `profiles.update(...)` to conditional UPDATE with `.eq("real_balance_locked", Number(profile.real_balance_locked))` — if concurrent request modified the lock, returns 409 with `code: "LOCK_CONFLICT"` (pattern from blitz-matchmake lines 181-184)
- **Structured error codes** on all error responses:
  - Unauthorized → 401 `{error: "Yetkisiz erişim", code: "UNAUTHORIZED"}`
  - Invite code missing → 400 `{error: "Davet kodu eksik", code: "INVITE_CODE_MISSING"}`
  - Room not found → 404 `{error: "Oda bulunamadı", code: "ROOM_NOT_FOUND"}`
  - Room unavailable (not waiting) → 409 `{error: "Oda kullanılamıyor", code: "ROOM_UNAVAILABLE"}`
  - Profile not found → 404 `{error: "Profil bulunamadı", code: "PROFILE_NOT_FOUND"}`
  - Insufficient balance → 402 `{error: "Yetersiz bakiye", code: "INSUFFICIENT_BALANCE"}`
  - Balance lock conflict → 409 `{error: "Bakiye kilitleme başarısız...", code: "LOCK_CONFLICT"}`
  - Price unavailable on activation → 503 `{error: "Sembol için fiyat bilgisi alınamadı", code: "PRICE_UNAVAILABLE"}`
- **Request timing**: `const start = Date.now()` at handler entry; `console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}))` logged before final success return

## What stayed the same
- Room join logic (invite_code lookup, participant insert)
- Participant limit logic (max_players check)
- Room activation logic (status update, Redis hsetAll, pot calculation) — only added price fallback and 503 error
- No new dependencies

## Key design decisions
- Conditional UPDATE for balance lock mirrors blitz-matchmake pattern exactly — prevents double-locking on concurrent join requests
- Price fallback chain (Redis → price_cache) ensures room can activate even if price-feed hasn't written to Redis yet
- 503 for price unavailable signals "service temporarily unavailable" — room stays in waiting state, caller can retry
- Body size limit called after auth but before JSON parse — fails fast on oversized payloads
- Timing log uses `console.error(JSON.stringify(...))` for structured parsing (consistent with other edge functions)

## Files modified
- `supabase/functions/blitz-join-private/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Blocks
None. Runs in parallel with other Wave 2 tasks (Tasks 5-9, 11-12).

# Wave 2 — daily-brief: OpenRouter error mapping, 30s timeout, structured errors, request timing

## Change
Modified `supabase/functions/daily-brief/index.ts` with OpenRouter error response mapping, 30s AbortController timeout, structured error codes, and request timing logging.

## What changed
- **30s AbortController timeout**: OpenRouter fetch wrapped in `AbortController` with 30s timeout via `setTimeout`; signal passed to `fetch()`, timeout cleared in `finally` block
- **OpenRouter error mapping**:
  - 429 → 429 `{error, code: "RATE_LIMITED", retryable: true}`
  - 402 → 503 `{error, code: "QUOTA_EXCEEDED"}`
  - 5xx → 503 `{error, code: "AI_UNAVAILABLE"}`
  - Timeout (AbortError) → 504 `{error, code: "AI_TIMEOUT"}`
- **Structured error codes** added to all error responses:
  - Auth errors → `code: "UNAUTHORIZED"` (both missing header and invalid user paths)
  - Catch block → `code: "INTERNAL_ERROR"` (500), `code: "AI_TIMEOUT"` (504)
- **Request timing**: `const start = Date.now()` after auth check; `console.error(JSON.stringify({event: "request", duration_ms: N}))` logged on ALL exit paths:
  - "Already briefed" early return (line 40)
  - All 3 OpenRouter error returns (429, 402/503, 5xx/503)
  - Success return (line 115)
  - Catch block (both timeout and generic error paths)

## What stayed the same
- AI system prompt (Turkish/English market analyst prompt)
- `daily_briefs` insert logic and response shape
- Sentiment calculation (avgChange → bullish/bearish/neutral)
- Context assembly (positions, watchlist, price_cache)
- Auth flow (401 for missing/invalid auth)
- No new dependencies

## Files modified
- `supabase/functions/daily-brief/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Key design decisions
- `(e as Error)?.name === "AbortError"` check used instead of `instanceof DOMException` for Deno portability (Deno strict TS types catch param as `{}`)
- `clearTimeout()` in inner finally block ensures no dangling timers when fetch completes before deadline
- 30s timeout chosen as reasonable upper bound for LLM API response (OpenRouter GPT-4o-mini typically responds in 5-15s)
- Timing logged before every return (not via wrapper) to keep response construction explicit and consistent with other edge functions
- `retryable: true` on 429 signals callers to back off and retry

# Wave 2 — AI risk monitor: structured logging, request timing, structured errors

## Change
Modified `supabase/functions/ai-risk-monitor/index.ts` with structured logging per risk check, request timing, and structured error codes.

## What changed
- **Request timing**: `const start = Date.now()` added after auth check (line 47); `console.error(JSON.stringify({event: "request", duration_ms: ...}))` logged before success return
- **Per-check-type alert counters**: `concentrationAlerts`, `lossAlerts`, `disciplineAlerts` track alerts per check type (accumulated across all users)
- **Structured risk check logging**: After all users processed, logs three events:
  - `{event: "risk_check", check: "concentration", alerts_created: N}`
  - `{event: "risk_check", check: "loss", alerts_created: N}`
  - `{event: "risk_check", check: "discipline", alerts_created: N}`
- **Structured error codes** added to all error responses:
  - 401 → `{error: "Yetkisiz erişim", code: "UNAUTHORIZED"}`
  - 400 → `{error: "...", code: "INVALID_BODY"}`
  - 500 → `{error: "Sunucu hatası oluştu", code: "RISK_MONITOR_ERROR"}`
- **Structured catch logging**: `console.error("ai-risk-monitor error", e)` replaced with `console.error(JSON.stringify({event: "ai_risk_monitor_error", error: e.message}))`

## What stayed the same
- Risk detection logic (concentration >50% threshold, loss <=-10% threshold, discipline <=-5% threshold)
- Cooldown logic (6-hour dedup via `sentSignals` Set)
- Notification insert logic (title, body, link, metadata shape)
- No new dependencies

## Key design decisions
- Per-check-type counters accumulated across all users (not per-user) — cleaner observability for request-level monitoring
- Timing logged only on success path (early returns for OPTIONS/401/400/no-positions don't get timing — consistent with pattern of measuring actual work)
- Structured error logging in catch block surfaces error message without stack trace (consistent with other edge functions)
- Empty body handling (no positions → returns 200 with `alerts: 0`) verified unchanged

## Files modified
- `supabase/functions/ai-risk-monitor/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Blocks
None. Runs in parallel with other Wave 2 tasks.

# Wave 2 — Weekly Digest: null-safe operations, request timing, structured errors

## Change
Modified `supabase/functions/weekly-digest/index.ts` with null guards on array access, request timing on all exit paths, and `code` fields on error responses.

## What changed
- **Request timing**: `const start = Date.now()` added after user auth check (line 43); `console.log(JSON.stringify({event: "request", duration_ms: Date.now() - start}))` logged before every return path:
  - Already-sent-this-week skip (line 57)
  - Not-enough-trades skip (line 74)
  - Success return (line 166)
  - Catch error block (line 170)
- **Structured error codes**:
  - Auth header missing / user not found → 401 `{error: "Yetkisiz erişim", code: "UNAUTHORIZED"}`
  - Catch block → 500 `{error: "Sunucu hatası oluştu", code: "DIGEST_ERROR"}`
- **Null-safe operations**:
  - `bestIntent` (line 95): Added `?? null` after `[0]` — guards against empty filter results producing `undefined`
  - `dominantMood` (line 101): Added `?? null` after `[0]` — guards against empty `moodCounts` producing `undefined`
- The `sorted[0]` and `sorted[sorted.length - 1]` accesses (lines 82–83) are protected by the existing `closes.length < 2` guard at line 73

## What stayed the same
- Digest generation logic (lines, title, body construction)
- Throttle logic (last_weekly_digest_at check)
- Notification insert (`notifications` table)
- Coach insight insert (`coach_insights` table)
- Profile update (`last_weekly_digest_at`)
- `json()` helper function signature
- No new dependencies

## Key design decisions
- `start` placed after auth check (not at handler entry) so timing only measures authenticated requests — consistent with blitz-tick-order pattern
- Timing logged before each return rather than at a single exit point to capture ALL paths including early skips and catch block
- `?? null` chosen over `?? undefined` on `bestIntent`/`dominantMood` for consistent null sentinel type — existing `if (bestIntent)` / `if (dominantMood)` checks work identically
- `sorted[0]`/`sorted[sorted.length-1]` left unchanged because the pre-existing `< 2` guard guarantees at least 2 elements in `closes` (and thus `sorted`)
- Structured logging uses `console.log(JSON.stringify(...))` for parseable logs (consistent with rate-limit.ts pattern)

## Files modified
- `supabase/functions/weekly-digest/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

# Wave 2 — AI Chat: OpenRouter error mapping, streaming error handling, 30s timeout, request timing

## Change
Modified `supabase/functions/ai-chat/index.ts` with OpenRouter error code mapping, AbortController timeout (30s), mid-stream error logging, and structured request timing on all exit paths.

## What changed
- **Request timing**: `let start = 0` declared at handler entry (before try); `start = Date.now()` assigned after auth check passes; `console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}))` logged before every return/error path (after start is set)
- **AbortController 30s timeout**: `controller = new AbortController()`, `setTimeout(() => controller.abort(), 30000)` before OpenRouter fetch; `signal: controller.signal` passed to fetch; `clearTimeout(timeoutId)` in `.finally()` on fetch promise
- **OpenRouter error mapping**:
  - 429 → 429 `{error: "Çok fazla istek, lütfen bekleyin.", code: "RATE_LIMITED"}`
  - 402 → 503 `{error: "AI kredisi yetersiz.", code: "QUOTA_EXCEEDED"}`
  - 5xx → 503 `{error: "AI servisi hatası", code: "AI_UNAVAILABLE"}`
  - Timeout (AbortError) → 504 `{error: "AI servisi zaman aşımı", code: "AI_TIMEOUT"}` — caught in catch block via `e instanceof DOMException && e.name === "AbortError"`
- **Streaming error handling**: `resp.body!.pipeTo(writable)` on a `TransformStream`; `.catch()` logs `"Stream error:"` with the error — mid-stream failures are logged server-side without crashing
- **Structured error codes**: Added `code` field (RATE_LIMITED, QUOTA_EXCEEDED, AI_UNAVAILABLE, AI_TIMEOUT) to all OpenRouter error responses (no code on auth/validation errors — unchanged)

## What stayed the same
- Auth flow (401 for missing/invalid token)
- Rate limit response (rlResponse returned directly from rateLimit function, now with timing logged before return)
- Zod schema (ChatRequestSchema, ChatMessageSchema)
- AI prompt construction (sys message per language)
- SSE response format (text/event-stream)
- CORS headers
- No new dependencies

## Key design decisions
- `start` declared outside try block (`let start = 0`) so catch block can reference it for timing — avoids `ReferenceError` on timeout/catch paths
- `AbortController` + `setTimeout` chosen over `AbortSignal.timeout(30000)` because the latter cannot be reused and offers no benefit for a single fetch
- `.finally(() => clearTimeout(timeoutId))` on fetch promise ensures no dangling timer whether fetch succeeds or fails
- `TransformStream` passthrough for SSE body: the pipe `.catch()` logs mid-stream errors without trying to inject error JSON into an already-partial SSE stream
- Structured timing logged before each return (not a wrapper) to cover all paths including early exits and catch blocks
- 402→503 (not 402) per OpenRouter convention — 402 is non-standard for HTTP; 503 with QUOTA_EXCEEDED code signals service degradation with specific cause
- Auth error paths (401) intentionally lack timing logs — `start` not yet set (consistent with blitz-tick-order pattern)

## Files modified
- `supabase/functions/ai-analyze/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Blocks
None. Runs in parallel with other Wave 2 tasks.

# Wave 3 — AI Strategy: OpenRouter error mapping, 30s timeout, structured timing

## Change
Modified `supabase/functions/ai-strategy/index.ts` with OpenRouter error code mapping, AbortController timeout (30s), structured error codes with retryable flag, and request timing logging.

## What changed
- **30s AbortController timeout**: OpenRouter fetch wrapped in AbortController with 30s timeout
- **OpenRouter error mapping**: 429→429(RATE_LIMITED), 402→503(QUOTA_EXCEEDED), 5xx→503(AI_UNAVAILABLE), timeout→504(AI_TIMEOUT)
- **Request timing**: duration_ms logged on all exit paths
- **Structured error codes**: Added code field (RATE_LIMITED, QUOTA_EXCEEDED, AI_UNAVAILABLE, AI_TIMEOUT)

## Files modified
- `supabase/functions/ai-strategy/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

# Wave 3 — AI Risk Monitor: structured logging, request timing, structured errors

## Change
Modified `supabase/functions/ai-risk-monitor/index.ts` with per-check-type alert counters, structured risk check logging, and structured error codes.

## What changed
- **Per-check-type alert counters**: concentrationAlerts, lossAlerts, disciplineAlerts
- **Structured risk check logging**: Three events logged after all users processed
- **Structured error codes**: INVALID_BODY, RISK_MONITOR_ERROR, UNAUTHORIZED
- **Request timing**: duration_ms logged at end

## Files modified
- `supabase/functions/ai-risk-monitor/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

# Wave 3 — Trade Mirror: OpenRouter error mapping, 30s timeout, structured timing

## Change
Modified `supabase/functions/trade-mirror/index.ts` with OpenRouter error code mapping, AbortController timeout (30s), structured error responses, and request timing logging.

## What changed
- **30s AbortController timeout**: OpenRouter fetch with 30s timeout
- **OpenRouter error mapping**: 429→429 (retryable), 402→503(QUOTA_EXCEEDED), 5xx→503(AI_UNAVAILABLE), timeout→504(AI_TIMEOUT)
- **Request timing**: duration_ms logged on all exit paths
- **Structured error responses**: All error paths return structured format

## Files modified
- `supabase/functions/trade-mirror/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

# Wave 3 COMPLETE

All 8 Wave 3 tasks (13-20) implemented and verified. Changes staged for commit.
- ai-analyze: OpenRouter error mapping, 30s timeout, structured timing
- ai-chat: Streaming error handling, OpenRouter mapping, timeout
- ai-strategy: OpenRouter error mapping, timeout
- ai-trade-coach: OpenRouter mapping, null-safe parse, timeout
- ai-risk-monitor: Structured logging, error codes
- daily-brief: OpenRouter error mapping, timeout
- weekly-digest: Null-safe operations, timing, error codes
- trade-mirror: OpenRouter error mapping, timeout

# Wave 2 — AI Trade Coach: OpenRouter error mapping, 30s timeout, null-safe parse, request timing

## Change
Modified `supabase/functions/ai-trade-coach/index.ts` with OpenRouter error code mapping, AbortController timeout (30s), structured JSON parse error code, and request timing on all exit paths.

## What changed
- **Module-level `_lastAiError`**: Added `let _lastAiError: string | null = null` to communicate specific AI error codes from `generateInsight()` to the handler for HTTP status mapping
- **AbortController 30s timeout**: `controller = new AbortController()`, `setTimeout(() => controller.abort(), 30000)` before OpenRouter fetch; `signal: controller.signal` passed to fetch; `clearTimeout(timeoutId)` after fetch resolves
- **OpenRouter error mapping** (in `generateInsight()`):
  - 429 → sets `_lastAiError = "RATE_LIMITED"`
  - 402 → sets `_lastAiError = "QUOTA_EXCEEDED"`
  - 5xx → sets `_lastAiError = "AI_UNAVAILABLE"`
  - Other non-ok → sets `_lastAiError = "AI_ERROR"`
  - Timeout (AbortError) → sets `_lastAiError = "AI_TIMEOUT"` — caught via `e instanceof DOMException && e.name === "AbortError"`
- **Null-safe JSON.parse**: The existing try-catch around `JSON.parse(content)` now sets `_lastAiError = "AI_PARSE_ERROR"` in the catch block — structured error code instead of silent null return
- **Request timing**: `const start = Date.now()` at handler entry; all response paths include `{event: "request", duration_ms: N}` in the JSON body (400, 401, 403, 429, 503, 504, 500, success, batch success)
- **Structured error codes in handler**: When `processUser()` returns `{skipped: true, reason: "ai_failed"}`, the handler reads `_lastAiError` and maps it to:
  - `RATE_LIMITED` → 429 `{error: "Çok fazla istek, lütfen bekleyin", code: "RATE_LIMITED"}`
  - `QUOTA_EXCEEDED` → 503 `{error: "AI servis kotası aşıldı", code: "QUOTA_EXCEEDED"}`
  - `AI_TIMEOUT` → 504 `{error: "AI servisi zaman aşımı", code: "AI_TIMEOUT"}`
  - `AI_UNAVAILABLE` → 503 `{error: "AI servisi geçici olarak kullanılamıyor", code: "AI_UNAVAILABLE"}`
  - Other → 502 with generic message

## What stayed the same
- Zod schema (`TradeCoachRequestSchema`)
- AI prompt template and response format
- `analyzeBehavior()` function
- `processUser()` function (unchanged — the module-level `_lastAiError` pattern bridges the gap)
- CORS headers
- No new dependencies

## Key design decisions
- Module-level `_lastAiError` communicates error type from `generateInsight()` to handler without changing the `null` return type or modifying `processUser()` — respects the "no changes to processUser" constraint
- `_lastAiError` is read and then `null`-ed in the handler to prevent stale errors leaking across requests
- `AbortController` + `setTimeout` chosen over `AbortSignal.timeout(30000)` for consistency with other edge functions
- Structured timing included on ALL response paths including early exits (400 validation, 401 auth, 403 forbidden, 500 catch) — complete observability
- Auth/validation error paths (400, 401, 403) include timing but no `code` field (only AI failures get `code`)

## Files modified
- `supabase/functions/ai-trade-coach/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)

## Blocks
None. Runs in parallel with other Wave 2 tasks.

# Wave 2 — AI Analyze: OpenRouter error mapping, 30s timeout, structured timing

## Change
Modified `supabase/functions/ai-analyze/index.ts` with OpenRouter error code mapping, `AbortController` timeout (30s), structured error responses with `code` fields, and request timing logging.

## What changed
- **Request timing**: `let start = 0` declared at handler entry (before try); `start = Date.now()` assigned after auth check passes; `console.error(JSON.stringify({event: "request", duration_ms: Date.now() - start}))` logged before every return/error path (after start is set)
- **AbortController 30s timeout**: `new AbortController()` + `setTimeout(() => controller.abort(), 30000)` before OpenRouter fetch; `signal: controller.signal` passed to fetch; `clearTimeout(timeoutId)` after fetch completes
- **OpenRouter error mapping**:
  - 429 → 429 with `{error: "AI istek limiti doldu", code: "AI_RATE_LIMITED", retryable: true}`
  - 402 → 503 with `{error: "AI kredisi yetersiz", code: "QUOTA_EXCEEDED"}` (HTTP 503, not 402)
  - 500/502/503 → 503 with `{error: "AI servisi kullanılamıyor", code: "AI_UNAVAILABLE"}`
  - Timeout (AbortError) → 504 with `{error: "AI zaman aşımı", code: "AI_TIMEOUT"}` — caught in catch block via `e instanceof DOMException && e.name === "AbortError"`
- **Structured error codes**: Added `code` field (AI_RATE_LIMITED, QUOTA_EXCEEDED, AI_UNAVAILABLE, AI_TIMEOUT) and `retryable: true` on 429 response
- **Timing on all paths**: Success return, all error/early returns (after `start` is set), and catch block all log `{event: "request", duration_ms: N}`

## What stayed the same
- Auth flow (401 for missing/invalid token)
- Rate limit response (rlResponse returned directly)
- Zod schema (AnalyzeRequestSchema)
- AI prompt construction (sys message per language)
- Success response format (`{analysis: content}`)
- CORS headers
- No new dependencies

## Key design decisions
- `start` declared outside try block (`let start = 0`) so catch block can reference it for timing
- `AbortController` + `setTimeout` pattern (consistent with ai-chat and other Wave 2 functions)
- 402→503 (not 402) per OpenRouter convention — 402 is non-standard for HTTP; 503 with QUOTA_EXCEEDED signals service degradation
- 500/502/503 all map to same 503 AI_UNAVAILABLE — client only needs one "AI down" code regardless of upstream status
- Timing logged before each return (not wrapper function) to cover all paths including catch block
- Auth error paths (401) and OPTIONS intentionally lack timing logs — `start` not yet set (consistent with blitz-tick-order pattern)

## Files modified
- `supabase/functions/ai-analyze/index.ts`
- `.omo/notepads/edge-function-fix/learnings.md` (this file)
