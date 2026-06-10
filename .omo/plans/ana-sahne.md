Ana Sahne — Anasayfa Canlı Maç Widget'ı (Work Plan)
TL;DR
Quick Summary: lumenblitz.com anasayfasına gömülü, kayıt gerektirmeyen bir canlı maç izleyici (Ana Sahne) ekleniyor. Öne çıkan blitz odasının iki oyuncusunun PnL'i gerçek zamanlı güncellenir, 60sn geri sayım sayacı akar, izleyici sayısı Presence ile gösterilir.

Deliverables:
- Migration: is_featured kolonu, partial index, pick_featured_room() fonksiyonu, trigger, ana_sahne_view VIEW
- Hook: useAnaSahne (Realtime + Presence + countdown)
- Bileşenler: AnaSahne, PlayerCard, CountdownCircle, EmptyArena, FinishedBanner
- Index.tsx entegrasyonu (hero altına gömülü)
- RLS: ana_sahne_view + hedeflı public_profiles policy (anon SELECT)

Estimated Effort: Medium
Parallel Execution: YES — 3 waves (DB → Hook/Components → Integration)
Critical Path: Migration → Hook → AnaSahne component → Index integration
Context
Original Request
Kullanıcı lumenblitz.com anasayfasına "Ana Sahne" widget'ı eklemek istiyor: ziyaretçiler hesap oluşturmadan o anda oynanan öne çıkan blitz maçını canlı izleyebilir.
Interview Summary
Key Discussions:
- Proje Vite + React Router (Next.js DEĞIL) → SSR yok, dynamic() gerekmez
- Supabase client: @supabase/supabase-js via @/integrations/supabase/client
- blitz_rooms.status: 'waiting' | 'active' | 'settling' | 'finished' | 'cancelled'
- PnL style: Yeşil/kırmızı + transition: all 0.4s ease
- Mevcut Presence kullanımı YOK — ilk kez implement edilecek
- Ana Sahne Index.tsx içine gömülü (hero section altına)
- Viewer count: Sayfa refresh'ında sıfırlanır (per-page session)
- FinishedBanner: 3sn sabit + fade → EmptyArena
Research Findings:
- useBlitzRoom.ts (81 satır): Realtime hook pattern referansı
- BlitzRoom.tsx: 250ms interval timer, PnL hesaplama, 2-col layout
- Design system: glass, gradient-bull/bear, cn(), framer-motion, lucide-react
- 22 migration var, sonuncusu 20260609065635
- blitz tabloları zaten supabase_realtime publication'ında
Metis Review (Addressed)
Identified Gaps (tümü plan içinde çözüldü):
1. Anon data access: ana_sahne_view SECURITY DEFINER + hedeflı RLS policy
2. Presence authorization: postgres_changes + RLS yeterli, realtime.messages policy DEĞİŞİRMEZ
3. PII leakage: VIEW user_id, invite_code, created_by, winner_id, final_balance KESİNLİKLE exclude
4. starts_at null risk: Trigger active olduğunda starts_at = now() set etmeli
5. Race conditions: Hook stale data handle etmeli, finished→emptyArena transition atomic
6. Price for anon: Crypto = Binance WS (client), Non-crypto = Edge Function veya polling fallback
7. Feature flag: VITE_ANA_SAHNE_ENABLED env var ile kill switch
Work Objectives
Core Objective
Create a public spectator view on the homepage (lumenblitz.com/) that shows the currently featured blitz match in real-time, without requiring login/registration.
Concrete Deliverables
- Migration file: supabase/migrations/[timestamp]_add_ana_sahne.sql
- Hook: src/hooks/useAnaSahne.ts
- Components: src/components/AnaSahne/AnaSahne.tsx, PlayerCard.tsx, CountdownCircle.tsx, EmptyArena.tsx, FinishedBanner.tsx
- Index.tsx integration (lazy-loaded with Suspense)
- i18n keys in src/lib/i18n.ts
Definition of Done
- Migration applied successfully (supabase db status shows applied)
- pick_featured_room() manual trigger picks correct room (highest entry_fee, newest started_at)
- ana_sahne_view anon client ile sorgulanabilir, PII sızmaz
- npm run dev hatasız başlar
- Anasayfa / rotasında AnaSahne render olur, console hatasız
- Aktif maç simüle edildiğinde timeLeft sayacı düşer, PnL kartları anlık değişir
- Maç bittiğinde FinishedBanner 3sn gösterir, fade ile EmptyArena'ya geçer
- Viewer count Presence ile güncellenir (multi-tab test ≥3)
- RLS: anon ana_sahne_view SELECT başarılı, public_profiles sadece 2 oyuncu
- All QA scenarios pass (agent-executed)
Must Have
- SECURITY DEFINER view for anon access without base table permissions
- Targeted RLS: anon sees ONLY featured room + 2 player profiles
- Presence for viewer count (resets on refresh)
- Client-side 250ms countdown timer from starts_at
- 3s FinishedBanner → fade → EmptyArena flow
- Kill switch via VITE_ANA_SAHNE_ENABLED env var
Must NOT Have (Guardrails)
- ❌ New Redis keys / infrastructure
- ❌ Any write operations in AnaSahne components (read-only)
- ❌ Schema changes beyond is_featured on blitz_rooms
- ❌ realtime.messages RLS policy changes
- ❌ Anon SELECT grants on blitz_rooms, blitz_participants, blitz_orders directly
- ❌ TradingView chart, join CTAs, sound effects
- ❌ Multiple featured rooms / carousel UI
- ❌ Generic Presence infrastructure (scoped to Ana Sahne only)
- ❌ Push notifications for match starts
Verification Strategy
Test Decision
- Infrastructure exists: YES (vitest + @testing-library/react + jsdom configured)
- Automated tests: Tests-after — implement first, then targeted unit tests for hook state transitions
- Framework: vitest
QA Policy
Every task MUST include agent-executed QA scenarios. Evidence saved to .omo/evidence/task-{N}-{scenario-slug}.{ext}.
- Frontend/UI: Playwright — Navigate, interact, assert DOM, screenshot
- CLI/DB: Bash — SQL queries, curl, supabase CLI
- Realtime: Bash + tmux — subscribe, verify events
Execution Strategy
Parallel Execution Waves
Wave 1 (Foundation - sequential, 3 tasks):
├── 1. Database Migration [deep]
├── 2. RLS Policies + Realtime Grants [deep]  
└── 3. Migration Verification + Feature Flag [quick]

