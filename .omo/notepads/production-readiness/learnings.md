# Production-Readiness Learnings

---

## 2026-06-10 | Wave 0, Task 1: Environment Inventory

### Key Findings
- **14 unique env vars** total: 3 frontend (Vite), 9 edge function (Deno), 3 test-only
- **Zero secrets in source code** — comprehensive scan confirmed clean
- **No SQLCipher key remnants** in current codebase or git history
- **No `.env` files** committed (only `.env.example`)
- **CI workflow** uses mock server — no real secrets needed in CI

### Architecture Observations
- CORS is configured inline in each edge function (no shared `_shared/cors.ts` module)
- `x-cron-secret` auth pattern: 4 edge functions use `verify_cron_secret` RPC (database-side validation)
- Redis is fail-open: `redisEnabled = !!(URL && TOKEN)` — gracefully disabled when vars missing
- Frontend uses only public `VITE_*` vars — no secrets exposed to browser
- `SUPABASE_SERVICE_ROLE_KEY` used by 16/19 edge functions (admin operations)
- `LOVABLE_API_KEY` used by 7 edge functions (all AI features)

### Gaps for Downstream Tasks
1. `.env.example` only documents 3 frontend vars — edge function env vars need separate documentation
2. `src/pages/Settings.tsx` has hardcoded empty `VAPID_PUBLIC_KEY` — should be `VITE_VAPID_PUBLIC_KEY` or fetched from config
3. No `.env` file exists — Task 9 will create it
4. Edge function env vars are not version-controlled — need dashboard documentation

### Env Var Dependencies (for Task 9)
- `VITE_SUPABASE_URL` ↔ `SUPABASE_URL` (same value, different access patterns)
- `VITE_SUPABASE_PUBLISHABLE_KEY` ↔ `SUPABASE_ANON_KEY` (same key, different names)
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are optional (graceful degradation)
- `VAPID_*` vars are optional (push notifications disabled when missing)
- `LOVABLE_API_KEY` is required for all AI features (7 functions)

---

## 2026-06-10 | Wave 0, Task 2: Risk Register + STRIDE Threat Model

### Key Findings
- **28 threats documented** across all 6 STRIDE categories
- **2 P0 threats** (must fix before ANY production deploy): service role key leak, client JWT financial mutation
- **8 P1 threats** (must fix before GA): no rate limiting, JWT manipulation, Redis credential exposure, price cache poisoning, settlement ledger tampering, admin escalation
- **All 10 risk register items validated** against actual codebase (R01-R10)
- **All 13 Metis gaps addressed** with specific threat IDs and downstream task references

### Critical Security Findings
1. **`blitz-settle-room` timestamp gap (Metis Gap 2)**: Uses `new Date().toISOString()` (line 66) instead of `order_timestamp()` RPC — confirmed. Mapped to T-T01, downstream T52.
2. **Redis credential exposure**: `_shared/redis.ts` reads `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` at module scope — confirmed. No `console.log(Deno.env)` found (clean). Mapped to T-I01, downstream T33.
3. **`admin: any` type escape**: 4 edge functions type admin as `any` — confirmed. `blitz-settle-room` most critical (financial ops). Mapped to T-T05, downstream T49.
4. **No rate limiting**: 0 matches for `rate.limit|throttle|429` across all edge functions — confirmed. Mapped to T-D01, downstream T31.
5. **CORS wildcard**: All 19 functions use `Access-Control-Allow-Origin: *` — confirmed. Mapped to T-E05, downstream T32.

### Codebase Scan Results
- `as any` casts: 31 total (4 in edge functions, 27 in frontend across 10 files)
- Service role key usage: 32 references in 16/19 edge functions
- `admin: any` parameter: 4 functions (settle-room, execute-trade, price-feed, ai-trade-coach)
- CORS wildcards: 19 functions (all)
- Rate limiting: 0 server-side implementations
- Console.log env exposure: 0 matches (clean)

### Hard Audit Validation
- CRSH-001 (Redis leak): PASS — DBSIZE drift = 0
- CRSH-002 (Concurrency): PASS — p95 = 2ms, 0 deadlocks
- CRSH-003 (Exploit): PASS — stale→409, injection→400, spam→dedup

### Gap Identified
- **No balance audit trail**: `blitz-settle-room` modifies `profiles.real_balance` without writing to `real_balance_ledger` — mapped to T-R02, downstream T39/T44
- **Settlement failure logging**: Error path has `.catch(() => {})` on both main operation and error logging — could cause silent failures — mapped to T-R01, downstream T39/T41

### References
- Threat model: `.omo/reports/threat-model.md`
- Evidence: `.omo/evidence/task-2-threat-model.md`
- Env spec (Task 1): `.omo/reports/env-spec.md`

---

## 2026-06-10 | Wave 0, Task 3: Edge Function Dependency Map + Redis Key Audit

