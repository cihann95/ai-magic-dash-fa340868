# Edge Function non-2xx Hataları Düzeltme Planı

## TL;DR

> **Quick Summary**: Supabase Edge Function'larında çalışan canlı sistemde "Edge Function returned a non-2xx status code" hatası alınıyor. Bu hatalar işlem açma/kapatma (execute-trade), blitz odası işlemleri (matchmake/tick-order/settle), ve AI fonksiyonlarında meydana geliyor. Kök nedenler: 1) ConfigError ile crash olan env var eksikliği, 2) Redis bağlantı/senaryo hataları, 3) AI gateway hatalarının düzgün mapped edilmemesi. Tüm 17 Edge Function için graceful degradation, error mapping, structured logging ve verification testleri eklenecek.
>
> **Deliverables**:
> - Tüm 17 Edge Function'da graceful degradation (crash → fallback response)
> - ConfigError crash fix (cold start koruması)
> - Redis fail-open hardening
> - AI gateway error mapping (429→429, 402→503, 502→503)
> - Structured logging (request_id, error_code, duration)
> - Per-function smoke test scenarios
>
> **Estimated Effort**: Medium (3-4 dalga)
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Wave 1 (shared modules) → Wave 2 (core trade functions) → Wave 3 (blitz + AI) → Wave 4 (remaining) → Final

---

## Context

### Original Request
"Edge Function returned a non-2xx status code hatası alıyorum işlem açarken ve kapatırken. Bu durum çok sıkıntılı çünkü site canlıda. Ona göre hatasız yapılması lazım."

"Alt ajanlar spawn et gerekirse ama asla atlamadan hepsini düzelt"

### Interview Summary
**Key Discussions**:
- Canlı sitede 5xx hataları - zero-downtime fix zorunlu
- Tüm fonksiyonlarda hata var - kapsamlı fix gerekiyor
- 3 kök neden tespit edildi: env vars, Redis, AI gateway

**Research Findings**:
- 17 Edge Function mevcut (supabase/functions/)
- Shared modules: config.ts (import-time crash), rate-limit.ts (fail-open), redis.ts (fail-open), blitz-types.ts
- Config.ts line 123: `export const config: Config = loadConfig();` import'ta çalışır → missing var = crash
- AI fonksiyonları OpenRouter'a bağımlı (429/402/502 response'ları → function 500)
- Blitz fonksiyonları Redis fiyat cache'ine bağımlı
- Rate limit ve Redis fail-open tasarlanmış ama bazı edge case'ler eksik
- Test altyapısı mevcut: vitest, execute-trade/blitz-tick-order/rate-limit/ai-analyze testleri var

### Metis Review
**Identified Gaps** (addressed):
- Production log analizi yapılmadı (deploy sürecinde yapılacak)
- Environment variables validation check'i yok → eklendi
- AI gateway timeout handling eksik → eklendi
- Structured logging eksik → eklendi
- Body size limit yok → eklendi
- Per-function acceptance criteria eksikti → eklendi

---

## Work Objectives

### Core Objective
Tüm 17 Supabase Edge Function'da non-2xx (özellikle 5xx) hatalarını ortadan kaldırarak graceful degradation sağlamak. Canlı sistemde zero-downtime ile deploy edilecek.

### Concrete Deliverables
- `_shared/config.ts`: ConfigError graceful degradation (crash → console.error + fallback)
- `_shared/redis.ts`: Connection pool hardening + error categorization
- `_shared/rate-limit.ts`: Structured 429 response headers
- `_shared/blitz-types.ts`: Admin type enhancement
- `execute-trade/index.ts`: Price stale check hardening, AI error mapping
- `blitz-matchmake/index.ts`: Price fetch fallback, Redis fail-open
- `blitz-tick-order/index.ts`: Price fallback, error categorization
- `blitz-settle-room/index.ts`: Advisory lock timeout handling
- `blitz-join-private/index.ts`: Price fallback, balance lock hardening
- `ai-analyze/index.ts`: OpenRouter error mapping (429→429, 402→503, timeout→504)
- `ai-chat/index.ts`: OpenRouter streaming error handling
- `ai-strategy/index.ts`: OpenRouter error mapping
- `ai-trade-coach/index.ts`: OpenRouter error mapping, null-safe parsing
- `ai-risk-monitor/index.ts`: Structured logging
- `price-feed/index.ts`: Partial failure handling, Yahoo fallback
- `daily-brief/index.ts`: OpenRouter error mapping
- `weekly-digest/index.ts`: Null-safe operations
- `send-push/index.ts`: VAPID key validation
- `trade-mirror/index.ts`: OpenRouter error mapping
- `reset-demo-account/index.ts`: Authz hardening

### Definition of Done
- [ ] All 17 functions return 0% 5xx for 24 hours post-fix
- [ ] ConfigError no longer crashes cold starts
- [ ] AI functions return proper error codes (429/503/504)
- [ ] Redis failure = request still processed (fail-open verified)
- [ ] Structured logs visible in Supabase dashboard
- [ ] Per-function smoke tests pass

### Must Have
- Zero-downtime deployment
- All functions handle missing env vars gracefully
- AI error mapping (OpenRouter → proper HTTP codes)
- Structured logging in every function
- Body size limit (1MB) for all functions
- Per-function acceptance criteria with curl smoke tests
- Rollback plan documented per function

### Must NOT Have (Guardrails)
- No new features or API changes
- No shared module refactoring unless proven root cause
- No dependency upgrades
- No new test files beyond what's needed to verify fixes
- No architecture changes (circuit breakers, new patterns)
- No database migrations
- No changes to authentication/authorization logic
- No changes to business logic in execute-trade/blitz functions
- No changes to function signatures or request/response shapes

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: Tests-after (add focused tests for fixed code paths only)
- **Framework**: vitest (existing)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Edge Functions**: Use Bash (curl) - Send requests with exact JSON bodies, assert status + response fields
- **Shared Modules**: Use Bash (bun/node REPL) - Import, call functions, compare output
- **AI Functions**: Use Bash (curl) - Test error mapping with mocked responses

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - shared module hardening):
├── Task 1: _shared/config.ts - ConfigError graceful degradation [quick]
├── Task 2: _shared/redis.ts - Connection hardening + error categorization [quick]
├── Task 3: _shared/rate-limit.ts - Structured 429 headers [quick]
├── Task 4: _shared/body-size-limit.ts - New shared module for 1MB limit [quick]

Wave 2 (After Wave 1 - core trade functions, MAX PARALLEL):
├── Task 5: execute-trade/index.ts - Price stale hardening + error mapping [deep]
├── Task 6: price-feed/index.ts - Partial failure handling + Yahoo fallback [deep]
├── Task 7: blitz-tick-order/index.ts - Price fallback + error categorization [deep]
├── Task 8: blitz-matchmake/index.ts - Price fallback + Redis fail-open [deep]
├── Task 9: blitz-settle-room/index.ts - Advisory lock timeout + error handling [deep]
├── Task 10: blitz-join-private/index.ts - Price fallback + balance lock [deep]
├── Task 11: send-push/index.ts - VAPID key validation [quick]
├── Task 12: reset-demo-account/index.ts - Authz hardening [quick]

