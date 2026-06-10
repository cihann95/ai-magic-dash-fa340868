# Hard Technical Audit — LumenTrade Blitz

Path: `.omo/plans/hard-technical-audit.md`

Three crash-test tracks. Each produces a runnable script + evidence log under `.omo/evidence/hard-audit/`. No new features.

## CRSH-001 — Runtime Purge & Connection Proofing

**Reality check first:** current `supabase/functions/_shared/redis.ts` is already a REST-based fetch client (Upstash). `npm:redis@4.6.13` is **not** imported anywhere — verified via repo search context. Task 1 therefore becomes:

1. Swap the hand-rolled REST wrapper for the official `@upstash/redis` Deno package (`https://esm.sh/@upstash/redis@1.34.3`) so we stop maintaining bespoke pipeline logic and inherit Upstash's retry/backoff.
2. Refactor `blitz-matchmake`, `blitz-tick-order`, `blitz-settle-room`, `blitz-join-private` imports to the new client. Public API surface (`redis.get/set/hset/...`) preserved via a thin adapter so call sites don't drift.
3. **Connection-leak probe** (`scripts/audit/redis-leak-probe.ts`): spawns 50 parallel cold invocations of `blitz-matchmake` (`mode:cancel` no-op) using `supabase.functions.invoke`, then queries `INFO clients` via Upstash REST. Pass criterion: `connected_clients` returns to baseline ±2 within 10s. Fails the script (exit 1) otherwise → CI gate ready.
4. **Types consolidation**: extract `BlitzRoom`, `BlitzParticipant`, `BlitzOrder`, `MatchmakeRequest`, `TickOrderRequest`, `SettleResult` into `src/types/blitz.ts`. Re-export from `useBlitzRoom.ts`. Edge functions get a Deno-side mirror at `supabase/functions/_shared/blitz-types.ts` (Deno can't import from `src/`).

Evidence: `.omo/evidence/hard-audit/crsh-001-leak-probe.log`.

## CRSH-002 — Concurrency Bombardment

1. **Lock audit** (read-only SQL via migration-doc): inspect `tick_order_atomic`, `close_order_atomic` for `pg_advisory_xact_lock` keys, deadlock classes, isolation levels. Document findings in evidence file. Add the lock if missing: `pg_advisory_xact_lock(hashtext(_room_id::text))` inside both RPCs to serialize per-room mutations.
2. **Bombardment script** (`scripts/audit/concurrency-bomb.ts`):
   - Creates a synthetic active room (service-role insert).
   - Seeds 2 participants with locked `real_balance`.
   - Fires **100 parallel** `blitz-tick-order` calls (50 open, 50 close) within a 500 ms window using `Promise.all` + jittered sleeps.
   - Records: p50/p95/p99 latency, error histogram, deadlock count (`SELECT count(*) FROM pg_stat_database WHERE deadlocks > 0`), final `blitz_orders` consistency (no duplicate open per user, every close has matching open).
3. **Success metrics** written to `.omo/evidence/hard-audit/crsh-002-bombardment.log`:
   - 0 deadlocks
   - 0 orphan open orders
   - p95 < 800 ms, p99 < 1500 ms
   - 0 `connection limit exceeded` errors
   Script exits non-zero if any metric fails.

## CRSH-003 — Exploit Simulation & Idempotency

1. **Server-time enforcement** in `blitz-tick-order`:
   - Reject any request whose `x-client-sent-at` header is older than 150 ms vs server `Date.now()`.
   - Reject any body that contains a `timestamp`, `client_time`, `entry_price`, or `price` field (defence-in-depth — server already ignores them; now we 400 instead of silently dropping, so attackers get a clear failure).
   - Re-fetch price inside the RPC transaction (already done) and compare against the price snapshot used for slippage; widen rejection if `price_age_ms > 1000`.
2. **Idempotency layer**:
   - Client sends `Idempotency-Key: <uuid>` (generated per click). Hook patch in `useBlitzRoom` action helpers.
   - Edge function: `SETNX blitz:idem:{user}:{key}` with 30 s TTL via Upstash. On collision → `409 Conflict` + cached response body (store JSON under same key via `SET ... NX EX 30`).
   - Migration adds `blitz_orders.idempotency_key text` with `UNIQUE (user_id, idempotency_key)` as the DB belt-and-braces guard.
3. **Malicious arbitrageur script** (`scripts/audit/arbitrage-exploit.ts`):
   - Logs in as a test user (service-role mints a session).
   - **Stale-price attack**: snapshots price, sleeps 400 ms, sends order with spoofed `x-client-sent-at` 50 ms in the past. Expect `409` / `400`.
   - **Spam attack**: 10× parallel "sell" with the same `Idempotency-Key`. Expect exactly 1 × `200`, 9 × `409`.
   - **Body-injection attack**: sends `entry_price: 0.01` in body. Expect `400`.
   Logs each scenario pass/fail to `.omo/evidence/hard-audit/crsh-003-exploit.log` and exits non-zero on any failure.

## Deliverables

```text
.omo/plans/hard-technical-audit.md          # this plan, committed
.omo/boulder.json                           # phase locked to "hard-technical-audit"
.omo/evidence/hard-audit/
  crsh-001-leak-probe.log
  crsh-002-bombardment.log
  crsh-003-exploit.log
scripts/audit/
  redis-leak-probe.ts
  concurrency-bomb.ts
  arbitrage-exploit.ts
src/types/blitz.ts
supabase/functions/_shared/blitz-types.ts
supabase/functions/_shared/redis.ts         # rewritten on @upstash/redis
supabase/functions/blitz-tick-order/index.ts # +timestamp + idempotency
supabase/functions/blitz-matchmake/index.ts  # client swap
supabase/functions/blitz-settle-room/index.ts # client swap
supabase/functions/blitz-join-private/index.ts # client swap
supabase/migrations/<ts>_blitz_hard_audit.sql # advisory lock + idempotency unique
```

## Execution order

1. CRSH-001 client swap + types + leak probe → run probe, capture log.
2. Migration for advisory lock + `idempotency_key UNIQUE`.
3. CRSH-002 bombardment script → run, capture log, iterate if metrics fail.
4. CRSH-003 timestamp/idempotency edge-function changes → exploit script → log.
5. Update `.omo/boulder.json` (`phase: "hard-technical-audit"`, `status: "locked"`, evidence paths listed).

## Technical notes

- All scripts are Deno (`deno run -A`) so they reuse the edge runtime — no extra Node toolchain.
- Service-role key is required for seed/teardown; scripts read `SUPABASE_SERVICE_ROLE_KEY` from env and **abort** if missing (no hard-coded fallback).
- Bombardment + exploit scripts create their own throwaway users with `auth.admin.createUser` and tear them down in `finally`.
- Idempotency keys are stored both in Redis (fast path) and DB (durable). Redis miss → DB unique constraint still wins → consistent `409`.
- Advisory-lock key uses `hashtext(room_id::text)` to fit `bigint` and avoid cross-room contention.

Ready to implement on approval.