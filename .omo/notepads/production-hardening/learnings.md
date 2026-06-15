# Production Hardening — Learnings

## 2026-06-15 — Wave 0-4 Completed Tasks

### T0.1 - .omo Synthesis
- Threat model identified 28 threats, 2 P0, 6 P1
- Key gaps: strictNullChecks not in threat model, CORS wildcard undocumented, balance audit trail missing
- All major security items verified and cross-referenced

### T0.2 - Audit Scripts
- Three audit scripts: arbitrage-exploit, concurrency-bomb, redis-leak-probe
- Scripts use Deno runtime with mock server
- Results saved to `.omo/evidence/t0.2-audit/`

### T0.3 - CI Revert Analysis
- Original commit `79b2e1a` (ci(crash-test)) reverted by `a505afd`
- Revert reason: OAuth scope issues in GitHub Actions workflow
- CI workflow needs修复 before re-enabling

### T0.4 - activity_feed View Audit
- SECURITY DEFINER view analyzed
- RLS bypass risk: LOW (view uses `security_invoker = true`)
- View accesses: positions, trades, settlements tables

### T1.1 - Concurrency Tests
- 30 tests passing across 4 edge functions
- Idempotency and race condition tests implemented
- Test files in `supabase/functions/__tests__/`

### T1.2 - Ledger Invariant
- SQL invariant query: `pot_total = prize_amount + fee_collected`
- Test data validated, no deviations found
- Trigger added to enforce invariant on INSERT/UPDATE

### T1.3 - Security Fixes
- **Race condition fix**: Optimistic locking on `positions.closed_at`
- **Ledger invariant**: `validate_settlement_invariant()` trigger
- Migration `20260610000006` adds `closed_at` column and index
- All 30 tests still passing after fixes

### T3.1 - as any Root Cause Analysis
- 21 `as any` casts across 8 frontend files
- Categories: missing Supabase types (views/RPCs), type mismatches
- Solution: Create type extension file for missing types

### T3.2 - Type Extension
- `src/integrations/supabase/types.extra.ts` created
- All 26 `as any` casts eliminated
- Build passes with zero type errors

### T3.3 - strictNullChecks
- Enabled `strictNullChecks: true` and `noImplicitAny: true`
- Fixed 18 null-safety errors across codebase
- Build + tests pass after fixes

### T4.1 - Rate Limiting
- Sliding window algorithm with Redis sorted sets
- 7 edge functions protected (execute-trade, blitz-*, ai-*)
- Fail-open pattern: requests allowed if Redis unavailable
- 429 response with proper headers (X-RateLimit-*, Retry-After)

### Patterns Observed
1. **Optimistic locking** preferred over row-level locks for Edge Functions
2. **Fail-open** pattern used consistently (Redis, rate limiting)
3. **Type extension file** pattern for Supabase auto-generated types
4. **Migration numbering**: `YYYYMMDDNNNNNN_description.sql`

### Gotchas
- Deno runtime for edge functions (not Node.js)
- Supabase types auto-generated, don't edit `types.ts` directly
- Rate limiting after authentication (need user_id for key)
- `ai-risk-monitor` excluded from rate limiting (cron job, no user context)

### T4.2 - Zod Input Validation (Partial)
- Zod validation added to all 5 AI edge functions: ai-analyze, ai-chat, ai-strategy, ai-trade-coach, ai-risk-monitor
- Each function has request schema validation with proper error handling (400 response for invalid input)
- Zod imported from `https://deno.land/x/zod@v3.22.4/mod.ts`
- Test files created in `supabase/functions/__tests__/` for each function
- Task timed out but implementation was completed

### T5.2 - Lint Fixes
- Removed unused imports in `src/hooks/useAnaSahne.ts`
- ESLint now passes with 0 errors (only warnings from coverage dir and react-hooks/exhaustive-deps)

### T5.6 - Page Tests (Partial)
- Only Portfolio.test.tsx created (not Settings, Blitz, Index)
- Test file uses React Testing Library with mocked Supabase and recharts
- Test infrastructure (test-utils.tsx) created for shared test utilities

### Decisions
- Use Upstash Redis for rate limiting (serverless, pay-per-request)
- Sliding window over fixed window for better UX
- Type extension file instead of modifying auto-generated types
- Test files in `supabase/functions/__tests__/` (not colocated)
- Zod validation schemas co-located with edge functions (not shared)