Wave 2 (Core Logic - PARALLEL, 4 tasks):
├── 4. useAnaSahne Hook [deep]
├── 5. PlayerCard Component [visual-engineering]
├── 6. CountdownCircle Component [visual-engineering]
├── 7. EmptyArena + FinishedBanner [visual-engineering]

Wave 3 (Integration - PARALLEL, 3 tasks):
├── 8. AnaSahne Main Component [visual-engineering]
├── 9. Index.tsx Integration + i18n [quick]
├── 10. Hook Unit Tests (tests-after) [quick]

Wave FINAL (Verification - 4 PARALLEL reviewers):
├── F1. Plan Compliance Audit [oracle]
├── F2. Code Quality Review [unspecified-high]
├── F3. Real Manual QA [unspecified-high + playwright]
└── F4. Scope Fidelity Check [deep]
-> Present results -> Get explicit user okay

Critical Path: 1 → 2 → 4 → 8 → 9 → F1-F4 → user okay
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 4 (Wave 2 & 3)
Dependency Matrix
Task	Blocks
1	2, 4, 5, 6, 7
2	3, 4
3	4, 5, 6, 7
4	8
5	8
6	8
7	8
8	9
9	F1-F4
10	F2
Agent Dispatch Summary
- Wave 1: 3 tasks — 1: deep, 2: deep, 3: quick
- Wave 2: 4 tasks — 4: deep, 5: visual-engineering, 6: visual-engineering, 7: visual-engineering
- Wave 3: 3 tasks — 8: visual-engineering, 9: quick, 10: quick
- Wave FINAL: 4 tasks — F1: oracle, F2: unspecified-high, F3: unspecified-high (+ playwright), F4: deep
TODOs
1. Database Migration — is_featured, index, function, trigger, view
What to do:
- Create supabase/migrations/[timestamp]_add_ana_sahne.sql
- Add is_featured BOOLEAN DEFAULT FALSE to blitz_rooms
- Partial index: CREATE INDEX idx_blitz_rooms_featured_active ON blitz_rooms (is_featured, status) WHERE is_featured = TRUE AND status = 'active'
- Function pick_featured_room() SECURITY DEFINER:
- Set all is_featured = FALSE
- Find active room with highest entry_fee, tie-break started_at DESC
- Set that room is_featured = TRUE
- Return featured room_id
- Trigger on blitz_rooms UPDATE of status:
- WHEN NEW.status IN ('active', 'finished') THEN PERFORM pick_featured_room()
- View ana_sahne_view SECURITY DEFINER returning:
- room_id, symbol, entry_fee, status, started_at, ends_at
- prize_pool = r.pot - r.fee_collected (from settle-room)
- p1_id, p1_username, p1_level (as league), p1_current_streak (as streak), p1_pnl
- p2_id, p2_username, p2_level, p2_current_streak, p2_pnl
- PnL = live calculation from orders + current price (or last known)
- WHERE is_featured = TRUE AND status = 'active' LIMIT 1
- Exclude from view: user_id, invite_code, created_by, winner_id, final_balance, any PII
Must NOT do:
- Modify existing columns on blitz_rooms, blitz_participants, profiles
- Change existing RLS policies
- Modify supabase_realtime publication
- Add anon grants to base tables directly
Recommended Agent Profile:
- Category: deep
- Skills: supabase-migration, sql
- Reason: Complex SECURITY DEFINER view, trigger function, PII-safe column selection
Parallelization:
- Can Run In Parallel: NO (sequential Wave 1)
- Parallel Group: Wave 1 (with 2, 3)
- Blocks: 2, 4, 5, 6, 7
- Blocked By: None
References:
- supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql — Blitz tables, enums, RLS, realtime publication pattern
- supabase/migrations/20260608130000_blitz_cron_settler.sql — pg_cron job pattern, blitz-settle-room function reference
- src/integrations/supabase/types.ts — Generated Database types for column names
Acceptance Criteria:
- Migration applies clean: supabase db push succeeds
- SELECT * FROM ana_sahne_view LIMIT 1 returns row without error for anon role
- View columns: information_schema.columns confirms NO user_id, invite_code, created_by, winner_id, final_balance
- pick_featured_room() manual call returns correct room_id
- Trigger fires on status change to active/finished
- Partial index used: EXPLAIN SELECT * FROM blitz_rooms WHERE is_featured = TRUE AND status = 'active'
QA Scenarios:
Scenario: Migration applies and view accessible by anon
  Tool: Bash (supabase CLI + curl)
  Preconditions: Clean DB, migration not applied
  Steps:
    1. supabase db push
    2. supabase db status → shows migration applied
    3. curl -X POST <SUPABASE_URL>/rest/v1/rpc/pick_featured_room -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" -d {}
    4. Verify response 200, returns room_id
    5. curl -X GET "<SUPABASE_URL>/rest/v1/ana_sahne_view?select=*" -H "apikey: <ANON_KEY>"
    6. Verify response 200, JSON array, columns match spec
  Expected Result: All HTTP 200, view returns data, no PII columns
  Failure Indicators: 401/403, PII columns present, migration error
  Evidence: .omo/evidence/task-1-migration-apply.json

