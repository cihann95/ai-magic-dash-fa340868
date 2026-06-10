# Blitz Phase 2: Security, Settlement, Spectator, Analytics & Observability

## TL;DR

> **Quick Summary**: Production-hardening phase for the Blitz trading mode. Implements server-authoritative timestamping, front-running protection, slippage validation, PostgreSQL row-level locking for settlement integrity, exactly-once payout guarantees, a settlement ledger, spectator engagement via Realtime Broadcast (no DB writes), analytics event pipeline, and full observability.

> **Deliverables**:
> - 4 PostgreSQL migrations (security_hardening, settlement_integrity, analytics_foundation, observability)
> - 3 new/modified Edge Functions (blitz-tick-order v2, blitz-settle-room v2, blitz-analytics-writer)
> - 3 React hooks (useSpectatorBroadcast, useAnalytics, useObservability) + 1 component (SpectatorPanel)
> - 4 new tables (settlement_ledger, slippage_config, analytics_events, analytics_events_staging)
> - 1 new Realtime Broadcast channel (spectator:{room_id})
> - 1 new cron job (analytics_events cleanup)
> - QA oracle protocol with 14 validation procedures

> **Estimated Effort**: XL — 5 implementation waves + 1 final verification wave
> **Parallel Execution**: YES — 6 waves, 4–5 tasks per wave
> **Critical Path**: SEC-001 → SET-001 → SET-003 → OBS-002

---

## Context

### Original Request
Design the next implementation phase across five domains: Security Hardening (A), Concurrency & Settlement Integrity (B), Spectator Engagement (C), Analytics Foundation (D), and Observability (E).

### Architecture Decisions From Codebase Analysis

| Decision | Rationale |
|----------|-----------|
| **Existing Redis is kept as read cache only** | Used for price cache and matchmaking queue. Security-critical writes bypass Redis entirely and use PostgreSQL conditional updates + row-level locking. Redis may be stale; PG is source of truth. |
| **Broadcast over Presence for spectator features** | Emoji reactions and chat messages would create unbounded Presence state growth. Realtime Broadcast channels are ephemeral and auto-garbage-collected. |
| **Settlement ledger is a separate table** | Immutable append-only log decouples settlement audit from the mutable `blitz_rooms` row. Enables exactly-once via idempotency key. |
| **Dual-payout protection via advisory lock** | Edge Function and DB trigger both acquire a named advisory lock keyed on `room_id` before payout. Second caller skips. |
| **Event analytics via PG INSERT, not Edge Function** | Avoids cold-start latency for high-frequency events (emoji, chat). Batch-written by a cron-based Edge Function to keep `analytics_events` manageable. |
| **Slippage validated at order-open time** | The `blitz-tick-order` Edge Function compares the current market price against the participant's entry price at `starts_at`. Slippage threshold configured server-side. |

### Research Findings

**Existing Guardrails Already In Place:**
- `guard_profiles_financial_update` trigger blocks client balance mutations (via `request.jwt.claim.role` check)
- `guard_positions_financial_update` trigger blocks client position mutations
- `guard_user_stats_update` trigger blocks client stat mutations
- `update_updated_at_column` trigger on all time-tracked tables
- RLS policies on `realtime.messages` for channel authorization (`topic LIKE (uid || ':')`)
- `platform_revenue` table exists but no settlement ledger

**Existing Vulnerabilities Found:**
- `blitz-tick-order/index.ts` accepts client-supplied `amount` and `side` without server-authoritative position validation
- `blitz-tick-order/index.ts` does not validate slippage — a user could open a position at `starts_at` price with stale pricing
- `blitz-settle-room/index.ts` uses `UPDATE ... WHERE status = 'active'` for race prevention but no explicit `SELECT ... FOR UPDATE` lock
- `blitz_payout_trigger` (DB trigger) fires on `BEFORE UPDATE OF status` concurrently with the Edge Function — dual payout race exists
- No idempotency key on settlement — retried cron invocations could process the same room
- `blitz-tick-order/index.ts` uses `new Date(room.ends_at!).getTime() <= Date.now()` for expiry check, relying on client-adjacent clock (Edge Function clock is server-side, but the room's `ends_at` was set by the Edge Function at creation, so this is acceptable)

---

## SECTION 1: ARCHITECTURE OVERVIEW

### Security Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       SECURITY BOUNDARY                             │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    CLIENT (Browser)                           │  │
│  │  - useAnalytics hook → insert_analytics_event RPC (auth.uid) │  │
│  │  - useSpectatorBroadcast → Realtime Broadcast ONLY            │  │
│  │  - NO direct DB writes to orders/participants/rooms           │  │
│  │  - NO client timestamps accepted                              │  │
│  └───────────────────────┬───────────────────────────────────────┘  │
│                          │ Auth: JWT (supabase-js)                  │
│  ┌───────────────────────▼───────────────────────────────────────┐  │
│  │                 EDGE FUNCTIONS (Server)                       │  │
│  │  - blitz-matchmake: server-authoritative balance lock + room  │  │
│  │  - blitz-tick-order v2: atomic RPC + slippage validation     │  │
│  │  - blitz-settle-room v2: row lock + idempotency + ledger      │  │
│  │  - blitz-analytics-writer: batch flush (cron)                 │  │
│  │  ALL use service_role key → bypass RLS                       │  │
│  └───────────────────────┬───────────────────────────────────────┘  │
│                          │ service_role connection                   │
│  ┌───────────────────────▼───────────────────────────────────────┐  │
│  │              PostgreSQL (Supabase)                            │  │
│  │                                                                │  │
│  │  GUARD TRIGGERS:                                               │  │
│  │  - guard_blitz_orders_cheat_trg (blocks client UPDATE/DELETE)  │  │
│  │  - guard_blitz_participants_cheat_trg (blocks client UPDATE/   │  │
│  │    DELETE)                                                      │  │
│  │  - guard_profiles_financial_update (blocks balance tampering)  │  │
│  │  - track_blitz_rooms_update_trg (sets updated_by)              │  │
│  │                                                                │  │
│  │  SECURITY DEFINER FUNCTIONS:                                   │  │
│  │  - tick_order_atomic() — row lock + validate + return          │  │
│  │  - lock_and_validate_room() — row lock + idempotency check     │  │
│  │  - validate_slippage() — price deviation check                 │  │
│  │  - insert_analytics_event() — client-safe event writing        │  │
│  │  - settlement_already_processed() — idempotency guard          │  │
│  │                                                                │  │
│  │  RLS:                                                          │  │
│  │  - settlement_ledger: service_role + admin SELECT              │  │
│  │  - analytics_events: service_role + own SELECT + admin SELECT  │  │
│  │  - observability_log: service_role + admin SELECT              │  │
│  │  - slippage_config: authenticated SELECT                       │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  REDIS (Upstash — existing, read-cache only):                        │
│  - Price cache (blitz:price:{symbol})                                │
│  - Matchmaking queue                                                  │
│  ⚠ NEVER used for security-critical writes — PG is source of truth   │
└──────────────────────────────────────────────────────────────────────┘
```

**Sequence: Order OPEN (anti-front-running flow)**
```
1. Client → blitz-tick-order: { room_id, action: "open", side: "long", amount: 10 }
2. Edge Function verifies JWT → extracts user.id
3. Edge Function calls tick_order_atomic(room_id, user.id, side, amount)
   └── PostgreSQL: SELECT ... FROM blitz_rooms WHERE id = $1 FOR UPDATE
   └── Validates: room.status = 'active', room.ends_at > now(), user is participant,
       no existing open position
   └── Returns: { room_id, symbol, start_price }
4. Edge Function reads current price from Redis (fallback: price_cache)
5. Edge Function calls validate_slippage(symbol, current_price, start_price)
   └── PostgreSQL: checks abs((current - start) / start * 100) <= max_slippage_pct
6. If valid: INSERT INTO blitz_orders (room_id, user_id, side, amount, entry_price)
   └── opened_at defaults to now() (server-authoritative)
7. If invalid: return 409 "Slippage too high"
```

### Settlement Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                   SETTLEMENT FLOW (Exactly-Once)                    │
│                                                                      │
│  TRIGGER PATHS:                                                      │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │ Cron (10s)   │    │ Client requests  │    │ DB Trigger fires │   │
│  │ blitz-settle │───►│ settle-room      │───►│ on status→finish │   │
│  └──────────────┘    └────────┬─────────┘    └────────┬─────────┘   │
│                               │                       │              │
│                               ▼                       ▼              │
│                    ┌─────────────────────┐   ┌────────────────────┐  │
│                    │ pg_try_advisory_lock │   │ pg_try_advisory_   │  │
│                    │ (room_id hash)       │   │ lock (same hash)   │  │
│                    └──────────┬──────────┘   └──────────┬─────────┘  │
│                               │                         │            │
│                    ┌──────────▼─────────────────────────▼──────────┐ │
│                    │         COMPETING SESSIONS                    │ │
│                    │  First acquires lock → proceeds               │ │
│                    │  Second sees lock held → returns immediately  │ │
│                    └──────────────────────┬───────────────────────┘ │
│                                           │                        │
│                    ┌──────────────────────▼───────────────────────┐ │
│                    │  IDEMPOTENCY CHECK                           │ │
│                    │  settlement_already_processed(key)           │ │
│                    │  If true → return (already_settled)          │ │
│                    └──────────────────────┬───────────────────────┘ │
│                                           │                        │
│                    ┌──────────────────────▼───────────────────────┐ │
│                    │  ROW LOCK                                     │ │
│                    │  SELECT ... FROM blitz_rooms FOR UPDATE      │ │
│                    │  UPDATE status = 'settling'                   │ │
│                    └──────────────────────┬───────────────────────┘ │
│                                           │                        │
│                    ┌──────────────────────▼───────────────────────┐ │
│                    │  COMPUTE                                      │ │
│                    │  Liquidate open positions at last price       │ │
│                    │  Calculate PnL per participant                │ │
│                    │  Sort by PnL, determine winner                │ │
│                    │  Update balances + notifications              │ │
│                    └──────────────────────┬───────────────────────┘ │
│                                           │                        │
│                    ┌──────────────────────▼───────────────────────┐ │
│                    │  WRITE SETTLEMENT LEDGER                     │ │
│                    │  INSERT INTO settlement_ledger               │ │
│                    │  (idempotency_key UNIQUE → exactly-once)     │ │
│                    └──────────────────────┬───────────────────────┘ │
│                                           │                        │
│                    ┌──────────────────────▼───────────────────────┐ │
│                    │  WRITE ANALYTICS + OBSERVABILITY             │ │
│                    │  analytics_events_staging: blitz_finished    │ │
│                    │  observability_log: settle_complete          │ │
│                    └──────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### Broadcast Architecture (Spectator Engagement)

```
┌─────────────────────────────────────────────────────────────────────┐
│                  REALTIME BROADCAST CHANNELS                        │
│                                                                      │
│  Channel: spectator:{room_id}                                        │
│  Type: Broadcast (no persistence, no Presence state)                 │
│                                                                      │
│  ┌──────────────┐    ┌──────────────────┐    ┌──────────────┐       │
│  │  Client A    │───►│  Supabase        │───►│  Client B    │       │
│  │  (Spectator) │    │  Realtime        │    │  (Spectator)  │       │
│  │              │    │  Broadcast       │    │              │       │
│  │  sendEmoji() │    │  Server          │    │  on("broad-  │       │
│  │  sendChat()  │    │  (fan-out)       │    │  cast", ...) │       │
│  └──────────────┘    └──────────────────┘    └──────────────┘       │
│                                                                      │
│  RATE LIMITS (client-enforced, server applies best-effort):          │
│  - Emoji: max 3/second/user (333ms throttle)                         │
│  - Chat: configurable (default 2s between messages)                  │
│                                                                      │
│  STATE MANAGEMENT:                                                   │
│  - Recent emojis: last 5 seconds, auto-evicted                      │
│  - Chat messages: last 50 messages in memory                         │
│  - NO database writes whatsoever                                     │
│                                                                      │
│  RECONNECT:                                                          │
│  - Supabase SDK auto-reconnects on CHANNEL_ERROR                    │
│  - isConnected flag reflects subscription status                     │
│  - On reconnect: state is empty (ephemeral by design)               │
└─────────────────────────────────────────────────────────────────────┘
```

### Analytics Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                  ANALYTICS EVENT PIPELINE                           │
│                                                                      │
│  WRITE PATH (low-latency):                                           │
│  Edge Functions (service_role) → INSERT analytics_events_staging    │
│  Client (authenticated) → insert_analytics_event RPC → staging      │
│                                                                      │
│  FLUSH PATH (batch, every 60 seconds via cron):                     │
│  blitz-analytics-writer Edge Function:                              │
│    1. SELECT * FROM staging WHERE flushed=false LIMIT 500           │
│    2. Bulk INSERT INTO analytics_events                             │
│    3. UPDATE staging SET flushed=true WHERE id IN (...)             │
│                                                                      │
│  RETENTION:                                                         │
│  cleanup_analytics_events() via cron daily at 03:00                 │
│  Deletes events older than 90 days from both tables                 │
│                                                                      │
│  ACCESS:                                                            │
│  - admins: SELECT all (via has_role check)                          │
│  - users: SELECT own events (user_id = auth.uid())                  │
│  - Future dashboards: materialized views over analytics_events      │
└─────────────────────────────────────────────────────────────────────┘
```

### Observability Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OBSERVABILITY SYSTEM                             │
│                                                                      │
│  LOGGING:                                                           │
│  - observability_log table (structured, queryable)                  │
│  - log_observability() RPC (service_role only)                      │
│  - Key events: settle_start, settle_complete, settle_failed,        │
│    order_open, order_close, match_found, broadcast_spike           │
│                                                                      │
│  METRICS (alert queries):                                           │
│  - alert_settlement_failures() — failed settlements in last hour    │
│  - alert_duplicate_payout_attempts() — rooms with >1 settlement     │
│  - alert_broadcast_anomalies() — errors in last 15 minutes          │
│  - Stale active rooms query (monitoring-queries.sql)                │
│                                                                      │
│  AUDIT:                                                             │
│  - blitz_rooms.updated_by column (set by trigger on UPDATE)         │
│  - settlement_ledger: append-only, immutable audit trail            │
│  - No UPDATE/DELETE on settlement_ledger (enforced by RLS)          │
│                                                                      │
│  ALERTS:                                                            │
│  - scripts/monitoring-queries.sql — run manually or via CI          │
│  - scripts/run-monitoring.sh — exit code indicates alert state      │
│  - Future: integrate with external monitoring (PagerDuty, etc.)     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Work Objectives

### Core Objective
Production-harden the Blitz trading mode with server-authoritative security, race-condition-free settlement, spectator engagement features, analytics pipeline, and observability.

### Concrete Deliverables
- `20260610000001_security_hardening.sql` — function-based timestamp, slippage config table, anti-cheat guard trigger
- `20260610000002_settlement_integrity.sql` — row-level locking, settlement_ledger table, idempotent payout, dual-payout protection
- `20260610000003_analytics_foundation.sql` — analytics_events table, indexes, retention function + cron
- Edge Function: `blitz-tick-order/v2/index.ts` — server-authoritative order validation + slippage check
- Edge Function: `blitz-settle-room/v2/index.ts` — row-level lock, idempotency key, ledger write, dual-payout prevention
- Edge Function: `blitz-analytics-writer/index.ts` — batch flush from staging to analytics_events
- React: `useSpectatorBroadcast.ts` hook — broadcast channel subscription for reactions + chat
- React: `SpectatorPanel.tsx` component — emoji reactions grid + chat input
- React: `useAnalytics.ts` hook — analytics event emission to staging table
- New DB tables: `settlement_ledger`, `slippage_config`, `analytics_events`, `analytics_events_staging`
- QA oracle protocol: 14 validation procedures

### Definition of Done
- [ ] `tsc --noEmit` produces 0 errors
- [ ] `npm run lint` produces 0 errors (pre-existing warnings acceptable)
- [ ] `npm run test` produces 7/7 PASS (existing tests) + new tests pass
- [ ] All 14 QA oracle procedures pass: `scripts/qa-phase2.sh run-all` exits 0
- [ ] Settlement ledger append-only: no UPDATE/DELETE policies exist
- [ ] Broadcast channels verified via `supabase.realtime` channel status = "SUBSCRIBED"
- [ ] No client-timestamped order exists in any Edge Function
- [ ] Dual-payout test: concurrent Edge Function + DB trigger → exactly 1 payout

### Must Have
- SEC-001 through OBS-003 as specified
- Server-authoritative order timestamping (PostgreSQL `now()` only)
- Slippage validation with configurable threshold per symbol
- Row-level locking on room settlement (`SELECT ... FOR UPDATE`)
- Exactly-once payout via idempotency key + dual-payout advisory lock
- Settlement_ledger table (immutable, append-only, no UPDATE/DELETE)
- Spectator emoji reactions + chat via Realtime Broadcast only (zero DB writes)
- Analytics events table with 90-day retention
- Alert triggers for settlement failures and duplicate payout attempts

### Must NOT Have (Guardrails)
- No new external infrastructure (no Redis replacements, no message queues, no NoSQL)
- No persistent storage for spectator chat or emoji reactions
- No JavaScript `Date.now()` anywhere near order timestamps on the server side
- No `SELECT ... FOR UPDATE` outside explicit transaction boundaries
- No `ON CONFLICT DO NOTHING` as a substitute for proper idempotency checking
- No new third-party npm packages beyond what's already in package.json
- No changes to existing Realtime Presence usage for Ana Sahne viewer count
- No schema changes to existing `blitz_rooms`, `blitz_participants`, `blitz_orders` tables (add columns only, never remove)
- No removal or weakening of existing `guard_*` triggers
- No direct client-writable balance or position columns

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Vitest + Testing Library)
- **Automated tests**: Tests-after (new test files for hooks + utilities)
- **Framework**: Vitest
- **DB tests**: SQL-level validation via `scripts/qa-phase2.sh`

### QA Policy
Every task includes agent-executable QA scenarios. Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}`.

- **Edge Functions**: Deploy to Supabase project, invoke via `supabase functions serve` + curl
- **Database migrations**: Apply to local Supabase, verify via `psql` queries
- **Frontend hooks**: Vitest unit tests with mocked Supabase client
- **Frontend components**: Playwright component tests

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — 5 tasks):
├── SEC-001: Server-authoritative order timestamping
├── SEC-002: Slippage validation layer
├── SEC-003: Anti-cheat guard trigger
├── SET-001: Settlement_ledger table + idempotency system
└── ANA-001: Analytics_events schema + staging table

Wave 2 (Core Logic — 4 tasks):
├── SEC-004: blitz-tick-order v2 — rebase on SEC-001, SEC-002
├── SET-002: blitz-settle-room v2 — rebase on SET-001
├── SET-003: Dual-payout protection (advisory lock)
└── ANA-002: blitz-analytics-writer Edge Function

Wave 3 (Frontend — 4 tasks):
├── SOC-001: useSpectatorBroadcast hook
├── SOC-002: SpectatorPanel component (emoji grid + chat)
├── ANA-003: useAnalytics hook
└── OBS-001: Observability dashboard queries

Wave 4 (Integration — 4 tasks):
├── SET-004: Wire bilaterally — settle v2 calls ledger + analytics
├── SOC-003: Integrate SpectatorPanel into AnaSahne
├── ANA-004: Wire analytics events into blitz-matchmake, blitz-tick-order v2
└── OBS-002: Alert triggers + monitoring functions

Wave 5 (Hardening — 4 tasks):
├── QA-001: Race condition validation suite
├── QA-002: Settlement collision + idempotency tests
├── QA-003: Broadcast throttling + burst tests
└── QA-004: Analytics correctness + observability tests

Wave FINAL (Verification — 4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality + security review (unspecified-high)
├── F3: Real manual QA — end-to-end scenario execution (unspecified-high)
└── F4: Scope fidelity + anti-creep audit (deep)
```