### Key Findings
- **19 Edge Functions** (not 20 — `_shared` is a module directory, not a function)
- **5 functions use Redis** — all in blitz subsystem + price-feed
- **6 unique Redis key patterns** documented with full access patterns
- **1 inter-function call** — `execute-trade` → `trade-mirror` (fire-and-forget)
- **22 DB tables** accessed across all functions
- **14 unique RPCs** used
- **5 distinct auth patterns** identified

### Architecture Observations
- **Redis is isolated to blitz subsystem** — 14 of 19 functions don't use Redis at all
- **Price cache is the critical shared key** — `blitz:price:${symbol}` written by `price-feed`, read by 4 other functions
- **All blitz functions have DB fallbacks** for price reads when Redis unavailable
- **`blitz-matchmake` is the most complex Redis user** — uses lists (FIFO queue), hashes (room state), sets (users), and simple keys (price)
- **Single inter-function dependency** — `execute-trade` calls `trade-mirror` via HTTP (fire-and-forget, line 268)
- **Cron auth pattern** is consistent across 4 functions — all use `verify_cron_secret` RPC (DB-side validation)

### Redis Key Audit Findings
1. **Missing TTL on `blitz:room:${roomId}:positions`** — only deleted by settlement, no TTL safety net. Currently no code writes to this key (cleanup target only). Low severity.
2. **No price staleness validation in Redis readers** — functions trust Redis price without checking age. Defense-in-depth exists at DB level (`price_cache` staleness check in `execute-trade`). Low severity.
3. **All other keys have appropriate TTLs** — 30s (idempotency), 60s (price), 300s (queue), 600s (room state)
4. **No conflicting namespaces** — all keys use `blitz:` prefix with distinct sub-namespaces
5. **Fail-open behavior confirmed** — all Redis operations return safe defaults when unavailable

### `admin: any` Parameter Locations (for T49)
| Function | Line | Risk |
|----------|------|------|
| `blitz-settle-room` | 13 | High (financial settlement) |
| `execute-trade` | 102 | High (trade execution) |
| `price-feed` | 262 | Medium (order fill) |
| `ai-trade-coach` | 131 | Low (AI coaching) |

### Auth Pattern Distribution
- **User JWT (anon key):** 3 functions (ai-analyze, ai-chat, news-feed)
- **User JWT (service role + forwarded auth):** 6 functions (ai-strategy, daily-brief, execute-trade, reset-demo-account, weekly-digest, ai-trade-coach single-user)
- **User JWT (service role + token extraction):** 4 functions (blitz-admin-topup, blitz-join-private, blitz-matchmake, blitz-tick-order)
- **Service role OR cron secret:** 4 functions (blitz-analytics-writer, blitz-settle-room, ai-risk-monitor, price-feed)
- **Service role only:** 2 functions (send-push, trade-mirror)

### Gaps for Downstream Tasks
1. **T33 (Redis credentials rotation)** — 5 functions affected, all via `_shared/redis.ts`
2. **T31 (Rate limiting)** — 0 rate limits on any of 19 functions
3. **T32 (CORS restriction)** — all 19 functions use `Access-Control-Allow-Origin: *`
4. **T41 (Health check endpoints)** — 0 health checks on any function
5. **T45-T48 (`as any` elimination)** — 4 functions with `admin: any` parameter
6. **T49 (Admin type safety)** — settle-room, execute-trade, price-feed, ai-trade-coach
7. **T52 (Settlement timestamp fix)** — `blitz-settle-room` uses `new Date().toISOString()` instead of `order_timestamp()` RPC

### References
- Dependency map: `supabase/functions/DEPENDENCY_MAP.md`
- Redis key audit: `.omo/evidence/task-3-redis-keys.md`
- Evidence: `.omo/evidence/task-3-dependency-map.md`
- Threat model (Task 2): `.omo/reports/threat-model.md`
- Env spec (Task 1): `.omo/reports/env-spec.md`

---

## 2026-06-10 | Wave 0, Task 4: Migration Ordering Verification

### Key Findings
- **29 migration files** verified — all pass 5 checks with 0 errors
- **Phase 1 (April/May):** 13 migrations — core trading platform schema
- **Phase 1.5 (June 5):** 4 migrations — pg_cron/vault infrastructure
- **Phase 2 (June 8-10):** 12 migrations — blitz subsystem + security hardening
- **Total schema objects:** 32 tables, 36 functions, 5 views, 14+ enums/types
- **All dependencies resolve correctly** — no forward references found
- **No conflicting modifications** — all ALTER TABLE operations are additive

### Migration Architecture Observations
- **Supabase uses forward-only migrations** — no DOWN sections, reversibility via corrective forward migrations
- **DROP IF EXISTS + CREATE OR REPLACE** pattern used consistently for idempotent re-apply
- **Phase 1.5 is a pivot point** — 4 migrations on June 5 set up pg_cron, vault, and cron_secret infrastructure that Phase 2 depends on
- **Blitz subsystem is self-contained** — 12 migrations (18-29) create all blitz tables, functions, and cron jobs
- **Security hardening is layered** — guard triggers (migration 9-10), anti-cheat triggers (migration 25), financial integrity (migration 10)

