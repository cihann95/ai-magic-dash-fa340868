# Task 3 Evidence: Redis Key Audit

**Project:** Lumen Trade (ai-magic-dash-fa340868)
**Task:** Wave 0, Task 3 — Redis Key Audit
**Date:** 2026-06-10
**Auditor:** Sisyphus-Junior
**Status:** COMPLETE

---

## Redis Infrastructure

| Field | Value |
|-------|-------|
| Provider | Upstash (REST-based HTTP client) |
| Client | `@upstash/redis@1.34.3` via `https://esm.sh/` |
| Connection | REST (no persistent TCP sockets) |
| Fail-open | Yes — `redisEnabled = !!(URL && TOKEN)` |
| Error handling | `safe()` wrapper catches all errors, returns fallback values |
| Functions using Redis | 5 of 19 (26%) |
| Total Redis operations found | 25 calls across 5 files |

---

## Complete Redis Key Inventory

### Key 1: `blitz:price:${symbol}`

| Field | Value |
|-------|-------|
| **Pattern** | `blitz:price:${symbol}` (e.g., `blitz:price:BTCUSD`) |
| **Namespace** | `blitz:price` |
| **Type** | String (numeric price value) |
| **TTL** | 60 seconds |
| **Writer** | `price-feed` (line 185): `redis.set(\`blitz:price:${u.symbol}\`, u.price, 60)` |
| **Readers** | `blitz-tick-order` (line 92), `blitz-join-private` (line 48), `blitz-matchmake` (line 208), `blitz-settle-room` (line 57) |
| **Operations** | SET (with TTL), GET |
| **Purpose** | Live price cache for blitz room operations — fast price reads without DB roundtrip |
| **Symbols** | 30 symbols (8 crypto + 7 stocks + 4 forex + 4 commodities + 4 indices + 3 ETF) |
| **Threat** | T-T02 (Price Cache Poisoning) — if Redis credentials leak, attacker could overwrite prices |

#### Access Pattern
```
price-feed (cron, every ~30s):
  SET blitz:price:${symbol} ${price} EX 60   [for all 30 symbols]

blitz-tick-order (user request):
  GET blitz:price:${symbol}                   [fallback to price_cache table]

blitz-join-private (user request):
  GET blitz:price:${symbol}                   [fallback to price_cache table]

blitz-matchmake (user request):
  GET blitz:price:${symbol}                   [fallback to price_cache table]

blitz-settle-room (cron/user):
  GET blitz:price:${symbol}                   [fallback to price_cache table]
```

---

### Key 2: `blitz:room:${roomId}`

| Field | Value |
|-------|-------|
| **Pattern** | `blitz:room:${roomId}` (e.g., `blitz:room:550e8400-e29b-41d4-a716-446655440000`) |
| **Namespace** | `blitz:room` |
| **Type** | Hash (`status`, `symbol`, `start_price`, `ends_at`) |
| **TTL** | 600 seconds (10 minutes) |
| **Writers** | `blitz-matchmake` (line 264): `redis.hsetAll()`, `blitz-join-private` (line 64): `redis.hsetAll()` |
| **Readers** | None explicitly (used for real-time UI subscriptions via Supabase Realtime) |
| **Deleters** | `blitz-settle-room` (line 167): `redis.del()` |
| **Operations** | HSETALL, EXPIRE, DEL |
| **Purpose** | Active room metadata for real-time UI state |
| **Threat** | Low — room state is derived from DB, not authoritative |

#### Access Pattern
```
blitz-matchmake (on match found):
  HSETALL blitz:room:${roomId}  {status, symbol, start_price, ends_at}
  EXPIRE blitz:room:${roomId} 600

blitz-join-private (on room activation):
  HSETALL blitz:room:${roomId}  {status, symbol, start_price, ends_at}
  EXPIRE blitz:room:${roomId} 600

blitz-settle-room (on settlement):
  DEL blitz:room:${roomId}
```

---

### Key 3: `blitz:room:${roomId}:users`

| Field | Value |
|-------|-------|
| **Pattern** | `blitz:room:${roomId}:users` |
| **Namespace** | `blitz:room` |
| **Type** | Set (user IDs) |
| **TTL** | 600 seconds (10 minutes) |
| **Writers** | `blitz-matchmake` (line 270): `redis.sadd()` |
| **Readers** | None explicitly |
| **Deleters** | `blitz-settle-room` (line 167): `redis.del()` |
| **Operations** | SADD, EXPIRE, DEL |
| **Purpose** | Room participant set for real-time UI |
| **Threat** | Low — derived from DB |