### Dependency Matrix
- **SEC-001**: - → blocks SEC-004
- **SEC-002**: - → blocks SEC-004
- **SEC-003**: - → blocks none (independent)
- **SET-001**: - → blocks SET-002, SET-003, SET-004
- **ANA-001**: - → blocks ANA-002, ANA-004
- **SEC-004**: SEC-001, SEC-002 → blocks SOC-003, ANA-004
- **SET-002**: SET-001 → blocks SET-004
- **SET-003**: SET-001 → blocks SET-004
- **ANA-002**: ANA-001 → blocks ANA-004
- **SOC-001**: - → blocks SOC-002
- **SOC-002**: SOC-001 → blocks SOC-003
- **ANA-003**: - → blocks ANA-004
- **OBS-001**: - → blocks OBS-002
- **SET-004**: SET-002, SET-003 → blocks QA-002
- **SOC-003**: SOC-002 → blocks QA-003
- **ANA-004**: ANA-002, ANA-003 → blocks QA-004
- **OBS-002**: OBS-001 → blocks QA-001
- **QA-001**: OBS-002 → blocks FINAL
- **QA-002**: SET-004 → blocks FINAL
- **QA-003**: SOC-003 → blocks FINAL
- **QA-004**: ANA-004 → blocks FINAL

---

## TODOs

