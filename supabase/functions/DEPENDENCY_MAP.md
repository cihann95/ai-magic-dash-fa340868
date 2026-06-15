# Edge Function Dependency Map

**Project:** Lumen Trade (ai-magic-dash-fa340868)
**Date:** 2026-06-10
**Wave:** 0, Task 3
**Status:** Complete
**Auditor:** Sisyphus-Junior

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Edge Functions | 19 |
| Shared modules | 2 (`_shared/redis.ts`, `_shared/blitz-types.ts`) |
| Functions using Redis | 5 (`blitz-join-private`, `blitz-matchmake`, `blitz-settle-room`, `blitz-tick-order`, `price-feed`) |
| Functions with cron auth | 4 (`blitz-analytics-writer`, `blitz-settle-room`, `ai-risk-monitor`, `price-feed`) |
| Functions invoking other functions | 1 (`execute-trade` → `trade-mirror`) |
| Total env vars used | 9 (Deno-side) |
| Total DB tables accessed | 22 |
| Total RPC calls | 14 unique RPCs |
| `admin: any` parameters | 4 functions |

---

## Shared Modules

### `_shared/redis.ts`
- **Purpose:** Upstash Redis HTTP client wrapper with fail-open behavior
- **Env vars:** `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- **Exported:** `redis` object (get, set, setNxEx, del, hset, hsetAll, hget, hgetall, hdel, sadd, smembers, srem, rpush, lpop, lrem, lrange, expire), `redisEnabled` boolean
- **Fail-open:** `redisEnabled = !!(URL && TOKEN)` — all ops return safe defaults when disabled
- **Used by:** `blitz-join-private`, `blitz-matchmake`, `blitz-settle-room`, `blitz-tick-order`, `price-feed`

### `_shared/blitz-types.ts`
- **Purpose:** Shared TypeScript types for blitz room lifecycle
- **Exports:** `BlitzStatus`, `BlitzMode`, `BlitzSide`, `TickOrderOpenRequest`, `TickOrderCloseRequest`, `TickOrderRequest`
- **Used by:** None directly imported (types duplicated inline in functions)

---

## Function Inventory

---

### 1. `ai-analyze`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) |
| **Auth** | User JWT via `SUPABASE_ANON_KEY` client |
| **Input** | `{ symbol: string, asset_class?: string, language?: "tr"\|"en" }` |
| **Output** | `{ analysis: string }` (markdown AI analysis) |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LOVABLE_API_KEY` |
| **Redis Keys** | None |
| **DB Tables** | None (AI gateway only) |
| **RPCs** | None |
| **External APIs** | Lovable AI Gateway (`google/gemini-3-flash-preview`) |
| **Status Codes** | 200, 400, 401, 402, 429, 500, 502 |

---

### 2. `ai-chat`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) |
| **Auth** | User JWT via `SUPABASE_ANON_KEY` client |
| **Input** | `{ messages: Array<{role, content}>, language?: "tr"\|"en", context_symbol?: string }` |
| **Output** | SSE stream (`text/event-stream`) |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LOVABLE_API_KEY` |
| **Redis Keys** | None |
| **DB Tables** | None (AI gateway only) |
| **RPCs** | None |
| **External APIs** | Lovable AI Gateway (`google/gemini-3-flash-preview`, streaming) |
| **Status Codes** | 200, 400, 401, 402, 429, 500 |

---

### 3. `ai-risk-monitor`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) / Cron (every 15min via `x-cron-secret`) |
| **Auth** | Service role bearer OR cron secret (DB-validated via `verify_cron_secret` RPC) |
| **Input** | None (scans all open positions) |
| **Output** | `{ success: true, users_scanned: number, alerts: number }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Redis Keys** | None |
| **DB Tables** | `positions` (read), `notifications` (insert) |
| **RPCs** | `verify_cron_secret` |
| **External APIs** | None |
| **Status Codes** | 200, 401, 500 |
| **Notes** | 3 alert types: concentration risk (>50% single asset), stop-loss (-10%), discipline (-5% portfolio) |

---