#### Access Pattern
```
blitz-matchmake (on match found):
  SADD blitz:room:${roomId}:users ${opponent} ${userId}
  EXPIRE blitz:room:${roomId}:users 600

blitz-settle-room (on settlement):
  DEL blitz:room:${roomId}:users
```

---

### Key 4: `blitz:room:${roomId}:positions`

| Field | Value |
|-------|-------|
| **Pattern** | `blitz:room:${roomId}:positions` |
| **Namespace** | `blitz:room` |
| **Type** | Unknown (only deleted, never written in current code) |
| **TTL** | **NONE** ⚠️ |
| **Writers** | None found in current code |
| **Readers** | None found in current code |
| **Deleters** | `blitz-settle-room` (line 167): `redis.del()` |
| **Operations** | DEL only |
| **Purpose** | Room positions cache (cleanup target only) |
| **Threat** | Low — but missing TTL is a concern |

#### Issue Found
⚠️ **No TTL set** — This key is deleted by `blitz-settle-room` on successful settlement, but if settlement fails, the key persists indefinitely. Should have same 600s TTL as parent room keys.

---

### Key 5: `blitz:queue:${symbol}:${entry_fee}`

| Field | Value |
|-------|-------|
| **Pattern** | `blitz:queue:${symbol}:${entry_fee}` (e.g., `blitz:queue:BTCUSD:100`) |
| **Namespace** | `blitz:queue` |
| **Type** | List (FIFO queue of user IDs) |
| **TTL** | 300 seconds (5 minutes) |
| **Writers** | `blitz-matchmake` (lines 165, 188, 201): `redis.rpush()` |
| **Readers** | `blitz-matchmake` (line 148): `redis.lpop()` |
| **Deleters** | `blitz-matchmake` (lines 60, 146): `redis.lrem()` |
| **Operations** | RPUSH, LPOP, LREM, EXPIRE |
| **Purpose** | Matchmaking FIFO queue — users wait for opponents |
| **Threat** | T-D02 (Concurrency Bomb) — no per-user rate limiting on queue joins |

#### Access Pattern
```
blitz-matchmake (cancel mode):
  LREM blitz:queue:${symbol}:${entry_fee} 0 ${userId}

blitz-matchmake (quick match):
  LREM blitz:queue:${symbol}:${entry_fee} 0 ${userId}   [remove stale entry]
  LPOP blitz:queue:${symbol}:${entry_fee}                [try to match]
  
  If no match:
    RPUSH blitz:queue:${symbol}:${entry_fee} ${userId}   [enqueue]
    EXPIRE blitz:queue:${symbol}:${entry_fee} 300

  If match found but opponent invalid:
    RPUSH blitz:queue:${symbol}:${entry_fee} ${userId}   [re-enqueue]
```

---

### Key 6: `blitz:idem:${userId}:${idemKey}`

| Field | Value |
|-------|-------|
| **Pattern** | `blitz:idem:${userId}:${idemKey}` |
| **Namespace** | `blitz:idem` |
| **Type** | String (value: "1") |
| **TTL** | 30 seconds |
| **Writers** | `blitz-tick-order` (line 77): `redis.setNxEx()` |
| **Readers** | `blitz-tick-order` (line 77-79): checks return value |
| **Operations** | SETNX (SET with NX + EX) |
| **Purpose** | Idempotency guard — prevents duplicate order submissions within 30s window |
| **Threat** | None — correctly implemented |

#### Access Pattern
```
blitz-tick-order (on order request):
  SETNXEX blitz:idem:${userId}:${idemKey} "1" 30
  If NOT set (key existed): return 409 "Duplicate request"
```

---

## Key Namespace Summary

| Namespace | Keys | Functions | TTL Range |
|-----------|------|-----------|-----------|
| `blitz:price` | `blitz:price:${symbol}` | price-feed (W), blitz-tick-order (R), blitz-join-private (R), blitz-matchmake (R), blitz-settle-room (R) | 60s |
| `blitz:room` | `blitz:room:${roomId}`, `blitz:room:${roomId}:users`, `blitz:room:${roomId}:positions` | blitz-matchmake (W), blitz-join-private (W), blitz-settle-room (D) | 600s (except :positions — no TTL) |
| `blitz:queue` | `blitz:queue:${symbol}:${entry_fee}` | blitz-matchmake (W/R/D) | 300s |
| `blitz:idem` | `blitz:idem:${userId}:${idemKey}` | blitz-tick-order (W) | 30s |