Scenario: View excludes PII columns
  Tool: Bash (psql)
  Preconditions: Migration applied, sample data exists
  Steps:
    1. psql -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'ana_sahne_view' ORDER BY ordinal_position"
    2. Verify output: room_id, symbol, entry_fee, status, started_at, ends_at, prize_pool, p1_id, p1_username, p1_level, p1_current_streak, p1_pnl, p2_id, p2_username, p2_level, p2_current_streak, p2_pnl
    3. Confirm absent: user_id, invite_code, created_by, winner_id, final_balance, email, etc.
  Expected Result: Exactly 17 columns listed, no PII columns
  Evidence: .omo/evidence/task-1-view-columns.txt

Scenario: pick_featured_room picks highest entry_fee, newest started_at
  Tool: Bash (psql)
  Preconditions: 3 active rooms: A(fee=10, started=10:00), B(fee=20, started=10:05), C(fee=20, started=10:03)
  Steps:
    1. SELECT pick_featured_room()
    2. SELECT room_id, entry_fee, started_at FROM blitz_rooms WHERE is_featured = TRUE
  Expected Result: Room C picked (fee=20, started=10:03 newer than B's 10:05? Wait - DESC so newest = latest time = 10:05 > 10:03. Room B picked)
  Evidence: .omo/evidence/task-1-pick-featured.txt
Commit: YES
- Message: feat(db): add Ana Sahne migration - is_featured, pick_featured_room, ana_sahne_view
- Files: supabase/migrations/[timestamp]_add_ana_sahne.sql
- Pre-commit: supabase db push --dry-run
2. RLS Policies + Realtime Authorization
What to do:
- Policy on ana_sahne_view: CREATE POLICY "Ana sahne herkese açık" ON ana_sahne_view FOR SELECT TO anon, authenticated USING (TRUE);
- Policy on blitz_rooms: CREATE POLICY "Ana sahne: öne çıkan oda" ON blitz_rooms FOR SELECT TO anon USING (is_featured = TRUE AND status = 'active');
- Policy on blitz_participants: CREATE POLICY "Ana sahne: öne çıkan oyuncular" ON blitz_participants FOR SELECT TO anon USING (room_id IN (SELECT room_id FROM ana_sahne_view));
- Policy on public_profiles: CREATE POLICY "Ana sahne: anonim username okuma" ON public_profiles FOR SELECT TO anon USING (id IN (SELECT p1_id FROM ana_sahne_view UNION SELECT p2_id FROM ana_sahne_view));
- Verify Realtime works: anon can subscribe to postgres_changes on filtered rooms via RLS (no realtime.messages changes)
Must NOT do:
- Grant anon SELECT on base tables without featured filter
- Modify realtime.messages RLS policies
- Change existing authenticated policies
Recommended Agent Profile:
- Category: deep
- Skills: supabase-rls, sql
- Reason: Precise RLS policy crafting with subquery filters, security boundary enforcement
Parallelization:
- Can Run In Parallel: NO (depends on migration)
- Parallel Group: Wave 1 (with 1, 3)
- Blocks: 3, 4
- Blocked By: 1
References:
- supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql — Existing RLS pattern for blitz tables
- supabase/migrations/20260505061855_*.sql — realtime_user_topic_read policy reference (what NOT to change)
Acceptance Criteria:
- All 4 policies created without error
- Anon curl to ana_sahne_view returns 200
- Anon curl to blitz_rooms?is_featured=eq.true&status=eq.active returns 200
- Anon curl to blitz_participants with featured room_id returns 200
- Anon curl to public_profiles?id=in.(p1_id,p2_id) returns 200
- Anon curl to public_profiles WITHOUT filter returns 403 (policy blocks)
- Realtime subscription from anon client receives postgres_changes events
QA Scenarios:
Scenario: Anon can read featured room data via REST
  Tool: Bash (curl)
  Preconditions: Migration + policies applied, featured room exists
  Steps:
    1. curl -X GET "<URL>/rest/v1/ana_sahne_view?select=*" -H "apikey: <ANON_KEY>"
    2. curl -X GET "<URL>/rest/v1/blitz_rooms?is_featured=eq.true&status=eq.active&select=*" -H "apikey: <ANON_KEY>"
    3. curl -X GET "<URL>/rest/v1/blitz_participants?room_id=eq.<FEATURED_ID>&select=*" -H "apikey: <ANON_KEY>"
    4. curl -X GET "<URL>/rest/v1/public_profiles?id=in.(<P1_ID>,<P2_ID>)&select=username" -H "apikey: <ANON_KEY>"
  Expected Result: All 200, data returned
  Evidence: .omo/evidence/task-2-rls-read.json

Scenario: Anon CANNOT read non-featured data
  Tool: Bash (curl)
  Preconditions: Non-featured active room exists
  Steps:
    1. curl -X GET "<URL>/rest/v1/blitz_rooms?is_featured=eq.false&status=eq.active&select=*" -H "apikey: <ANON_KEY>"
    2. curl -X GET "<URL>/rest/v1/public_profiles?select=username" -H "apikey: <ANON_KEY>"
  Expected Result: 1) Empty array or 403, 2) 403 or empty
  Evidence: .omo/evidence/task-2-rls-deny.json