### 4. `ai-strategy`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) |
| **Auth** | User JWT (service role client with forwarded auth header) |
| **Input** | `{ language?: "tr"\|"en" }` |
| **Output** | `{ suggestion: string }` (markdown AI strategy) |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY` |
| **Redis Keys** | None |
| **DB Tables** | `positions` (read), `profiles` (read) |
| **RPCs** | None |
| **External APIs** | Lovable AI Gateway (`google/gemini-3-flash-preview`) |
| **Status Codes** | 200, 401, 402, 429, 500 |

---

### 5. `ai-trade-coach`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) / Cron (batch mode via service role bearer) |
| **Auth** | User JWT (single-user mode) OR service role (batch/cron mode) |
| **Input** | `{ user_id?: string }` (optional — triggers single-user or batch) |
| **Output** | `{ success: true, skipped?: boolean, insight?: {...} }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `LOVABLE_API_KEY` |
| **Redis Keys** | None |
| **DB Tables** | `trades` (read), `coach_insights` (insert), `notifications` (insert) |
| **RPCs** | None |
| **External APIs** | Lovable AI Gateway (`google/gemini-2.5-flash`, JSON response format) |
| **Status Codes** | 200, 401, 403, 500 |
| **Notes** | `admin: any` parameter on `processUser()` (line 131) |

---

### 6. `blitz-admin-topup`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) |
| **Auth** | User JWT + `has_role('admin')` RPC check |
| **Input** | `{ user_id: string, amount: number, reason?: string }` |
| **Output** | `{ ok: true, new_balance: number }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Redis Keys** | None |
| **DB Tables** | `profiles` (read + update `real_balance`), `real_balance_ledger` (insert) |
| **RPCs** | `has_role` |
| **External APIs** | None |
| **Status Codes** | 200, 400, 401, 403, 404, 409, 500 |
| **Notes** | Admin-only. Writes audit trail to `real_balance_ledger`. |

---

### 7. `blitz-analytics-writer`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) / Cron (via `x-cron-secret`) |
| **Auth** | Service role bearer OR cron secret (DB-validated) |
| **Input** | None (batch processes staging events) |
| **Output** | `{ flushed: number }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Redis Keys** | None |
| **DB Tables** | `analytics_events_staging` (read + update `flushed=true`), `analytics_events` (insert) |
| **RPCs** | `verify_cron_secret` |
| **External APIs** | None |
| **Status Codes** | 200, 401, 500 |
| **Notes** | Batch flush: reads up to 500 unflushed staging events, inserts into analytics_events, marks flushed. |

---

### 8. `blitz-join-private`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) |
| **Auth** | User JWT |
| **Input** | `{ invite_code: string }` |
| **Output** | `{ room_id: string, status: "joined" }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Redis Keys** | `GET blitz:price:${symbol}`, `HSETALL blitz:room:${roomId}`, `EXPIRE blitz:room:${roomId}` (600s) |
| **DB Tables** | `blitz_rooms` (read + update), `profiles` (read + update `real_balance_locked`), `blitz_participants` (read + insert + count), `price_cache` (read fallback) |
| **RPCs** | None |
| **External APIs** | None |
| **Status Codes** | 200, 400, 401, 402, 404, 409 |
| **Notes** | Activates room when full (`count >= max_players`). Sets Redis room state for real-time UI. |

---

### 9. `blitz-matchmake`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) |
| **Auth** | User JWT |
| **Input** | `{ mode: "quick"\|"create_private"\|"cancel", symbol: string, entry_fee: number }` |
| **Output** | Quick: `{ room_id, status: "active", opponent }` or `{ status: "queued" }`. Private: `{ room_id, invite_code, status: "waiting" }`. Cancel: `{ ok: true }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Redis Keys** | `LREM blitz:queue:${symbol}:${entry_fee}`, `LPOP blitz:queue:${symbol}:${entry_fee}`, `RPUSH blitz:queue:${symbol}:${entry_fee}`, `EXPIRE blitz:queue:${symbol}:${entry_fee}` (300s), `GET blitz:price:${symbol}`, `HSETALL blitz:room:${roomId}`, `SADD blitz:room:${roomId}:users`, `EXPIRE blitz:room:${roomId}` (600s), `EXPIRE blitz:room:${roomId}:users` (600s) |
| **DB Tables** | `profiles` (read + conditional update `real_balance_locked`), `blitz_rooms` (insert + read), `blitz_participants` (insert + count), `price_cache` (read fallback), `analytics_events_staging` (insert) |
| **RPCs** | `log_observability` |
| **External APIs** | None |
| **Status Codes** | 200, 400, 401, 402, 404, 409, 500, 503 |
| **Notes** | Most complex Redis user. FIFO queue for matchmaking. Conditional UPDATE for TOCTOU protection on balance locking. |