Wave 3 (After Wave 2 - AI functions, MAX PARALLEL):
├── Task 13: ai-analyze/index.ts - OpenRouter error mapping [quick]
├── Task 14: ai-chat/index.ts - Streaming error handling [quick]
├── Task 15: ai-strategy/index.ts - OpenRouter error mapping [quick]
├── Task 16: ai-trade-coach/index.ts - OpenRouter + null-safe [quick]
├── Task 17: ai-risk-monitor/index.ts - Structured logging [quick]
├── Task 18: daily-brief/index.ts - OpenRouter error mapping [quick]
├── Task 19: weekly-digest/index.ts - Null-safe operations [quick]
├── Task 20: trade-mirror/index.ts - OpenRouter error mapping [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
├── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 5 → Task 13 → F1-F4 → user okay
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 8 (Waves 2 & 3)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | None | 5-12 | 1 |
| 2 | None | 5-12 | 1 |
| 3 | None | 5-12 | 1 |
| 4 | None | 5-12 | 1 |
| 5 | 1,2,3,4 | 13-20 | 2 |
| 6 | 1,2,3,4 | 13-20 | 2 |
| 7 | 1,2,3,4 | 13-20 | 2 |
| 8 | 1,2,3,4 | 13-20 | 2 |
| 9 | 1,2,3,4 | 13-20 | 2 |
| 10 | 1,2,3,4 | 13-20 | 2 |
| 11 | 1,2,3,4 | 13-20 | 2 |
| 12 | 1,2,3,4 | 13-20 | 2 |
| 13 | 5,6,7,8 | F1-F4 | 3 |
| 14 | 5,6,7,8 | F1-F4 | 3 |
| 15 | 5,6,7,8 | F1-F4 | 3 |
| 16 | 5,6,7,8 | F1-F4 | 3 |
| 17 | 5,6,7,8 | F1-F4 | 3 |
| 18 | 5,6,7,8 | F1-F4 | 3 |
| 19 | 5,6,7,8 | F1-F4 | 3 |
| 20 | 5,6,7,8 | F1-F4 | 3 |
| F1 | All | - | FINAL |
| F2 | All | - | FINAL |
| F3 | All | - | FINAL |
| F4 | All | - | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks - T1→`quick`, T2→`quick`, T3→`quick`, T4→`quick`
- **Wave 2**: 8 tasks - T5→`deep`, T6→`deep`, T7→`deep`, T8→`deep`, T9→`deep`, T10→`deep`, T11→`quick`, T12→`quick`
- **Wave 3**: 8 tasks - T13→`quick`, T14→`quick`, T15→`quick`, T16→`quick`, T17→`quick`, T18→`quick`, T19→`quick`, T20→`quick`
- **FINAL**: 4 tasks - F1→`oracle`, F2→`unspecified-high`, F3→`unspecified-high`, F4→`deep`

---

## TODOs

- [x] 1. _shared/config.ts - ConfigError Graceful Degradation

  **What to do**:
  - Modify `_shared/config.ts` to catch ConfigError at module load time
  - Instead of crashing, log warning and return a degraded config with empty strings for missing vars
  - Keep ConfigError throw for local/dev environment (fail-fast in development)
  - Add `isConfigValid()` helper function that checks if critical vars are set
  - Every function that uses config should check `isConfigValid()` before proceeding

  **Must NOT do**:
  - Do NOT change the Config interface
  - Do NOT remove ConfigError class
  - Do NOT change function signatures

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4)
  - **Blocks**: Tasks 5-12
  - **Blocked By**: None

  **References**:
  - `supabase/functions/_shared/config.ts:75-123` - ConfigError class and loadConfig function
  - `supabase/functions/_shared/config.ts:36-41` - ConfigError definition
  - `supabase/functions/_shared/config.ts:96-111` - loadConfig with getRequired/getOptional

  **Acceptance Criteria**:
  - [ ] ConfigError caught at module load in production mode
  - [ ] `isConfigValid()` returns false when required vars missing
  - [ ] Development mode still throws ConfigError (fail-fast)
  - [ ] Existing imports of `config` still work unchanged

  **QA Scenarios**:
  ```
  Scenario: ConfigError caught in production mode
    Tool: Bash
    Preconditions: Set SUPABASE_URL="" in test environment
    Steps:
      1. cd supabase/functions && deno eval "Deno.env.set('SUPABASE_URL', ''); Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test'); Deno.env.set('SUPABASE_ANON_KEY', 'test'); Deno.env.set('OPENROUTER_API_KEY', 'test'); import('./_shared/config.ts')"
      2. Verify no crash, config loaded with empty supabaseUrl
      3. Verify isConfigValid() returns false
    Expected Result: Config loads with degraded state, isConfigValid() = false
    Failure Indicators: Uncaught ConfigError, process exit
    Evidence: .omo/evidence/task-1-config-degraded.txt

  Scenario: ConfigError still thrown in dev mode
    Tool: Bash
    Preconditions: NODE_ENV=development
    Steps:
      1. cd supabase/functions && NODE_ENV=development deno eval "Deno.env.set('SUPABASE_URL', ''); import('./_shared/config.ts')"
      2. Verify ConfigError is thrown
    Expected Result: ConfigError thrown with message "SUPABASE_URL is required but not set"
    Failure Indicators: No error thrown, config loads with empty values
    Evidence: .omo/evidence/task-1-config-dev-throw.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `fix(shared): ConfigError graceful degradation in production`
  - Files: `supabase/functions/_shared/config.ts`

- [x] 2. _shared/redis.ts - Connection Hardening + Error Categorization

  **What to do**:
  - Add connection timeout (3s) to all Redis operations via AbortController
  - Add structured error types: `RedisConnectionError`, `RedisTimeoutError`, `RedisCommandError`
  - Enhance `safe()` wrapper to categorize errors and log structured info
  - Add `redisHealthCheck()` function for startup verification
  - Keep fail-open behavior but add detailed logging

  **Must NOT do**:
  - Do NOT change the public API (redis.set, redis.get, etc.)
  - Do NOT remove fail-open behavior
  - Do NOT add new Redis operations

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4)
  - **Blocks**: Tasks 5-12
  - **Blocked By**: None

  **References**:
  - `supabase/functions/_shared/redis.ts:1-96` - Full Redis adapter implementation
  - `supabase/functions/_shared/redis.ts:16-24` - safe() wrapper function
  - `supabase/functions/_shared/redis.ts:7-8` - URL/TOKEN env vars

  **Acceptance Criteria**:
  - [ ] All Redis operations have 3s timeout via AbortController
  - [ ] Structured error types defined (RedisConnectionError, RedisTimeoutError, RedisCommandError)
  - [ ] safe() wrapper logs error category and key
  - [ ] redisHealthCheck() returns {ok: boolean, latency: number}
  - [ ] Fail-open behavior preserved

  **QA Scenarios**:
  ```
  Scenario: Redis timeout on slow operation
    Tool: Bash
    Preconditions: Mock Redis with 5s delay
    Steps:
      1. Create mock Redis that delays 5s
      2. Call redis.get("test-key")
      3. Verify timeout after 3s
      4. Verify fallback value returned (fail-open)
    Expected Result: Operation completes in ~3s with fallback, no crash
    Failure Indicators: Operation hangs >5s, throws unhandled error
    Evidence: .omo/evidence/task-2-redis-timeout.txt

  Scenario: Redis connection refused
    Tool: Bash
    Preconditions: Invalid Redis URL
    Steps:
      1. Set UPSTASH_REDIS_REST_URL to invalid URL
      2. Call redis.get("test-key")
      3. Verify graceful fallback
    Expected Result: Returns null (fallback), logs connection error
    Failure Indicators: Uncaught exception, process crash
    Evidence: .omo/evidence/task-2-redis-connection-refused.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `fix(shared): Redis connection hardening with timeout and error categorization`
  - Files: `supabase/functions/_shared/redis.ts`