### Dependency Chain (Critical Path)
1. `app_role` type → `user_roles` table → `has_role()` function
2. `profiles` table → `guard_profiles_financial_update()` trigger
3. `blitz_rooms` table → `blitz_participants` → `blitz_orders` (FK chain)
4. `vault` extension → `cron_secret` → `verify_cron_secret()` → all cron auth
5. `settlement_ledger` → `settlement_already_processed()` → `lock_and_validate_room()` → `blitz_payout_trigger()`

### Known Patterns (Not Issues)
- **DROP VIEW CASCADE** in `ana_sahne` migration: recreates view with updated security_barrier — safe pattern
- **Large timestamp gaps** between Phase 1 and Phase 2: expected (development paused May 6 → June 5)
- **No DOWN markers** in any migration: standard Supabase practice — forward-only migrations

### Tool Created
- `scripts/verify-migration-order.ts` — comprehensive 5-check verification script
- Checks: sequential numbering, DOWN safety, conflict detection, dependency validation, reversibility
- Can be re-run after future migrations to verify ordering

### References
- Report: `.omo/reports/migration-issues.md`
- Evidence: `.omo/evidence/task-4-migration-check.log`, `.omo/evidence/task-4-migration-count.log`
- Script: `scripts/verify-migration-order.ts`

---

## 2026-06-10 | Wave 1, Task 9: .env File Creation with All Secrets

### Key Findings
- **15 env vars** documented (14 from env-spec + `NODE_ENV`)
- `.env` created with local dev placeholders (no real secrets)
- `.env.example` expanded from 3 to 15 variables with descriptive placeholders
- `.gitignore` already had `.env` on line 25 — no modification needed
- `git check-ignore .env` returns `.env` — confirmed ignored
- `git status` does NOT show `.env` as tracked — clean

### Architecture Observations
- **Frontend vs Edge split matters**: VITE_ vars are safe for browser; edge function vars (SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY, etc.) must NEVER be in frontend code
- **VITE_SUPABASE_URL = SUPABASE_URL** for local dev, but different in production (VITE uses client-facing URL, edge functions use internal)
- **VITE_SUPABASE_PUBLISHABLE_KEY = SUPABASE_ANON_KEY** — same key, different naming conventions
- **Optional vars have fail-open behavior**: UPSTASH_REDIS_REST_URL/TOKEN and VAPID_* vars are gracefully handled when missing
- **SENTRY_DSN and LOG_LEVEL** added to env spec (not in original Task 1 audit but needed for Tasks T10 and T40)

### Dependencies for Downstream Tasks
1. **T10 (config module)**: Will read these env vars with validation and type safety
2. **T40 (Sentry)**: Will use `SENTRY_DSN` from .env
3. **Settings.tsx VAPID fix**: Now has env var available for `VITE_VAPID_PUBLIC_KEY` (currently hardcoded empty)

### Gap Identified
- Edge function env vars are NOT in `.env` — they're set via Supabase Dashboard. The `.env` file is for local dev and frontend; edge function vars are documented in `.env.example` for reference but must be configured separately in Supabase Dashboard for production.

### References
- Evidence: `.omo/evidence/task-9-gitignore.log`
- Env spec (Task 1): `.omo/reports/env-spec.md`

---

## 2026-06-10 | Wave 1, Task 12: Feature Flag System Enhancement

### Key Findings
- **2 files** referenced `VITE_ANA_SAHNE_ENABLED` (Index.tsx + vite-env.d.ts) — both migrated
- **`src/lib/feature-flags.ts` created** with typed `FeatureFlag` union, `FeatureFlags` interface, `hasFeature()` and `getFeatureFlags()` functions
- **All flags default to `false`** when env var not set — safe-by-default design
- **Flag naming convention**: kebab-case flag names (`'ana-sahne'`) map to `VITE_SCREAMING_CASE_ENABLED` env vars

### Architecture Decisions
- `hasFeature()` uses strict `=== 'true'` comparison — any other value (undefined, empty string, `'false'`) → `false`
- `toEnvKey()` helper converts kebab-case to `VITE_*_ENABLED` format automatically
- JSDoc documentation included with step-by-step instructions for adding new flags
- `VITE_ANA_SAHNE_ENABLED` left in `vite-env.d.ts` type declarations (required for `import.meta.env` shape)

### Files Changed
1. **NEW** `src/lib/feature-flags.ts` — typed feature flag module
2. **EDITED** `src/pages/Index.tsx` — replaced direct `import.meta.env` check with `hasFeature('ana-sahne')`

### Dependencies for Downstream Tasks
- **T26 (Blitz integration tests)**: Now can use `hasFeature()` for flag-dependent test setup
- **T30 (ErrorBoundary)**: Can use the module for future feature gates