---

### 10. `blitz-settle-room`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) / Cron (via `x-cron-secret`) |
| **Auth** | Service role bearer OR cron secret OR user JWT |
| **Input** | `{ room_id?: string }` (optional — single room or batch scan) |
| **Output** | Single: `{ ok: true, reason?: string }`. Batch: `{ settled: number, results: [...] }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Redis Keys** | `GET blitz:price:${symbol}`, `DEL blitz:room:${roomId}`, `DEL blitz:room:${roomId}:users`, `DEL blitz:room:${roomId}:positions` |
| **DB Tables** | `blitz_participants` (read + update), `blitz_rooms` (read + update), `price_cache` (read fallback), `blitz_orders` (read + update), `profiles` (read + update `real_balance`, `real_balance_locked`), `notifications` (insert), `platform_revenue` (insert), `settlement_ledger` (insert), `analytics_events_staging` (insert) |
| **RPCs** | `make_advisory_lock_key`, `try_advisory_lock`, `lock_and_validate_room`, `log_observability`, `verify_cron_secret` |
| **External APIs** | None |
| **Status Codes** | 200, 401, 500 |
| **Notes** | `admin: any` parameter on `settleRoom()` (line 13). Advisory lock prevents double-settlement. Uses `new Date().toISOString()` instead of `order_timestamp()` RPC (T-T01 gap). |

---

### 11. `blitz-tick-order`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) |
| **Auth** | User JWT |
| **Input** | `{ room_id, action: "open"\|"close", side?, amount?, order_id? }` + `Idempotency-Key` header + `x-client-sent-at` header |
| **Output** | Open: `{ ok: true, order }`. Close: `{ ok: true, pnl, exit_price }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Redis Keys** | `SETNXEX blitz:idem:${userId}:${idemKey}` (30s TTL), `GET blitz:price:${symbol}` |
| **DB Tables** | `blitz_rooms` (read), `price_cache` (read fallback), `blitz_orders` (insert + update), `analytics_events_staging` (insert) |
| **RPCs** | `tick_order_atomic`, `validate_slippage`, `log_observability`, `close_order_atomic`, `order_timestamp` |
| **External APIs** | None |
| **Status Codes** | 200, 400, 401, 404, 409, 500, 503 |
| **Notes** | Server-authoritative execution. Rejects client-supplied price/timestamp fields. 150ms clock drift guard. Idempotency via Redis SETNX. |

---

### 12. `daily-brief`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) |
| **Auth** | User JWT (service role client with forwarded auth header) |
| **Input** | `{ language?: "tr"\|"en" }` |
| **Output** | Daily brief object `{ user_id, brief_date, content, sentiment }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY` |
| **Redis Keys** | None |
| **DB Tables** | `daily_briefs` (read + insert), `positions` (read), `watchlist` (read), `price_cache` (read) |
| **RPCs** | None |
| **External APIs** | Lovable AI Gateway (`google/gemini-3-flash-preview`) |
| **Status Codes** | 200, 401, 402, 429, 500 |
| **Notes** | Idempotent: returns existing brief if already generated today. |

---

### 13. `execute-trade`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) |
| **Auth** | User JWT (service role client with forwarded auth header) |
| **Input** | `{ symbol, asset_class, side: "buy"\|"sell", quantity, position_id?, intent_tag?, intent_note?, planned_tp?, planned_sl? }` |
| **Output** | `{ success: true, balance, pnl, price, achievements, trade_id }` |
| **Called Functions** | `trade-mirror` (fire-and-forget, line 268) |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Redis Keys** | None |
| **DB Tables** | `price_cache` (read), `profiles` (read + update `demo_balance`), `positions` (read + insert + delete), `trades` (read + insert), `notifications` (insert), `user_stats` (read + update), `copy_settings` (read) |
| **RPCs** | `touch_streak`, `award_xp`, `grant_achievement` |
| **External APIs** | None |
| **Status Codes** | 200, 400, 401, 500 |
| **Notes** | `admin: any` parameter on `executeOne()` (line 102). Server-authoritative price from `price_cache`. 5-minute staleness guard. Copy-trade fan-out to followers. Gamification: achievements + XP. |