- [x] 3. _shared/rate-limit.ts - Structured 429 Headers

  **What to do**:
  - Enhance createRateLimitResponse() to include standard rate limit headers
  - Add `X-RateLimit-Policy` header with window info
  - Add structured logging when rate limit triggered
  - Verify addRateLimitHeaders() preserves existing response headers

  **Must NOT do**:
  - Do NOT change rate limit logic or thresholds
  - Do NOT change fail-open behavior
  - Do NOT change Redis operations

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4)
  - **Blocks**: Tasks 5-12
  - **Blocked By**: None

  **References**:
  - `supabase/functions/_shared/rate-limit.ts:76-97` - createRateLimitResponse
  - `supabase/functions/_shared/rate-limit.ts:99-105` - addRateLimitHeaders
  - `supabase/functions/_shared/rate-limit.ts:71-74` - CORS_HEADERS

  **Acceptance Criteria**:
  - [ ] 429 response includes: X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, X-RateLimit-Policy, Retry-After
  - [ ] Structured log when rate limit triggered (userId, route, limit, remaining)
  - [ ] addRateLimitHeaders() preserves all existing response headers
  - [ ] Existing rate limit tests still pass

  **QA Scenarios**:
  ```
  Scenario: 429 response has all required headers
    Tool: Bash
    Preconditions: Mock rate limit to return blocked
    Steps:
      1. Call rateLimit("user-1", "execute-trade") with mocked blocked state
      2. Assert response.status === 429
      3. Assert response.headers has X-RateLimit-Limit
      4. Assert response.headers has X-RateLimit-Remaining = "0"
      5. Assert response.headers has X-RateLimit-Reset
      6. Assert response.headers has Retry-After
      7. Assert response.headers has X-RateLimit-Policy
    Expected Result: All headers present and valid
    Failure Indicators: Missing headers, invalid values
    Evidence: .omo/evidence/task-3-rate-limit-headers.txt

  Scenario: Rate limit log output
    Tool: Bash
    Preconditions: Mock rate limit to return blocked
    Steps:
      1. Call rateLimit("user-1", "execute-trade") with mocked blocked state
      2. Capture console output
      3. Verify structured log includes userId, route, limit, remaining
    Expected Result: JSON structured log line
    Failure Indicators: No log output, unstructured log
    Evidence: .omo/evidence/task-3-rate-limit-log.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `fix(shared): Rate limit 429 structured headers and logging`
  - Files: `supabase/functions/_shared/rate-limit.ts`

- [x] 4. _shared/body-size-limit.ts - New Shared Module

  **What to do**:
  - Create new file `_shared/body-size-limit.ts`
  - Export `checkBodySize(req: Request, maxSizeBytes?: number): Response | null`
  - Default max size: 1MB (1048576 bytes)
  - Returns 413 Response if body too large, null if OK
  - Include Content-Length header check + streaming body size check

  **Must NOT do**:
  - Do NOT modify existing functions yet (Tasks 5-20 will add it)
  - Do NOT add file upload support
  - Do NOT add streaming body support beyond size check

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 3)
  - **Blocks**: Tasks 5-12
  - **Blocked By**: None

  **References**:
  - None (new file creation)

  **Acceptance Criteria**:
  - [ ] File created: `supabase/functions/_shared/body-size-limit.ts`
  - [ ] checkBodySize() returns null for requests under 1MB
  - [ ] checkBodySize() returns 413 Response for requests over 1MB
  - [ ] Custom maxSizeBytes parameter works
  - [ ] Handles missing Content-Length header gracefully

  **QA Scenarios**:
  ```
  Scenario: Request under 1MB allowed
    Tool: Bash
    Preconditions: None
    Steps:
      1. Create Request with body size 500KB
      2. Call checkBodySize(req)
      3. Assert result is null
    Expected Result: null (request OK)
    Failure Indicators: 413 response returned
    Evidence: .omo/evidence/task-4-body-size-under.txt

  Scenario: Request over 1MB blocked
    Tool: Bash
    Preconditions: None
    Steps:
      1. Create Request with body size 2MB
      2. Call checkBodySize(req)
      3. Assert result.status === 413
      4. Assert result body contains "too large"
    Expected Result: 413 Response with error message
    Failure Indicators: null returned, no error
    Evidence: .omo/evidence/task-4-body-size-over.txt
  ```

  **Commit**: YES (groups with Wave 1)
  - Message: `feat(shared): Add body size limit module (1MB default)`
  - Files: `supabase/functions/_shared/body-size-limit.ts`

- [x] 5. execute-trade/index.ts - Price Stale Hardening + Error Mapping

  **What to do**:
  - Import body-size-limit.ts and add checkBodySize() at function entry
  - Add Binance API timeout (5s) via AbortController
  - Enhance price stale check: return 429 (not 400) when price unavailable
  - Add structured error response format: `{error: string, code: string, retryable: boolean}`
  - Add request timing logging (duration_ms)
  - Wrap main handler in try-catch that returns structured 500

  **Must NOT do**:
  - Do NOT change trade execution logic
  - Do NOT change balance deduction logic
  - Do NOT change notification logic
  - Do NOT change copy-trade fan-out logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6-12)
  - **Blocks**: Tasks 13-20
  - **Blocked By**: Tasks 1-4

  **References**:
  - `supabase/functions/execute-trade/index.ts:56-67` - fetchBinancePrice (no timeout)
  - `supabase/functions/execute-trade/index.ts:134-157` - price stale check logic
  - `supabase/functions/execute-trade/index.ts:404-456` - Deno.serve handler
  - `supabase/functions/_shared/body-size-limit.ts` - New shared module

  **Acceptance Criteria**:
  - [ ] Body size limit enforced (413 for >1MB)
  - [ ] Binance API timeout after 5s
  - [ ] Price unavailable returns 429 with `{error: "...", code: "PRICE_UNAVAILABLE", retryable: true}`
  - [ ] All errors return structured format: `{error, code, retryable}`
  - [ ] Request duration logged in milliseconds
  - [ ] No changes to trade logic

  **QA Scenarios**:
  ```
  Scenario: Body too large returns 413
    Tool: Bash
    Preconditions: None
    Steps:
      1. curl -X POST /functions/v1/execute-trade -H "Authorization: Bearer $TOKEN" -d '{"symbol":"BTC","side":"buy","quantity":1}' --data-binary @/tmp/2mb-file.json
      2. Assert status === 413
      3. Assert body.error contains "too large"
    Expected Result: 413 with structured error
    Failure Indicators: 500, 200, connection error
    Evidence: .omo/evidence/task-5-body-too-large.txt

  Scenario: Price unavailable returns 429
    Tool: Bash
    Preconditions: Mock price_cache to return empty
    Steps:
      1. curl -X POST /functions/v1/execute-trade -H "Authorization: Bearer $TOKEN" -d '{"symbol":"INVALID","side":"buy","quantity":1}'
      2. Assert status === 429
      3. Assert body.code === "PRICE_UNAVAILABLE"
      4. Assert body.retryable === true
    Expected Result: 429 with structured error
    Failure Indicators: 500, 400
    Evidence: .omo/evidence/task-5-price-unavailable.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `fix(execute-trade): Price stale hardening and error mapping`
  - Files: `supabase/functions/execute-trade/index.ts`