### References
- Feature flag module: `src/lib/feature-flags.ts`
- Evidence: `.omo/evidence/task-12-feature-flag-default.log`

---

## 2026-06-10 | Wave 1, Task 10: Type-Safe Config Module

### Key Findings
- **2 config modules created** — one for Edge Functions (Deno), one for frontend (Vite)
- **ConfigError class** in both modules — throws with variable name for actionable error messages
- **Edge config validates 9 env vars**: 4 required (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY, LOVABLE_API_KEY), 5 optional (UPSTASH_REDIS_REST_URL/TOKEN, VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT)
- **Frontend config validates 3 env vars**: 2 required (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY), 1 optional with default (VITE_ANA_SAHNE_ENABLED → false)
- **Zero heavy deps** — no zod, no joi, pure TypeScript validation
- **All existing tests pass** (14/14) — no regressions
- **Build passes** cleanly

### Architecture Decisions
- **`ConfigError extends Error`** — standard Error subclass for catch blocks; `name` set to `"ConfigError"` for identification
- **`Object.freeze()`** on config objects — prevents accidental mutation of validated config
- **`satisfies Config`** — TypeScript 4.9+ pattern for compile-time type checking without widening
- **`getRequired()` / `getOptional()`** helpers — clean separation of required vs optional var validation
- **Module-level singleton** — config loaded once at import time; fail-fast on missing required vars
- **VAPID_SUBJECT defaults to `mailto:noreply@lumen.trade`** — matches env-spec default
- **Frontend `anaSahneEnabled` defaults to `false`** — safe-by-default, matches feature-flags.ts pattern

### Pattern Compatibility
- **Edge config** follows `_shared/redis.ts` pattern: `Deno.env.get()` at module scope
- **Frontend config** compatible with `src/lib/feature-flags.ts` — both read from `import.meta.env`
- **Import paths**: Edge functions use `../_shared/config.ts`; frontend uses `@/lib/config`
- **Singleton export pattern** matches existing `supabase` client export in `src/integrations/supabase/client.ts`

### Gap Identified
- **Config module is NOT yet imported by existing edge functions** — that's Tasks 45-48 (as-any elimination)
- **Frontend config is NOT yet imported by existing files** — `src/integrations/supabase/client.ts` still uses raw `import.meta.env`
- **No runtime validation test** in vitest — Deno not available in this environment; structural validation via evidence script

### Dependencies for Downstream Tasks
1. **T45-T48 (as-any elimination)**: Edge functions will import `config` from `../_shared/config.ts`
2. **Frontend migration**: `src/integrations/supabase/client.ts` can import `frontendConfig` instead of raw env access
3. **T40 (Sentry)**: Can add `SENTRY_DSN` to frontend config if needed

### References
- Edge config: `supabase/functions/_shared/config.ts`
- Frontend config: `src/lib/config.ts`
- Evidence: `.omo/evidence/task-10-config-validation.log`
- Env spec (Task 1): `.omo/reports/env-spec.md`

---

## 2026-06-10 | Wave 1, Task 17: Vercel/Netlify Deploy Config (Frontend)

### Key Findings
- **No existing deploy config** found — `vercel.json` or `netlify.toml` did not exist
- **`vercel.json` created** with Vite framework, `buildCommand: "npm run build"`, `outputDirectory: "dist"`
- **SPA rewrites** configured: all routes fallback to `/index.html` (required for client-side routing)
- **Preview deployments** supported via Vercel's native PR deployment feature (no special config needed — Vercel auto-deploys PR branches when project is linked)
- **Build verified** — `npm run build` succeeds in 7.2s producing `dist/` with 27 output chunks

### Architecture Observations
- Vite defaults to `dist/` output — matches Vercel config
- Largest chunk (`index-BLXownzh.js`, 1.34MB / 380KB gzip) exceeds 500KB warning threshold — consider code-splitting optimization
- 3121 modules transformed — substantial frontend bundle
- Tailwind class ambiguity warning for `duration-[3000ms]` — minor, non-blocking

### Files Created
1. **NEW** `vercel.json` — Vercel deploy configuration

### Dependencies
- **T9 (.env)**: `.env` required for build environment variables
- **T10 (config module)**: Config validation ensures required vars present at runtime
- **T12 (feature flags)**: Feature flags read from `import.meta.env` at build time

### References
- Deploy config: `vercel.json`
- Evidence: `.omo/evidence/task-17-build.log`

---

## 2026-06-10 | Wave 1, Task 49: Admin Type Safety (Eliminate `admin: any`)

### Key Findings
- **`admin` is a SupabaseClient** — NOT a user/admin profile object. All 4 functions create it via `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` and use `.rpc()`, `.from()`, `.auth.getUser()`
- **Created `Admin` type alias** = `SupabaseClient` in `_shared/blitz-types.ts` — type-safe, semantically correct
- **4 `admin: any` parameters eliminated** across 4 edge functions
- **`npx tsc --noEmit` passes** (frontend code only — edge functions are Deno, not in tsconfig)
- **1 pre-existing test failure** in `test-utils.test.ts` (chainable mock assertion) — unrelated to this change
- **Concurrency-bomb test** requires Deno runtime + live Supabase — not runnable in CI environment