---

### 14. `news-feed`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) |
| **Auth** | User JWT via `SUPABASE_ANON_KEY` client |
| **Input** | `{ symbol?: string, language?: "tr"\|"en" }` |
| **Output** | `{ items: Array<{ title, summary, sentiment, source }> }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LOVABLE_API_KEY` |
| **Redis Keys** | None |
| **DB Tables** | None (AI gateway only) |
| **RPCs** | None |
| **External APIs** | Lovable AI Gateway (`google/gemini-3-flash-preview`, function calling) |
| **Status Codes** | 200, 400, 401, 402, 429, 500, 502 |

---

### 15. `price-feed`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) / Cron (via `x-cron-secret`) |
| **Auth** | Service role bearer OR cron secret (DB-validated) |
| **Input** | None (fetches all symbols) |
| **Output** | `{ success: true, updated, crypto, yahoo, orders_checked, alerts_checked }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Redis Keys** | `SET blitz:price:${symbol}` (60s TTL) — writes for ALL 30 symbols |
| **DB Tables** | `price_cache` (upsert), `positions` (update `current_price`), `orders` (read + update status), `price_alerts` (read + update), `notifications` (insert), `profiles` (read + update `demo_balance`), `trades` (insert) |
| **RPCs** | `verify_cron_secret` |
| **External APIs** | Binance public API (`api.binance.com`), Yahoo Finance (`query1.finance.yahoo.com`) |
| **Status Codes** | 200, 401, 500 |
| **Notes** | `admin: any` parameter on `fillOrder()` (line 262). Fetches 30 symbols: 8 crypto (Binance) + 22 others (Yahoo). Triggers limit/stop/take-profit orders. Triggers price alerts. |

---

### 16. `reset-demo-account`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) |
| **Auth** | User JWT (service role client with forwarded auth header) |
| **Input** | None (resets caller's own account) |
| **Output** | `{ success: true }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Redis Keys** | None |
| **DB Tables** | `positions` (delete), `orders` (update status to "cancelled"), `profiles` (update `demo_balance=100000`, `initial_balance=100000`) |
| **RPCs** | None |
| **External APIs** | None |
| **Status Codes** | 200, 401, 500 |
| **Notes** | Hardcoded reset balance: $100,000. |

---