- [x] 6. price-feed/index.ts - Partial Failure Handling + Yahoo Fallback

  **What to do**:
  - Add try-catch around each symbol update (one failure doesn't fail all)
  - Add Yahoo Finance API timeout (5s) via AbortController
  - Add Binance API timeout (5s) via AbortController
  - Return partial results: `{success: true, updated: N, failed: [...]}`
  - Add structured logging for each symbol update success/failure
  - Handle empty responses from Binance/Yahoo gracefully

  **Must NOT do**:
  - Do NOT change the SYMBOLS array
  - Do NOT change the upsert logic
  - Do NOT change Redis cache writing
  - Do NOT change order/alert triggering logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 7-12)
  - **Blocks**: Tasks 13-20
  - **Blocked By**: Tasks 1-4

  **References**:
  - `supabase/functions/price-feed/index.ts:66-98` - fetchBinance (no timeout)
  - `supabase/functions/price-feed/index.ts:100-142` - fetchYahoo/fetchYahooChart (no timeout)
  - `supabase/functions/price-feed/index.ts:178-182` - upsert price_cache
  - `supabase/functions/price-feed/index.ts:248-260` - response format

  **Acceptance Criteria**:
  - [ ] Each symbol update wrapped in try-catch
  - [ ] Binance API timeout after 5s
  - [ ] Yahoo API timeout after 5s
  - [ ] Response includes `failed` array with symbol + error for each failure
  - [ ] Empty Binance/Yahoo response handled (skip symbol, don't crash)
  - [ ] Partial updates committed (some symbols succeed, others don't)

  **QA Scenarios**:
  ```
  Scenario: Partial symbol failure
    Tool: Bash
    Preconditions: Mock Binance to fail for BTCUSDT, succeed for ETHUSDT
    Steps:
      1. curl -X POST /functions/v1/price-feed -H "Authorization: Bearer $SERVICE_ROLE_KEY"
      2. Assert status === 200
      3. Assert body.updated >= 1 (ETHUSDT succeeded)
      4. Assert body.failed contains BTCUSDT entry
    Expected Result: 200 with partial results
    Failure Indicators: 500, all symbols failed
    Evidence: .omo/evidence/task-6-partial-failure.txt

  Scenario: Empty Yahoo response handled
    Tool: Bash
    Preconditions: Mock Yahoo to return empty chart data
    Steps:
      1. curl -X POST /functions/v1/price-feed -H "Authorization: Bearer $SERVICE_ROLE_KEY"
      2. Assert status === 200
      3. Assert body.yahoo = 0 (all Yahoo symbols failed gracefully)
      4. Assert body.crypto > 0 (Binance symbols succeeded)
    Expected Result: 200 with Yahoo=0, crypto>0
    Failure Indicators: 500, crash
    Evidence: .omo/evidence/task-6-yahoo-empty.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `fix(price-feed): Partial failure handling and API timeouts`
  - Files: `supabase/functions/price-feed/index.ts`

- [x] 7. blitz-tick-order/index.ts - Price Fallback + Error Categorization

  **What to do**:
  - Import body-size-limit.ts and add checkBodySize() at function entry
  - Add Redis price fallback: if blitz:price:* missing, try price_cache
  - Enhance price unavailable response: 503 with `{error: "...", code: "PRICE_UNAVAILABLE"}`
  - Add structured error responses for all error paths
  - Add request timing logging

  **Must NOT do**:
  - Do NOT change order open/close logic
  - Do NOT change idempotency key logic
  - Do NOT change clock drift protection
  - Do NOT change advisory lock usage

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6, 8-12)
  - **Blocks**: Tasks 13-20
  - **Blocked By**: Tasks 1-4

  **References**:
  - `supabase/functions/blitz-tick-order/index.ts:88-108` - price fetch logic
  - `supabase/functions/blitz-tick-order/index.ts:110-183` - order open logic
  - `supabase/functions/blitz-tick-order/index.ts:185-227` - order close logic
  - `supabase/functions/_shared/body-size-limit.ts` - New shared module

  **Acceptance Criteria**:
  - [ ] Body size limit enforced (413 for >1MB)
  - [ ] Price fallback: Redis → price_cache
  - [ ] Price unavailable returns 503 with structured error
  - [ ] All error paths return structured format
  - [ ] Request duration logged

  **QA Scenarios**:
  ```
  Scenario: Price fallback from Redis to price_cache
    Tool: Bash
    Preconditions: Redis price missing, price_cache has data
    Steps:
      1. Delete Redis blitz:price:BTCUSD key
      2. Ensure price_cache has BTCUSD entry
      3. curl -X POST /functions/v1/blitz-tick-order with BTCUSD room
      4. Assert status !== 503 (price found via fallback)
    Expected Result: Request succeeds using price_cache fallback
    Failure Indicators: 503 PRICE_UNAVAILABLE
    Evidence: .omo/evidence/task-7-price-fallback.txt

  Scenario: Price unavailable returns 503
    Tool: Bash
    Preconditions: Redis and price_cache both missing for symbol
    Steps:
      1. Delete Redis blitz:price:INVALID key
      2. Remove price_cache entry for INVALID
      3. curl -X POST /functions/v1/blitz-tick-order with INVALID room
      4. Assert status === 503
      5. Assert body.code === "PRICE_UNAVAILABLE"
    Expected Result: 503 with structured error
    Failure Indicators: 500, 404
    Evidence: .omo/evidence/task-7-price-unavailable.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `fix(blitz-tick-order): Price fallback and error categorization`
  - Files: `supabase/functions/blitz-tick-order/index.ts`

- [x] 8. blitz-matchmake/index.ts - Price Fallback + Redis Fail-Open

  **What to do**:
  - Import body-size-limit.ts and add checkBodySize() at function entry
  - Add Redis price fallback: if blitz:price:* missing, try price_cache
  - Enhance price unavailable response: 503 with structured error
  - Verify Redis fail-open for queue operations (lrem, lpop, rpush)
  - Add structured error responses for all error paths
  - Add request timing logging

  **Must NOT do**:
  - Do NOT change matchmaking logic
  - Do NOT change balance lock logic
  - Do NOT change room creation logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-7, 9-12)
  - **Blocks**: Tasks 13-20
  - **Blocked By**: Tasks 1-4

  **References**:
  - `supabase/functions/blitz-matchmake/index.ts:290-301` - price fetch logic
  - `supabase/functions/blitz-matchmake/index.ts:218-253` - quick match logic
  - `supabase/functions/blitz-matchmake/index.ts:130-160` - cancel mode
  - `supabase/functions/_shared/body-size-limit.ts` - New shared module

  **Acceptance Criteria**:
  - [ ] Body size limit enforced (413 for >1MB)
  - [ ] Price fallback: Redis → price_cache
  - [ ] Price unavailable returns 503 with structured error
  - [ ] Redis queue operations fail-open (request still processed)
  - [ ] All error paths return structured format
  - [ ] Request duration logged

  **QA Scenarios**:
  ```
  Scenario: Redis down, queue operation fails open
    Tool: Bash
    Preconditions: Mock Redis to throw connection error
    Steps:
      1. Mock Redis lpop/lpush to throw
      2. curl -X POST /functions/v1/blitz-matchmake with quick mode
      3. Assert status === 200 (not 500)
      4. Assert body.status === "queued"
    Expected Result: Request succeeds despite Redis failure
    Failure Indicators: 500, connection error
    Evidence: .omo/evidence/task-8-redis-fail-open.txt

  Scenario: Price unavailable returns 503
    Tool: Bash
    Preconditions: Redis and price_cache both missing for symbol
    Steps:
      1. Delete Redis blitz:price:INVALID key
      2. Remove price_cache entry for INVALID
      3. curl -X POST /functions/v1/blitz-matchmake with INVALID symbol
      4. Assert status === 503
    Expected Result: 503 with structured error
    Failure Indicators: 500, 404
    Evidence: .omo/evidence/task-8-price-unavailable.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `fix(blitz-matchmake): Price fallback and Redis fail-open hardening`
  - Files: `supabase/functions/blitz-matchmake/index.ts`

- [x] 9. blitz-settle-room/index.ts - Advisory Lock Timeout + Error Handling

  **What to do**:
  - Add timeout (5s) to advisory lock acquisition via PostgreSQL statement_timeout
  - Enhance lock failure response: 409 with `{error: "...", code: "LOCK_BUSY", retryable: true}`
  - Add structured logging for settlement phases (lock, validate, settle, distribute)
  - Add try-catch around each participant update (partial settlement protection)
  - Add request timing logging

  **Must NOT do**:
  - Do NOT change settlement logic
  - Do NOT change prize distribution logic
  - Do NOT change notification logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-8, 10-12)
  - **Blocks**: Tasks 13-20
  - **Blocked By**: Tasks 1-4

  **References**:
  - `supabase/functions/blitz-settle-room/index.ts:14-207` - settleRoom function
  - `supabase/functions/blitz-settle-room/index.ts:17-25` - advisory lock acquisition
  - `supabase/functions/blitz-settle-room/index.ts:92-119` - participant update loop

  **Acceptance Criteria**:
  - [ ] Advisory lock acquisition times out after 5s
  - [ ] Lock failure returns 409 with structured error
  - [ ] Each participant update wrapped in try-catch
  - [ ] Settlement phases logged (lock, validate, settle, distribute)
  - [ ] Partial settlement protection (some participants succeed, others don't)
  - [ ] Request duration logged

  **QA Scenarios**:
  ```
  Scenario: Advisory lock timeout
    Tool: Bash
    Preconditions: Mock advisory lock to hang for 10s
    Steps:
      1. Mock try_advisory_lock to delay 10s
      2. curl -X POST /functions/v1/blitz-settle-room with room_id
      3. Assert status === 409
      4. Assert body.code === "LOCK_BUSY"
    Expected Result: 409 with lock busy error
    Failure Indicators: 500, timeout, hang
    Evidence: .omo/evidence/task-9-lock-timeout.txt

  Scenario: Partial participant update failure
    Tool: Bash
    Preconditions: Mock profiles.update to fail for one user
    Steps:
      1. Mock profiles.update to fail for user_id="user-fail"
      2. curl -X POST /functions/v1/blitz-settle-room with room_id
      3. Assert status === 200 (settlement completes despite partial failure)
      4. Verify other participants updated successfully
    Expected Result: 200 with partial success
    Failure Indicators: 500, no participants updated
    Evidence: .omo/evidence/task-9-partial-settlement.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `fix(blitz-settle-room): Advisory lock timeout and error handling`
  - Files: `supabase/functions/blitz-settle-room/index.ts`

- [x] 10. blitz-join-private/index.ts - Price Fallback + Balance Lock Hardening

  **What to do**:
  - Import body-size-limit.ts and add checkBodySize() at function entry
  - Add Redis price fallback: if blitz:price:* missing, try price_cache
  - Add conditional UPDATE for balance lock (TOCTOU protection like blitz-matchmake)
  - Enhance price unavailable response: 503 with structured error
  - Add structured error responses for all error paths
  - Add request timing logging

  **Must NOT do**:
  - Do NOT change room join logic
  - Do NOT change participant limit logic
  - Do NOT change room activation logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-9, 11-12)
  - **Blocks**: Tasks 13-20
  - **Blocked By**: Tasks 1-4

  **References**:
  - `supabase/functions/blitz-join-private/index.ts:46-70` - room activation with price
  - `supabase/functions/blitz-join-private/index.ts:42` - balance lock (no conditional)
  - `supabase/functions/blitz-matchmake/index.ts:181-184` - conditional UPDATE pattern

  **Acceptance Criteria**:
  - [ ] Body size limit enforced (413 for >1MB)
  - [ ] Price fallback: Redis → price_cache
  - [ ] Balance lock uses conditional UPDATE (TOCTOU protection)
  - [ ] Price unavailable returns 503 with structured error
  - [ ] All error paths return structured format
  - [ ] Request duration logged

  **QA Scenarios**:
  ```
  Scenario: TOCTOU balance lock protection
    Tool: Bash
    Preconditions: Two concurrent join requests for same user
    Steps:
      1. Send two concurrent curl requests for same user + room
      2. Assert exactly one succeeds (200)
      3. Assert other fails with 409 (lock conflict)
    Expected Result: One success, one 409
    Failure Indicators: Both succeed (double-spend), both fail
    Evidence: .omo/evidence/task-10-toctou-protection.txt

  Scenario: Price unavailable returns 503
    Tool: Bash
    Preconditions: Redis and price_cache both missing for room symbol
    Steps:
      1. Create room with symbol that has no price data
      2. curl -X POST /functions/v1/blitz-join-private
      3. Assert status === 503
    Expected Result: 503 with structured error
    Failure Indicators: 500, 404
    Evidence: .omo/evidence/task-10-price-unavailable.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `fix(blitz-join-private): Price fallback and balance lock hardening`
  - Files: `supabase/functions/blitz-join-private/index.ts`

- [x] 11. send-push/index.ts - VAPID Key Validation

  **What to do**:
  - Add VAPID key validation at function entry (check both keys present)
  - Add structured error for missing VAPID keys: 503 with `{error: "...", code: "VAPID_NOT_CONFIGURED"}`
  - Add try-catch around VAPID JWT generation (invalid key format)
  - Add structured error for VAPID JWT failure: 503 with `{error: "...", code: "VAPID_INVALID"}`
  - Add request timing logging

  **Must NOT do**:
  - Do NOT change push notification logic
  - Do NOT change subscription management logic
  - Do NOT change VAPID key format

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-10, 12)
  - **Blocks**: Tasks 13-20
  - **Blocked By**: Tasks 1-4

  **References**:
  - `supabase/functions/send-push/index.ts:11-13` - VAPID key env vars
  - `supabase/functions/send-push/index.ts:24-37` - importVapidKey (can throw)
  - `supabase/functions/send-push/index.ts:39-49` - buildVapidJWT (can throw)

  **Acceptance Criteria**:
  - [ ] VAPID key presence validated at entry
  - [ ] Missing VAPID keys returns 503 with structured error
  - [ ] Invalid VAPID key format returns 503 with structured error
  - [ ] VAPID JWT generation failure returns 503 with structured error
  - [ ] Request duration logged

  **QA Scenarios**:
  ```
  Scenario: Missing VAPID keys returns 503
    Tool: Bash
    Preconditions: Unset VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY
    Steps:
      1. curl -X POST /functions/v1/send-push -H "Authorization: Bearer $SERVICE_ROLE_KEY" -d '{"user_id":"test"}'
      2. Assert status === 503
      3. Assert body.code === "VAPID_NOT_CONFIGURED"
    Expected Result: 503 with VAPID not configured error
    Failure Indicators: 500, 200
    Evidence: .omo/evidence/task-11-vapod-not-configured.txt

  Scenario: Invalid VAPID key format returns 503
    Tool: Bash
    Preconditions: Set VAPID_PRIVATE_KEY to invalid base64
    Steps:
      1. curl -X POST /functions/v1/send-push -H "Authorization: Bearer $SERVICE_ROLE_KEY" -d '{"user_id":"test"}'
      2. Assert status === 503
      3. Assert body.code === "VAPID_INVALID"
    Expected Result: 503 with VAPID invalid error
    Failure Indicators: 500, uncaught exception
    Evidence: .omo/evidence/task-11-vapid-invalid.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `fix(send-push): VAPID key validation and error handling`
  - Files: `supabase/functions/send-push/index.ts`