### Files Changed
1. **`supabase/functions/_shared/blitz-types.ts`** — Added `import type { SupabaseClient }` + `export type Admin = SupabaseClient`
2. **`supabase/functions/blitz-settle-room/index.ts`** — Added `import type { Admin }`, changed `settleRoom(admin: any, ...)` → `settleRoom(admin: Admin, ...)`
3. **`supabase/functions/execute-trade/index.ts`** — Added `import type { Admin }`, changed `executeOne(admin: any, ...)` → `executeOne(admin: Admin, ...)`
4. **`supabase/functions/price-feed/index.ts`** — Added `import type { Admin }`, changed `fillOrder(admin: any, ...)` → `fillOrder(admin: Admin, ...)`
5. **`supabase/functions/ai-trade-coach/index.ts`** — Added `import type { Admin }`, changed `processUser(admin: any, ...)` → `processUser(admin: Admin, ...)`

### Architecture Observations
- Edge functions are **Deno-only** — not covered by `npx tsc --noEmit` (tsconfig.app.json only includes `src/`). Type safety is enforced by Deno's type checker at deploy time.
- The `Admin` type is a **type alias** (not a structural type) — preserves full `SupabaseClient` API surface including `.rpc()`, `.from()`, `.auth`, `.channel()`, etc.
- All 4 functions use the same `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` pattern — single source of truth for the `Admin` type
- `fillOrder` in price-feed still has `order: any` parameter — separate cleanup target (not financial like admin type)
- `executeOne` in execute-trade has a recursive call at line 308 that passes `admin` — now type-safe

### Security Impact
- **T-T05 (Metis Gap)** addressed: `admin: any` type escape eliminated from all 4 functions
- Financial operations (settlement, trade execution) now have full type checking on the service-role client
- Future property access errors on `admin` will be caught at compile time instead of runtime

### Verification
- `npx tsc --noEmit`: ✅ PASS
- `npx vitest run`: ✅ 48/49 pass (1 pre-existing failure in test-utils mocks)
- Concurrency-bomb: ⏭ SKIPPED (requires Deno + live Supabase)
- `admin: any` grep: ✅ 0 matches in edge functions

### References
- Type definition: `supabase/functions/_shared/blitz-types.ts`
- Previous audit: `.omo/reports/threat-model.md` (T-T05)
- Dependency map: `supabase/functions/DEPENDENCY_MAP.md`

## 2026-06-10 | Wave 1, Task 53: Waiting Room Timeout Audit

### Key Findings
- **Existing DB-side safety net**: Migration `20260610000000_cleanup_stale_rooms.sql` creates `cleanup_stale_rooms()` function + pg_cron job (every 5min) that sets `status='cancelled'` on rooms waiting > 30 minutes
- **Balance leak**: The cron-based cleanup does NOT release locked balances (`profiles.real_balance_locked`) for participants of stale rooms — balances remained locked indefinitely
- **No inline cleanup**: The matchmake function had zero cleanup logic — stale rooms only cleaned by cron with 30-min hardcoded threshold
- **Queue TTL**: 300s hardcoded on the `blitz:queue:*` Redis key — no env var configuration

### Changes Made

#### `supabase/functions/blitz-matchmake/index.ts`
1. **`WAITING_ROOM_TTL_SECONDS` env var** (default `300` = 5 min) — configurable timeout for both queue TTL and stale room detection
2. **`releaseStaleBalances()` function** — inline cleanup that:
   - Queries `blitz_rooms` for `status='waiting'` AND `created_at < now() - TTL`
   - Releases locked balances for all participants of stale rooms
   - Marks rooms as `cancelled`
   - Logs each timeout via `log_observability` RPC with `p_event: "waiting_room_timeout"` (warn level)
3. **Cleanup called early** in request handler (after auth, before body parse) — runs on every matchmake invocation
4. **Queue TTL** changed from hardcoded `300` to `WAITING_ROOM_TTL_SECONDS` — consistent timeout behavior
5. **`queue_joined` observability log** — tracks when users enter the queue with TTL metadata

#### `supabase/functions/_shared/config.ts`
- Added `waitingRoomTtlSeconds` field to `Config` interface (optional, read as `WAITING_ROOM_TTL_SECONDS`)

### Architecture Observations
- **Two-layer cleanup**: Fast inline cleanup (5min default, catches ~stale rooms immediately) + DB cron safety net (30min, catches anything missed)
- **Balance unlock is critical**: The existing cron only flips status to `cancelled` — participants' locked balances would never be released without the inline fix
- **`releaseStaleBalances` is bounded**: Uses `.limit(20)` — prevents runaway cleanup on cold starts with many stale rooms