**No conflicting namespaces found** — all keys use `blitz:` prefix with distinct sub-namespaces.

---

## Audit Findings

### ✅ Pass: No Undocumented Redis Keys
All 6 key patterns found in code match the documented inventory. No orphaned or mystery keys.

### ✅ Pass: All Keys Have TTLs (except one)
5 of 6 key types have appropriate TTLs:
- `blitz:price:*` → 60s (price freshness)
- `blitz:room:*` → 600s (room lifecycle + settlement buffer)
- `blitz:room:*:users` → 600s (matches room)
- `blitz:queue:*` → 300s (5min matchmaking window)
- `blitz:idem:*` → 30s (idempotency window)

### ⚠️ Finding: Missing TTL on `blitz:room:${roomId}:positions`
- **Key:** `blitz:room:${roomId}:positions`
- **Issue:** No TTL set. Only deleted by `blitz-settle-room` on successful settlement.
- **Risk:** If settlement fails, key persists indefinitely (memory leak).
- **Recommendation:** Add `EXPIRE 600` when key is created, or add to the `blitz:room:${roomId}` TTL group.
- **Severity:** Low (currently no code writes to this key — it's a cleanup target only)
- **Downstream:** T33 (Redis hardening)

### ⚠️ Finding: No Price Staleness Validation in Redis Readers
- **Keys:** `blitz:price:${symbol}`
- **Issue:** Functions read price from Redis without checking TTL/staleness. If `price-feed` cron stops, Redis prices expire after 60s, but functions fall back to `price_cache` table which may also be stale.
- **Risk:** Orders could execute on stale prices.
- **Existing mitigation:** `blitz-tick-order` has 150ms clock drift guard and `execute-trade` has 5-minute staleness check on `price_cache`.
- **Severity:** Low (defense-in-depth exists at DB level)
- **Downstream:** T37 (Production crash test)

### ✅ Pass: No Conflicting Key Namespaces
All keys use `blitz:` prefix with distinct sub-namespaces. No key is used for different purposes by different functions.

### ✅ Pass: Fail-Open Behavior
Redis operations gracefully degrade when unavailable. All blitz functions have DB fallbacks for price reads.

### ✅ Pass: No Redis Keys in Non-Blitz Functions
14 of 19 functions do not use Redis at all. Redis usage is isolated to the blitz subsystem + price-feed.

---

## Redis Operations by Function

| Function | Operations | Keys |
|----------|------------|------|
| `price-feed` | `SET` (with TTL) | `blitz:price:${symbol}` |
| `blitz-tick-order` | `SETNXEX`, `GET` | `blitz:idem:*`, `blitz:price:${symbol}` |
| `blitz-matchmake` | `LREM`, `LPOP`, `RPUSH`, `EXPIRE`, `GET`, `HSETALL`, `SADD` | `blitz:queue:*`, `blitz:price:${symbol}`, `blitz:room:*`, `blitz:room:*:users` |
| `blitz-join-private` | `GET`, `HSETALL`, `EXPIRE` | `blitz:price:${symbol}`, `blitz:room:${roomId}` |
| `blitz-settle-room` | `GET`, `DEL` | `blitz:price:${symbol}`, `blitz:room:${roomId}`, `blitz:room:${roomId}:users`, `blitz:room:${roomId}:positions` |

---

## Threat Model Cross-Reference

| Threat | Redis Key | Current Mitigation | Gap |
|--------|-----------|-------------------|-----|
| T-I01 (Redis credential exposure) | All | No `console.log(Deno.env)` found | Add lint rule (T36) |
| T-T02 (Price cache poisoning) | `blitz:price:*` | Price validation (finite, positive); slippage check | Read-only token scope (T33) |
| T-D02 (Concurrency bomb) | `blitz:queue:*` | Conditional UPDATE on balance | Per-user rate limit (T31) |
| T-D03 (Redis connection exhaustion) | All | Fail-open; DB fallback | Circuit breaker pattern |

---

*Evidence generated by Wave 0, Task 3 — Redis Key Audit*