- [x] 12. reset-demo-account/index.ts - Authz Hardening

  **What to do**:
  - Add admin role check before reset operation
  - Add structured error for non-admin: 403 with `{error: "...", code: "NOT_ADMIN"}`
  - Add idempotency check (already reset = return success without changes)
  - Add request timing logging
  - Add audit log for reset operations

  **Must NOT do**:
  - Do NOT change reset logic
  - Do NOT change balance restoration logic
  - Do NOT change position clearing logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-11)
  - **Blocks**: Tasks 13-20
  - **Blocked By**: Tasks 1-4

  **References**:
  - `supabase/functions/reset-demo-account/index.ts` - Full function (needs reading)

  **Acceptance Criteria**:
  - [ ] Admin role check enforced
  - [ ] Non-admin returns 403 with structured error
  - [ ] Already-reset account returns success without changes
  - [ ] Reset operation logged for audit
  - [ ] Request duration logged

  **QA Scenarios**:
  ```
  Scenario: Non-admin user returns 403
    Tool: Bash
    Preconditions: Use non-admin JWT token
    Steps:
      1. curl -X POST /functions/v1/reset-demo-account -H "Authorization: Bearer $NON_ADMIN_TOKEN" -d '{"user_id":"test"}'
      2. Assert status === 403
      3. Assert body.code === "NOT_ADMIN"
    Expected Result: 403 with not admin error
    Failure Indicators: 500, 200 (unauthorized reset)
    Evidence: .omo/evidence/task-12-not-admin.txt

  Scenario: Already-reset account returns success
    Tool: Bash
    Preconditions: Account already at initial balance
    Steps:
      1. curl -X POST /functions/v1/reset-demo-account -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"user_id":"already-reset"}'
      2. Assert status === 200
      3. Assert body.success === true
      4. Assert body.changes === 0 (no changes made)
    Expected Result: 200 with no changes
    Failure Indicators: 500, 400
    Evidence: .omo/evidence/task-12-already-reset.txt
  ```

  **Commit**: YES (groups with Wave 2)
  - Message: `fix(reset-demo-account): Authz hardening and audit logging`
  - Files: `supabase/functions/reset-demo-account/index.ts`