### Verification
- `npx tsc --noEmit` — passes (0 errors)
- `npm run test` — 5 files, 18 tests, all pass
- Room creation flow unchanged (same INSERT/SELECT pattern)
- Active game room TTLs (600s) unchanged — only waiting/queue state affected

### Dependencies for Downstream Tasks
- **T9 (.env)**: `WAITING_ROOM_TTL_SECONDS` should be added to `.env.example` and `.env`
- **Env spec**: Add to `.omo/reports/env-spec.md`

### References
- Files changed: `supabase/functions/blitz-matchmake/index.ts`, `supabase/functions/_shared/config.ts`
- Existing migration: `supabase/migrations/20260610000000_cleanup_stale_rooms.sql`
- Evidence: `.omo/evidence/task-53-waiting-room-timeout.log`

---

## 2026-06-10 | Wave 1, Task 52: Server-Authoritative Timestamps (blitz-settle-room)

### Key Findings
- **Line 66 replaced**: `new Date().toISOString()` → `admin.rpc("order_timestamp")` with error handling
- **Pattern matched**: Same pattern as `blitz-tick-order` line 202-205 (established in T30)
- **1 remaining `new Date()`**: Line 244 uses it for `ends_at` query filter (cron room sweep) — NOT a settlement timestamp, intentionally left unchanged per scope
- **Server-authoritative**: Settlement `closed_at` values on `blitz_orders` now come from PostgreSQL `now()` via `order_timestamp()` RPC

### Architecture Observations
- `order_timestamp()` RPC defined in `20260610000001_security_hardening.sql` — returns `timestamptz` via `SELECT now()`
- Error handling follows the fail-safe pattern: if RPC fails or returns null, the function returns `{ ok: false, error: "Server timestamp unavailable" }` rather than crashing
- The RPC is already granted to `service_role` — no migration changes needed

### Verification
- `npx tsc --noEmit` — PASS (clean exit)
- `concurrency-bomb.ts` — SKIPPED (tests `blitz-tick-order`, not `settle-room`; requires live Supabase)

### Files Changed
1. **EDITED** `supabase/functions/blitz-settle-room/index.ts` — line 66: client timestamp → RPC call

### References
- RPC definition: `supabase/migrations/20260610000001_security_hardening.sql`
- Reference pattern: `supabase/functions/blitz-tick-order/index.ts` line 202-205

---
## 2026-06-10 | Wave 1, Task 30: Error Boundary Component

### Key Findings
- **`src/components/ErrorBoundary.tsx` created** — React class component with `getDerivedStateFromError` and `componentDidCatch`
- **Props**: `children` (required), `fallback?` (custom ReactNode), `onError?` (callback with error + errorInfo)
- **Production UI**: Shows "Something went wrong" + "An unexpected error occurred. Please try again." + "Try again" reset button
- **Dev mode**: Also renders a `<pre>` block with `error.name: error.message` (not full stack trace)
- **Integrated into App.tsx** — wraps `<AppProvider>` inside `<BrowserRouter>`

### Architecture Decisions
- Error boundary wraps the `AppProvider` block (not the entire app) — catches rendering errors in pages and context, while leaving infra providers (QueryClient, Tooltip, Toasters) outside so they remain functional
- Default error UI uses Tailwind classes consistent with the app's design system (`bg-background`, `text-foreground`, `text-muted-foreground`, `bg-muted`, `border`)
- `handleReset` method resets `hasError` + `error` state, allowing users to retry without full page reload
- No stack trace exposure in production — dev-only `<pre>` block shows sanitized error name + message

### Test Coverage
- **4 tests** in `src/components/__tests__/ErrorBoundary.test.tsx`:
  1. Renders children normally when no error occurs
  2. Catches an error and shows default fallback UI ("Something went wrong" heading, retry button)
  3. Renders custom `fallback` prop when provided (default UI suppressed)
  4. Calls `onError` callback with the caught error and errorInfo

### Files Created
1. **NEW** `src/components/ErrorBoundary.tsx` — error boundary class component
2. **NEW** `src/components/__tests__/ErrorBoundary.test.tsx` — vitest test suite

### Files Modified
1. **EDITED** `src/App.tsx` — added `ErrorBoundary` import and wrapped `AppProvider`

### Verification
- `npx vitest run src/components/__tests__/ErrorBoundary.test.tsx` → 4/4 passed
- `npx tsc --noEmit` → clean (0 errors)
- `npm run test` → 18/18 passed across 5 test files (0 regressions)

### References
- Error boundary component: `src/components/ErrorBoundary.tsx`
- Test file: `src/components/__tests__/ErrorBoundary.test.tsx`
- App integration: `src/App.tsx`

---

## 2026-06-10 | Wave 2, Task 45: Eliminate `as any` Casts in `src/lib/`