### 17. `send-push`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) / DB trigger (notification insert) |
| **Auth** | Service role bearer only |
| **Input** | `{ user_id: string, notification?: object }` |
| **Output** | `{ success: true, sent: number, removed: number }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
| **Redis Keys** | None |
| **DB Tables** | `push_subscriptions` (read + delete stale 404/410) |
| **RPCs** | None |
| **External APIs** | Web Push services (VAPID-authenticated) |
| **Status Codes** | 200, 400, 401, 500 |
| **Notes** | Gracefully skips when VAPID keys not configured. Cleans up expired subscriptions. |

---

### 18. `trade-mirror`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) — internal only |
| **Auth** | Service role bearer only (called by `execute-trade`) |
| **Input** | `{ user_id: string, trade_id: string }` |
| **Output** | `{ ok: true, observation: string, pattern_type: string }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY` |
| **Redis Keys** | None |
| **DB Tables** | `trades` (read), `coach_insights` (insert), `notifications` (insert) |
| **RPCs** | None |
| **External APIs** | Lovable AI Gateway (`google/gemini-3-flash-preview`, function calling) |
| **Status Codes** | 200, 400, 401, 500 |
| **Notes** | Fire-and-forget from `execute-trade`. Generates behavioral mirror observation (not advice). |

---

### 19. `weekly-digest`

| Field | Value |
|-------|-------|
| **Trigger** | HTTP (`Deno.serve`) |
| **Auth** | User JWT (service role client with forwarded auth header) |
| **Input** | None |
| **Output** | `{ success: true, closes: number, total_pnl: number }` or `{ skipped: true, reason: string }` |
| **Called Functions** | None |
| **Env Vars** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Redis Keys** | None |
| **DB Tables** | `profiles` (read + update `last_weekly_digest_at`), `trades` (read), `emotional_logs` (read), `coach_insights` (insert), `notifications` (insert) |
| **RPCs** | None |
| **External APIs** | None |
| **Status Codes** | 200, 401, 500 |
| **Notes** | 3 `as any` casts (lines 53, 69, 71, 79, 81, 85). Throttled: max once per 6 days. |

---

## Cross-Function Dependencies

### Inter-Function Calls

| Source | Target | Pattern | Auth | Fire-and-Forget |
|--------|--------|---------|------|-----------------|
| `execute-trade` | `trade-mirror` | HTTP fetch (`/functions/v1/trade-mirror`) | Service role bearer | Yes (line 268-275) |

### Shared Redis Keys (Cross-Function Access)

| Key Pattern | Writer | Readers |
|-------------|--------|---------|
| `blitz:price:${symbol}` | `price-feed` (SET 60s) | `blitz-tick-order`, `blitz-join-private`, `blitz-matchmake`, `blitz-settle-room` |
| `blitz:room:${roomId}` | `blitz-matchmake` (HSETALL), `blitz-join-private` (HSETALL) | `blitz-settle-room` (DEL) |
| `blitz:room:${roomId}:users` | `blitz-matchmake` (SADD) | `blitz-settle-room` (DEL) |

### Shared DB Tables (Multi-Function Access)

| Table | Writers | Readers |
|-------|---------|---------|
| `profiles` | blitz-admin-topup, blitz-matchmake, blitz-settle-room, blitz-join-private, execute-trade, price-feed, reset-demo-account, weekly-digest, daily-brief, ai-strategy | All functions with auth |
| `positions` | execute-trade, price-feed, reset-demo-account | ai-risk-monitor, ai-strategy, daily-brief, price-feed |
| `trades` | execute-trade, price-feed | ai-trade-coach, trade-mirror, weekly-digest |
| `notifications` | ai-risk-monitor, blitz-settle-room, execute-trade, price-feed, trade-mirror, weekly-digest, ai-trade-coach | ai-risk-monitor (read cooldown) |
| `blitz_rooms` | blitz-matchmake, blitz-join-private | blitz-settle-room, blitz-tick-order |
| `blitz_orders` | blitz-tick-order | blitz-settle-room |
| `blitz_participants` | blitz-matchmake, blitz-join-private | blitz-settle-room |
| `analytics_events_staging` | blitz-matchmake, blitz-tick-order, blitz-settle-room | blitz-analytics-writer |
| `analytics_events` | blitz-analytics-writer | — (append-only) |
| `price_cache` | price-feed (upsert) | blitz-tick-order, blitz-join-private, blitz-matchmake, blitz-settle-room, execute-trade, daily-brief |
| `settlement_ledger` | blitz-settle-room | — (append-only) |
| `platform_revenue` | blitz-settle-room | — (append-only) |
| `real_balance_ledger` | blitz-admin-topup | — (append-only) |
| `coach_insights` | ai-trade-coach, trade-mirror, weekly-digest | — |
| `user_stats` | execute-trade | — |
| `push_subscriptions` | send-push (read + delete) | — |
| `daily_briefs` | daily-brief | — |
| `watchlist` | — (user-managed) | daily-brief |
| `orders` | price-feed (fill/cancel), reset-demo-account | price-feed |
| `price_alerts` | price-feed (trigger) | — |
| `copy_settings` | — (user-managed) | execute-trade |
| `emotional_logs` | — (user-managed) | weekly-digest |

---

## Environment Variable Matrix

| Variable | ai-analyze | ai-chat | ai-risk-monitor | ai-strategy | ai-trade-coach | blitz-admin-topup | blitz-analytics-writer | blitz-join-private | blitz-matchmake | blitz-settle-room | blitz-tick-order | daily-brief | execute-trade | news-feed | price-feed | reset-demo-account | send-push | trade-mirror | weekly-digest |
|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `SUPABASE_URL` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | — | — | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ |
| `SUPABASE_ANON_KEY` | ✅ | ✅ | — | — | ✅ | — | — | — | — | — | — | — | — | ✅ | — | — | — | — | — |
| `LOVABLE_API_KEY` | ✅ | ✅ | — | ✅ | ✅ | — | — | — | — | — | — | ✅ | — | ✅ | — | — | — | ✅ | — |
| `UPSTASH_REDIS_REST_URL` | — | — | — | — | — | — | — | via shared | via shared | via shared | via shared | — | — | — | via shared | — | — | — | — |
| `UPSTASH_REDIS_REST_TOKEN` | — | — | — | — | — | — | — | via shared | via shared | via shared | via shared | — | — | — | via shared | — | — | — | — |
| `VAPID_PUBLIC_KEY` | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | ✅ | — | — |
| `VAPID_PRIVATE_KEY` | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | ✅ | — | — |
| `VAPID_SUBJECT` | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | — | ✅ | — | — |

---

## RPC Calls Reference

| RPC | Called By | Purpose |
|-----|-----------|---------|
| `verify_cron_secret` | blitz-analytics-writer, blitz-settle-room, ai-risk-monitor, price-feed | DB-side cron token validation |
| `has_role` | blitz-admin-topup | Admin role check |
| `log_observability` | blitz-matchmake, blitz-tick-order, blitz-settle-room | Structured observability logging |
| `tick_order_atomic` | blitz-tick-order | Atomic order open validation |
| `close_order_atomic` | blitz-tick-order | Atomic order close with lock |
| `validate_slippage` | blitz-tick-order | Price slippage check |
| `order_timestamp` | blitz-tick-order | Server-authoritative timestamp |
| `make_advisory_lock_key` | blitz-settle-room | Generate advisory lock key |
| `try_advisory_lock` | blitz-settle-room | Acquire advisory lock |
| `lock_and_validate_room` | blitz-settle-room | Lock room + idempotency check |
| `touch_streak` | execute-trade | Update daily streak |
| `award_xp` | execute-trade | Award XP points |
| `grant_achievement` | execute-trade | Grant achievement badge |

---

## Auth Pattern Summary

| Pattern | Functions | Count |
|---------|-----------|-------|
| User JWT (anon key client) | ai-analyze, ai-chat, news-feed | 3 |
| User JWT (service role client + forwarded auth) | ai-strategy, daily-brief, execute-trade, reset-demo-account, weekly-digest, ai-trade-coach (single-user) | 6 |
| User JWT (service role client + token extraction) | blitz-admin-topup, blitz-join-private, blitz-matchmake, blitz-tick-order | 4 |
| Service role OR cron secret | blitz-analytics-writer, blitz-settle-room, ai-risk-monitor, price-feed | 4 |
| Service role only | send-push, trade-mirror | 2 |

---

## `admin: any` Parameter Inventory

| Function | Line | Parameter | Risk |
|----------|------|-----------|------|
| `blitz-settle-room` | 13 | `settleRoom(admin: any, roomId: string)` | High (financial settlement) |
| `execute-trade` | 102 | `executeOne(admin: any, userId, body, opts)` | High (trade execution) |
| `price-feed` | 262 | `fillOrder(admin: any, order, fillPrice)` | Medium (order fill) |
| `ai-trade-coach` | 131 | `processUser(admin: any, userId)` | Low (AI coaching) |

---

## Threat Model Cross-Reference (Redis-Related)

| Threat ID | Description | Affected Functions | Redis Keys |
|-----------|-------------|-------------------|------------|
| T-I01 | Redis credential exposure via env dump | `_shared/redis.ts` → all 5 Redis functions | All |
| T-T02 | Price cache poisoning via Redis key tampering | blitz-tick-order, blitz-settle-room, blitz-matchmake | `blitz:price:${symbol}` |
| T-D03 | Redis connection exhaustion under load | `_shared/redis.ts` → all 5 Redis functions | All |
| T-D02 | Concurrency bomb on matchmaking queue | blitz-matchmake | `blitz:queue:${symbol}:${entry_fee}` |

---

*Generated by Wave 0, Task 3 — Edge Function Dependency Map + Redis Key Audit*