- [x] 13. ai-analyze/index.ts - OpenRouter Error Mapping

  **What to do**:
  - Add OpenRouter response status mapping:
    - 429 → 429 with `{error: "AI istek limiti doldu", retryable: true}`
    - 402 → 503 with `{error: "AI kredisi yetersiz", code: "QUOTA_EXCEEDED"}`
    - 500/502/503 → 503 with `{error: "AI servisi kullanılamıyor", code: "AI_UNAVAILABLE"}`
    - Timeout → 504 with `{error: "AI zaman aşımı", code: "AI_TIMEOUT"}`
  - Add AbortController with 30s timeout for OpenRouter fetch
  - Add structured error responses for all error paths
  - Add request timing logging

  **Must NOT do**:
  - Do NOT change Zod validation schema
  - Do NOT change AI prompt
  - Do NOT change response format

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 14-20)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 5-12

  **References**:
  - `supabase/functions/ai-analyze/index.ts:54-76` - OpenRouter fetch and error handling
  - `supabase/functions/ai-analyze/index.ts:71-75` - Current error mapping (429, 402, other)

  **Acceptance Criteria**:
  - [ ] 429 → 429 with retryable flag
  - [ ] 402 → 503 with QUOTA_EXCEEDED code
  - [ ] 500/502/503 → 503 with AI_UNAVAILABLE code
  - [ ] 30s timeout → 504 with AI_TIMEOUT code
  - [ ] All errors return structured format

  **QA Scenarios**:
  ```
  Scenario: OpenRouter 429 mapped to 429
    Tool: Bash
    Preconditions: Mock OpenRouter to return 429
    Steps:
      1. curl -X POST /functions/v1/ai-analyze -H "Authorization: Bearer $TOKEN" -d '{"symbol":"BTC"}'
      2. Assert status === 429
      3. Assert body.error contains "limit"
      4. Assert body.retryable === true
    Expected Result: 429 with retryable flag
    Failure Indicators: 500, 200
    Evidence: .omo/evidence/task-13-openrouter-429.txt

  Scenario: OpenRouter 402 mapped to 503
    Tool: Bash
    Preconditions: Mock OpenRouter to return 402
    Steps:
      1. curl -X POST /functions/v1/ai-analyze -H "Authorization: Bearer $TOKEN" -d '{"symbol":"BTC"}'
      2. Assert status === 503
      3. Assert body.code === "QUOTA_EXCEEDED"
    Expected Result: 503 with quota exceeded code
    Failure Indicators: 500, 402
    Evidence: .omo/evidence/task-13-openrouter-402.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `fix(ai-analyze): OpenRouter error mapping and timeout`
  - Files: `supabase/functions/ai-analyze/index.ts`

- [x] 14. ai-chat/index.ts - Streaming Error Handling

  **What to do**:
  - Add OpenRouter response status mapping (same as ai-analyze)
  - Add AbortController with 30s timeout for OpenRouter fetch
  - Handle streaming errors: if stream fails mid-way, return partial response with error
  - Add structured error responses for all error paths
  - Add request timing logging

  **Must NOT do**:
  - Do NOT change Zod validation schema
  - Do NOT change AI prompt
  - Do NOT change streaming format (SSE)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13, 15-20)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 5-12

  **References**:
  - `supabase/functions/ai-chat/index.ts:60-82` - OpenRouter streaming fetch
  - `supabase/functions/ai-chat/index.ts:75-79` - Current error mapping

  **Acceptance Criteria**:
  - [ ] 429 → 429 with retryable flag
  - [ ] 402 → 503 with QUOTA_EXCEEDED code
  - [ ] 500/502/503 → 503 with AI_UNAVAILABLE code
  - [ ] 30s timeout → 504 with AI_TIMEOUT code
  - [ ] Streaming error returns partial response with error field

  **QA Scenarios**:
  ```
  Scenario: OpenRouter 429 mapped to 429
    Tool: Bash
    Preconditions: Mock OpenRouter to return 429
    Steps:
      1. curl -X POST /functions/v1/ai-chat -H "Authorization: Bearer $TOKEN" -d '{"messages":[{"role":"user","content":"test"}]}'
      2. Assert status === 429
      3. Assert body.retryable === true
    Expected Result: 429 with retryable flag
    Failure Indicators: 500, 200
    Evidence: .omo/evidence/task-14-openrouter-429.txt

  Scenario: Streaming error returns partial response
    Tool: Bash
    Preconditions: Mock OpenRouter to fail mid-stream
    Steps:
      1. curl -X POST /functions/v1/ai-chat -H "Authorization: Bearer $TOKEN" -d '{"messages":[{"role":"user","content":"test"}]}'
      2. Assert response contains partial content
      3. Assert response contains error field
    Expected Result: Partial response with error
    Failure Indicators: 500, empty response
    Evidence: .omo/evidence/task-14-streaming-error.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `fix(ai-chat): Streaming error handling and timeout`
  - Files: `supabase/functions/ai-chat/index.ts`

