
# Ana Sahne Migration (20260609234136)

## Created
- `supabase/migrations/20260609234136_ana_sahne.sql`

## Contents
1. `is_featured` column on `blitz_rooms` (boolean NOT NULL DEFAULT false) + partial index
2. `pick_featured_room()` SECURITY DEFINER trigger function + AFTER STATEMENT trigger
   - Clears previous featured, picks active room with highest entry_fee within last 24h
3. `ana_sahne_view` — SECURITY DEFINER view with security_barrier
   - Shows featured room without PII (no winner_id, created_by, user_id, invite_code, final_balance)
   - Participants as JSON array: username (from profiles.display_name), side, pnl, pnlPct
   - GRANT SELECT to anon + authenticated
4. `blitz_payout_trigger()` SECURITY DEFINER function + BEFORE trigger
   - Records platform_revenue on room finish
   - Pays winner from pot - fee_collected (updates profiles.real_balance)
   - Works with guard_profiles_financial_update because it runs in service_role context

## Key decisions
- `pick_featured_room` is FOR EACH STATEMENT (not per row) — only one featured room
- `blitz_payout_trigger` includes `OLD.status IS DISTINCT FROM 'finished'` check for idempotency
- Prize formula uses `pot - fee_collected` (not `entry_fee * 2 * 0.95`)
- No `has_role()` in view — SECURITY DEFINER bypasses RLS
- View uses `profiles` (not `public_profiles`) via SECURITY DEFINER owner context

## Task 3 - Feature Flag Type
- Created `.env.example` with VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_ANA_SAHNE_ENABLED
- Updated `src/vite-env.d.ts` with `ImportMetaEnv` interface; `VITE_ANA_SAHNE_ENABLED?: string` resolves as `string | undefined`
- `.env` file not modified (only `.env.example`)

## Not verified (infrastructure unavailable)
- `supabase db push --dry-run` — needs Docker or linked remote project
- `curl` tests — needs running Supabase instance with service/anon keys

# Task 4 - useAnaSahne Hook

## Created
- `src/hooks/useAnaSahne.ts` — React hook for featured room
- `src/hooks/__tests__/useAnaSahne.test.ts` — 6 vitest tests (all pass)

## Hook interface
- `AnaSahneRoom` — matches `ana_sahne_view` columns (no PII: no winner_id, created_by, invite_code)
- `AnaSahneParticipant` — `{ user_id, username, side, pnl, pnlPct }` from JSON aggregate
- Returns `{ room, participants, timeLeft, viewers, isLoading, isFinished, error }`

## Implementation notes
- `ana_sahne_view` is NOT in `src/integrations/supabase/types.ts` Views — cast as `as unknown as AnaSahneRoom`
- Used `"ana_sahne_view" as never` in `.from()` to bypass Supabase typed client (view not in generated types)
- Room ref (`useRef`) needed for timer closure — stale closure bug without it
- Timer: 250ms `setInterval` computing `starts_at + 60s - now()` for countdown
- Presence: `track({ user_id: "anonymous" })` — no PII, ephemeral
- Cleanup: `cancelled = true` + `clearInterval` + `removeChannel`

## Testing gotchas
- `vi.mock` factory is hoisted — must use `vi.hoisted()` for mock variables
- `vi.runAllTimers()` infinite loops with setInterval — use `vi.advanceTimersByTimeAsync(0)` instead
- `require("@/hooks/...")` doesn't resolve `@` alias in vitest — use `import` at top level
- Test runner: `npx vitest run` (NOT `bun test` — bun's test runner lacks jsdom)