Scenario: Anon realtime subscription receives events
  Tool: Bash (tmux + node script)
  Preconditions: Featured room active, anon key valid
  Steps:
    1. Run node script: supabase.createClient(anon).channel('test').on('postgres_changes', {event:'*', schema:'public', table:'blitz_participants', filter:'room_id=eq.<FEATURED_ID>'}, console.log).subscribe()
    2. In another terminal: UPDATE blitz_participants SET final_pnl = 123.45 WHERE room_id = '<FEATURED_ID>' AND user_id = '<P1_ID>'
    3. Verify event received in node script output
  Expected Result: Event payload logged with new pnl value
  Evidence: .omo/evidence/task-2-realtime-sub.txt
Commit: YES (group with 1)
- Message: feat(db): Ana Sahne RLS policies for anon access
- Files: supabase/migrations/[timestamp]_add_ana_sahne.sql (append policies)
- Pre-commit: supabase db push --dry-run
3. Migration Verification + Feature Flag
What to do:
- Verify migration end-to-end: supabase db reset → supabase db push → all objects exist
- Add VITE_ANA_SAHNE_ENABLED to .env.example and vite.config.ts (definePlugin)
- Create kill switch: hook checks import.meta.env.VITE_ANA_SAHNE_ENABLED !== 'false' before subscribing
- Document rollback: supabase migration down command
Must NOT do:
- Add feature flag UI (admin only, out of scope)
- Modify existing env vars
Recommended Agent Profile:
- Category: quick
- Skills: vite-config, env-vars
- Reason: Simple env var setup, migration verification script
Parallelization:
- Can Run In Parallel: NO (depends on 1, 2)
- Parallel Group: Wave 1
- Blocks: 4, 5, 6, 7
- Blocked By: 1, 2
Acceptance Criteria:
- supabase db reset && supabase db push succeeds
- VITE_ANA_SAHNE_ENABLED=true enables feature, false disables (hook returns empty state)
- Rollback verified: supabase migration down removes objects cleanly
QA Scenarios:
Scenario: Feature flag disables hook
  Tool: Bash (node/vite)
  Preconditions: VITE_ANA_SAHNE_ENABLED=false in .env
  Steps:
    1. npm run dev
    2. Open homepage, verify AnaSahne not rendered (or renders EmptyArena only)
  Expected Result: No Supabase connections from AnaSahne hook
  Evidence: .omo/evidence/task-3-flag-off.txt