- [x] 15. ai-strategy/index.ts - OpenRouter Error Mapping

  **What to do**:
  - Add OpenRouter response status mapping (same as ai-analyze)
  - Add AbortController with 30s timeout for OpenRouter fetch
  - Add structured error responses for all error paths
  - Add request timing logging

  **Must NOT do**:
  - Do NOT change Zod validation schema
  - Do NOT change AI prompt
  - Do NOT change response format

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-14, 16-20)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 5-12

  **References**:
  - `supabase/functions/ai-strategy/index.ts:69-88` - OpenRouter fetch and error handling

  **Acceptance Criteria**:
  - [ ] 429 → 429 with retryable flag
  - [ ] 402 → 503 with QUOTA_EXCEEDED code
  - [ ] 500/502/503 → 503 with AI_UNAVAILABLE code
  - [ ] 30s timeout → 504 with AI_TIMEOUT code
  - [ ] All errors return structured format

  **QA Scenarios**:
  ```
  Scenario: OpenRouter 429 mapped to 429
    Tool: Bash
    Preconditions: Mock OpenRouter to return 429
    Steps:
      1. curl -X POST /functions/v1/ai-strategy -H "Authorization: Bearer $TOKEN" -d '{}'
      2. Assert status === 429
      3. Assert body.retryable === true
    Expected Result: 429 with retryable flag
    Failure Indicators: 500, 200
    Evidence: .omo/evidence/task-15-openrouter-429.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `fix(ai-strategy): OpenRouter error mapping and timeout`
  - Files: `supabase/functions/ai-strategy/index.ts`

- [x] 16. ai-trade-coach/index.ts - OpenRouter + Null-Safe Parsing

  **What to do**:
  - Add OpenRouter response status mapping (same as ai-analyze)
  - Add AbortController with 30s timeout for OpenRouter fetch
  - Add null-safe JSON.parse for AI response (try-catch around JSON.parse)
  - Add structured error responses for all error paths
  - Add request timing logging

  **Must NOT do**:
  - Do NOT change Zod validation schema
  - Do NOT change AI prompt
  - Do NOT change behavior analysis logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-15, 17-20)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 5-12

  **References**:
  - `supabase/functions/ai-trade-coach/index.ts:129-155` - generateInsight function
  - `supabase/functions/ai-trade-coach/index.ts:148-151` - JSON.parse (can throw)

  **Acceptance Criteria**:
  - [ ] 429 → 429 with retryable flag
  - [ ] 402 → 503 with QUOTA_EXCEEDED code
  - [ ] 500/502/503 → 503 with AI_UNAVAILABLE code
  - [ ] 30s timeout → 504 with AI_TIMEOUT code
  - [ ] Invalid JSON from AI → 503 with AI_PARSE_ERROR code
  - [ ] All errors return structured format

  **QA Scenarios**:
  ```
  Scenario: Invalid JSON from AI handled
    Tool: Bash
    Preconditions: Mock OpenRouter to return non-JSON response
    Steps:
      1. curl -X POST /functions/v1/ai-trade-coach -H "Authorization: Bearer $TOKEN" -d '{"user_id":"test"}'
      2. Assert status === 503
      3. Assert body.code === "AI_PARSE_ERROR"
    Expected Result: 503 with parse error
    Failure Indicators: 500, uncaught exception
    Evidence: .omo/evidence/task-16-invalid-json.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `fix(ai-trade-coach): OpenRouter error mapping and null-safe parsing`
  - Files: `supabase/functions/ai-trade-coach/index.ts`