### Key Findings
- **3 `as any` casts eliminated** across 2 files (previously reported as 27 in frontend, but `src/lib/` only contained 3)
- **Zero `as any` remaining** in `src/lib/*.ts` and `src/lib/*.tsx` — confirmed via grep
- **All casts replaced with focused type assertions** — no `@ts-ignore` used, no runtime behavior changed

### Files Changed
1. **EDITED** `src/lib/binanceStream.ts` — 2 casts replaced:
   - `(window as any)` → `(window as { __binance_stream?: BinanceStreamState })` with extracted interface
   - `({} as any)` → `{}` (typed via variable annotation `{ __binance_stream?: BinanceStreamState }`)
2. **EDITED** `src/lib/blitzSfx.ts` — 2 casts replaced:
   - `(window as any).webkitAudioContext` → `(window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext`
   - `(navigator as any).vibrate(pattern)` → `navigator.vibrate(pattern)` (stdlib DOM lib includes Vibration API in TS 5.8)

### Patterns Applied
- **Extracted interface for global state**: `BinanceStreamState` interface captures the exact shape of the HMR singleton, replacing untyped `window` patching
- **Focused type assertions**: `as { __binance_stream?: ... }` and `as { webkitAudioContext?: ... }` — narrow, specific casts instead of `as any`
- **Removed unnecessary cast**: `navigator.vibrate()` is in the TS 5.8 DOM lib, so `(navigator as any).vibrate()` was simply `navigator.vibrate()`

### Verification
- `npx tsc --noEmit` — PASS (clean exit)
- `npm run test` — 18/18 passed across 5 test files (0 regressions)
- `npm run build` — PASS (built in ~15s)

### References
- Binance stream: `src/lib/binanceStream.ts`
- SFX module: `src/lib/blitzSfx.ts`

---

## 2026-06-10 | Wave 2, Task 21: Test Utilities Foundation

### Key Findings
- **`src/test-utils/` created** with 5 files: setup.ts, factories.ts, mocks.ts, health-check.ts, index.ts
- **31 tests** pass — factories, mocks, health check all compile and work at runtime
- **Zero regressions** — all 18 existing tests still pass (49/49 total)
- **Mock server health check** — `waitForServer()` polls until responsive, used by global setup
- **Factories match Supabase types** — rooms, participants, orders, profiles all align with `src/integrations/supabase/types.ts`

### Files Created
1. **`src/test-utils/setup.ts`** — Vitest global setup: spawns mock server (Deno), health checks, teardown with SIGTERM/SIGKILL fallback
2. **`src/test-utils/factories.ts`** — 18 factory functions: rooms (3 variants), participants, orders, profiles, users, auth tokens, edge function responses, Redis responses, spectator events, batch factories
3. **`src/test-utils/mocks.ts`** — Mock builders: `createSupabaseMocks()` (chainable from/channel/rpc/auth), `createRedisMocks()` (matching `_shared/redis.ts` API), `createEdgeFunctionMocks()` (fetch interceptor), `createConsoleSpy()`, `setupFakeTimers()`
4. **`src/test-utils/health-check.ts`** — `waitForServer()` (polling with timeout), `isServerHealthy()` (non-throwing), `pingEndpoint()` (specific path check), CLI mode for standalone use
5. **`src/test-utils/index.ts`** — Barrel export for all utilities
6. **`src/test-utils/test-utils.test.ts`** — 31 smoke tests verifying all exports compile and produce correct shapes

### Architecture Decisions
- **`createSupabaseMocks()` returns full chainable object** — `.from().select().single()` works out of the box, matching real Supabase client API
- **Factories use `uid()` with counter + timestamp** — unique across test runs, reset via `resetCounter()` in beforeEach
- **Redis mocks match `_shared/redis.ts` API surface** — all 17 methods (set, setNxEx, get, del, hset, hget, hgetall, sadd, smembers, srem, rpush, lpop, lrem, lrange, expire, hsetAll, hdel) are mocked with correct return types
- **Health check defaults to 404 status** — mock server returns 404 for unmatched paths, so this is the correct "server is alive" signal
- **Global setup uses Deno spawn** — spawns `scripts/audit/_mock_server.ts` as a child process, reads PORT= from stdout, writes `process.env.MOCK_SERVER_URL`

### Wiring Required
- **vitest.config.ts** needs `globalSetup: ["./src/test-utils/setup.ts"]` added to `test` section to activate mock server lifecycle
- Existing `setupFiles: ["./src/test/setup.ts"]` (matchMedia mock) is unaffected — runs per-test-file, global setup runs once

### Dependencies for Downstream Tasks
- **T22-T28**: All test tasks can now `import { createSupabaseMocks, createMockRoom, ... } from "@/test-utils"`
- **T26 (Blitz integration tests)**: `createActiveRoom()`, `createParticipants()`, `createOrders()` ready
- **T27 (Edge Function unit tests)**: `createEdgeFunctionMocks()` and response factories ready
- **T28 (Security tests)**: `createRedisMocks()`, `createConsoleSpy()` ready