Commit: YES (group with 1, 2)
- Message: feat(config): Ana Sahne feature flag + migration verification
- Files: .env.example, vite.config.ts, supabase/migrations/[timestamp]_add_ana_sahne.sql
4. useAnaSahne Hook
What to do:
- Create src/hooks/useAnaSahne.ts
- Initial fetch: supabase.from('ana_sahne_view').select('*').single()
- Realtime channel ana-sahne-public:
- postgres_changes on blitz_participants (event: UPDATE) → update participants state with new PnL
- postgres_changes on blitz_rooms (event: UPDATE, filter: status=finished) → set isFinished = true, trigger FinishedBanner
- Presence: channel.track({ online_at: Date.now() }), channel.on('presence', { event: 'sync' }, () => setViewers(Object.keys(channel.presenceState()).length))
- Countdown: useMemo(() => Math.max(0, Math.floor((ends_at - Date.now()) / 1000)), [ends_at]) + 250ms interval for smooth UI
- Cleanup: supabase.removeChannel(channel), clearInterval
- Return: { room, participants, timeLeft, viewers, isLoading, isFinished, error }
- Feature flag check at start: if disabled, return empty state immediately
Must NOT do:
- Write operations (no insert/update/delete)
- Connect to non-featured rooms
- Use price_cache (anon can't access) — use Binance WS for crypto or compute PnL from orders + last price
Recommended Agent Profile:
- Category: deep
- Skills: supabase-realtime, react-hooks
- Reason: Complex realtime + presence + timer orchestration, matches useBlitzRoom.ts pattern
Parallelization:
- Can Run In Parallel: YES (Wave 2)
- Parallel Group: Wave 2 (with 5, 6, 7)
- Blocks: 8
- Blocked By: 1, 2, 3
References:
- src/hooks/useBlitzRoom.ts — Lines 44-81: Realtime subscription pattern, cleanup, state management
- src/pages/BlitzRoom.tsx — Lines 48-51: 250ms interval timer; Lines 53-56: secondsLeft memo; Lines 118-138: PnL calculation
- src/integrations/supabase/client.ts — Supabase client import
- src/lib/symbols.ts — Symbol metadata for price formatting
Acceptance Criteria:
- Hook returns { room, participants, timeLeft, viewers, isLoading, isFinished, error }
- Initial load: isLoading=true → false with data
- Realtime: participant PnL update → participants state updates within 500ms
- Realtime: room status=finished → isFinished=true immediately
- Presence: viewer count increments on mount, decrements on unmount
- Countdown: timeLeft decreases every 250ms, hits 0 at ends_at
- Cleanup: unmount removes channel + clears interval (no memory leak)
- Feature flag: VITE_ANA_SAHNE_ENABLED=false → returns empty state, no subscriptions
QA Scenarios:
Scenario: Hook loads featured room data
  Tool: Playwright
  Preconditions: Featured room active, dev server running
  Steps:
    1. Navigate to /
    2. Wait for [data-testid="ana-sahne"] to appear
    3. Verify room data displayed: symbol, entry_fee, player usernames
  Expected Result: Data visible, isLoading=false
  Evidence: .omo/evidence/task-4-hook-load.png

Scenario: Realtime PnL updates reflect in state
  Tool: Playwright + Bash (parallel)
  Preconditions: Featured room active, 2 participants
  Steps:
    1. Open homepage, note initial PnL values
    2. Bash: UPDATE blitz_participants SET final_pnl = 999.99 WHERE room_id='<ID>' AND user_id='<P1_ID>'
    3. Wait 500ms, verify PnL updated in UI
  Expected Result: PnL changes from old to 999.99 with transition
  Evidence: .omo/evidence/task-4-pnl-update.png

Scenario: Presence viewer count updates
  Tool: Playwright (multi-context)
  Preconditions: Featured room active
  Steps:
    1. Context 1: open /, note viewer count
    2. Context 2: open /, wait 1s, note viewer count in both
    3. Context 3: open /, wait 1s, note viewer count in all
    4. Close Context 2, wait 1s, verify count decrements
  Expected Result: Count = 1 → 2 → 3 → 2
  Evidence: .omo/evidence/task-4-presence-count.png

Scenario: Countdown timer accuracy
  Tool: Playwright
  Preconditions: Room with ends_at = now() + 10s
  Steps:
    1. Open page, record timeLeft at t=0
    2. Wait 5s, record timeLeft
    3. Wait 5s more, verify timeLeft = 0
  Expected Result: timeLeft decreases ~1 per second, reaches 0 at ends_at
  Evidence: .omo/evidence/task-4-countdown.png
Commit: YES
- Message: feat(hooks): useAnaSahne - realtime + presence + countdown
- Files: src/hooks/useAnaSahne.ts
- Pre-commit: npm run lint && npm run typecheck
5. PlayerCard Component
What to do:
- Create src/components/AnaSahne/PlayerCard.tsx
- Props: username, level (as league), currentStreak (as streak), pnl, entryFee, position ('long' | 'short')
- Layout: Avatar/initial, username, league badge, streak flame icon, PnL large, PnL% small, position badge
- PnL positive → gradient-bull background, negative → gradient-bear
- Animate PnL changes: transition: all 0.4s ease on background-color + color
- Use cn(), glass class, framer-motion for mount animation
- Responsive: compact on mobile, full on desktop
Must NOT do:
- Fetch data (pure presentational)
- Any Supabase calls
- Complex logic (compute PnL% in parent)
Recommended Agent Profile:
- Category: visual-engineering
- Skills: react-components, tailwind, framer-motion
- Reason: Visual polish, animations, responsive design, design system adherence
Parallelization:
- Can Run In Parallel: YES (Wave 2)
- Parallel Group: Wave 2 (with 4, 6, 7)
- Blocks: 8
- Blocked By: 3
References:
- src/pages/BlitzRoom.tsx — Lines 200-280: Leaderboard PlayerCard-like rendering, PnL coloring
- src/components/ui/badge.tsx — Badge component for league/streak
- src/components/ui/avatar.tsx — Avatar fallback initials
- src/index.css — gradient-bull, gradient-bear, glass, shadow-card
Acceptance Criteria:
- Renders all props correctly
- PnL positive → green gradient bg, negative → red gradient bg
- PnL change triggers 0.4s smooth transition
- League badge shows level (e.g., "Bronze III")
- Streak shows flame icon + number
- Position badge: LONG (green) / SHORT (red)
- Mobile: compact layout, desktop: full layout
QA Scenarios:
Scenario: PlayerCard renders with positive PnL
  Tool: Playwright
  Preconditions: Component mounted with pnl=123.45, position='long'
  Steps:
    1. Navigate to test page with PlayerCard
    2. Screenshot component
    3. Verify background has gradient-bull classes
    4. Verify PnL% calculated correctly (pnl / entryFee * 100)
  Expected Result: Green theme, correct values
  Evidence: .omo/evidence/task-5-playercard-positive.png

Scenario: PlayerCard renders with negative PnL
  Tool: Playwright
  Preconditions: pnl=-56.78, position='short'
  Steps:
    1. Same as above with negative props
  Expected Result: Red theme, SHORT badge red
  Evidence: .omo/evidence/task-5-playercard-negative.png

Scenario: PnL transition animation
  Tool: Playwright
  Preconditions: PlayerCard mounted, initial pnl=0
  Steps:
    1. Update prop pnl=100 (via parent state)
    2. Capture frames during 0.4s transition
    3. Verify background-color interpolates
  Expected Result: Smooth color transition over ~400ms
  Evidence: .omo/evidence/task-5-transition.gif
Commit: YES
- Message: feat(ui): PlayerCard component for Ana Sahne
- Files: src/components/AnaSahne/PlayerCard.tsx
- Pre-commit: npm run lint
6. CountdownCircle Component
What to do:
- Create src/components/AnaSahne/CountdownCircle.tsx
- Props: timeLeft (seconds), totalDuration (default 60)
- SVG: two circles — background (gray), foreground (stroke-dasharray animated)
- Foreground: stroke-dashoffset calculated from progress (0→1)
- Center text: MM:SS format (mm:ss with leading zeros)
- Color: gradient-primary stroke, transitions on time thresholds (<10s → bear red)
- Accessibility: role="timer", aria-live="polite", aria-label="Kalan süre: MM:SS"
Must NOT do:
- Own timer logic (receives timeLeft from hook)
- Complex state
Recommended Agent Profile:
- Category: visual-engineering
- Skills: svg-animation, react-components, a11y
- Reason: SVG stroke animation, accessibility, precise visual implementation
Parallelization:
- Can Run In Parallel: YES (Wave 2)
- Parallel Group: Wave 2 (with 4, 5, 7)
- Blocks: 8
- Blocked By: 3
References:
- src/pages/BlitzRoom.tsx — Lines 53-56: Countdown display pattern (text-based)
- src/index.css — gradient-primary, gradient-bear for color thresholds
Acceptance Criteria:
- Full circle at 60s, empty at 0s
- Center shows MM:SS (e.g., "00:45", "01:00")
- Stroke color: primary → bear red at <10s
- Smooth animation (CSS transition on stroke-dashoffset)
- Accessible: screen reader announces time changes
QA Scenarios:
Scenario: CountdownCircle renders at various times
  Tool: Playwright
  Preconditions: Component with timeLeft=60, 30, 10, 5, 0
  Steps:
    1. Render at each value, screenshot
    2. Verify stroke-dashoffset matches progress
    3. Verify center text format
  Expected Result: Visual progress matches timeLeft
  Evidence: .omo/evidence/task-6-countdown-states.png

Scenario: Color change at <10s
  Tool: Playwright
  Preconditions: timeLeft=11 → 9
  Steps:
    1. Render at 11s, note stroke color
    2. Update to 9s, verify color changes to bear red
  Expected Result: Color transition at 10s threshold
  Evidence: .omo/evidence/task-6-color-change.png
Commit: YES
- Message: feat(ui): CountdownCircle SVG component
- Files: src/components/AnaSahne/CountdownCircle.tsx
- Pre-commit: npm run lint
7. EmptyArena + FinishedBanner Components
What to do:
- EmptyArena.tsx: Centered card with glass class, "Şu an aktif maç yok" text, "İlk maçı sen başlat" subtext, CTA button → /blitz (lucide Play icon), framer-motion fade-in
- FinishedBanner.tsx: Full-width banner, "🏆 {winnerUsername} kazandı! +{prizePool} USDC", gradient-bull background, auto-dismount after 3000ms + 300ms fade-out via AnimatePresence
- Both: responsive, i18n keys (tr/en)
Must NOT do:
- Auto-redirect (user clicks CTA)
- Complex logic
Recommended Agent Profile:
- Category: visual-engineering
- Skills: react-components, framer-motion, tailwind
- Reason: Animation-heavy (AnimatePresence, fade), polish, i18n
Parallelization:
- Can Run In Parallel: YES (Wave 2)
- Parallel Group: Wave 2 (with 4, 5, 6)
- Blocks: 8
- Blocked By: 3
References:
- src/components/ui/button.tsx — Button component for CTA
- src/lib/i18n.ts — Translation keys pattern
- src/pages/BlitzRoom.tsx — Finished state handling pattern (Lines 59-63)
Acceptance Criteria:
- EmptyArena: message + CTA button → /blitz works
- FinishedBanner: shows winner + prize, auto-hides after 3s + fade
- Transition: FinishedBanner → EmptyArena smooth
- i18n: TR/EN texts correct
QA Scenarios:
Scenario: EmptyArena renders when no featured room
  Tool: Playwright
  Preconditions: No room with is_featured=true AND status=active
  Steps:
    1. Navigate to /
    2. Verify EmptyArena visible, CTA button present
    3. Click CTA, verify navigation to /blitz
  Expected Result: EmptyArena shown, CTA works
  Evidence: .omo/evidence/task-7-empty-arena.png

Scenario: FinishedBanner shows and fades
  Tool: Playwright
  Preconditions: Room just finished, winner known
  Steps:
    1. Navigate to / (or trigger finish via DB)
    2. Verify FinishedBanner visible with winner + prize
    3. Wait 3.5s, verify EmptyArena visible
  Expected Result: Banner 3s → fade 300ms → EmptyArena
  Evidence: .omo/evidence/task-7-finished-banner.gif
Commit: YES
- Message: feat(ui): EmptyArena + FinishedBanner for Ana Sahne
- Files: src/components/AnaSahne/EmptyArena.tsx, src/components/AnaSahne/FinishedBanner.tsx
- Pre-commit: npm run lint
8. AnaSahne Main Component
What to do:
- Create src/components/AnaSahne/AnaSahne.tsx
- Use useAnaSahne hook
- State machine: isLoading → Skeleton | isFinished → FinishedBanner → EmptyArena | room → main layout
- Main layout: 2-column (mobile: stack)
- Left: CountdownCircle (large) + match info (symbol, entry_fee, prize_pool)
- Right: 2x PlayerCard side-by-side (mobile: stack)
- Viewer count badge: Eye icon + number (top-right)
- framer-motion layout animations for state transitions
- Skeleton loader during isLoading (match main layout shape)
- Error state: EmptyArena with "Veri yüklenemedi" message
Must NOT do:
- Direct Supabase calls (use hook)
- Complex business logic
Recommended Agent Profile:
- Category: visual-engineering
- Skills: react-components, framer-motion, state-machine
- Reason: Complex conditional rendering, layout animations, skeleton states
Parallelization:
- Can Run In Parallel: NO (depends on 4, 5, 6, 7)
- Parallel Group: Wave 3 (with 9, 10)
- Blocks: 9
- Blocked By: 4, 5, 6, 7
References:
- src/pages/BlitzRoom.tsx — 2-column layout pattern (chart + leaderboard)
- src/components/ui/skeleton.tsx — Skeleton component if exists, else create inline
- src/components/AnaSahne/*.tsx — Child components
Acceptance Criteria:
- Loading → Skeleton → Data flow works
- Main layout: countdown left, players right (desktop), stacked (mobile)
- Viewer badge top-right, updates real-time
- Finished → FinishedBanner (3s) → EmptyArena flow
- Error → EmptyArena with error message
- Skeleton matches final layout shape (no layout shift)
QA Scenarios:
Scenario: Full AnaSahne render with active match
  Tool: Playwright
  Preconditions: Featured room active, 2 players, PnL varying
  Steps:
    1. Navigate to /
    2. Verify all elements: countdown, symbol, fee, prize, 2 player cards, viewer count
    3. Verify layout: 2-col desktop, stacked mobile (resize viewport)
  Expected Result: Complete widget rendered correctly
  Evidence: .omo/evidence/task-8-full-render.png

Scenario: State transitions: loading → active → finished → empty
  Tool: Playwright + Bash
  Preconditions: Can manipulate room status via DB
  Steps:
    1. Start with no featured room → EmptyArena
    2. DB: INSERT featured room active → verify active layout
    4. DB: UPDATE room status=finished → verify FinishedBanner
    5. Wait 3.5s → verify EmptyArena
  Expected Result: Smooth transitions through all states
  Evidence: .omo/evidence/task-8-state-transitions.gif
Commit: YES
- Message: feat(ui): AnaSahne main component - layout + state machine
- Files: src/components/AnaSahne/AnaSahne.tsx, src/components/AnaSahne/index.ts (barrel)
- Pre-commit: npm run lint && npm run typecheck
9. Index.tsx Integration + i18n
What to do:
- Edit src/pages/Index.tsx
- Import: const AnaSahne = lazy(() => import('@/components/AnaSahne').then(m => ({ default: m.AnaSahne })))
- Wrap in <Suspense fallback={<AnaSahneSkeleton />}>
- Place in anon hero section: after hero <section>, before features grid
- Authenticated view: optionally show above dashboard or hide (product decision — default: show for all)
- Add i18n keys to src/lib/i18n.ts:
- anaSahne.emptyTitle, anaSahne.emptySubtitle, anaSahne.ctaText
- anaSahne.finishedTitle, anaSahne.finishedPrize
- anaSahne.viewers, anaSahne.prizePool, anaSahne.entryFee
Must NOT do:
- Change routing (no new route)
- Modify AppShell or TopBar
Recommended Agent Profile:
- Category: quick
- Skills: react-lazy, i18n
- Reason: Simple integration, lazy loading, translation keys
Parallelization:
- Can Run In Parallel: YES (Wave 3)
- Parallel Group: Wave 3 (with 8, 10)
- Blocks: F1-F4
- Blocked By: 8
References:
- src/pages/Index.tsx — Current structure: anon hero + features, authenticated 3-col grid
- src/App.tsx — Lazy import pattern for other pages
- src/lib/i18n.ts — Translation object structure (tr/en)
Acceptance Criteria:
- AnaSahne renders in anon hero section (below hero, above features)
- Lazy loading works (chunk loaded on demand)
- Suspense fallback shows skeleton
- i18n keys work for TR/EN
- No console errors on page load
QA Scenarios:
Scenario: AnaSahne integrated in Index.tsx anon view
  Tool: Playwright
  Preconditions: Dev server, not logged in
  Steps:
    1. Navigate to /
    2. Verify AnaSahne appears below hero section
    3. Switch language to EN, verify texts translated
    4. Login, verify AnaSahne still visible (or hidden per decision)
  Expected Result: Integrated correctly, i18n works
  Evidence: .omo/evidence/task-9-integration.png
Commit: YES
- Message: feat(pages): AnaSahne integration in homepage + i18n
- Files: src/pages/Index.tsx, src/lib/i18n.ts
- Pre-commit: npm run lint && npm run typecheck
10. Hook Unit Tests (Tests-After)
What to do:
- Create src/hooks/__tests__/useAnaSahne.test.ts
- Test: initial load state transitions (loading → success)
- Test: realtime PnL update → state merge
- Test: room finished event → isFinished=true
- Test: presence sync → viewer count
- Test: countdown memo updates
- Test: cleanup on unmount (channel removed, interval cleared)
- Test: feature flag disabled → empty state
- Mock: supabase.from, supabase.channel, supabase.removeChannel
Must NOT do:
- Integration tests (covered by QA scenarios)
- E2E tests (Playwright covers)
Recommended Agent Profile:
- Category: quick
- Skills: vitest, testing-library, mocking
- Reason: Unit test patterns, hook testing, mocking Supabase
Parallelization:
- Can Run In Parallel: YES (Wave 3)
- Parallel Group: Wave 3 (with 8, 9)
- Blocks: F2
- Blocked By: 4
References:
- src/hooks/useBlitzRoom.ts — Hook to test
- vitest.config.ts — Test config
- Existing test files if any
Acceptance Criteria:
- All tests pass: npm test
- Coverage: hook state transitions covered
- Mocks verify cleanup called
QA Scenarios:
Scenario: Unit tests pass
  Tool: Bash (npm test)
  Preconditions: Test file created
  Steps:
    1. npm test -- src/hooks/__tests__/useAnaSahne.test.ts
    2. Verify all tests pass, coverage reported
  Expected Result: Green tests
  Evidence: .omo/evidence/task-10-unit-tests.txt
Commit: YES
- Message: test(hooks): useAnaSahne unit tests
- Files: src/hooks/__tests__/useAnaSahne.test.ts
- Pre-commit: npm test
Final Verification Wave
4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.
-   F1. Plan Compliance Audit — oracle
Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
Output: Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT
-   F2. Code Quality Review — unspecified-high
Run tsc --noEmit + linter + npm test. Review all changed files for: as any/@ts-ignore, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
Output: Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT
-   F3. Real Manual QA — unspecified-high (+ playwright skill if UI)
Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to .omo/evidence/final-qa/.
Output: Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT
-   F4. Scope Fidelity Check — deep
For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
Output: Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT
Commit Strategy
- 1-3: feat(db): Ana Sahne migration + RLS + feature flag — supabase/migrations/[timestamp]_add_ana_sahne.sql, .env.example, vite.config.ts — supabase db push --dry-run
- 4: feat(hooks): useAnaSahne — src/hooks/useAnaSahne.ts — npm run lint && npm run typecheck
- 5: feat(ui): PlayerCard — src/components/AnaSahne/PlayerCard.tsx — npm run lint
- 6: feat(ui): CountdownCircle — src/components/AnaSahne/CountdownCircle.tsx — npm run lint
- 7: feat(ui): EmptyArena + FinishedBanner — src/components/AnaSahne/EmptyArena.tsx, src/components/AnaSahne/FinishedBanner.tsx — npm run lint
- 8: feat(ui): AnaSahne main component — src/components/AnaSahne/AnaSahne.tsx, src/components/AnaSahne/index.ts — npm run lint && npm run typecheck
- 9: feat(pages): Index integration + i18n — src/pages/Index.tsx, src/lib/i18n.ts — npm run lint && npm run typecheck
- 10: test(hooks): useAnaSahne unit tests — src/hooks/__tests__/useAnaSahne.test.ts — npm test
Success Criteria
Verification Commands
# Migration
supabase db push --dry-run && supabase db push

# View accessible by anon
curl -X GET "<SUPABASE_URL>/rest/v1/ana_sahne_view?select=*" -H "apikey: <ANON_KEY>"

# RLS policies
curl -X GET "<SUPABASE_URL>/rest/v1/blitz_rooms?is_featured=eq.true&status=eq.active" -H "apikey: <ANON_KEY>"
curl -X GET "<SUPABASE_URL>/rest/v1/public_profiles?id=in.(<P1>,<P2>)" -H "apikey: <ANON_KEY>"

# Dev server
npm run dev  # No errors, AnaSahne renders

# Tests
npm test  # All pass

# Typecheck + Lint
npm run typecheck && npm run lint  # Pass

# Feature flag
VITE_ANA_SAHNE_ENABLED=false npm run dev  # AnaSahne disabled
Final Checklist
- All "Must Have" present
- All "Must NOT Have" absent
- All tests pass
- All QA scenarios pass (evidence in .omo/evidence/)
- F1-F4 reviewers all APPROVE
- User explicit "okay" received
- Commit pushed to main