- [x] 17. ai-risk-monitor/index.ts - Structured Logging

  **What to do**:
  - Add structured logging for each risk check (concentration, loss, discipline)
  - Add request timing logging
  - Add structured error responses for all error paths
  - Verify empty body handling (cron request with empty body)

  **Must NOT do**:
  - Do NOT change risk detection logic
  - Do NOT change notification logic
  - Do NOT change cooldown logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-16, 18-20)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 5-12

  **References**:
  - `supabase/functions/ai-risk-monitor/index.ts:56-173` - Main function logic
  - `supabase/functions/ai-risk-monitor/index.ts:26-54` - Auth and body validation

  **Acceptance Criteria**:
  - [ ] Each risk check logged (concentration, loss, discipline)
  - [ ] Request duration logged
  - [ ] Empty body handled gracefully (returns 200 with alerts:0)
  - [ ] All error paths return structured format

  **QA Scenarios**:
  ```
  Scenario: Empty body handled gracefully
    Tool: Bash
    Preconditions: None
    Steps:
      1. curl -X POST /functions/v1/ai-risk-monitor -H "Authorization: Bearer $SERVICE_ROLE_KEY" -d '{}'
      2. Assert status === 200
      3. Assert body.success === true
    Expected Result: 200 with success
    Failure Indicators: 400, 500
    Evidence: .omo/evidence/task-17-empty-body.txt

  Scenario: Structured logging output
    Tool: Bash
    Preconditions: None
    Steps:
      1. curl -X POST /functions/v1/ai-risk-monitor -H "Authorization: Bearer $SERVICE_ROLE_KEY" -d '{}'
      2. Check Supabase logs for structured log entries
      3. Verify log includes risk_check, user_id, alert_created fields
    Expected Result: Structured log entries
    Failure Indicators: No logs, unstructured logs
    Evidence: .omo/evidence/task-17-structured-logging.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `fix(ai-risk-monitor): Structured logging and error handling`
  - Files: `supabase/functions/ai-risk-monitor/index.ts`

- [x] 18. daily-brief/index.ts - OpenRouter Error Mapping

  **What to do**:
  - Add OpenRouter response status mapping (same as ai-analyze)
  - Add AbortController with 30s timeout for OpenRouter fetch
  - Add structured error responses for all error paths
  - Add request timing logging

  **Must NOT do**:
  - Do NOT change brief generation logic
  - Do NOT change sentiment calculation
  - Do NOT change database operations

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-17, 19-20)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 5-12

  **References**:
  - `supabase/functions/daily-brief/index.ts:62-81` - OpenRouter fetch and error handling

  **Acceptance Criteria**:
  - [ ] 429 → 429 with retryable flag
  - [ ] 402 → 503 with QUOTA_EXCEEDED code
  - [ ] 500/502/503 → 503 with AI_UNAVAILABLE code
  - [ ] 30s timeout → 504 with AI_TIMEOUT code
  - [ ] All errors return structured format

  **QA Scenarios**:
  ```
  Scenario: OpenRouter 429 mapped to 429
    Tool: Bash
    Preconditions: Mock OpenRouter to return 429
    Steps:
      1. curl -X POST /functions/v1/daily-brief -H "Authorization: Bearer $TOKEN" -d '{}'
      2. Assert status === 429
      3. Assert body.retryable === true
    Expected Result: 429 with retryable flag
    Failure Indicators: 500, 200
    Evidence: .omo/evidence/task-18-openrouter-429.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `fix(daily-brief): OpenRouter error mapping and timeout`
  - Files: `supabase/functions/daily-brief/index.ts`

- [x] 19. weekly-digest/index.ts - Null-Safe Operations

  **What to do**:
  - Add null-safe operations for all array accesses (trades, emotional_logs)
  - Add try-catch around statistical calculations (division by zero, NaN)
  - Add structured error responses for all error paths
  - Add request timing logging

  **Must NOT do**:
  - Do NOT change digest generation logic
  - Do NOT change notification logic
  - Do NOT change profile update logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-18, 20)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 5-12

  **References**:
  - `supabase/functions/weekly-digest/index.ts:67-108` - Statistical calculations
  - `supabase/functions/weekly-digest/index.ts:94-97` - Mood counting (can fail on empty)

  **Acceptance Criteria**:
  - [ ] Empty trades array handled (returns 200 with skipped:true)
  - [ ] Empty emotional_logs handled gracefully
  - [ ] Division by zero prevented in win rate calculation
  - [ ] NaN values filtered from calculations
  - [ ] All error paths return structured format

  **QA Scenarios**:
  ```
  Scenario: Empty trades array handled
    Tool: Bash
    Preconditions: User with no trades in last 7 days
    Steps:
      1. curl -X POST /functions/v1/weekly-digest -H "Authorization: Bearer $TOKEN" -d '{}'
      2. Assert status === 200
      3. Assert body.skipped === true
      4. Assert body.reason === "not_enough_trades"
    Expected Result: 200 with skipped
    Failure Indicators: 500, 400
    Evidence: .omo/evidence/task-19-empty-trades.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `fix(weekly-digest): Null-safe operations and error handling`
  - Files: `supabase/functions/weekly-digest/index.ts`

- [x] 20. trade-mirror/index.ts - OpenRouter Error Mapping

  **What to do**:
  - Add OpenRouter response status mapping (same as ai-analyze)
  - Add AbortController with 30s timeout for OpenRouter fetch
  - Add structured error responses for all error paths
  - Add request timing logging

  **Must NOT do**:
  - Do NOT change mirror observation logic
  - Do NOT change notification logic
  - Do NOT change coach_insights insert logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13-19)
  - **Blocks**: Tasks F1-F4
  - **Blocked By**: Tasks 5-12

  **References**:
  - `supabase/functions/trade-mirror/index.ts:80-128` - OpenRouter fetch and error handling

  **Acceptance Criteria**:
  - [ ] 429 → 429 with retryable flag
  - [ ] 402 → 503 with QUOTA_EXCEEDED code
  - [ ] 500/502/503 → 503 with AI_UNAVAILABLE code
  - [ ] 30s timeout → 504 with AI_TIMEOUT code
  - [ ] All errors return structured format

  **QA Scenarios**:
  ```
  Scenario: OpenRouter 429 mapped to 429
    Tool: Bash
    Preconditions: Mock OpenRouter to return 429
    Steps:
      1. curl -X POST /functions/v1/trade-mirror -H "Authorization: Bearer $SERVICE_ROLE_KEY" -d '{"user_id":"test","trade_id":"test"}'
      2. Assert status === 429
      3. Assert body.retryable === true
    Expected Result: 429 with retryable flag
    Failure Indicators: 500, 200
    Evidence: .omo/evidence/task-20-openrouter-429.txt
  ```

  **Commit**: YES (groups with Wave 3)
  - Message: `fix(trade-mirror): OpenRouter error mapping and timeout`
  - Files: `supabase/functions/trade-mirror/index.ts`

---

## Final Verification Wave

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run the build, lint, and test commands from the plan's "Success Criteria" section. Review all changed files for: type suppression, empty catches, debug logging in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty state, invalid input, rapid actions. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `fix(shared): harden config/redis/rate-limit for graceful degradation` - _shared/*.ts
- **Wave 2**: `fix(trade): harden execute-trade, price-feed, blitz functions` - supabase/functions/{execute-trade,price-feed,blitz-*}/*.ts
- **Wave 3**: `fix(ai): add OpenRouter error mapping to all AI functions` - supabase/functions/ai-*,daily-brief,weekly-digest,trade-mirror/*.ts
- **Final**: N/A (verification only)

---

## Success Criteria

### Verification Commands
```bash
# Shared modules compile
cd supabase/functions && deno check _shared/config.ts _shared/redis.ts _shared/rate-limit.ts

# Tests pass
cd supabase/functions && deno test __tests__/

# Lint clean
npm run lint

# Build clean
npm run build
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] All 17 functions return 2xx for valid requests
- [ ] ConfigError no longer crashes cold starts
- [ ] AI functions return proper error codes
- [ ] Redis failure = request still processed
- [ ] Structured logs visible