### References
- Test utilities: `src/test-utils/`
- Mock server: `scripts/audit/_mock_server.ts`
- Redis API: `supabase/functions/_shared/redis.ts`
- Supabase types: `src/integrations/supabase/types.ts`

---

## 2026-06-10 | Wave 2, Task 51: Remove Unused Imports and Variables

### Key Findings
- **27 unused import/variable errors** found and fixed across `src/`, `supabase/functions/`, and `scripts/`
- **`noUnusedLocals` and `noUnusedParameters`** enabled in both `tsconfig.app.json` and `tsconfig.json` (were `false`)
- **`@typescript-eslint/no-unused-vars`** enabled in `eslint.config.js` (was `"off"`) — set to `["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }]`
- **TS compiler**: `npx tsc --noEmit` — clean (0 output)
- **ESLint**: 0 errors, 18 pre-existing warnings (react-hooks/exhaustive-deps + react-refresh/only-export-components — unrelated to dead code)
- **Tests**: 49/49 pass (6 test files)
- **Build**: Passes cleanly

### Files Changed

#### `src/` — Unused imports removed
| File | Removed |
|------|---------|
| `src/components/TopBar.tsx` | `DropdownMenuLabel` from dropdown-menu import |
| `src/components/trading/AccountAIPanel.tsx` | `TrendingDown`, `TrendingUp`, `X` from lucide-react; `formatPrice` from symbols; removed unused `closePos()` function; removed `celebrateAchievements`, `recordTrade` imports; renamed unused `onTradeDone` prop to `_onTradeDone` |
| `src/components/trading/ChartPanel.tsx` | `useEffect` from React import |
| `src/pages/BlitzRoom.tsx` | `cn` from utils import |
| `src/pages/Social.tsx` | `Switch` from ui/switch import |
| `src/hooks/use-toast.ts` | Renamed `actionTypes` → `_actionTypes` (used only as type) |
| `src/hooks/__tests__/useAnaSahne.test.ts` | Unused destructured mocks: `mockSelect`, `mockPresenceState`, `mockSubscribe`, `mockOn`, `mockChannelObj` |
| `src/test-utils/setup.ts` | Removed unused `portDetected` flag; renamed `chunk` → `_chunk` |
| `src/test-utils/mocks.ts` | Exposed `mockSelect`, `mockSingle`, `mockOn`, `mockSubscribe`, `mockTrack`, `mockPresenceState` directly on return object (fixed test that expected them at top level) |

#### `supabase/functions/` — Unused variables fixed
| File | Fix |
|------|-----|
| `reset-demo-account/index.ts` | Removed unused `e` from `catch (e)` → `catch` |
| `send-push/index.ts` | Renamed unused `payload` → `_payload` |

#### `scripts/` — Unused variables + duplicate case
| File | Fix |
|------|-----|
| `scripts/audit/_mock_server.ts` | Removed duplicate `case "SET":` block (first simple handler) |
| `scripts/audit/concurrency-bomb.ts` | Removed unused `deadlocksBefore` + `dlBefore` variables |
| `scripts/verify-migration-order.ts` | Removed unused `extractTableName()` function; removed unused `blockStart`, `stmt`, `revokes`, `sql`, `table` variables |

### Architecture Decisions
- **`_` prefix convention**: Used for intentionally unused parameters/props (`_onTradeDone`, `_payload`, `_chunk`, `_actionTypes`) — matches ESLint rule's `argsIgnorePattern: "^_"` and `varsIgnorePattern: "^_"`
- **TypeScript configs enabled**: Both `tsconfig.app.json` and `tsconfig.json` now have `noUnusedLocals: true` and `noUnusedParameters: true` to prevent dead code from re-entering
- **ESLint rule enabled**: `@typescript-eslint/no-unused-vars` set to `error` with underscore-prefix ignore — catches dead code at lint time

### Remaining Warnings (18 total — out of scope)
- **`react-hooks/exhaustive-deps`** (10 warnings) — useEffect has missing dependencies. Fixing would change runtime behavior (infinite loops, stale closures). Deliberately left as-is per "Do NOT change any runtime behavior" constraint.
- **`react-refresh/only-export-components`** (6 warnings) — In shadcn/ui library files that export both components and constants. Requires file restructuring. Pre-existing.
- **`duration-[3000ms]` Tailwind ambiguity** (1 warning) — build-time only, not a lint issue.

### Verification
- `npx tsc --noEmit`: ✅ PASS (0 output, exit 0)
- `npm run lint`: ✅ 0 errors, 18 warnings (all pre-existing, non-dead-code)
- `npm run test`: ✅ 49/49 pass (6 test files)
- `npm run build`: ✅ PASS (built in ~17s)

### References
- ESLint config: `eslint.config.js`
- TypeScript configs: `tsconfig.json`, `tsconfig.app.json`
- Learnings format: `.omo/notepads/production-readiness/learnings.md`

---