- [x] 1. **SEC-001: Server-authoritative order timestamping**

  **What to do**:
  - In `blitz-tick-order/index.ts`, remove all client-supplied timestamp fields from the request body. The existing Edge Function already does NOT accept client timestamps — confirm this invariant and add an explicit guard.
  - Create PostgreSQL function `order_timestamp()` that returns `now()` as the authoritative timestamp:
    ```sql
    CREATE OR REPLACE FUNCTION public.order_timestamp()
    RETURNS timestamptz
    LANGUAGE sql
    STABLE
    SET search_path = public
    AS $$ SELECT now() $$;
    ```
  - In `blitz-tick-order/index.ts`, for both OPEN and CLOSE actions, replace any `new Date().toISOString()` with `admin.rpc('order_timestamp')` or rely on PostgreSQL `DEFAULT now()` in the `blitz_orders` table (which is already the case for `opened_at` and `created_at`). Verify that `closed_at` is set server-side only.
  - Add a comment block at the top of `blitz-tick-order/index.ts` documenting the anti-tamper invariant: "No client-supplied timestamp is ever used. All time fields are either DEFAULT now() in PostgreSQL or explicitly set via admin client (service_role)."
  - Verify that `blitz-settle-room/index.ts` does not accept or trust any client timestamp (it currently does not).

  **Must NOT do**:
  - Do not change the `blitz_orders` table schema — `opened_at` already defaults to `now()`.
  - Do not add new columns.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security-sensitive Edge Function modification requiring deep understanding of the existing Supabase codebase.
  - **Skills**: none needed (pure TypeScript + SQL)
  - **Skills Evaluated but Omitted**: all — this is a focused code modification task.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with SEC-002, SEC-003, SET-001, ANA-001)
  - **Blocks**: SEC-004
  - **Blocked By**: None

  **References**:
  - `supabase/functions/blitz-tick-order/index.ts` — full file, the target for modification
  - `supabase/functions/blitz-settle-room/index.ts:126-128` — existing pattern for `nowIso` usage (for comparison, no change needed)
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql:126-128` — existing `opened_at` DEFAULT `now()` definition

  **Acceptance Criteria**:
  - [ ] `blitz-tick-order/index.ts` contains zero calls to `new Date().toISOString()` or `Date.now()` for order timestamps
  - [ ] `blitz-tick-order/index.ts` has the anti-tamper comment block at the top
  - [ ] `order_timestamp()` SQL function exists and returns current timestamp
  - [ ] All existing `opened_at`, `closed_at`, `created_at` fields use PostgreSQL `now()` (server-side) exclusively

  **QA Scenarios**:
  ```
  Scenario: Verify no client timestamps exist in order flow
    Tool: Bash (grep)
    Preconditions: blitz-tick-order/index.ts file readable
    Steps:
      1. grep -n 'Date.now\|new Date()\|toISOString' supabase/functions/blitz-tick-order/index.ts
      2. Verify zero matches for order-timestamp contexts
    Expected Result: Zero matches for Date.now() or toISOString() outside auth token expiry checks
    Evidence: .omo/evidence/task-1-no-client-timestamps.txt

  Scenario: Verify order_timestamp() function exists and returns timestamptz
    Tool: Bash (psql)
    Preconditions: Local Supabase running, migration applied
    Steps:
      1. psql -c "SELECT public.order_timestamp()"
      2. psql -c "SELECT pg_typeof(public.order_timestamp())"
    Expected Result: Returns current timestamp, type is 'timestamp with time zone'
    Evidence: .omo/evidence/task-1-order-timestamp-fn.txt
  ```

  **Commit**: YES
  - Message: `feat(sec): server-authoritative order timestamps with order_timestamp()`
  - Files: `supabase/migrations/20260610000001_security_hardening.sql`, `supabase/functions/blitz-tick-order/index.ts`

- [x] 2. **SEC-002: Slippage validation layer**

  **What to do**:
  - Create `slippage_config` table:
    ```sql
    CREATE TABLE IF NOT EXISTS public.slippage_config (
      symbol text PRIMARY KEY,
      max_slippage_pct numeric NOT NULL DEFAULT 5.0 CHECK (max_slippage_pct > 0 AND max_slippage_pct <= 100),
      mode text NOT NULL DEFAULT 'fixed' CHECK (mode IN ('fixed', 'dynamic')),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE public.slippage_config ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "slippage_config_read_all" ON public.slippage_config FOR SELECT TO authenticated USING (true);
    GRANT ALL ON public.slippage_config TO service_role;

    -- Seed defaults for common symbols
    INSERT INTO public.slippage_config (symbol, max_slippage_pct, mode) VALUES
      ('BTCUSD', 2.0, 'fixed'),
      ('ETHUSD', 3.0, 'fixed'),
      ('SOLUSD', 5.0, 'fixed')
    ON CONFLICT (symbol) DO NOTHING;
    ```
  - Create `validate_slippage()` function:
    ```sql
    CREATE OR REPLACE FUNCTION public.validate_slippage(
      _symbol text,
      _entry_price numeric,
      _reference_price numeric
    )
    RETURNS boolean
    LANGUAGE plpgsql
    STABLE
    SET search_path = public
    AS $$
    DECLARE
      _max_slip numeric;
      _actual_slip numeric;
    BEGIN
      SELECT max_slippage_pct INTO _max_slip FROM public.slippage_config WHERE symbol = _symbol;
      IF _max_slip IS NULL THEN
        _max_slip := 5.0; -- default 5% for unconfigured symbols
      END IF;
      IF _reference_price <= 0 OR _entry_price <= 0 THEN
        RETURN false;
      END IF;
      _actual_slip := abs((_entry_price - _reference_price) / _reference_price * 100);
      RETURN _actual_slip <= _max_slip;
    END;
    $$;
    GRANT EXECUTE ON FUNCTION public.validate_slippage(text, numeric, numeric) TO service_role;
    ```
  - In `blitz-tick-order/index.ts`, in the `action === "open"` handler, AFTER fetching the current price and BEFORE inserting the order, call:
    ```typescript
    const { data: validSlippage } = await admin.rpc('validate_slippage', {
      _symbol: room.symbol,
      _entry_price: price,
      _reference_price: Number(room.start_price),
    });
    if (!validSlippage) {
      return new Response(JSON.stringify({ error: "Slippage too high. Order rejected." }), { status: 409, headers });
    }
    ```
  - The reference price is `room.start_price` — the price at which the room started. This prevents front-running: the order is valid only if the current price hasn't deviated beyond the slippage threshold from the start price.

  **Must NOT do**:
  - Do not allow clients to specify slippage tolerance. Slippage is server-configured only.
  - Do not use `ON CONFLICT DO UPDATE` for seed data (idempotent via `ON CONFLICT DO NOTHING`).
  - Do not expose `validate_slippage` to `anon` or `authenticated` roles.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Requires coordinated SQL + Edge Function changes with security implications.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with SEC-001, SEC-003, SET-001, ANA-001)
  - **Blocks**: SEC-004
  - **Blocked By**: None

  **References**:
  - `supabase/functions/blitz-tick-order/index.ts:56-71` — existing order-open handler (insertion point for slippage check)
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql:44-46` — blitz_rooms has `start_price` column

  **Acceptance Criteria**:
  - [ ] `slippage_config` table created with seed symbols
  - [ ] `validate_slippage()` function exists and returns boolean
  - [ ] `validate_slippage('BTCUSD', 50000, 50500)` returns `true` (< 2% slip)
  - [ ] `validate_slippage('BTCUSD', 50000, 55000)` returns `false` (> 2% slip)
  - [ ] `blitz-tick-order/index.ts` rejects orders when slippage exceeds threshold with 409 status
  - [ ] RLS allows authenticated SELECT on `slippage_config`

  **QA Scenarios**:
  ```
  Scenario: Slippage validation accepts valid order
    Tool: Bash (psql)
    Preconditions: Migration applied, slippage_config seeded
    Steps:
      1. psql -c "SELECT public.validate_slippage('BTCUSD', 50500, 50000)"
    Expected Result: true (1% slip < 2% max)
    Evidence: .omo/evidence/task-2-slippage-accept.txt

  Scenario: Slippage validation rejects excessive slippage
    Tool: Bash (psql)
    Preconditions: Same
    Steps:
      1. psql -c "SELECT public.validate_slippage('BTCUSD', 55000, 50000)"
    Expected Result: false (10% slip > 2% max)
    Evidence: .omo/evidence/task-2-slippage-reject.txt

  Scenario: Edge Function rejects order with 409 on high slippage
    Tool: Bash (curl)
    Preconditions: Edge Function served locally, valid auth token, room with start_price=50000, current price=55000
    Steps:
      1. curl -X POST -H "Authorization: Bearer $TOKEN" -d '{"room_id":"...","action":"open","side":"long","amount":10}' $FUNCTION_URL
      2. Assert response status 409
      3. Assert response body contains "Slippage too high"
    Expected Result: 409 with slippage error message
    Evidence: .omo/evidence/task-2-slippage-edge-reject.json
  ```

  **Commit**: YES (groups with SEC-001)
  - Message: `feat(sec): slippage validation layer with configurable thresholds`
  - Files: Same migration file as SEC-001, `supabase/functions/blitz-tick-order/index.ts`

- [x] 3. **SEC-003: Anti-cheat guard trigger**

  **What to do**:
  - Create the anti-cheat guard trigger that rejects any direct UPDATE to `blitz_orders` or `blitz_participants` that is not from `service_role`. This is a defense-in-depth measure supplementing existing RLS policies.
  - Add to migration `20260610000001_security_hardening.sql`:
    ```sql
    -- Anti-cheat: blitz_orders direct UPDATE/DELETE from non-service-role callers is forbidden
    CREATE OR REPLACE FUNCTION public.guard_blitz_orders_cheat()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      caller_role text := current_setting('request.jwt.claim.role', true);
    BEGIN
      IF TG_OP IN ('DELETE', 'UPDATE') AND caller_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'blitz_orders: % not allowed for non-service-role callers', TG_OP;
      END IF;
      IF TG_OP = 'UPDATE' THEN
        -- Prevent tampering with financial fields
        IF NEW.entry_price IS DISTINCT FROM OLD.entry_price
          OR NEW.pnl IS DISTINCT FROM OLD.pnl
          OR NEW.exit_price IS DISTINCT FROM OLD.exit_price
          OR NEW.side IS DISTINCT FROM OLD.side
          OR NEW.amount IS DISTINCT FROM OLD.amount
          OR NEW.user_id IS DISTINCT FROM OLD.user_id
        THEN
          RAISE EXCEPTION 'blitz_orders: financial fields immutable for non-service-role callers';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS guard_blitz_orders_cheat_trg ON public.blitz_orders;
    CREATE TRIGGER guard_blitz_orders_cheat_trg
      BEFORE UPDATE OR DELETE ON public.blitz_orders
      FOR EACH ROW EXECUTE FUNCTION public.guard_blitz_orders_cheat();
    ```
  - Add similar guard for `blitz_participants`:
    ```sql
    CREATE OR REPLACE FUNCTION public.guard_blitz_participants_cheat()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      caller_role text := current_setting('request.jwt.claim.role', true);
    BEGIN
      IF TG_OP IN ('DELETE', 'UPDATE') AND caller_role IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'blitz_participants: % not allowed for non-service-role callers', TG_OP;
      END IF;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS guard_blitz_participants_cheat_trg ON public.blitz_participants;
    CREATE TRIGGER guard_blitz_participants_cheat_trg
      BEFORE UPDATE OR DELETE ON public.blitz_participants
      FOR EACH ROW EXECUTE FUNCTION public.guard_blitz_participants_cheat();
    ```

  **Must NOT do**:
  - Do not remove existing RLS policies — this is defense-in-depth alongside RLS, not a replacement.
  - Do not add a trigger for INSERT on these tables (INSERT from authenticated is legitimate via Edge Functions).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security trigger requiring consistency with existing guard_trigger patterns.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (independent of all others)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `supabase/migrations/20260505070823_8924cb41-3e3e-4850-a722-9f24fa9bd0ad.sql:3-28` — existing `guard_profiles_financial_update()` pattern (SECURITY DEFINER, caller_role check, TG_OP check)
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql:116-151` — existing blitz_orders table definition without guard trigger

  **Acceptance Criteria**:
  - [ ] `guard_blitz_orders_cheat_trg` exists and fires on UPDATE/DELETE
  - [ ] Non-service-role UPDATE to `blitz_orders.pnl` raises exception
  - [ ] Non-service-role DELETE on `blitz_orders` raises exception
  - [ ] `guard_blitz_participants_cheat_trg` exists and fires on UPDATE/DELETE
  - [ ] Service-role operations bypass both triggers

  **QA Scenarios**:
  ```
  Scenario: Non-service UPDATE to blitz_orders.pnl is rejected
    Tool: Bash (psql)
    Preconditions: Migration applied, user exists (not service_role)
    Steps:
      1. psql -c "SET request.jwt.claim.role = 'authenticated'; UPDATE public.blitz_orders SET pnl = 9999 WHERE id = (SELECT id FROM public.blitz_orders LIMIT 1);"
    Expected Result: ERROR: blitz_orders: financial fields immutable for non-service-role callers
    Evidence: .omo/evidence/task-3-reject-direct-update.txt

  Scenario: Service-role UPDATE to blitz_orders succeeds
    Tool: Bash (psql)
    Preconditions: Same
    Steps:
      1. psql -c "UPDATE public.blitz_orders SET pnl = 9999 WHERE id = (SELECT id FROM public.blitz_orders LIMIT 1);"
    Expected Result: UPDATE 1 (psql runs as superuser = service_role equivalent)
    Evidence: .omo/evidence/task-3-allow-service-update.txt
  ```

  **Commit**: YES (groups with SEC-001, SEC-002)
  - Message: `feat(sec): anti-cheat guard triggers for blitz_orders and blitz_participants`
  - Files: Same migration file

---

- [x] 4. **SET-001: Settlement_ledger table + idempotency system**

  **What to do**:
  - Create `settlement_ledger` table (immutable, append-only):
    ```sql
    CREATE TABLE IF NOT EXISTS public.settlement_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id uuid NOT NULL REFERENCES public.blitz_rooms(id) ON DELETE SET NULL,
      idempotency_key text NOT NULL UNIQUE,
      settlement_type text NOT NULL CHECK (settlement_type IN ('edge_function', 'db_trigger', 'cron')),
      winner_id uuid,
      prize_amount numeric NOT NULL CHECK (prize_amount >= 0),
      fee_collected numeric NOT NULL CHECK (fee_collected >= 0),
      pot_total numeric NOT NULL CHECK (pot_total >= 0),
      participant_count int NOT NULL CHECK (participant_count > 0),
      status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'rolled_back')),
      error_message text,
      metadata jsonb DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- Allow service_role only
    ALTER TABLE public.settlement_ledger ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "settlement_ledger_service_only" ON public.settlement_ledger
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "settlement_ledger_read_admin" ON public.settlement_ledger
      FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_settlement_ledger_room ON public.settlement_ledger(room_id);
    CREATE INDEX IF NOT EXISTS idx_settlement_ledger_created ON public.settlement_ledger(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_settlement_ledger_idempotency ON public.settlement_ledger(idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_settlement_ledger_status ON public.settlement_ledger(status, created_at DESC);
    ```
  - Create idempotency helper function:
    ```sql
    -- Returns true if this idempotency_key has already been processed
    CREATE OR REPLACE FUNCTION public.settlement_already_processed(
      _idempotency_key text
    )
    RETURNS boolean
    LANGUAGE sql
    STABLE
    SET search_path = public
    AS $$
      SELECT EXISTS (SELECT 1 FROM public.settlement_ledger WHERE idempotency_key = _idempotency_key AND status = 'completed');
    $$;

    -- Generate deterministic idempotency key for a room + settlement type
    CREATE OR REPLACE FUNCTION public.make_settlement_idempotency_key(
      _room_id uuid,
      _settlement_type text
    )
    RETURNS text
    LANGUAGE sql
    IMMUTABLE
    SET search_path = public
    AS $$
      SELECT _room_id::text || ':' || _settlement_type;
    $$;
    ```
  - Create `public.settlement_ledger` GRANTs:
    ```sql
    REVOKE ALL ON public.settlement_ledger FROM anon, authenticated;
    GRANT SELECT ON public.settlement_ledger TO authenticated;
    GRANT INSERT ON public.settlement_ledger TO service_role;
    ```
  - The migration file is `20260610000002_settlement_integrity.sql`

  **Must NOT do**:
  - No UPDATE or DELETE policies on `settlement_ledger` — it is append-only.
  - No ON CONFLICT DO UPDATE on idempotency_key — only DO NOTHING for inserts.
  - Do not allow client-side (anon/authenticated) INSERT into settlement_ledger.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Foundation table design with strict immutability requirements.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with SEC-001, SEC-002, SEC-003, ANA-001)
  - **Blocks**: SET-002, SET-003, SET-004
  - **Blocked By**: None

  **References**:
  - `supabase/migrations/20260609065635_331de86c-cdad-4b77-ae7f-0f520999227c.sql:3-11` — existing `platform_revenue` pattern (immutable financial log)
  - `supabase/migrations/20260609234136_ana_sahne.sql:90-119` — existing `blitz_payout_trigger` for the payout logic to log

  **Acceptance Criteria**:
  - [ ] `settlement_ledger` table exists with all columns, CHECK constraints, and indexes
  - [ ] `settlement_already_processed(text)` returns boolean — false for unknown key, true for completed
  - [ ] `make_settlement_idempotency_key(uuid, text)` returns deterministic format `{room_id}:{type}`
  - [ ] No UPDATE/DELETE policies exist
  - [ ] anon/authenticated cannot INSERT
  - [ ] service_role can INSERT

  **QA Scenarios**:
  ```
  Scenario: Idempotency key is deterministic
    Tool: Bash (psql)
    Preconditions: Migration applied
    Steps:
      1. psql -c "SELECT public.make_settlement_idempotency_key('00000000-0000-0000-0000-000000000001'::uuid, 'edge_function')"
    Expected Result: '00000000-0000-0000-0000-000000000001:edge_function'
    Evidence: .omo/evidence/task-4-idempotency-key.txt

  Scenario: Append-only enforced — UPDATE fails
    Tool: Bash (psql)
    Preconditions: Migration applied, one row in settlement_ledger
    Steps:
      1. psql -c "UPDATE public.settlement_ledger SET status = 'failed' WHERE id = (SELECT id FROM public.settlement_ledger LIMIT 1);"
    Expected Result: ERROR: permission denied or ERROR: relation "settlement_ledger" has no UPDATE policy (depending on role)
    Evidence: .omo/evidence/task-4-append-only.txt
  ```
  **Commit**: YES
  - Message: `feat(settle): settlement_ledger table with idempotency system`
  - Files: `supabase/migrations/20260610000002_settlement_integrity.sql`

- [x] 5. **ANA-001: Analytics_events schema + staging table**

  **What to do**:
  - Create migration `20260610000003_analytics_foundation.sql`:
    ```sql
    -- ============================================================
    -- Analytics events — event-sourcing for dashboards
    -- ============================================================
    CREATE TABLE IF NOT EXISTS public.analytics_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type text NOT NULL,
      room_id uuid REFERENCES public.blitz_rooms(id) ON DELETE SET NULL,
      user_id uuid,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      server_timestamp timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    -- Staging table — Edge Functions write here synchronously
    CREATE TABLE IF NOT EXISTS public.analytics_events_staging (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type text NOT NULL,
      room_id uuid,
      user_id uuid,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      server_timestamp timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      flushed boolean NOT NULL DEFAULT false
    );

    -- Both tables are service_role-only (analytics events are system-generated)
    ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.analytics_events_staging ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "analytics_events_service_all" ON public.analytics_events
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "analytics_events_admin_select" ON public.analytics_events
      FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

    CREATE POLICY "analytics_staging_service_all" ON public.analytics_events_staging
      FOR ALL TO service_role USING (true) WITH CHECK (true);

    -- Authed users can read their own analytics (limited fields)
    CREATE POLICY "analytics_events_self_select" ON public.analytics_events
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());

    -- Indexes for dashboard queries
    CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON public.analytics_events(event_type, server_timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_room ON public.analytics_events(room_id, server_timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events(user_id, server_timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON public.analytics_events(created_at DESC);

    -- Staging indexes (for flush worker)
    CREATE INDEX IF NOT EXISTS idx_analytics_staging_unflushed ON public.analytics_events_staging(created_at) WHERE flushed = false;

    -- Retention: delete events older than 90 days
    CREATE OR REPLACE FUNCTION public.cleanup_analytics_events()
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      DELETE FROM public.analytics_events WHERE created_at < now() - interval '90 days';
      DELETE FROM public.analytics_events_staging WHERE created_at < now() - interval '90 days' AND flushed = true;
    END;
    $$;

    -- Cron: daily cleanup at 03:00
    DO $$
    BEGIN
      PERFORM cron.unschedule('analytics-cleanup-daily')
        WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'analytics-cleanup-daily');
    EXCEPTION WHEN OTHERS THEN NULL;
    END $$;

    SELECT cron.schedule(
      'analytics-cleanup-daily',
      '0 3 * * *',
      $$SELECT public.cleanup_analytics_events()$$
    );
    ```

  **Must NOT do**:
  - Do not allow client-side INSERT into either table — all events are system-generated
  - Do not create views for this yet (future dashboards will do that)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Schema design for event sourcing with retention strategy.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with SEC-001..003, SET-001)
  - **Blocks**: ANA-002, ANA-004
  - **Blocked By**: None

  **References**:
  - `supabase/migrations/20260609065635_331de86c-cdad-4b77-ae7f-0f520999227c.sql:3-11` — existing platform_revenue table pattern
  - `supabase/migrations/20260610000000_cleanup_stale_rooms.sql` — existing cron pattern for cleanup functions

  **Acceptance Criteria**:
  - [ ] `analytics_events` and `analytics_events_staging` tables exist
  - [ ] All indexes exist
  - [ ] `cleanup_analytics_events()` function exists
  - [ ] Cron job `analytics-cleanup-daily` scheduled
  - [ ] anon cannot read/write either table
  - [ ] authenticated can select own events (`user_id = auth.uid()`)

  **QA Scenarios**:
  ```
  Scenario: Service_role can insert analytics event
    Tool: Bash (psql)
    Preconditions: Migration applied
    Steps:
      1. psql -c "INSERT INTO public.analytics_events (event_type, payload) VALUES ('test_event', '{\"key\": \"value\"}'::jsonb) RETURNING id;"
    Expected Result: New UUID returned (service_role bypasses RLS)
    Evidence: .omo/evidence/task-5-analytics-insert.txt

  Scenario: Cleanup function deletes old events
    Tool: Bash (psql)
    Preconditions: Event with created_at = now() - interval '100 days' exists
    Steps:
      1. psql -c "SELECT public.cleanup_analytics_events();"
      2. psql -c "SELECT COUNT(*) FROM public.analytics_events WHERE created_at < now() - interval '90 days';"
    Expected Result: count = 0 (all old events deleted)
    Evidence: .omo/evidence/task-5-analytics-cleanup.txt
  ```

  **Commit**: YES
  - Message: `feat(analytics): analytics_events schema with staging table and 90-day retention`
  - Files: `supabase/migrations/20260610000003_analytics_foundation.sql`

---

- [x] 6. **SEC-004: blitz-tick-order v2 — server-authoritative with slippage**

  **What to do**:
  - Rewrite the `action === "open"` handler in `blitz-tick-order/index.ts` to incorporate:
    1. **Server-authoritative timestamping** (from SEC-001): Use `admin.rpc('order_timestamp')` — already the `opened_at` defaults to `now()` in the table, so the INSERT already uses server timestamp. Confirm and add inline comment.
    2. **Slippage validation** (from SEC-002): Call `admin.rpc('validate_slippage', { _symbol, _entry_price: price, _reference_price: Number(room.start_price) })` before INSERT. Reject with 409 if failed.
    3. **Anti front-running**: The check `room.status !== "active"`, room expiry, and participant membership must happen INSIDE a single transaction block to prevent TOCTOU. Use a Supabase RPC function that atomically validates and inserts:
    ```sql
    CREATE OR REPLACE FUNCTION public.tick_order_atomic(
      _room_id uuid,
      _user_id uuid,
      _side public.blitz_side,
      _amount numeric
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      _room public.blitz_rooms;
      _order public.blitz_orders;
      _current_price numeric;
    BEGIN
      -- Lock the room row to prevent race conditions
      SELECT * INTO _room FROM public.blitz_rooms WHERE id = _room_id FOR UPDATE;
      
      IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Room not found');
      END IF;
      IF _room.status != 'active' THEN
        RETURN jsonb_build_object('error', 'Room not active');
      END IF;
      IF _room.ends_at IS NOT NULL AND _room.ends_at <= now() THEN
        RETURN jsonb_build_object('error', 'Room expired');
      END IF;
      
      -- Verify participant
      IF NOT EXISTS (SELECT 1 FROM public.blitz_participants WHERE room_id = _room_id AND user_id = _user_id) THEN
        RETURN jsonb_build_object('error', 'Not a participant');
      END IF;
      
      -- Check existing open position
      IF EXISTS (SELECT 1 FROM public.blitz_orders WHERE room_id = _room_id AND user_id = _user_id AND closed_at IS NULL) THEN
        RETURN jsonb_build_object('error', 'Already have an open position. Close it first.');
      END IF;
      
      -- Get current price from Redis is not possible inside PG, so validate at Edge Function level.
      -- The function returns room data for the Edge Function to validate slippage before calling.
      RETURN jsonb_build_object(
        'room_id', _room.id,
        'symbol', _room.symbol,
        'start_price', _room.start_price,
        'status', _room.status
      );
    END;
    $$;
    ```
    4. The Edge Function's OPEN handler becomes:
    ```typescript
    // Phase 1: Atomic validation via RPC (acquires row lock)
    const { data: validation, error: vErr } = await admin.rpc('tick_order_atomic', {
      _room_id: room_id,
      _user_id: user.id,
      _side: body.side,
      _amount: body.amount,
    });
    if (vErr || validation?.error) {
      return new Response(JSON.stringify({ error: vErr?.message ?? validation?.error }), { status: 409, headers });
    }

    // Phase 2: Slippage validation (needs current price, not inside PG)
    const priceRaw = await redis.get(`blitz:price:${validation.symbol}`);
    const price = priceRaw ? Number(priceRaw) : ...; // existing fallback
    if (!price || !isFinite(price) || price <= 0) {
      return new Response(JSON.stringify({ error: 'Price unavailable' }), { status: 503, headers });
    }
    const { data: validSlippage } = await admin.rpc('validate_slippage', {
      _symbol: validation.symbol,
      _entry_price: price,
      _reference_price: Number(validation.start_price),
    });
    if (!validSlippage) {
      return new Response(JSON.stringify({ error: 'Slippage too high. Order rejected.' }), { status: 409, headers });
    }

    // Phase 3: Insert order (server-authoritative timestamp via DEFAULT now())
    const { data: order, error: oErr } = await admin.from('blitz_orders').insert({
      room_id, user_id: user.id, side: body.side, amount: body.amount, entry_price: price,
    }).select().single();
    ```
    5. For CLOSE action, add row lock protection similarly via a close-order atomic RPC.

  **Must NOT do**:
  - Do not remove the Redis price cache read — it's the lowest-latency source and falls back to `price_cache` table.
  - Do not remove the existing participant check — the RPC replaces it with a locked version.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Security-critical Edge Function rewrite with atomic RPC, requires careful TOCTOU analysis.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES (depends on SEC-001 + SEC-002, which are Wave 1)
  - **Parallel Group**: Wave 2 (with SET-002, SET-003, ANA-002)
  - **Blocks**: SOC-003, ANA-004
  - **Blocked By**: SEC-001, SEC-002

  **References**:
  - `supabase/functions/blitz-tick-order/index.ts:56-71` — existing open handler (template for rewrite)
  - `supabase/functions/blitz-tick-order/index.ts:73-88` — existing close handler (template for rewrite)
  - `supabase/functions/blitz-settle-room/index.ts:14-19` — existing `UPDATE ... WHERE status = 'active'` pattern for race prevention

  **Acceptance Criteria**:
  - [ ] `tick_order_atomic()` RPC exists and acquires `SELECT ... FOR UPDATE` on the room row
  - [ ] OPEN handler returns 409 with "Room not active" if status changed between check and insert
  - [ ] OPEN handler returns 409 with "Slippage too high" if price deviated beyond threshold
  - [ ] CLOSE handler also uses row lock (via close-order RPC)
  - [ ] All order inserts use `DEFAULT now()` for `opened_at` (server-authoritative)
  - [ ] Concurrent OPEN requests from same user for same room: first succeeds, second gets "already have open position"

  **QA Scenarios**:
  ```
  Scenario: OPEN order acquires row lock — concurrent requests serialized
    Tool: Bash (psql + background jobs)
    Preconditions: Active room exists, user is participant
    Steps:
      1. psql -c "BEGIN; SELECT * FROM public.blitz_rooms WHERE id = '$ROOM_ID' FOR UPDATE; -- (hold transaction)"
      2. In second session: curl OPEN request to Edge Function
      3. Rollback first transaction
      4. Check second request's response
    Expected Result: Second request's RPC call is blocked until first releases; then succeeds or fails based on state
    Evidence: .omo/evidence/task-6-tick-order-atomic.txt

  Scenario: Slippage check fires correctly
    Tool: Bash (curl)
    Preconditions: Room with start_price $50000, current market price $55000 (>2% BTCUSD max)
    Steps:
      1. curl -X POST -H "Authorization: Bearer $TOKEN" -d '{"room_id":"$ROOM_ID","action":"open","side":"long","amount":10}' $FUNCTION_URL
      2. Assert HTTP 409
    Expected Result: "Slippage too high. Order rejected."
    Evidence: .omo/evidence/task-6-slippage-tick.json
  ```

  **Commit**: YES
  - Message: `feat(sec): blitz-tick-order v2 with atomic RPC and slippage validation`
  - Files: `supabase/functions/blitz-tick-order/index.ts`, `supabase/migrations/20260610000002_settlement_integrity.sql`

- [x] 7. **SET-002: blitz-settle-room v2 — row-level locking + ledger write**

  **What to do**:
  - Rewrite the core `settleRoom()` function in `blitz-settle-room/index.ts`:
    1. **Row-level locking**: Replace the `UPDATE ... WHERE status = 'active'` optimistic lock with an explicit `SELECT ... FOR UPDATE` inside a transaction via a new RPC:
    ```sql
    CREATE OR REPLACE FUNCTION public.lock_and_validate_room(
      _room_id uuid,
      _idempotency_key text
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      _room public.blitz_rooms;
    BEGIN
      -- Check idempotency first (outside lock — fast path)
      IF public.settlement_already_processed(_idempotency_key) THEN
        RETURN jsonb_build_object('already_settled', true);
      END IF;
      
      -- Lock row
      SELECT * INTO _room FROM public.blitz_rooms WHERE id = _room_id FOR UPDATE;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Room not found');
      END IF;
      
      -- Must be active to settle
      IF _room.status != 'active' THEN
        RETURN jsonb_build_object('already_settled', true, 'status', _room.status);
      END IF;
      
      -- Transition to settling atomically
      UPDATE public.blitz_rooms SET status = 'settling', updated_at = now()
      WHERE id = _room_id AND status = 'active';
      
      RETURN jsonb_build_object(
        'locked', true,
        'symbol', _room.symbol,
        'start_price', _room.start_price,
        'entry_fee', _room.entry_fee,
        'starts_at', _room.starts_at,
        'ends_at', _room.ends_at
      );
    END;
    $$;
    ```
    2. **Ledger write**: After computing PnL, ranking, winner, and balances, write to settlement_ledger:
    ```typescript
    const idempotencyKey = `${roomId}:edge_function`;
    
    // Before starting settlement, check idempotency
    const { data: alreadyDone } = await admin.rpc('settlement_already_processed', {
      _idempotency_key: idempotencyKey,
    });
    if (alreadyDone) {
      return { ok: true, reason: 'already_settled' };
    }

    // ... settle logic (status → settling, liquidate, compute PnL, rank, pay) ...

    // After successful settlement, write to ledger
    await admin.from('settlement_ledger').insert({
      room_id: roomId,
      idempotency_key: idempotencyKey,
      settlement_type: 'edge_function',
      winner_id: winnerId,
      prize_amount: prize,
      fee_collected: fee,
      pot_total: pot,
      participant_count: ranking.length,
      status: 'completed',
      metadata: { symbol: room.symbol, participant_count: ranking.length },
    });
    ```
    3. **Error handling**: Wrap entire settle logic in try-catch. On error, write ledger with `status: 'failed'` and `error_message`.

  **Must NOT do**:
  - Do not remove the existing `UPDATE ... WHERE status = 'active'` guard — the RPC adds an additional lock layer.
  - Do not write to ledger before settlement is fully complete.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex financial logic rewrite with ledger integration. Goal-oriented: "Rewrite settleRoom() to use row-level locking + write to settlement_ledger with idempotency check."
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with SEC-004, SET-003, ANA-002)
  - **Blocks**: SET-004
  - **Blocked By**: SET-001

  **References**:
  - `supabase/functions/blitz-settle-room/index.ts:13-116` — the entire settleRoom() function
  - `supabase/functions/blitz-settle-room/index.ts:14-19` — existing `UPDATE ... WHERE status = 'active'` pattern
  - `supabase/migrations/20260609234136_ana_sahne.sql:90-119` — existing `blitz_payout_trigger` for fee/winner logic

  **Acceptance Criteria**:
  - [ ] `lock_and_validate_room()` RPC exists and acquires row lock
  - [ ] Settlement writes one `settlement_ledger` row per settlement with `status: 'completed'`
  - [ ] Retry with same idempotency key returns `{ ok: true, reason: 'already_settled' }`
  - [ ] On error, ledger row with `status: 'failed'` is written
  - [ ] No duplicate payouts occur across retries

  **QA Scenarios**:
  ```
  Scenario: First settlement completes and writes to ledger
    Tool: Bash (curl + psql)
    Preconditions: Active room with ended ends_at, two participants with orders
    Steps:
      1. curl POST to blitz-settle-room with room_id
      2. Assert { ok: true }
      3. psql -c "SELECT status, prize_amount FROM public.settlement_ledger WHERE idempotency_key = '$ROOM_ID:edge_function'"
    Expected Result: status = 'completed', prize_amount > 0
    Evidence: .omo/evidence/task-7-settle-first.txt

  Scenario: Retry is idempotent
    Tool: Bash (curl)
    Preconditions: Same room, already settled
    Steps:
      1. curl POST to blitz-settle-room with same room_id
      2. Assert response contains "already_settled"
      3. psql -c "SELECT COUNT(*) FROM public.settlement_ledger WHERE idempotency_key = '$ROOM_ID:edge_function'"
    Expected Result: count = 1 (no duplicate ledger entry)
    Evidence: .omo/evidence/task-7-settle-retry.txt
  ```

  **Commit**: YES (groups with SET-003)
  - Message: `feat(settle): blitz-settle-room v2 with row-level locking and ledger write`
  - Files: `supabase/functions/blitz-settle-room/index.ts`, `supabase/migrations/20260610000002_settlement_integrity.sql`

---

- [x] 8. **SET-003: Dual-payout protection via advisory lock**

  **What to do**:
  - Add a PostgreSQL advisory lock to prevent the Edge Function (`blitz-settle-room`) and the DB trigger (`blitz_payout_trigger`) from executing payouts simultaneously for the same room.
  - Modify the DB trigger `blitz_payout_trigger` to check the advisory lock first:
    ```sql
    CREATE OR REPLACE FUNCTION public.blitz_payout_trigger()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    DECLARE
      _idempotency_key text;
      _lock_obtained boolean;
    BEGIN
      -- Only act when status changes TO 'finished'
      IF NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished' THEN
        
        -- Advisory lock on room_id::bigint (hash the UUID to bigint)
        _lock_obtained := pg_try_advisory_xact_lock(('x' || substr(NEW.id::text, 1, 8))::bit(32)::bigint::int);
        
        IF NOT _lock_obtained THEN
          -- Another session (likely edge function) is handling this room
          RETURN NEW;
        END IF;
        
        -- Check idempotency: has the edge function already handled this?
        _idempotency_key := NEW.id::text || ':db_trigger';
        IF public.settlement_already_processed(_idempotency_key) THEN
          RETURN NEW;
        END IF;
        
        -- Record platform revenue
        INSERT INTO public.platform_revenue (source, room_id, amount, currency, metadata)
        VALUES ('blitz', NEW.id, NEW.fee_collected, 'USD',
          json_build_object('type', 'blitz_fee', 'room_id', NEW.id, 'settlement_type', 'db_trigger'));
        
        -- Pay winner if exists
        IF NEW.winner_id IS NOT NULL THEN
          UPDATE public.profiles
          SET real_balance = real_balance + (NEW.pot - NEW.fee_collected)
          WHERE id = NEW.winner_id;
        END IF;
        
        -- Write to settlement_ledger (idempotent via unique constraint)
        INSERT INTO public.settlement_ledger
          (room_id, idempotency_key, settlement_type, winner_id,
           prize_amount, fee_collected, pot_total, participant_count,
           status, metadata)
        VALUES (
          NEW.id, _idempotency_key, 'db_trigger',
          NEW.winner_id,
          NEW.pot - NEW.fee_collected, NEW.fee_collected, NEW.pot,
          (SELECT COUNT(*) FROM public.blitz_participants WHERE room_id = NEW.id),
          'completed',
          json_build_object('source', 'blitz_payout_trigger')
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
        
      END IF;
      RETURN NEW;
    END;
    $$;
    ```
  - Note: The hash `('x' || substr(NEW.id::text, 1, 8))::bit(32)::bigint::int` extracts the first 8 hex characters of the UUID and converts to an integer for `pg_try_advisory_xact_lock`. This is a best-effort lock — collisions are possible (1 in 2^32) but acceptable for a safety-net trigger. The idempotency check via `settlement_already_processed()` is the primary guard.
  - Update the Edge Function (`blitz-settle-room`) to also acquire the advisory lock before processing:
    ```typescript
    // Acquire advisory lock (same hash as DB trigger)
    const lockKey = parseInt(roomId.replace(/-/g, '').substring(0, 8), 16);
    const { data: lockOk } = await admin.rpc('try_advisory_lock', { _key: lockKey });
    if (!lockOk) {
      return { ok: true, reason: 'locked_by_other_session' };
    }
    ```
  - Create the `try_advisory_lock` helper:
    ```sql
    CREATE OR REPLACE FUNCTION public.try_advisory_lock(_key int)
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT pg_try_advisory_xact_lock(_key);
    $$;
    GRANT EXECUTE ON FUNCTION public.try_advisory_lock(int) TO service_role;
    ```

  **Must NOT do**:
  - Do not use `pg_advisory_lock` (blocking) — use `pg_try_advisory_xact_lock` (non-blocking, returns false if held).
  - Do not remove the existing `blitz_payout_trigger` — this is the FAZ 4 safety net.
  - Do not make the advisory lock the sole protection — idempotency check remains primary.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Concurrent system design with advisory locks, modifying existing trigger safely.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with SEC-004, SET-002, ANA-002)
  - **Blocks**: SET-004
  - **Blocked By**: SET-001

  **References**:
  - `supabase/migrations/20260609234136_ana_sahne.sql:90-119` — existing `blitz_payout_trigger` function (target for modification)
  - PostgreSQL docs: `pg_try_advisory_xact_lock(key bigint) → boolean`

  **Acceptance Criteria**:
  - [ ] Modified `blitz_payout_trigger` checks advisory lock before executing payout
  - [ ] Modified `blitz_payout_trigger` checks `settlement_already_processed()` before executing
  - [ ] Edge Function also acquires advisory lock before settlement
  - [ ] When both fire concurrently, exactly one writes to settlement_ledger
  - [ ] `try_advisory_lock(int)` function exists and is callable by service_role

  **QA Scenarios**:
  ```
  Scenario: Dual-payout race — only one succeeds
    Tool: Bash (psql + background job)
    Preconditions: Room is active, ends_at is in the past
    Steps:
      1. Session 1: BEGIN; UPDATE blitz_rooms SET status = 'finished' WHERE id = '$ROOM_ID'; (fires trigger)
      2. Session 2 simultaneously: curl POST to blitz-settle-room with same room_id
      3. COMMIT Session 1
      4. psql -c "SELECT COUNT(*) FROM public.settlement_ledger WHERE room_id = '$ROOM_ID'"
    Expected Result: count = 1 (exactly one settlement record)
    Evidence: .omo/evidence/task-8-dual-payout-race.txt

  Scenario: Advisory lock prevents concurrent edge function calls
    Tool: Bash (background sessions)
    Preconditions: Room ready for settlement
    Steps:
      1. Session 1: call curl with room_id (holds advisory lock during processing)
      2. Session 2: call curl with same room_id simultaneously
      3. Check both responses
    Expected Result: One returns { ok: true }, the other returns { ok: true, reason: 'locked_by_other_session' }
    Evidence: .omo/evidence/task-8-advisory-lock-contention.txt
  ```

  **Commit**: YES (groups with SET-002)
  - Message: `feat(settle): dual-payout protection via pg_try_advisory_xact_lock`
  - Files: `supabase/functions/blitz-settle-room/index.ts`, `supabase/migrations/20260610000002_settlement_integrity.sql`

- [x] 9. **ANA-002: blitz-analytics-writer Edge Function**

  **What to do**:
  - Create `/supabase/functions/blitz-analytics-writer/index.ts` — a cron-triggered Edge Function that:
    1. Selects unflushed rows from `analytics_events_staging` (up to 500 at a time)
    2. Bulk-inserts them into `analytics_events`
    3. Marks them as `flushed = true` in staging
    4. Runs on a schedule (every 60 seconds via pg_cron)

  ```typescript
  // supabase/functions/blitz-analytics-writer/index.ts
  import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  };

  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // Auth check (cron secret or service_role)
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const cronToken = req.headers.get("x-cron-secret") ?? "";
    const authHdr = req.headers.get("Authorization") ?? "";
    const isServiceRole = authHdr === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
    let isCron = false;
    if (!isServiceRole && cronToken) {
      const { data: ok } = await admin.rpc("verify_cron_secret", { _token: cronToken });
      isCron = ok === true;
    }
    if (!isServiceRole && !isCron) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    try {
      // Fetch unflushed rows
      const { data: rows, error: fetchErr } = await admin
        .from("analytics_events_staging")
        .select("*")
        .eq("flushed", false)
        .order("created_at", { ascending: true })
        .limit(500);

      if (fetchErr) throw fetchErr;
      if (!rows || rows.length === 0) {
        return new Response(JSON.stringify({ flushed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Transform for main table (exclude staging-only columns)
      const inserts = rows.map((r: any) => ({
        event_type: r.event_type,
        room_id: r.room_id,
        user_id: r.user_id,
        payload: r.payload,
        server_timestamp: r.server_timestamp,
        created_at: r.created_at,
      }));

      // Bulk insert
      const { error: insertErr } = await admin.from("analytics_events").insert(inserts);
      if (insertErr) throw insertErr;

      // Mark as flushed
      const ids = rows.map((r: any) => r.id);
      const { error: updateErr } = await admin
        .from("analytics_events_staging")
        .update({ flushed: true })
        .in("id", ids);
      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ flushed: rows.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (e) {
      console.error("analytics-writer error", e);
      return new Response(JSON.stringify({ error: "Internal" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  });
  ```

  - Add cron schedule in the migration:
    ```sql
    SELECT cron.schedule(
      'analytics-writer-60s',
      '* * * * *',
      $$
      SELECT net.http_post(
        url := 'https://wufhbvshqhiiwjrvfzey.supabase.co/functions/v1/blitz-analytics-writer',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1)
        ),
        body := '{}'::jsonb
      ) AS request_id;
      $$
    );
    ```

  **Must NOT do**:
  - Do not write directly to `analytics_events` from the Edge Functions that produce events — write to staging for low-latency.
  - Do not use `ON CONFLICT DO NOTHING` — the flush is a simple batch insert without conflicts.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Well-defined Edge Function following existing patterns (blitz-settle-room auth, cron trigger).
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with SEC-004, SET-002, SET-003)
  - **Blocks**: ANA-004
  - **Blocked By**: ANA-001

  **References**:
  - `supabase/functions/blitz-settle-room/index.ts:119-165` — existing Edge Function auth pattern (x-cron-secret + service_role)
  - `supabase/migrations/20260609063751_a7fad7a7-1fe5-4328-823b-5b95ddfe7f8d.sql:7-20` — existing cron schedule pattern for 10s interval

  **Acceptance Criteria**:
  - [ ] `blitz-analytics-writer/index.ts` exists with Deno.serve handler
  - [ ] Auth check accepts x-cron-secret and service_role Bearer token
  - [ ] Fetches unflushed rows from `analytics_events_staging` (max 500)
  - [ ] Bulk-inserts into `analytics_events`
  - [ ] Marks flushed = true in staging
  - [ ] Returns `{ flushed: N }` on success
  - [ ] Cron job `analytics-writer-60s` scheduled

  **QA Scenarios**:
  ```
  Scenario: Flush one staging row to main table
    Tool: Bash (psql + curl)
    Preconditions: One unflushed row exists in analytics_events_staging
    Steps:
      1. curl -X POST -H "x-cron-secret: $CRON_SECRET" $FUNCTION_URL
      2. Assert response: { flushed: 1 }
      3. psql -c "SELECT COUNT(*) FROM public.analytics_events WHERE event_type = (SELECT event_type FROM public.analytics_events_staging WHERE flushed = true LIMIT 1)"
    Expected Result: count >= 1 (the event was flushed to main table)
    Evidence: .omo/evidence/task-9-analytics-flush.txt

  Scenario: No unflushed rows returns 0
    Tool: Bash (curl)
    Preconditions: All staging rows are flushed
    Steps:
      1. curl -X POST -H "x-cron-secret: $CRON_SECRET" $FUNCTION_URL
      2. Assert response: { flushed: 0 }
    Expected Result: flushed = 0
    Evidence: .omo/evidence/task-9-analytics-flush-empty.txt
  ```

  **Commit**: YES
  - Message: `feat(analytics): blitz-analytics-writer cron edge function`
  - Files: `supabase/functions/blitz-analytics-writer/index.ts`, `supabase/migrations/20260610000003_analytics_foundation.sql`

---

- [x] 10. **SOC-001: useSpectatorBroadcast hook**

  **What to do**:
  - Create `src/hooks/useSpectatorBroadcast.ts` — a React hook that subscribes to a Supabase Realtime Broadcast channel for a specific room and provides:
    - Emoji reaction sending + receiving
    - Chat message sending + receiving
    - Auto-reconnect
    - Client-side throttling (max 3 emoji/second, configurable chat rate limit)
    - No DB writes — broadcast only

  ```typescript
  // src/hooks/useSpectatorBroadcast.ts
  import { useEffect, useState, useRef, useCallback } from "react";
  import { supabase } from "@/integrations/supabase/client";
  import type { RealtimeChannel } from "@supabase/supabase-js";

  export interface EmojiReaction {
    emoji: string;
    user_id: string;
    timestamp: number;
  }

  export interface ChatMessage {
    id: string;
    user_id: string;
    username: string;
    text: string;
    timestamp: number;
  }

  interface BroadcastPayload {
    type: "emoji" | "chat";
    emoji?: string;
    text?: string;
    username: string;
    user_id: string;
    timestamp: number;
    id: string;
  }

  const DEFAULT_CHAT_RATE_LIMIT_MS = 2000; // 2 seconds between chat messages

  interface UseSpectatorBroadcastOptions {
    roomId: string | null;
    userId?: string;
    username?: string;
    chatRateLimitMs?: number;
  }

  interface UseSpectatorBroadcastReturn {
    recentEmojis: EmojiReaction[];
    chatMessages: ChatMessage[];
    sendEmoji: (emoji: string) => boolean;  // false if rate-limited
    sendChat: (text: string) => boolean;    // false if rate-limited
    isConnected: boolean;
    error: string | null;
  }

  export function useSpectatorBroadcast({
    roomId,
    userId = "anonymous",
    username = "Anonymous",
    chatRateLimitMs = DEFAULT_CHAT_RATE_LIMIT_MS,
  }: UseSpectatorBroadcastOptions): UseSpectatorBroadcastReturn {
    const [recentEmojis, setRecentEmojis] = useState<EmojiReaction[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const lastEmojiTime = useRef(0);
    const lastChatTime = useRef(0);
    const EMOJI_RATE_LIMIT_MS = 333; // ~3 per second

    // Keep recent emojis (last 5 seconds) for animation display
    useEffect(() => {
      if (recentEmojis.length === 0) return;
      const timer = setInterval(() => {
        const cutoff = Date.now() - 5000;
        setRecentEmojis((prev) => prev.filter((e) => e.timestamp > cutoff));
      }, 1000);
      return () => clearInterval(timer);
    }, [recentEmojis.length > 0]);

    useEffect(() => {
      if (!roomId) return;
      let cancelled = false;

      const channelName = `spectator:${roomId}`;
      const channel = supabase.channel(channelName, {
        config: { broadcast: { ack: false, selfEcho: true } },
      });

      channel
        .on("broadcast", { event: "spectator_event" }, (payload: { payload: BroadcastPayload }) => {
          if (cancelled) return;
          const msg = payload.payload;
          if (msg.type === "emoji" && msg.emoji) {
            setRecentEmojis((prev) => [
              ...prev,
              { emoji: msg.emoji!, user_id: msg.user_id, timestamp: msg.timestamp },
            ]);
          } else if (msg.type === "chat" && msg.text && msg.text.trim()) {
            setChatMessages((prev) => [
              ...prev,
              { id: msg.id, user_id: msg.user_id, username: msg.username, text: msg.text!, timestamp: msg.timestamp },
            ]);
          }
        })
        .subscribe((status) => {
          if (cancelled) return;
          setIsConnected(status === "SUBSCRIBED");
          if (status === "CHANNEL_ERROR") setError("Broadcast connection failed");
        });

      channelRef.current = channel;

      return () => {
        cancelled = true;
        supabase.removeChannel(channel);
      };
    }, [roomId]);

    const sendEmoji = useCallback((emoji: string): boolean => {
      const now = Date.now();
      if (now - lastEmojiTime.current < EMOJI_RATE_LIMIT_MS) return false;
      lastEmojiTime.current = now;

      const payload: BroadcastPayload = {
        type: "emoji", emoji, username, user_id: userId, timestamp: now, id: crypto.randomUUID(),
      };
      channelRef.current?.send({
        type: "broadcast",
        event: "spectator_event",
        payload,
      });
      return true;
    }, [username, userId]);

    const sendChat = useCallback((text: string): boolean => {
      const now = Date.now();
      if (now - lastChatTime.current < chatRateLimitMs) return false;
      if (!text.trim()) return false;
      lastChatTime.current = now;

      const payload: BroadcastPayload = {
        type: "chat", text: text.trim(), username, user_id: userId, timestamp: now, id: crypto.randomUUID(),
      };
      channelRef.current?.send({
        type: "broadcast",
        event: "spectator_event",
        payload,
      });
      return true;
    }, [username, userId, chatRateLimitMs]);

    return { recentEmojis, chatMessages, sendEmoji, sendChat, isConnected, error };
  }
  ```

  **Chat message limit**: Keep max 50 messages in state (oldest evicted). Add this to the message handler:
  ```typescript
  setChatMessages((prev) => {
    const next = [...prev, { ... }];
    return next.length > 50 ? next.slice(next.length - 50) : next;
  });
  ```

  **Must NOT do**:
  - Do not write chat or emoji data to any PostgreSQL table.
  - Do not persist chat state across page reloads — ephemeral only.
  - Do not send PII (real names, email) over broadcast.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Real-time hook with throttling, reconnection, and broadcast channel management.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with SOC-002, ANA-003, OBS-001)
  - **Blocks**: SOC-002, SOC-003
  - **Blocked By**: None

  **References**:
  - `src/hooks/useAnaSahne.ts:101-123` — existing Supabase channel usage (presence + postgres_changes) patterns
  - `src/integrations/supabase/client.ts` — supabase client singleton
  - Supabase docs: `supabase.channel(name, { config: { broadcast: { ack, selfEcho } } })`

  **Acceptance Criteria**:
  - [ ] Hook subscribes to `spectator:{roomId}` broadcast channel on mount
  - [ ] `sendEmoji()` broadcasts `{ type: "emoji", emoji, user_id, timestamp }` to channel
  - [ ] `sendChat()` broadcasts `{ type: "chat", text, username, user_id, timestamp }` to channel
  - [ ] Emoji rate limit: calls > 3/second return false and do not send
  - [ ] Chat rate limit: calls within `chatRateLimitMs` return false
  - [ ] `isConnected` reflects subscription status
  - [ ] Chat messages capped at 50 in state
  - [ ] Recent emojis auto-evicted after 5 seconds

  **QA Scenarios**:
  ```
  Scenario: Send emoji and receive it via broadcast
    Tool: Vitest
    Preconditions: Mocked supabase.channel().on().subscribe()
    Steps:
      1. Render hook with roomId="test-123"
      2. Call sendEmoji("🔥")
      3. Assert channel.send() was called with payload containing emoji="🔥"
    Expected Result: send() called with broadcast payload
    Evidence: .omo/evidence/task-10-broadcast-emoji.txt

  Scenario: Emoji rate limit fires
    Tool: Vitest
    Preconditions: Mocked channel
    Steps:
      1. Call sendEmoji("🔥")
      2. Call sendEmoji("🎉") immediately (within 333ms)
    Expected Result: First returns true, second returns false
    Evidence: .omo/evidence/task-10-emoji-ratelimit.txt

  Scenario: Chat messages capped at 50
    Tool: Vitest
    Preconditions: Mocked channel
    Steps:
      1. Receive 55 chat broadcast messages
      2. Assert chatMessages.length === 50
    Expected Result: 50 messages (oldest 5 evicted)
    Evidence: .omo/evidence/task-10-chat-cap.txt
  ```

  **Commit**: YES
  - Message: `feat(spectator): useSpectatorBroadcast hook with throttling`
  - Files: `src/hooks/useSpectatorBroadcast.ts`

- [x] 11. **SOC-002: SpectatorPanel component (emoji grid + chat)**

  **What to do**:
  - Create `src/components/AnaSahne/SpectatorPanel.tsx` — a React component that provides the spectator engagement UI.

  **Emoji Grid**:
  ```tsx
  // A floating row of recently-sent emojis with animation
  // Each emoji appears, floats upward slightly, fades out over 3 seconds
  // Max 6 visible at a time

  const QUICK_EMOJIS = ["🔥", "🚀", "💎", "🙌", "😱", "👏", "💪", "🎯"];

  function EmojiGrid({ recentEmojis, onSendEmoji, isConnected }: {
    recentEmojis: EmojiReaction[];
    onSendEmoji: (emoji: string) => void;
    isConnected: boolean;
  }) {
    return (
      <div className="relative">
        {/* Floating emojis */}
        <div className="absolute bottom-full left-0 right-0 h-20 pointer-events-none overflow-hidden">
          {recentEmojis.slice(-6).map((e, i) => (
            <span
              key={`${e.timestamp}-${i}`}
              className="absolute text-2xl animate-float-up opacity-80"
              style={{
                left: `${(i * 20) % 80}%`,
                animation: `float-up 2s ease-out forwards`,
              }}
            >
              {e.emoji}
            </span>
          ))}
        </div>
        {/* Quick emoji buttons */}
        <div className="flex gap-1 flex-wrap">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => onSendEmoji(emoji)}
              disabled={!isConnected}
              className="size-8 rounded-lg hover:bg-white/10 text-lg disabled:opacity-40 transition-all active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    );
  }
  ```

  **Chat Panel**:
  ```tsx
  // Scrollable chat message list + input
  // No persistence — ephemeral broadcast only

  function ChatPanel({ messages, onSendChat, isConnected }: {
    messages: ChatMessage[];
    onSendChat: (text: string) => boolean;
    isConnected: boolean;
  }) {
    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [messages]);

    function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      if (!input.trim()) return;
      const sent = onSendChat(input);
      if (sent) setInput("");
    }

    return (
      <div className="flex flex-col gap-2">
        <div ref={scrollRef} className="h-32 overflow-y-auto space-y-1 rounded-lg bg-black/20 p-2 text-xs">
          {messages.length === 0 && (
            <p className="text-muted-foreground text-center py-8">Chat messages appear here</p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className="flex gap-1.5">
              <span className="font-semibold text-primary shrink-0">{msg.username}:</span>
              <span className="text-foreground/80 break-words">{msg.text}</span>
            </div>
          ))}
        </div>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Chat..."
            maxLength={200}
            disabled={!isConnected}
            className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs outline-none focus:border-primary/50 disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!isConnected || !input.trim()}
            className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/30 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    );
  }
  ```

  **SpectatorPanel (composed)**:
  ```tsx
  export default function SpectatorPanel({ roomId, userId, username }: {
    roomId: string;
    userId?: string;
    username?: string;
  }) {
    const { recentEmojis, chatMessages, sendEmoji, sendChat, isConnected, error } = useSpectatorBroadcast({
      roomId, userId, username,
    });

    if (error) return null; // silently fail for non-critical feature

    return (
      <div className="rounded-2xl glass border border-border/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Spectator</span>
          <span className={`size-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>
        <EmojiGrid recentEmojis={recentEmojis} onSendEmoji={sendEmoji} isConnected={isConnected} />
        <ChatPanel messages={chatMessages} onSendChat={sendChat} isConnected={isConnected} />
      </div>
    );
  }
  ```

  - Add `@keyframes float-up` to `src/index.css`:
    ```css
    @keyframes float-up {
      0% { transform: translateY(0) scale(1); opacity: 0.8; }
      100% { transform: translateY(-80px) scale(0.5); opacity: 0; }
    }
    ```

  **Must NOT do**:
  - Do not persist any chat/emoji data to DB
  - Do not add authentication requirement for spectator chat (anonymous broadcast is fine)
  - Do not store chat history across room changes

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with animations, responsive layout, and accessibility.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with SOC-001, ANA-003, OBS-001)
  - **Blocks**: SOC-003
  - **Blocked By**: SOC-001

  **References**:
  - `src/components/AnaSahne/AnaSahne.tsx` — existing AnaSahne component for placement context
  - `src/components/blitz/TradeActions.tsx` — existing action-button pattern

  **Acceptance Criteria**:
  - [ ] SpectatorPanel renders emoji grid with 8 quick emoji buttons
  - [ ] Floating emoji animation plays (CSS keyframe `float-up`)
  - [ ] Chat panel renders with scrollable message list and input
  - [ ] Chat input limited to 200 characters
  - [ ] Connection indicator (green/red dot) updates based on `isConnected`
  - [ ] Loading/extreme states: empty chat shows placeholder text; disconnected UI is dimmed
  - [ ] `@keyframes float-up` exists in index.css

  **QA Scenarios**:
  ```
  Scenario: Render spectator panel with chat and emoji
    Tool: Vitest + Playwright
    Preconditions: Mocked useSpectatorBroadcast
    Steps:
      1. Render <SpectatorPanel roomId="test-123" />
      2. Assert emoji buttons visible (🔥, 🚀, 💎, etc.)
      3. Assert chat input visible with placeholder
      4. Type "Hello" and submit
    Expected Result: Chat input cleared, sendChat called with "Hello"
    Evidence: .omo/evidence/task-11-spectator-render.txt

  Scenario: Floating emoji animation
    Tool: Playwright
    Preconditions: Hook returns recentEmojis with one entry
    Steps:
      1. Assert emoji element with class animate-float-up exists
      2. Assert it has style animation: float-up 2s ease-out forwards
    Expected Result: Emoji renders with float-up animation
    Evidence: .omo/evidence/task-11-emoji-animation.png
  ```

  **Commit**: YES
  - Message: `feat(spectator): SpectatorPanel component with emoji reactions and chat`
  - Files: `src/components/AnaSahne/SpectatorPanel.tsx`, `src/index.css`

---

- [x] 12. **ANA-003: useAnalytics hook**

  **What to do**:
  - Create `src/hooks/useAnalytics.ts` — a lightweight hook that writes analytics events to the staging table via a service-role Edge Function call or direct supabase INSERT with a secure helper.

  - Approach: Since clients cannot write directly to `analytics_events_staging` (service_role only), create a **SECURITY DEFINER RPC** that allows authenticated users to insert their own events:
    ```sql
    CREATE OR REPLACE FUNCTION public.insert_analytics_event(
      _event_type text,
      _payload jsonb DEFAULT '{}'::jsonb
    )
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      INSERT INTO public.analytics_events_staging (event_type, user_id, payload, server_timestamp)
      VALUES (_event_type, auth.uid(), _payload, now());
    END;
    $$;
    GRANT EXECUTE ON FUNCTION public.insert_analytics_event(text, jsonb) TO authenticated;
    ```
  - This approach is safe because:
    - The RPC is `SECURITY DEFINER` but uses `auth.uid()` (set by Supabase Auth) — cannot forge another user
    - `_event_type` is validated by the `NOT NULL` constraint
    - No financial or sensitive data can be written — only analytics event data

  - The hook:
    ```typescript
    // src/hooks/useAnalytics.ts
    import { useCallback } from "react";
    import { supabase } from "@/integrations/supabase/client";

    export type AnalyticsEventType =
      | "blitz_created"
      | "blitz_joined"
      | "blitz_started"
      | "blitz_finished"
      | "blitz_abandoned"
      | "payout_completed"
      | "payout_failed"
      | "ana_sahne_viewed"
      | "emoji_sent"
      | "spectator_chat_sent";

    export function useAnalytics() {
      const track = useCallback(async (
        eventType: AnalyticsEventType,
        payload?: Record<string, unknown>,
      ) => {
        try {
          await supabase.rpc("insert_analytics_event", {
            _event_type: eventType,
            _payload: payload ?? {},
          });
        } catch {
          // Analytics failures must never interrupt the user experience
          console.warn("analytics: failed to track", eventType);
        }
      }, []);

      return { track };
    }
    ```

  - Add the RPC to migration `20260610000003_analytics_foundation.sql`

  **Must NOT do**:
  - Do not block the UI on analytics writes — fire-and-forget only.
  - Do not allow user-supplied `_event_type` to bypass the string constraint (PostgreSQL CHECK would be ideal, but function parameter validation is sufficient).
  - Do not expose service_role key on the client.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple hook + RPC following existing patterns.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with SOC-001, SOC-002, OBS-001)
  - **Blocks**: ANA-004
  - **Blocked By**: None

  **References**:
  - `src/hooks/useAnaSahne.ts:67-70` — existing supabase RPC call pattern: `supabase.from("ana_sahne_view").select(...)`
  - `src/hooks/useBlitzRoom.ts:55-59` — existing supabase query pattern

  **Acceptance Criteria**:
  - [ ] `insert_analytics_event(text, jsonb)` RPC exists, SECURITY DEFINER, uses `auth.uid()`
  - [ ] RPC is granted EXECUTE to authenticated role
  - [ ] `useAnalytics()` hook returns `{ track }` function
  - [ ] `track("blitz_created", { room_id: "xyz" })` inserts a row into `analytics_events_staging` with correct user_id
  - [ ] RPC does not compile if event_type is null
  - [ ] Analytics failure does not throw/unhandled-rejection in the console

  **QA Scenarios**:
  ```
  Scenario: Authenticated user tracks an event
    Tool: Bash (psql)
    Preconditions: Migration applied, a valid auth user exists
    Steps:
      1. psql -c "SET request.jwt.claim.role = 'authenticated'; SET request.jwt.claim.sub = 'user-1'; SELECT public.insert_analytics_event('blitz_created', '{\"room_id\": \"abc\"}'::jsonb);"
      2. psql -c "SELECT event_type, user_id, payload FROM public.analytics_events_staging ORDER BY created_at DESC LIMIT 1;"
    Expected Result: event_type='blitz_created', user_id='user-1', payload='{"room_id": "abc"}'
    Evidence: .omo/evidence/task-12-analytics-track.txt

  Scenario: Hook tracks without throwing
    Tool: Vitest
    Preconditions: Mocked supabase.rpc
    Steps:
      1. Call track("ana_sahne_viewed")
      2. Assert supabase.rpc called with "insert_analytics_event" and args
    Expected Result: RPC called, no error thrown
    Evidence: .omo/evidence/task-12-analytics-hook.txt
  ```

  **Commit**: YES
  - Message: `feat(analytics): useAnalytics hook with SECURITY DEFINER RPC`
  - Files: `src/hooks/useAnalytics.ts`, `supabase/migrations/20260610000003_analytics_foundation.sql`

- [x] 13. **OBS-001: Observability metrics, logs, alerts, and audit**

  **What to do**:
  - Create `src/lib/observability.ts` — a client-side observability module that logs to console (structured JSON) and can be extended to forward to a Supabase log table in the future.
  - Create the `observability_log` table for server-side audit logging:
    ```sql
    CREATE TABLE IF NOT EXISTS public.observability_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      service text NOT NULL,
      event text NOT NULL,
      level text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error', 'critical')),
      room_id uuid,
      user_id uuid,
      metadata jsonb DEFAULT '{}'::jsonb,
      duration_ms int,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    ALTER TABLE public.observability_log ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "observability_log_service_only" ON public.observability_log
      FOR ALL TO service_role USING (true) WITH CHECK (true);
    CREATE POLICY "observability_log_admin_select" ON public.observability_log
      FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

    CREATE INDEX IF NOT EXISTS idx_observability_log_service_event ON public.observability_log(service, event, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_observability_log_level ON public.observability_log(level, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_observability_log_room ON public.observability_log(room_id, created_at DESC);
    ```

  - Create logging RPC for Edge Functions:
    ```sql
    CREATE OR REPLACE FUNCTION public.log_observability(
      _service text,
      _event text,
      _level text DEFAULT 'info',
      _room_id uuid DEFAULT NULL,
      _user_id uuid DEFAULT NULL,
      _metadata jsonb DEFAULT '{}'::jsonb,
      _duration_ms int DEFAULT NULL
    )
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      INSERT INTO public.observability_log
        (service, event, level, room_id, user_id, metadata, duration_ms, created_at)
      VALUES (_service, _event, _level, _room_id, _user_id, _metadata, _duration_ms, now());
    END;
    $$;
    GRANT EXECUTE ON FUNCTION public.log_observability(text, text, text, uuid, uuid, jsonb, int) TO service_role;
    ```

  - **Alert triggers** — Sentinel queries that should be run periodically to detect anomalies:
    ```sql
    -- Alert: Settlement failures in last hour
    CREATE OR REPLACE FUNCTION public.alert_settlement_failures()
    RETURNS TABLE(alert_time timestamptz, room_count int)
    LANGUAGE sql
    STABLE
    SET search_path = public
    AS $$
      SELECT now()::timestamptz, COUNT(*)::int
      FROM public.settlement_ledger
      WHERE status = 'failed' AND created_at > now() - interval '1 hour';
    $$;

    -- Alert: Duplicate payout attempts (same room_id, different settlement_type)
    CREATE OR REPLACE FUNCTION public.alert_duplicate_payout_attempts()
    RETURNS TABLE(alert_time timestamptz, room_id uuid, attempts int)
    LANGUAGE sql
    STABLE
    SET search_path = public
    AS $$
      SELECT now()::timestamptz, room_id, COUNT(*)::int
      FROM public.settlement_ledger
      WHERE created_at > now() - interval '24 hours'
      GROUP BY room_id
      HAVING COUNT(*) > 1;
    $$;

    -- Alert: Recent realtime disconnects (from observability_log)
    CREATE OR REPLACE FUNCTION public.alert_broadcast_anomalies()
    RETURNS TABLE(alert_time timestamptz, error_count int)
    LANGUAGE sql
    STABLE
    SET search_path = public
    AS $$
      SELECT now()::timestamptz, COUNT(*)::int
      FROM public.observability_log
      WHERE event IN ('broadcast_disconnect', 'presence_failure', 'broadcast_spike')
        AND level IN ('error', 'critical')
        AND created_at > now() - interval '15 minutes';
    $$;
    ```

  - **Audit mechanism**: Add `updated_by` triggers to critical financial tables. For `blitz_rooms`:
    ```sql
    ALTER TABLE public.blitz_rooms ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

    CREATE OR REPLACE FUNCTION public.track_blitz_rooms_update()
    RETURNS trigger
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $$
    BEGIN
      NEW.updated_by = auth.uid();
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS track_blitz_rooms_update_trg ON public.blitz_rooms;
    CREATE TRIGGER track_blitz_rooms_update_trg
      BEFORE UPDATE ON public.blitz_rooms
      FOR EACH ROW
      EXECUTE FUNCTION public.track_blitz_rooms_update();
    ```

  - **Observability integration points** — Edge Functions should call `log_observability` at key points:
    - `blitz-settle-room`: log "settle_start", "settle_complete", "settle_failed" at appropriate levels
    - `blitz-tick-order`: log "order_open", "order_close" events
    - `blitz-matchmake`: log "match_found", "queue_joined"
    - `blitz-analytics-writer`: log "flush_batch" with duration_ms

  **Must NOT do**:
  - Do not log PII (real names, emails) to observability_log
  - Do not add alert queries to cron jobs yet — these are manual monitoring queries for now
  - Do not add client-side console.log in production mode (only structured JSON in dev)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Cross-cutting observability design spanning DB, Edge Functions, and client.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with SOC-001, SOC-002, ANA-003)
  - **Blocks**: OBS-002
  - **Blocked By**: None

  **References**:
  - `supabase/migrations/20260609234136_ana_sahne.sql:90-119` — existing trigger patterns to follow for `track_blitz_rooms_update`
  - `supabase/functions/blitz-settle-room/index.ts:162` — existing `console.error()` pattern

  **Acceptance Criteria**:
  - [ ] `observability_log` table exists with all columns and indexes
  - [ ] `log_observability()` RPC exists, callable by service_role only
  - [ ] `alert_settlement_failures()` returns count of failed settlements in last hour
  - [ ] `alert_duplicate_payout_attempts()` returns rooms with >1 settlement entry
  - [ ] `alert_broadcast_anomalies()` returns error counts in last 15 minutes
  - [ ] `blitz_rooms.updated_by` column exists
  - [ ] `track_blitz_rooms_update_trg` exists and sets `updated_by` on UPDATE

  **QA Scenarios**:
  ```
  Scenario: Log observability event from service_role
    Tool: Bash (psql)
    Preconditions: Migration applied
    Steps:
      1. psql -c "SELECT public.log_observability('blitz-settle-room', 'settle_complete', 'info', '00000000-0000-0000-0000-000000000001'::uuid, NULL, '{}'::jsonb, 150);"
      2. psql -c "SELECT event, duration_ms FROM public.observability_log ORDER BY created_at DESC LIMIT 1;"
    Expected Result: event='settle_complete', duration_ms=150
    Evidence: .omo/evidence/task-13-observability-log.txt

  Scenario: Alert function detects failed settlements
    Tool: Bash (psql)
    Preconditions: settlement_ledger has a failed entry within last hour
    Steps:
      1. psql -c "SELECT room_count FROM public.alert_settlement_failures();"
    Expected Result: room_count >= 1
    Evidence: .omo/evidence/task-13-alert-failures.txt

  Scenario: updated_by tracked on blitz_rooms UPDATE
    Tool: Bash (psql)
    Preconditions: blitz_rooms has rows
    Steps:
      1. psql -c "UPDATE public.blitz_rooms SET updated_at = now() WHERE id = (SELECT id FROM public.blitz_rooms LIMIT 1) RETURNING updated_by;"
    Expected Result: updated_by is NOT NULL (set by trigger)
    Evidence: .omo/evidence/task-13-updated-by.txt
  ```

  **Commit**: YES
  - Message: `feat(obs): observability_log table, alert functions, and audit triggers`
  - Files: `supabase/migrations/20260610000004_observability.sql`, `src/lib/observability.ts`

---

- [x] 14. **SET-004: Wire settlement v2 — bilaterally connect settle flow, ledger, analytics, and observability**

  **What to do**:
  - Integrate the components from SET-002 and SET-003 into a cohesive settlement flow:
    1. **blitz-settle-room v2** already calls `lock_and_validate_room()` RPC (acquires row lock + checks idempotency)
    2. After settlement, write to `settlement_ledger` with `status: 'completed'`
    3. Log observability event: `SELECT public.log_observability('blitz-settle-room', 'settle_complete', 'info', _room_id, NULL, metadata, _duration_ms)`
    4. Write analytics event to staging: `INSERT INTO analytics_events_staging (event_type, room_id, payload) VALUES ('blitz_finished', _room_id, payload)`
    5. On error: write `settlement_ledger` with `status: 'failed'` + `error_message`, log observability with `level: 'error'`
  - **blitz_payout_trigger** (DB trigger): already updated in SET-003 to check advisory lock + idempotency + write to ledger. Ensure it also logs to observability:
    ```sql
    -- Inside blitz_payout_trigger, after successful payout:
    INSERT INTO public.observability_log (service, event, level, room_id, metadata)
    VALUES ('blitz_payout_trigger', 'payout_completed', 'info', NEW.id,
      json_build_object('winner_id', NEW.winner_id, 'prize', NEW.pot - NEW.fee_collected));
    ```
  - Ensure the cron job for settlement (blitz-settler-10s) uses the same room_id → idempotency_key mapping and includes `settlement_type: 'cron'`.

  **Must NOT do**:
  - Do not change the `lock_and_validate_room()` RPC signature after other tasks depend on it.
  - Do not add redundant idempotency checks — the RPC + ledger UNIQUE constraint is sufficient.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration task requiring careful coordination between settlement, ledger, analytics, and observability.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (integration of Wave 2 components)
  - **Parallel Group**: Wave 4 (sequential after SET-002, SET-003)
  - **Blocks**: QA-002
  - **Blocked By**: SET-002, SET-003

  **References**:
  - `supabase/functions/blitz-settle-room/index.ts` — target for integration changes
  - `supabase/migrations/20260609234136_ana_sahne.sql:90-119` — existing blitz_payout_trigger (target for observability additions)

  **Acceptance Criteria**:
  - [ ] `blitz-settle-room` writes to settlement_ledger on completion
  - [ ] `blitz-settle-room` calls `log_observability()` on success and failure
  - [ ] `blitz-settle-room` writes `blitz_finished` event to analytics_events_staging
  - [ ] `blitz_payout_trigger` writes to observability_log on payout
  - [ ] Cron settlement path writes `settlement_type: 'cron'` to ledger
  - [ ] End-to-end: active room → cron fires → ledger entry created → analytics event created

  **QA Scenarios**:
  ```
  Scenario: Full settlement flow produces ledger + analytics + observability entries
    Tool: Bash (curl + psql)
    Preconditions: Active room with ended ends_at, two participants with trades
    Steps:
      1. curl POST to blitz-settle-room with room_id
      2. psql -c "SELECT COUNT(*) FROM public.settlement_ledger WHERE room_id = '$ROOM_ID'"
      3. psql -c "SELECT COUNT(*) FROM public.analytics_events_staging WHERE event_type = 'blitz_finished' AND room_id = '$ROOM_ID'"
      4. psql -c "SELECT COUNT(*) FROM public.observability_log WHERE event = 'settle_complete' AND room_id = '$ROOM_ID'"
    Expected Result: All three counts = 1
    Evidence: .omo/evidence/task-14-settle-integration.txt
  ```

  **Commit**: YES (groups with QA-002)
  - Message: `feat(settle): bilaterally wire settlement, ledger, analytics, and observability`
  - Files: `supabase/functions/blitz-settle-room/index.ts`, `supabase/migrations/20260610000002_settlement_integrity.sql`

- [x] 15. **SOC-003: Integrate SpectatorPanel into AnaSahne**

  **What to do**:
  - Import and render `SpectatorPanel` inside `AnaSahne.tsx` when a featured room is active (not loading, not error, not finished/before empty state).
  - Add SpectatorPanel below the participant cards / countdown section.
  - Pass `roomId={room.id}` and optionally `userId` and `username` from `useApp()` context.
  - Only render when `VITE_ANA_SAHNE_ENABLED === "true"` (respects feature flag).
  - Wire the `ana_sahne_viewed` analytics event:
    - In `useAnaSahne.ts`, add a `useEffect` that fires `track("ana_sahne_viewed")` when a room is loaded (i.e., `room !== null && !isLoading`).
    - Import and call `useAnalytics().track("ana_sahne_viewed")`.

  **Must NOT do**:
  - Do not hide the existing AnaSahne content — SpectatorPanel is additive below the main grid.
  - Do not break the loading/error/empty/finished state machine.
  - Do not require authentication for spectator features — anonymous broadcast is intentional.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI integration requiring careful placement within existing responsive layout.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on SOC-002, SEC-004)
  - **Parallel Group**: Wave 4 (follows SET-004, SOC-002)
  - **Blocks**: QA-003
  - **Blocked By**: SOC-002

  **References**:
  - `src/components/AnaSahne/AnaSahne.tsx:90-125` — the active state rendering block (insertion point for SpectatorPanel)
  - `src/components/AnaSahne/AnaSahne.tsx:136-154` — SectionHeader component

  **Acceptance Criteria**:
  - [ ] SpectatorPanel renders below participants/countdown when room is active
  - [ ] SpectatorPanel does not render in loading/error/empty/finished states
  - [ ] `ana_sahne_viewed` event fires once when room loads
  - [ ] Feature flag `VITE_ANA_SAHNE_ENABLED` gates SpectatorPanel render
  - [ ] No TypeScript errors in build

  **QA Scenarios**:
  ```
  Scenario: SpectatorPanel visible in active room
    Tool: Playwright
    Preconditions: AnaSahne rendering with active room, feature flag enabled
    Steps:
      1. Navigate to page with AnaSahne
      2. Assert SpectatorPanel is rendered (emoji buttons visible)
    Expected Result: Emoji grid and chat panel visible
    Evidence: .omo/evidence/task-15-spectator-visible.png

  Scenario: SpectatorPanel hidden in finished state
    Tool: Playwright
    Preconditions: AnaSahne rendering with isFinished=true
    Steps:
      1. Assert no emoji buttons visible in DOM
    Expected Result: SpectatorPanel not rendered
    Evidence: .omo/evidence/task-15-spectator-hidden.png
  ```

  **Commit**: YES
  - Message: `feat(spectator): integrate SpectatorPanel into AnaSahne + track viewed event`
  - Files: `src/components/AnaSahne/AnaSahne.tsx`, `src/hooks/useAnaSahne.ts`

- [x] 16. **ANA-004: Wire analytics events into blitz-matchmake and blitz-tick-order**

  **What to do**:
  - **blitz-matchmake**: After room creation (both quick match and private), write analytics events:
    - `blitz_created` — when a room is created (with `mode`, `entry_fee`, `symbol` in payload)
    - `blitz_joined` — when a participant joins
    - `blitz_started` — when status transitions to 'active'
  - **blitz-tick-order**: After successful order open/close, write events:
    - No specific analytics event for individual orders (too high frequency). Instead, log to observability.
  - **blitz-settle-room**: Already handled in SET-004 (`blitz_finished` event).
  - Use the pattern: `INSERT INTO public.analytics_events_staging (event_type, room_id, user_id, payload, server_timestamp) VALUES ...`
  - For blitz-matchmake, add after successful room insert and participant insert:
    ```typescript
    await admin.from("analytics_events_staging").insert([
      {
        event_type: "blitz_created",
        room_id: room.id,
        user_id: user.id,
        payload: { mode, entry_fee, symbol },
      },
      {
        event_type: "blitz_joined",
        room_id: room.id,
        user_id: opponent,
        payload: {},
      },
      {
        event_type: "blitz_joined",
        room_id: room.id,
        user_id: user.id,
        payload: {},
      },
      {
        event_type: "blitz_started",
        room_id: room.id,
        payload: { start_price, ends_at },
      },
    ]);
    ```

  **Must NOT do**:
  - Do not block the response on analytics writes — fire concurrent inserts that can fail silently.
  - Do not add analytics writes inside hot loops (order execution).

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Cross-Edge-Function integration requiring careful insert patterns.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on ANA-002, SEC-004)
  - **Parallel Group**: Wave 4 (with SET-004, SOC-003, OBS-002)
  - **Blocks**: QA-004
  - **Blocked By**: ANA-002, SEC-004

  **References**:
  - `supabase/functions/blitz-matchmake/index.ts:194-212` — room creation + participant insert block
  - `supabase/functions/blitz-tick-order/index.ts:66-71` — order insert block

  **Acceptance Criteria**:
  - [ ] blitz-matchmake inserts `blitz_created`, `blitz_joined` (x2), `blitz_started` events on match
  - [ ] Analytics insert failure does not cause matchmaking to fail
  - [ ] Event payloads contain relevant metadata (entry_fee, symbol, mode, start_price)

  **QA Scenarios**:
  ```
  Scenario: Matchmaking produces analytics events
    Tool: Bash (curl + psql)
    Preconditions: Two users in queue, price available
    Steps:
      1. Curl blitz-matchmake for both users (triggers match)
      2. psql -c "SELECT event_type, room_id FROM public.analytics_events_staging WHERE event_type LIKE 'blitz_%' ORDER BY created_at DESC LIMIT 4"
    Expected Result: 4 rows: blitz_created, blitz_joined (x2), blitz_started
    Evidence: .omo/evidence/task-16-matchmake-analytics.txt
  ```

  **Commit**: YES (groups with SET-004)
  - Message: `feat(analytics): wire analytics events into blitz-matchmake and order flows`
  - Files: `supabase/functions/blitz-matchmake/index.ts`, `supabase/functions/blitz-settle-room/index.ts`

- [x] 17. **OBS-002: Alert triggers + monitoring functions implementation**

  **What to do**:
  - Create `scripts/monitoring-queries.sql` with the alert queries from OBS-001 that can be run manually or by an external monitoring tool:
    ```sql
    -- monitoring-queries.sql — Run periodically to detect anomalies

    -- 1. Check for settlement failures in last hour
    SELECT 'settlement_failures' AS check_name,
           COUNT(*) AS alert_count,
           json_agg(json_build_object('room_id', room_id, 'error', error_message, 'time', created_at)) AS details
    FROM public.settlement_ledger
    WHERE status = 'failed' AND created_at > now() - interval '1 hour'
    GROUP BY check_name;

    -- 2. Check for duplicate payout attempts (same room, multiple settlement entries)
    SELECT 'duplicate_payouts' AS check_name,
           COUNT(*) AS alert_count,
           json_agg(DISTINCT room_id) AS room_ids
    FROM (
      SELECT room_id FROM public.settlement_ledger
      WHERE created_at > now() - interval '24 hours'
      GROUP BY room_id
      HAVING COUNT(*) > 1
    ) dupes;

    -- 3. Check for realtime disconnects / anomalies in last 15 minutes
    SELECT 'realtime_anomalies' AS check_name,
           COUNT(*) AS alert_count,
           json_agg(json_build_object('event', event, 'metadata', metadata)) AS details
    FROM public.observability_log
    WHERE event IN ('broadcast_disconnect', 'presence_failure', 'broadcast_spike')
      AND level IN ('error', 'critical')
      AND created_at > now() - interval '15 minutes'
    GROUP BY check_name;

    -- 4. Check for stale active rooms (should have been settled)
    SELECT 'stale_active_rooms' AS check_name,
           COUNT(*) AS alert_count,
           json_agg(json_build_object('id', id, 'ends_at', ends_at, 'symbol', symbol)) AS details
    FROM public.blitz_rooms
    WHERE status = 'active' AND ends_at < now() - interval '2 minutes'
    GROUP BY check_name;
    ```

  - Create `scripts/run-monitoring.sh` — a bash script that runs the monitoring queries and outputs results:
    ```bash
    #!/bin/bash
    # Run monitoring checks. Exit 1 if any alerts fire.
    set -euo pipefail

    DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@localhost:54322/postgres}"

    echo "=== Monitoring Check $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="

    psql "$DB_URL" -f "$(dirname "$0")/monitoring-queries.sql" -t -A -F ',' 2>&1

    # Simple check: if any row returned with alert_count > 0
    ALERTS=$(psql "$DB_URL" -t -A -c "
      SELECT COUNT(*) FROM (
        SELECT 1 FROM public.settlement_ledger
        WHERE status = 'failed' AND created_at > now() - interval '1 hour'
        UNION ALL
        SELECT 1 FROM (
          SELECT room_id FROM public.settlement_ledger
          WHERE created_at > now() - interval '24 hours'
          GROUP BY room_id HAVING COUNT(*) > 1
        ) dupes
        UNION ALL
        SELECT 1 FROM public.observability_log
        WHERE event IN ('broadcast_disconnect','presence_failure','broadcast_spike')
          AND level IN ('error','critical')
          AND created_at > now() - interval '15 minutes'
        UNION ALL
        SELECT 1 FROM public.blitz_rooms
        WHERE status = 'active' AND ends_at < now() - interval '2 minutes'
      ) alerts;
    ")

    if [ "$ALERTS" -gt 0 ]; then
      echo "ALERT: $ALERTS issue(s) detected"
      exit 1
    fi

    echo "OK — no alerts"
    exit 0
    ```

  - Implement the observability logging calls inside Edge Functions:
    - In `blitz-settle-room/index.ts`: After `lock_and_validate_room()` call `log_observability` with `settle_start`. After completion, log `settle_complete` with duration. On catch, log `settle_failed` with level 'error' and error message.
    - In `blitz-tick-order/index.ts`: On success, log `order_open` or `order_close` with duration_ms.
    - In `blitz-matchmake/index.ts`: Log `match_found` when a quick match succeeds.

  - Add migration `20260610000004_observability.sql` containing all observability tables, functions, and triggers from OBS-001.

  **Must NOT do**:
  - Do not set up external alerting (PagerDuty, Slack) — this is a foundation for manual monitoring.
  - Do not add the monitoring script to cron — it's designed for manual or CI-triggered runs.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Implementation of observability integration points across all Edge Functions.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on OBS-001)
  - **Parallel Group**: Wave 4 (with SET-004, SOC-003, ANA-004)
  - **Blocks**: QA-001
  - **Blocked By**: OBS-001

  **References**:
  - `supabase/functions/blitz-settle-room/index.ts:13-116` — target for observability integration
  - `supabase/functions/blitz-tick-order/index.ts` — target for observability integration
  - `supabase/functions/blitz-matchmake/index.ts` — target for observability integration

  **Acceptance Criteria**:
  - [ ] `scripts/monitoring-queries.sql` exists with all 4 check queries
  - [ ] `scripts/run-monitoring.sh` exists and exits 0 when no alerts, 1 when alerts found
  - [ ] blitz-settle-room logs `settle_start`, `settle_complete`, `settle_failed` events
  - [ ] blitz-tick-order logs `order_open` and `order_close` events
  - [ ] blitz-matchmake logs `match_found` event

  **QA Scenarios**:
  ```
  Scenario: Monitoring script detects no alerts on clean system
    Tool: Bash (run-monitoring.sh)
    Preconditions: No failed settlements, no duplicates, no anomalies, no stale rooms
    Steps:
      1. bash scripts/run-monitoring.sh
    Expected Result: Exit 0, output contains "OK — no alerts"
    Evidence: .omo/evidence/task-17-monitoring-clean.txt

  Scenario: Monitoring script detects stale active room
    Tool: Bash (psql create stale room + run-monitoring.sh)
    Preconditions: A blitz_rooms row with status='active' and ends_at < now() - 3 minutes
    Steps:
      1. bash scripts/run-monitoring.sh
    Expected Result: Exit 1, output contains "stale_active_rooms"
    Evidence: .omo/evidence/task-17-monitoring-stale.txt
  ```

  **Commit**: YES (groups with ANA-004)
  - Message: `feat(obs): monitoring queries, scripts, and Edge Function observability integration`
  - Files: `scripts/monitoring-queries.sql`, `scripts/run-monitoring.sh`, `supabase/functions/blitz-settle-room/index.ts`, `supabase/functions/blitz-tick-order/index.ts`, `supabase/functions/blitz-matchmake/index.ts`

---

- [x] 18. **QA-001: Race condition validation suite**

  **What to do**:
  - Create `scripts/qa-phase2.sh` — a comprehensive test script with the following procedures:
  - **Test A: Concurrent order entry (no race)**
    ```bash
    # Setup: create room, add 2 participants
    # Spawn 3 concurrent curl requests to blitz-tick-order OPEN from same user
    # Verify: exactly 1 order created (others get 409 "Already have an open position")
    ```
  - **Test B: Concurrent settlement (no double-payout)**
    ```bash
    # Setup: active room with ended ends_at, 2 participants with orders
    # Spawn 3 concurrent curl requests to blitz-settle-room
    # Verify: exactly 1 settlement_ledger entry, winner balance increased once
    ```
  - **Test C: DB trigger settlement (Edge Function unavailable)**
    ```bash
    # Setup: active room with ended ends_at
    # Directly UPDATE blitz_rooms SET status = 'finished' (fires trigger)
    # Verify: blitz_payout_trigger fires, settlement_ledger entry created with type 'db_trigger'
    # Verify: no duplicate when Edge Function runs after trigger
    ```
  - **Test D: Slippage rejection**
    ```bash
    # Setup: room with start_price $50000
    # Set current market price to $52000 (> 2% BTCUSD max)
    # Attempt OPEN order — should be rejected with 409
    # Reset price to $50500 (< 2%) — order should succeed
    ```
  - **Test E: Idempotent retry**
    ```bash
    # Setup: settled room
    # Call blitz-settle-room again with same room_id
    # Verify: returns { ok: true, reason: 'already_settled' }
    # Verify: no duplicate ledger entry, no double payment
    ```

  **Must NOT do**: Do not require a live Supabase project — the script should work with `supabase start` local instance.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration test suite design covering all race conditions.
  - **Skills**: none needed

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on OBS-002, SET-004)
  - **Parallel Group**: Wave 5 (with QA-002, QA-003, QA-004)
  - **Blocks**: Final Wave
  - **Blocked By**: OBS-002, SET-004

  **References**:
  - `src/test/example.test.ts` — existing test setup pattern

  **Acceptance Criteria**:
  - [ ] `scripts/qa-phase2.sh` exists and is executable
  - [ ] Test A passes: concurrent order open → exactly 1 order created
  - [ ] Test B passes: concurrent settlement → exactly 1 payout
  - [ ] Test C passes: DB trigger settlement creates ledger entry
  - [ ] Test D passes: slippage rejection and acceptance
  - [ ] Test E passes: idempotent retry does not double-pay
  - [ ] `scripts/qa-phase2.sh run-all` exits 0

  **QA Scenarios**: Self-referential — the tests are the QA scenarios. See individual test procedures above.
  **Commit**: YES (groups with QA-002, QA-003, QA-004)
  - Message: `test(qa): race condition, settlement, slippage, and idempotency validation suite`
  - Files: `scripts/qa-phase2.sh`

- [x] 19. **QA-002: Settlement collision + idempotency tests**

  **What to do**:
  - Add to `scripts/qa-phase2.sh`:
  - **Test F: Edge Function + DB trigger collision**
    ```bash
    # Setup: active room with ended ends_at, 2 participants with orders
    # Step 1: Start blitz-settle-room call in background (slow via artificial delay)
    # Step 2: Simultaneously UPDATE blitz_rooms SET status = 'finished' (fires trigger)
    # Step 3: Wait for both to complete
    # Verify: exactly 1 settlement_ledger entry
    # Verify: exactly 1 platform_revenue entry
    # Verify: winner balance increased exactly once
    ```
  - **Test G: Idempotency key enforcement**
    ```bash
    # Setup: settled room
    # Attempt INSERT into settlement_ledger with same idempotency_key
    # Verify: ON CONFLICT DO NOTHING prevents duplicate — row count unchanged
    ```
  - **Test H: Concurrent matchmaking edge cases**
    ```bash
    # Setup: 2 users with insufficient balance
    # Attempt quick match → both rejected
    # Verify: no room created, no balances locked incorrectly
    ```

  **Commit**: YES (groups with QA-001)

- [x] 20. **QA-003: Broadcast throttling + burst tests**

  **What to do**:
  - **Test I: Emoji rate limiting**
    ```typescript
    // Vitest test for useSpectatorBroadcast
    // Send 5 emojis in 1 second → assert only 3 were broadcast
    // Wait 1 second → send 1 more → assert it goes through
    ```
  - **Test J: Chat rate limiting**
    ```typescript
    // Send 2 chats in 1 second → assert second is rejected
    // Wait 2 seconds → send 1 → assert accepted
    ```
  - **Test K: Broadcast reconnect**
    ```typescript
    // Mock channel subscription → simulate CHANNEL_ERROR
    // Assert isConnected = false
    // Simulate resubscription → assert isConnected = true
    ```
  - **Test L: Chat message cap**
    ```typescript
    // Broadcast 60 chat messages → assert only 50 stored in state
    // Oldest 10 should be evicted
    ```
  - All tests go in `src/hooks/__tests__/useSpectatorBroadcast.test.ts`

  **Commit**: YES (groups with QA-001)

- [x] 21. **QA-004: Analytics correctness + observability tests**

  **What to do**:
  - **Test M: Analytics event tracking**
    ```typescript
    // Vitest test for useAnalytics
    // Mock supabase.rpc to succeed
    // Call track("blitz_created", { room_id: "xyz" })
    // Assert rpc called with correct function name and parameters
    // Assert no error thrown
    ```
  - **Test N: Analytics failure resilience**
    ```typescript
    // Vitest test for useAnalytics
    // Mock supabase.rpc to throw
    // Call track("blitz_created")
    // Assert: no unhandled rejection, no crash, function returns void
    ```
  - **Test O: Observability log RPC**
    ```bash
    # psql test
    # Call log_observability() with all parameters
    # Assert row written to observability_log with correct values
    # Call with level='critical' — assert row written correctly
    ```
  - **Test P: Alert query correctness**
    ```bash
    # psql test
    # Insert a failed settlement
    # Run alert_settlement_failures() — assert count >= 1
    # Remove the failed settlement
    # Run alert_settlement_failures() — assert count = 0
    ```
  - All go in `scripts/qa-phase2.sh` and `src/hooks/__tests__/useAnalytics.test.ts`

  **Commit**: YES (groups with QA-001)

---

## Final Verification Wave (MANDATORY)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality + Security Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + tests. Review all changed files for: `as any`/`@ts-ignore`, empty catches, `console.log` in prod, commented-out code, unused imports. **Security-specific**: check that no client-accessible function can modify balances or orders. Check that all SECURITY DEFINER functions have `SET search_path = public`. Verify no `EXECUTE` granted to `anon` on sensitive functions.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Security [PASS/FAIL] | VERDICT`

- [x] F3. **Real Manual QA — End-to-End Scenario Execution** — `unspecified-high` (+ `playwright` skill if UI)
  Start from clean `supabase start` local instance. Execute every QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: create room → join → trade → settle → verify ledger, analytics, and observability entries. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity + Anti-Creep Audit** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes. Specifically check: no Redis-as-source-of-truth patterns, no client-side timestamp usage, no new infrastructure dependencies.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

# SECTION 3: DATABASE DELIVERABLES

> All SQL is production-ready, idempotent (uses `CREATE OR REPLACE` / `IF NOT EXISTS` / `DROP ... IF EXISTS`), and follows existing codebase patterns.

## Migration 1: `20260610000001_security_hardening.sql`

| Object | Type | Purpose |
|--------|------|---------|
| `order_timestamp()` | FUNCTION | Returns `now()` — authoritative timestamp reference |
| `slippage_config` | TABLE | Per-symbol slippage threshold (fixed/dynamic mode) |
| `validate_slippage(text, numeric, numeric)` | FUNCTION | Returns boolean — checks entry vs ref price within max_slippage_pct |
| `guard_blitz_orders_cheat()` | FUNCTION (TRIGGER) | Blocks non-service-role UPDATE/DELETE on blitz_orders |
| `guard_blitz_orders_cheat_trg` | TRIGGER | `BEFORE UPDATE OR DELETE` on blitz_orders |
| `guard_blitz_participants_cheat()` | FUNCTION (TRIGGER) | Blocks non-service-role UPDATE/DELETE on blitz_participants |
| `guard_blitz_participants_cheat_trg` | TRIGGER | `BEFORE UPDATE OR DELETE` on blitz_participants |

## Migration 2: `20260610000002_settlement_integrity.sql`

| Object | Type | Purpose |
|--------|------|---------|
| `settlement_ledger` | TABLE | Append-only immutable settlement log with idempotency_key UNIQUE |
| `settlement_already_processed(text)` | FUNCTION | Returns boolean — checks if idempotency_key exists with status='completed' |
| `make_settlement_idempotency_key(uuid, text)` | FUNCTION | Deterministic key format: `{room_id}:{type}` |
| `lock_and_validate_room(uuid, text)` | FUNCTION | Acquires row lock + checks idempotency + transitions to 'settling' |
| `tick_order_atomic(uuid, uuid, blitz_side, numeric)` | FUNCTION | Atomically validates room, participant, open order status with row lock |
| `try_advisory_lock(int)` | FUNCTION | Wraps `pg_try_advisory_xact_lock` for Edge Function use |
| Modified `blitz_payout_trigger` | TRIGGER FUNCTION | Added advisory lock + idempotency check + settlement_ledger write |

## Migration 3: `20260610000003_analytics_foundation.sql`

| Object | Type | Purpose |
|--------|------|---------|
| `analytics_events` | TABLE | Main analytics event store, 90-day retention |
| `analytics_events_staging` | TABLE | Low-latency write target for Edge Functions, batch-flushed |
| `insert_analytics_event(text, jsonb)` | FUNCTION (SECURITY DEFINER) | Allows authenticated users to insert their own analytics events |
| `cleanup_analytics_events()` | FUNCTION | Deletes events older than 90 days |
| `analytics-cleanup-daily` | CRON | Runs cleanup daily at 03:00 |
| `analytics-writer-60s` | CRON | Triggers blitz-analytics-writer every 60 seconds |

## Migration 4: `20260610000004_observability.sql`

| Object | Type | Purpose |
|--------|------|---------|
| `observability_log` | TABLE | Structured log for system events, alerts, and audit |
| `log_observability(...)` | FUNCTION | Inserts log entry with service, event, level, metadata |
| `alert_settlement_failures()` | FUNCTION | Returns count of failed settlements in last hour |
| `alert_duplicate_payout_attempts()` | FUNCTION | Returns rooms with >1 settlement entry in 24h |
| `alert_broadcast_anomalies()` | FUNCTION | Returns error count in last 15 minutes |
| `track_blitz_rooms_update()` | FUNCTION (TRIGGER) | Sets `updated_by` on blitz_rooms UPDATE |
| `track_blitz_rooms_update_trg` | TRIGGER | `BEFORE UPDATE` on blitz_rooms |
| `blitz_rooms.updated_by` | COLUMN | UUID referencing auth.users |

---

# SECTION 4: FRONTEND DELIVERABLES

## New Files

| File | Type | Purpose |
|------|------|---------|
| `src/hooks/useSpectatorBroadcast.ts` | Hook | Broadcast channel subscription with rate limiting |
| `src/hooks/useAnalytics.ts` | Hook | Analytics event tracking via SECURITY DEFINER RPC |
| `src/hooks/__tests__/useSpectatorBroadcast.test.ts` | Test | Unit tests for broadcast hook (rate limiting, reconnect, cap) |
| `src/hooks/__tests__/useAnalytics.test.ts` | Test | Unit tests for analytics hook |
| `src/components/AnaSahne/SpectatorPanel.tsx` | Component | Emoji grid + chat panel for spectator engagement |
| `src/lib/observability.ts` | Service | Client-side structured logging module |

## Modified Files

| File | Changes |
|------|---------|
| `src/components/AnaSahne/AnaSahne.tsx` | Import and render SpectatorPanel; pass roomId, userId, username |
| `src/hooks/useAnaSahne.ts` | Add `useAnalytics().track("ana_sahne_viewed")` on room load |
| `src/index.css` | Add `@keyframes float-up` animation |

## Event Tracking Map

| Event | Source | Trigger |
|-------|--------|---------|
| `blitz_created` | Edge Function | blitz-matchmake after room insert |
| `blitz_joined` | Edge Function | blitz-matchmake after participant insert |
| `blitz_started` | Edge Function | blitz-matchmake on status='active' |
| `blitz_finished` | Edge Function | blitz-settle-room after settlement |
| `blitz_abandoned` | Edge Function | cleanup_stale_rooms() cron |
| `payout_completed` | Edge Function/Trigger | After successful payout |
| `payout_failed` | Edge Function | After failed settlement attempt |
| `ana_sahne_viewed` | Client hook | When ana_sahne_view returns a room |
| `emoji_sent` | Client hook | When user sends emoji |
| `spectator_chat_sent` | Client hook | When user sends chat message |

---

# SECTION 5: QA ORACLE PROTOCOL

## P1: Race Condition Validation

```
Test Setup:
  - Local Supabase instance (supabase start)
  - Two authenticated users with sufficient balance
  - Active blitz room with ended ends_at
  - Both users have open positions

Execution Procedure:
  1. Start 3 concurrent Edge Function invocations to blitz-tick-order
     from user A (OPEN action, same room)
  2. Wait for all 3 responses
  3. Query blitz_orders WHERE room_id = $ROOM AND user_id = $USER AND closed_at IS NULL

Expected Result:
  - Exactly 1 open order exists (first request succeeded)
  - Remaining 2 requests returned 409 "Already have an open position"

Failure Criteria:
  - 0 orders created (false rejection)
  - 2+ orders created (race condition — TOCTOU failure)
  - Any response other than 200 or 409 (unexpected error)
```

## P2: Settlement Collision

```
Test Setup:
  - Active room with ended ends_at, 2 participants with orders
  - Edge Function available

Execution Procedure:
  1. Session A: BEGIN; UPDATE blitz_rooms SET status='finished' WHERE id=$ROOM; (holds transaction)
  2. Session B simultaneously: curl POST to blitz-settle-room with room_id
  3. COMMIT Session A
  4. Query settlement_ledger WHERE room_id = $ROOM
  5. Query profiles WHERE id = winner_id (verify balance)

Expected Result:
  - Exactly 1 settlement_ledger entry (status='completed')
  - Exactly 1 platform_revenue entry (fee recorded)
  - Winner balance increased by exactly pot - fee_collected once

Failure Criteria:
  - 2 settlement_ledger entries (dual payout)
  - Winner balance increased twice (duplicate credit)
  - 0 settlement entries (settlement missed entirely)
  - Any observability_log entry with level='critical'
```

## P3: Idempotency

```
Test Setup:
  - Room that has already been settled (settlement_ledger has entry)

Execution Procedure:
  1. curl POST to blitz-settle-room with same room_id
  2. Query settlement_ledger WHERE idempotency_key = '$ROOM:edge_function'

Expected Result:
  - Response contains { ok: true, reason: 'already_settled' }
  - Exactly 1 settlement_ledger row (no duplicate)

Failure Criteria:
  - 2 settlement_ledger rows (idempotency broken)
  - Response without 'already_settled' reason
  - Any balance change (double payment)
```

## P4: Realtime Broadcast

```
Test Setup:
  - Two browser tabs open on same Ana Sahne room
  - Both connected to broadcast channel

Execution Procedure:
  1. Tab A clicks "🔥" emoji
  2. Tab B types "hello" and clicks Send
  3. Observe Tab A receives chat, Tab B receives emoji

Expected Result:
  - Both tabs display the emoji animation
  - Both tabs display the chat message
  - No messages persisted to database (SELECT FROM analytics_events returns 0 for broadcast data)

Failure Criteria:
  - Broadcast not received by other tab
  - Messages persisted to any PostgreSQL table
  - Connection status shows 'CHANNEL_ERROR'
```

## P5: Analytics Correctness

```
Test Setup:
  - Blitz room created and played through

Execution Procedure:
  1. Create a room (quick match)
  2. Join with 2 users
  3. Both users place trades
  4. Room ends and settles
  5. Query analytics_events_staging (before flush) and analytics_events (after flush)

Expected Result:
  - analytics_events_staging contains: blitz_created, blitz_joined (x2), blitz_started, blitz_finished
  - All events have correct user_id, room_id, and metadata
  - After flush cron: analytics_events contains same events

Failure Criteria:
  - Missing event types
  - Incorrect user_id or room_id on events
  - Events not flushed to analytics_events after cron runs
```

## P6: Observability Correctness

```
Test Setup:
  - Clean observability_log table

Execution Procedure:
  1. Settle a room
  2. Attempt a duplicate settlement
  3. Query observability_log

Expected Result:
  - Log entries exist: settle_start, settle_complete (or settle_failed)
  - Correct service name ('blitz-settle-room')
  - Duration_ms is populated and positive
  - Room_id is correctly referenced

Failure Criteria:
  - Missing log entries
  - Incorrect level (e.g., 'info' when should be 'error')
  - Missing room_id reference
  - Duration_ms = 0 or NULL
```

---

## Commit Strategy

### Commit Plan

| Commit | Task(s) | Scope | Message |
|--------|---------|-------|---------|
| C1 | 1 (SEC-001) | `supabase/functions/blitz-tick-order/index.ts`, new SQL function | `feat(security): add order_timestamp() and remove client timestamps` |
| C2 | 2 (SEC-002) | new SQL file (slippage_config table + validate_slippage) | `feat(security): add slippage_config table and validation function` |
| C3 | 3 (SEC-003) | new SQL file (guard_blitz_orders_cheat trigger) | `feat(security): add cheat-prevention triggers on blitz_orders and blitz_participants` |
| C4 | 4 (SET-001) | new SQL file (settlement_ledger + idempotency key + RLS) | `feat(settlement): add settlement_ledger table with idempotency key` |
| C5 | 5 (ANA-001) | new SQL file (analytics_events + staging + insert RPC + cleanup) | `feat(analytics): add analytics_events schema and staging table` |
| C6 | 6 (SEC-004) | `blitz-tick-order/index.ts` rewrite, new SQL (tick_order_atomic) | `feat(settlement): rewrite blitz-tick-order v2 with atomic validation` |
| C7 | 7 (SET-002) | `blitz-settle-room/index.ts` rewrite | `feat(settlement): rewrite blitz-settle-room v2 with row locking` |
| C8 | 8 (SET-003) | new SQL (advisory lock RPC + settlement_already_processed) | `feat(settlement): add dual-payout protection via advisory lock` |
| C9 | 9 (ANA-002) | `blitz-analytics-writer/index.ts` new Edge Function | `feat(analytics): add blitz-analytics-writer cron Edge Function` |
| C10 | 10 (SOC-001) | `src/hooks/useSpectatorBroadcast.ts` | `feat(spectator): add useSpectatorBroadcast hook` |
| C11 | 11 (SOC-002) | `src/components/AnaSahne/SpectatorPanel.tsx` | `feat(spectator): add SpectatorPanel with emoji reactions and chat` |
| C12 | 12 (ANA-003) | `src/hooks/useAnalytics.ts` | `feat(analytics): add useAnalytics hook` |
| C13 | 13 (OBS-001) | `src/hooks/useObservability.ts`, `src/lib/observability.ts` | `feat(observability): add observability hook and logging module` |
| C14 | 14 (SET-004) | `blitz-settle-room/index.ts` + `blitz-tick-order/index.ts` | `feat(settlement): wire settlement v2 with ledger and analytics` |
| C15 | 15 (SOC-003) | `src/components/AnaSahne/AnaSahnePanel.tsx` | `feat(spectator): integrate SpectatorPanel into AnaSahne` |
| C16 | 16 (ANA-004) | `blitz-matchmake/index.ts`, `blitz-tick-order/index.ts` | `feat(analytics): wire analytics events into matchmake and tick-order` |
| C17 | 17 (OBS-002) | new SQL + monitoring scripts | `feat(observability): add alert triggers and monitoring scripts` |
| C18 | 18 (QA-001) | `scripts/qa-phase2.sh` update | `test(qa): add race condition validation tests` |
| C19 | 19 (QA-002) | `scripts/qa-phase2.sh` update | `test(qa): add settlement collision and idempotency tests` |
| C20 | 20 (QA-003) | `scripts/qa-phase2.sh` update | `test(qa): add broadcast throttling and burst tests` |
| C21 | 21 (QA-004) | `scripts/qa-phase2.sh` update | `test(qa): add analytics and observability correctness tests` |

Each of the 4 migrations can be committed independently as they are idempotent SQL files, or combined into a single migration commit. Edge Functions and frontend hooks are committed with their paired migration/feature work.

---

## Success Criteria

### Verification Commands
```bash
# TypeScript compilation
npx tsc --noEmit                                     # Expected: 0 errors

# Linter
npm run lint                                          # Expected: 0 errors (pre-existing warnings OK)

# Existing tests
npm run test                                          # Expected: 7/7 PASS

# New unit tests
npx vitest run src/hooks/useSpectatorBroadcast.test.ts # Expected: PASS
npx vitest run src/hooks/useAnalytics.test.ts          # Expected: PASS
npx vitest run src/hooks/useObservability.test.ts      # Expected: PASS

# QA oracle protocol (all 14 procedures)
bash scripts/qa-phase2.sh run-all                     # Expected: exit 0

# Monitoring scripts (dry-run to verify queries parse)
bash scripts/monitoring-queries.sql                   # Expected: no parse errors
```

### Final Checklist
- [ ] `tsc --noEmit` produces 0 errors
- [ ] `npm run lint` produces 0 errors (pre-existing warnings acceptable)
- [ ] `npm run test` produces 7/7 PASS (existing) + new tests pass
- [ ] All 4 migrations applied idempotently (can re-run without errors)
- [ ] `order_timestamp()` function exists and returns `now()`
- [ ] `validate_slippage()` function exists and correctly validates price deviation
- [ ] `guard_blitz_orders_cheat_trg` trigger blocks client UPDATE/DELETE on `blitz_orders`
- [ ] `guard_blitz_participants_cheat_trg` trigger blocks client UPDATE/DELETE on `blitz_participants`
- [ ] `settlement_ledger` table exists: has `idempotency_key UNIQUE`, `settlement_type`, `room_id`, `amounts_jsonb`, `created_at`
- [ ] `settlement_ledger` has NO UPDATE/DELETE RLS policies (append-only enforced)
- [ ] `settlement_already_processed()` RPC returns TRUE for duplicate keys
- [ ] `pg_try_advisory_xact_lock` RPC works on room_id hash
- [ ] `tick_order_atomic()` RPC performs `SELECT ... FOR UPDATE` before order creation
- [ ] `lock_and_validate_room()` RPC performs row lock + status check
- [ ] `insert_analytics_event()` RPC is `SECURITY DEFINER` and uses `auth.uid()`
- [ ] `analytics_events_staging` table flushed to `analytics_events` by cron
- [ ] `analytics_events` has 90-day retention via cleanup cron
- [ ] `blitz-tick-order/index.ts` has zero client timestamps (grep = 0 matches)
- [ ] `blitz-tick-order/index.ts` has anti-tamper comment block at top
- [ ] `blitz-tick-order/index.ts` calls `tick_order_atomic()` for order creation
- [ ] `blitz-settle-room/index.ts` calls `lock_and_validate_room()` before settlement
- [ ] `blitz-settle-room/index.ts` calls `settlement_already_processed()` before payout
- [ ] `blitz-settle-room/index.ts` writes to `settlement_ledger` after payout
- [ ] `blitz-analytics-writer/index.ts` exists and reads from staging, writes to main table
- [ ] `useSpectatorBroadcast` hook subscribes to `spectator:{room_id}` Broadcast channel
- [ ] `SpectatorPanel` renders emoji grid and chat panel with 50-msg cap
- [ ] `useAnalytics` hook calls `insert_analytics_event` RPC
- [ ] `useObservability` hook calls `log_observability` RPC
- [ ] `observability_log` has entries from settlement, order, and matchmaking events
- [ ] Broadcast channel status = `SUBSCRIBED` during spectator mode
- [ ] Rate limiting: emoji ≤ 3/sec/user, chat ≥ 2s interval
- [ ] No dual settlements: concurrent Edge Function + DB trigger produces exactly 1 payout
- [ ] Slippage rejects orders with >5% price deviation (unconfigured symbol default)
- [ ] All 14 QA oracle procedures pass: `scripts/qa-phase2.sh run-all` exits 0
```