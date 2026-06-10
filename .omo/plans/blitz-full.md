# Blitz Full Uygulama Plani — LumenTrade Blitz Modu + Ana Sahne

## TL;DR

> **Quick Summary**: Blitz 1v1 trading arenasina Ana Sahne (canli izleme ozelligi) ekleniyor, trade paneli bilesenlere ayriliyor, FAZ 4 guvenlik tetigi ekleniyor. Mevcut kodtabani esas alinmistir.
>
> **Deliverables**:
> - Ana Sahne: `ana_sahne_view` (SECURITY DEFINER) + `pick_featured_room()` trigger + `useAnaSahne` hook + 5 bilesen
> - Feature flag: `VITE_ANA_SAHNE_ENABLED` + `.env.example`
> - i18n: ~20 yeni key (tr/en)
> - Refactor: `BlitzRoom.tsx` → alt bilesenler (BlitzTimer, TradeActions, BlitzLeaderboard, BlitzChart)
> - FAZ 4: PostgreSQL trigger (SECURITY DEFINER) payout safety net
> - Index.tsx: Ana Sahne entegrasyonu
>
> **Estimated Effort**: Large (22 tasks + 4 verification)
> **Parallel Execution**: YES — 4 waves (Wave 1-2 parallel ic ice, Wave 3 hepsi paralel + T5, Wave Final sequential)
> **Critical Path**: Task 1 → Task 4 → Task 7 → Task 13 → Task F1-F4

---

## Context

### Original Request
Blitz modunun 4 FAZ'i + Ana Sahne canli izleme ozelliginin tek bir planda toplanmasi. Kullanici tum kodtabanini okudu, Adim 0'da kararlari kodtabaniyla karsilastirdi ve celiskileri codebase lehine cozdu.

### Interview Summary
**Key Findings (Adim 0 — Codebase Dogrulama)**:

**Mevcut Tablolar (DEGISMEYECEK):**
- `blitz_rooms`: id, symbol, entry_fee, status (enum: waiting/active/settling/finished/cancelled), mode, invite_code, max_players, **starts_at**, ends_at, start_price, winner_id, pot, fee_collected, created_by, created_at, updated_at
- `blitz_participants`: id, room_id, user_id, joined_at, final_pnl, **final_balance**, rank, created_at (NOT: `initial_balance` yok)
- `blitz_orders`: id, room_id, user_id, side (long/short), amount, entry_price, exit_price, pnl, opened_at, closed_at, created_at
- `platform_revenue`: id, source, room_id, amount, currency, metadata, created_at ✅ MEVCUT
- `user_stats`: user_id, xp, level, current_streak, ... ✅ MEVCUT
- `profiles`: id, display_name, **real_balance**, real_balance_locked, ... (NOT: `balance` degil)

**Mevcut Edge Functions (DEGISMEYECEK):**
- `blitz-matchmake`: Eslestirme + private oda ✅
- `blitz-settle-room`: 60s sonu kapanis + cuzdan odemeleri + platform_revenue kaydi ✅
- `blitz-tick-order`: Emir acma/kapama ✅
- `blitz-join-private`: Ozel odaya katilma ✅

**Mevcut Cron Jobs:**
- `blitz-settler-10s`: Her 10 saniyede bir settle-room cagirir ✅

**Mevcut Frontend:**
- `BlitzRoom.tsx` (`src/pages/BlitzRoom.tsx`): 383 satir, tek dosyada timer/chart/buttons/leaderboard/result-modal/sfx/confetti
- `useBlitzRoom.ts`: Realtime subscription + cleanup pattern'i
- `Blitz.tsx`: Lobi sayfasi
- `canvas-confetti` kurulu ve kullaniliyor
- Framer Motion kurulu ve kullaniliyor
- `public_profiles` RLS: `pp_select_active` — anon dahil tum aktif profiller gorulebilir

**Celiskiler ve Cozumleri** (codebase esas alindi):
1. `started_at` → `starts_at` (gercek kolon adi)
2. `initial_balance` → tabloda yok, eklenmeyecek
3. `profiles.balance` → `profiles.real_balance`
4. Status enum: `waiting/active/settling/finished/cancelled` (tam liste)
5. `.env.example` yok → olusturulacak
6. `has_role()` anon cagiramaz → SECURITY DEFINER view ile cozuldu
7. `profiles` cuzdan trigger'i zaten var → FAZ 4 trigger'i ORADA olmayan bir kolona (real_balance) dokunacak + platform_revenue INSERT

### Metis Review
**Identified Gaps** (addressed in plan):
- **BlitzRoom.tsx component extraction** → Wave 3'e tasindi, Ana Sahne ayaga kalktiktan sonra (Task 5)
- **Tie-case prize handling** → CRITICAL DECISION: varsayilan olarak mevcut davranis korunuyor (tie = kimse alamaz), opsiyon olarak sorulacak
- **Waiting room timeout** → Task 14'te cleanup mekanizmasi eklendi
- **FAZ 4 scope netligi** → Mevcut Edge Function'a alternatif DEGIL, PostgreSQL trigger safety net olarak eklendi
- **`.env.example`** → Task 3'e eklendi
- **Ana Sahne Presence** → Ephemeral (Supabase Presence), sayfa yenilemede sifirlanir
- **Feature flag kapsami** → Yalnizca Ana Sahne render kontrolu, tum Blitz modunu degil

---

## Work Objectives

### Core Objective
Blitz 1v1 trading arenasina Ana Sahne canli izleme ozelligi eklemek, trade panelini yeniden kullanilabilir bilesenlere ayirmak, ve FAZ 4 guvenlik tetigini PostgreSQL seviyesinde uygulamak.

### Concrete Deliverables
- `supabase/migrations/xxxxx_ana_sahne.sql` — pick_featured_room(), ana_sahne_view, FAZ 4 trigger
- `.env.example` — VITE_ANA_SAHNE_ENABLED dahil
- `src/hooks/useAnaSahne.ts` — hook
- `src/components/AnaSahne/` — 5 bilesen
- `src/components/blitz/` — 4 extracted component
- `src/lib/i18n.ts` — yeni keyler
- `src/pages/Index.tsx` — Ana Sahne entegrasyonu
- `src/vite-env.d.ts` — VITE_ANA_SAHNE_ENABLED type

### Definition of Done
- [ ] `curl -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/ana_sahne_view?select=*"` → 200, PII yok
- [ ] Anon SELECT on `blitz_rooms` → 401 (veya 200 ama bos)
- [ ] `VITE_ANA_SAHNE_ENABLED=false` → Index'te Ana Sahne render edilmez
- [ ] `VITE_ANA_SAHNE_ENABLED=true` → featured room varsa gosterilir
- [ ] `bun test` → PASS
- [ ] `tsc --noEmit` → 0 error

### Must Have
- Ana Sahne SECURITY DEFINER view (anon erisimi, PII yok)
- Targeted RLS: anon yalnizca featured room + 2 oyuncunun username'ini gorebilir
- Supabase Presence ile izleyici sayisi (sayfa yenilemede sifirlanir)
- 250ms sayac `starts_at`'tan itibaren
- 3s FinishedBanner → CSS opacity fade → EmptyArena
- `VITE_ANA_SAHNE_ENABLED` kill switch
- BlitzRoom.tsx alt bilesenlere ayrilmasi (BlitzTimer, TradeActions, BlitzLeaderboard)
- FAZ 4 PostgreSQL trigger (SECURITY DEFINER, cuzdan odemesi + platform_revenue)

### Must NOT Have (Guardrails)
- Next.js pattern'leri (`dynamic()`, `ssr: false`, `app/` router)
- Yeni Redis key yapisi — mevcut key'lere dokunma
- `realtime.messages` RLS politikasina degisiklik
- `public_profiles`'a filtresiz anon SELECT grant (mevcut RLS korunacak)
- `ana_sahne_view`'da PII: `user_id`, `invite_code`, `winner_id`, `created_by`, `final_balance`, `real_balance`
- `entry_fee * 2 * 0.95` prize pool formulu (`r.pot - r.fee_collected` kullan)
- Non-kripto fiyat kaynagi
- Mevcut `blitz_rooms`, `blitz_participants`, `profiles`, `blitz_orders` kolonlarinin DEGISTIRILMESI
- Mevcut Edge Function'larin (blitz-matchmake, blitz-settle-room, blitz-tick-order) DEGISTIRILMESI
- Koşulsuz retry dongusu — 2 REJECT sonrasi dur
- `profiles` tablosuna yeni trigger eklenmesi (guard_profiles_financial_update ZATEN VAR)
- Anon kullanicilarin canli trade data gormesi (Ana Sahne read-only, PnL gosterimi yok)
- Yeni Edge Function olusturulmasi (mevcutlar yeterli)

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: YES (vitest@3.2 + @testing-library/react@16 + jsdom)
- **Automated tests**: Tests-after — implement oncek, sonra test
- **Framework**: vitest + @testing-library/react
- **Tooling**: Playwright for UI scenarios (import via /playwright skill)

### QA Policy
Every task MUST include agent-executable QA scenarios (see TODO template below). Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Supabase/DB**: Bash (curl with apikey headers + supabase client) — assert HTTP status + response body
- **UI/Component**: Playwright — navigate, interact, assert DOM, screenshot
- **Hook/Logic**: Bun/vitest — import module, mock dependencies, assert state transitions
- **RLS/Security**: Bash (curl with/without apikey) — assert 200 vs 401/403

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — Ana Sahne altyapisi):
├── Task 1: Migration (ana_sahne_view, pick_featured_room, FAZ 4 trigger) [quick]
├── Task 2: RLS policies (ana_sahne_view icin) [unspecified-high]
├── Task 3: Feature flag (.env.example + vite-env.d.ts) [quick]
└── Task 4: useAnaSahne hook [deep]

Wave 2 (Core UI — MAX PARALLEL, Wave 1'den sonra):
├── Task 6: PlayerCard component [visual-engineering]
├── Task 7: CountdownCircle component [visual-engineering]
├── Task 8: EmptyArena + FinishedBanner components [visual-engineering]
├── Task 9: AnaSahne.tsx (parent orchestrator) [visual-engineering]
└── Task 10: AnaSahne index.ts barrel export [quick]

Wave 3 (Integration + Refactor — PARALLEL, Wave 2'den sonra):
├── Task 5: Extract BlitzRoom.tsx into sub-components [quick]
├── Task 11: Index.tsx + i18n integration [unspecified-high]
├── Task 12: Blitz sub-component barrel export + documentation [writing]
├── Task 13: FAZ 4 PostgreSQL trigger testing + verification [unspecified-high]
└── Task 14: Waiting room timeout cleanup mechanism [deep]

Wave FINAL (After ALL — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright)
└── Task F4: Scope fidelity check (deep)
-> Present results -> Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 4 → Task 11 → Task F1-F4 → user okay
Parallel Speedup: ~55% faster than sequential
```

### Dependency Matrix (Full)

| Task | Blocked By | Blocks | Wave |
|------|-----------|--------|------|
| 1 | None | 2, 4, 13, 14 | 1 |
| 2 | 1 | 4 | 1 |
| 3 | None | 11 | 1 |
| 4 | 1, 2 | 6, 7, 8, 9, 10 | 1 |
| 5 | None (Wave 3 — Ana Sahne ayaktayken) | 12 | 3 |
| 6-10 | 4 | 11 | 2 |
| 11 | 3, 6-10 | F1-F4 | 3 |
| 12 | 5 | F1-F4 | 3 |
| 13 | 1 | F1-F4 | 3 |
| 14 | 1 | F1-F4 | 3 |
| F1-F4 | 11, 12, 13, 14 | user | FINAL |

### Agent Dispatch Summary

- **Wave 1**: 4 tasks — T1 → `quick`, T2 → `unspecified-high`, T3 → `quick`, T4 → `deep`
- **Wave 2**: 5 tasks — T6-T9 → `visual-engineering`, T10 → `quick`
- **Wave 3**: 5 tasks — T5 → `quick`, T11 → `unspecified-high`, T12 → `writing`, T13 → `unspecified-high`, T14 → `deep`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high+playwright`, F4 → `deep`

---

## TODOs

- [x] 5. **Extract BlitzRoom.tsx into reusable sub-components**

  **What to do**:
  - Read `src/pages/BlitzRoom.tsx` (383 lines, monolith)
  - Extract the following into `src/components/blitz/`:
    - `BlitzTimer.tsx`: Countdown display, `secondsLeft` prop, red highlight at ≤5s, Framer Motion spring animation. Props: `{ secondsLeft: number | null; status: string; isActive: boolean; onTick?: () => void }`
    - `TradeActions.tsx`: LONG/SHORT buttons, quick amount selector ($5/$10/$25/$50), open position display, close button. Props: `{ isActive: boolean; myOpenOrder: any; amount: number; submitting: boolean; onAmountChange: (n: number) => void; onOpenPosition: (side: 'long'|'short') => void; onClosePosition: () => void }`
    - `BlitzLeaderboard.tsx`: Live PnL ranking with Framer Motion AnimatePresence, color-coded percentages, "Sen (siz)" indicator. Props: `{ ranking: [string, number][]; usernames: Record<string,string>; userId: string; entryFee: number; isActive: boolean }`
  - Keep original `BlitzRoom.tsx` as orchestrator that imports these components
  - Export all from `src/components/blitz/index.ts`

  **Must NOT do**:
  - Change any logic, PnL calculation, or behavior
  - Add new features during extraction
  - Remove or rename any existing exports

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical extraction — copy/paste JSX into new files, props interface extraction, no new logic
  - **Skills**: none (pure React extraction)
  - **Skills Evaluated but Omitted**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent — BlitzRoom extraction, Ana Sahne'den bagimsiz)
  - **Parallel Group**: Wave 3 (Ana Sahne ayaga kalktiktan sonra; Tasks 11, 13, 14 ile paralel)
  - **Blocks**: Task 12 (barrel export)
  - **Blocked By**: None (Wave siralamasi — Wave 2 bittikten sonra calisir)

  **References**:
  - `src/pages/BlitzRoom.tsx` — source file to extract from (383 lines)
  - `src/hooks/useBlitzRoom.ts` — interfaces (BlitzRoom, BlitzParticipant, BlitzOrder)
  - `src/components/ui/card.tsx` — Card component pattern
  - `src/components/ui/button.tsx` — Button component pattern

  **Acceptance Criteria**:
  - [ ] `src/components/blitz/BlitzTimer.tsx` created and exports default
  - [ ] `src/components/blitz/TradeActions.tsx` created and exports default
  - [ ] `src/components/blitz/BlitzLeaderboard.tsx` created and exports default
  - [ ] `src/components/blitz/index.ts` barrel export created
  - [ ] `src/pages/BlitzRoom.tsx` imports from `@/components/blitz` instead of inline JSX
  - [ ] `bun test` → PASS (no regressions)
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios**:
  ```
  Scenario: Extraction preserves original behavior
    Tool: Bash (bun)
    Preconditions: Extraction complete, BlitzRoom.tsx updated to use sub-components
    Steps:
      1. bun test → assert all existing tests pass
      2. tsc --noEmit → assert 0 errors
      3. grep "function BlitzTimer\|function TradeActions\|function BlitzLeaderboard" src/pages/BlitzRoom.tsx → assert NOT found (moved)
    Expected Result: All existing tests pass, type check passes, original file no longer contains extracted component code
    Evidence: .omo/evidence/task-05-extraction-verify.txt

  Scenario: Barrel export is correct
    Tool: Bash (node -e)
    Preconditions: All files created
    Steps:
      1. node -e "const m = require('./src/components/blitz/index.ts')" → assert no error
    Expected Result: Barrel export works
    Evidence: .omo/evidence/task-05-barrel.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-05-extraction-verify.txt` — test + typecheck output
  - [ ] `task-05-barrel.txt` — barrel export verification

  **Commit**: YES
  - Message: `refactor(blitz): extract BlitzRoom sub-components`
  - Files: `src/components/blitz/*.tsx src/pages/BlitzRoom.tsx`
  - Pre-commit: `bun test && tsc --noEmit`

- [x] 1. **Migration: ana_sahne_view, pick_featured_room(), FAZ 4 trigger**

  **What to do**:
  - Create new migration file: `supabase/migrations/YYYYMMDDHHMMSS_ana_sahne.sql`
  - Create `public.pick_featured_room()` trigger function (SECURITY DEFINER):
    - En yuksek `entry_fee`'li `status = 'active'` odasini secer
    - Her INSERT/UPDATE on `blitz_rooms` icin calisir
    - Mevcut featured room'u gunceller (blitz_rooms.is_featured kolonunu ayarlar)
    - `is_featured` kolonu `blitz_rooms`'a EKLENECEK (ALTER TABLE ADD COLUMN IF NOT EXISTS)
    - `created_at > now() - interval '1 day'` filtrele
  - Create `public.ana_sahne_view` (SECURITY DEFINER view):
    - 17 kolon (PII yok: `winner_id`, `created_by`, `user_id`, `invite_code`, `final_balance` HARIC)
    - `pick_featured_room()`'un isaretledigi odayi gosterir
    - Katilimci bilgileri: username (public_profiles), PnL, side (blitz_orders)
    - İzleyici sayisi dahil DEGIL (Presence, DB'de tutulmaz)
  - Create FAZ 4 payout trigger function `public.blitz_payout_trigger()` (SECURITY DEFINER):
    - `blitz_rooms`'da `status` → `finished` oldugunda tetiklenir
    - Eger `winner_id` varsa: `profiles.real_balance`'a `(pot - fee_collected)` ekle
    - `platform_revenue`'a `fee_collected` miktarinda kayit ekle
    - `guard_profiles_financial_update` trigger'i ile CATISMAZ — cunku SECURITY DEFINER olarak calisir
    - **NOT**: Bu trigger mevcut `blitz-settle-room` Edge Function'ina ALTERNATIF degil, SAFETY NET olarak calisir. Edge Function zaten ayni islemi yapiyor.
  - `ALTER PUBLICATION supabase_realtime ADD TABLE ...` (gerekli degil, zaten mevcut)

  **Must NOT do**:
  - Mevcut kolonlari degistirme (sadece `is_featured` EKLENECEK)
  - Mevcut trigger'lari silme veya degistirme
  - `profiles` uzerinde guard trigger'i ile catisan yeni trigger ekleme (FAZ 4 trigger dogrudan UPDATE yapar, guard trigger'i service_role kontrolu yapar - SECURITY DEFINER ile calisir)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: SQL migration yazma — tek dosya, net spesifikasyon, test edilebilir
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: NO (sequential)
  - **Parallel Group**: Wave 1 (sequential foundation)
  - **Blocks**: Task 2 (RLS), Task 13 (FAZ 4 test)
  - **Blocked By**: None

  **References**:
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql` — existing blitz migration pattern (enum, table, trigger, RLS, realtime)
  - `src/hooks/useBlitzRoom.ts:BlitzRoom` — interface for columns to include/exclude
  - `src/hooks/useAnaSahne.ts` (Task 4) — this migration provides the data source for this hook

  **Acceptance Criteria**:
  - [ ] `supabase db push --dry-run` → 0 errors, expected changes listed
  - [ ] `supabase db push` → success
  - [ ] `curl -H "apikey: $SERVICE_KEY" "$SUPABASE_URL/rest/v1/ana_sahne_view?select=*"` → 200, no PII columns
  - [ ] `curl -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/ana_sahne_view?select=*"` → 200 (anon can read view)
  - [ ] `blitz_rooms` has `is_featured` column

  **QA Scenarios**:
  ```
  Scenario: Migration applies cleanly
    Tool: Bash (supabase)
    Preconditions: Supabase local/dev instance running
    Steps:
      1. supabase db push --dry-run → assert exit code 0
      2. supabase db push → assert success
      3. supabase db diff --schema public | grep -c "ana_sahne_view" → assert >= 1
    Expected Result: Migration applies without errors
    Evidence: .omo/evidence/task-01-migration-dry-run.txt

  Scenario: View returns correct data
    Tool: Bash (curl)
    Preconditions: At least one blitz_room with status='active' exists
    Steps:
      1. curl -s -H "apikey: $SERVICE_KEY" "$SUPABASE_URL/rest/v1/ana_sahne_view?select=*" | jq 'length'
      2. For each column in response: assert NOT in banned list (user_id, winner_id, created_by, invite_code, final_balance)
    Expected Result: View returns data without PII columns
    Evidence: .omo/evidence/task-01-view-data.json

  Scenario: FAZ 4 trigger fires
    Tool: Bash (supabase + curl)
    Preconditions: Active room with participants and orders exists
    Steps:
      1. UPDATE blitz_rooms SET status='finished', winner_id='<valid-uuid>' WHERE id='<room-id>'
      2. curl -s $SUPABASE_URL/rest/v1/platform_revenue?select=amount,source | jq '.[0].source == "blitz"'
      3. curl -s $SUPABASE_URL/rest/v1/profiles?id=eq.<winner-id>&select=real_balance | jq '.[0].real_balance'
    Expected Result: platform_revenue kaydi olusur, winner real_balance artar
    Evidence: .omo/evidence/task-01-trigger-verify.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-01-migration-dry-run.txt`
  - [ ] `task-01-view-data.json`
  - [ ] `task-01-trigger-verify.txt`

  **Commit**: YES (groups with T2)
  - Message: `feat(ana-sahne): add migration for ana_sahne_view, FAZ 4 trigger, pick_featured_room`
  - Files: `supabase/migrations/*ana_sahne.sql`
  - Pre-commit: `supabase db push --dry-run`

- [x] 2. **RLS policies for ana_sahne_view**

  **What to do**:
  - Append to the same migration file (Task 1) OR create separate migration if preferred:
  - RLS on `ana_sahne_view`:
    - `GRANT SELECT ON public.ana_sahne_view TO anon;` (view zaten SECURITY DEFINER, bu grant erisim icin gerekli)
    - `GRANT SELECT ON public.ana_sahne_view TO authenticated;`
  - Verify existing RLS on base tables:
    - `blitz_rooms`: mevcut `"Authenticated can read rooms"` anon icin calismaz (authenticated only) ✅
    - Anon'un base tablolara erisimi OLMAMALI — sadece view uzerinden
  - **NOT**: `public_profiles` RLS politikalari DEGISMEYECEK. Mevcut `pp_select_active` zaten anon dahil tum aktif profilleri gostermeye izin veriyor. Ana Sahne view'i bu policy uzerinden calisacak.

  **Must NOT do**:
  - `public_profiles` politikalari degistirme
  - `blitz_rooms`'a anon SELECT grant ekleme
  - `has_role()` fonksiyonunu RLS'de kullanma (anon cagiramaz)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: RLS guvenlik dogrulama kritik, yanlis policy data leak'ine yol acabilir
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 migration)
  - **Parallel Group**: Wave 1 (sequential)
  - **Blocks**: Task 4 (useAnaSahne hook — hook view'den veri ceker)
  - **Blocked By**: Task 1

  **References**:
  - `supabase/migrations/20260417111010_61686f6f-6da7-4833-b75b-551605c69c53.sql` — existing RLS patterns (public_profiles policy)
  - `supabase/migrations/20260505061855_4a6bebd8-7116-4e0c-b349-d0e7c1a8c45d.sql` — has_role EXECUTE restriction
  - `supabase/migrations/20260605073107_f43eda95-c7ea-4b12-afc8-6fe73bfcffda.sql` — existing view RLS pattern

  **Acceptance Criteria**:
  - [ ] `curl -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/ana_sahne_view?select=*"` → 200, data returned
  - [ ] `curl -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/blitz_rooms?select=id"` → 401 (or 200 empty)
  - [ ] `curl -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/blitz_participants?select=room_id"` → 401 (or 200 empty)
  - [ ] `curl -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/blitz_orders?select=id"` → 401 (or 200 empty)

  **QA Scenarios**:
  ```
  Scenario: Anon can read view but NOT base tables
    Tool: Bash (curl)
    Preconditions: Migration from Task 1 applied
    Steps:
      1. curl -s -o /dev/null -w "%{http_code}" -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/ana_sahne_view?select=*" → assert 200
      2. curl -s -o /dev/null -w "%{http_code}" -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/blitz_rooms?select=id" → assert 401 (veya 200 ama bos)
      3. curl -s -o /dev/null -w "%{http_code}" -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/blitz_participants?select=room_id" → assert 401 (veya 200 ama bos)
    Expected Result: View accessible, base tables inaccessible to anon
    Evidence: .omo/evidence/task-02-rls-verify.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-02-rls-verify.txt`

  **Commit**: YES (groups with T1)
  - Message: `feat(ana-sahne): add RLS policies for anon view access`
  - Files: (same migration file)
  - Pre-commit: (same as T1)

- [x] 3. **Feature flag: `.env.example` + `VITE_ANA_SAHNE_ENABLED` + type**

  **What to do**:
  - Create `.env.example` at project root:
    ```
    VITE_SUPABASE_URL=your_supabase_url
    VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
    VITE_ANA_SAHNE_ENABLED=true
    ```
  - Add `VITE_ANA_SAHNE_ENABLED` to `src/vite-env.d.ts`:
    ```typescript
    /// <reference types="vite/client" />
    interface ImportMetaEnv {
      readonly VITE_SUPABASE_URL: string;
      readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
      readonly VITE_ANA_SAHNE_ENABLED?: string;
    }
    interface ImportMeta {
      readonly env: ImportMetaEnv;
    }
    ```
  - **NOT**: Mevcut `.env` dosyasina DOKUNMA. Yalnizca `.env.example` olustur.
  - **NOT**: `vite.config.ts`'de env tanimi gerekmez (VITE_ prefix otomatik handle eder)

  **Must NOT do**:
  - Mevcut `.env` dosyasini okuma, degistirme veya silme
  - `.env.example`'a gerkli olmayan dummy ekleme (yalnizca gercek VITE_ env'ler)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Trivial file creation
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent of T1/T2)
  - **Parallel Group**: Wave 1 (with T1, T2)
  - **Blocks**: Task 11 (Index.tsx integration)
  - **Blocked By**: None

  **References**:
  - `src/vite-env.d.ts` (mevcut durumda env type tanimi yok, eklenmeli)
  - Vite docs: `https://vite.dev/guide/env-and-mode.html`

  **Acceptance Criteria**:
  - [ ] `.env.example` created at project root
  - [ ] `src/vite-env.d.ts` updated with `ImportMetaEnv` interface
  - [ ] `import.meta.env.VITE_ANA_SAHNE_ENABLED` resolves as `string | undefined` in TypeScript

  **QA Scenarios**:
  ```
  Scenario: Feature flag type is available
    Tool: Bash (tsc)
    Preconditions: .env.example and vite-env.d.ts created
    Steps:
      1. tsc --noEmit src/vite-env.d.ts → assert 0 errors
      2. echo 'const x: string | undefined = import.meta.env.VITE_ANA_SAHNE_ENABLED' | tsc --noEmit --strict --lib es2020,dom → assert compiles
    Expected Result: Type system recognizes VITE_ANA_SAHNE_ENABLED
    Evidence: .omo/evidence/task-03-flag-type-verify.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-03-flag-type-verify.txt`

  **Commit**: YES (groups with T1/T2)
  - Message: `chore: add .env.example and VITE_ANA_SAHNE_ENABLED type`
  - Files: `.env.example src/vite-env.d.ts`
  - Pre-commit: `tsc --noEmit`

- [x] 4. **useAnaSahne hook**

  **What to do**:
  - Create `src/hooks/useAnaSahne.ts`:
  - Return type:
    ```typescript
    interface AnaSahneState {
      room: BlitzRoom | null;
      participants: Array<{
        user_id: string;
        username: string;
        side: 'long' | 'short' | null;
        pnl: number;
        pnlPct: number;
      }>;
      timeLeft: number | null;
      viewers: number;
      isLoading: boolean;
      isFinished: boolean;
      error: string | null;
    }
    ```
  - Fetch logic:
    1. `supabase.from('ana_sahne_view').select('*').single()` → mevcut featured room
    2. Katilimci bilgilerini view'den parse et
    3. `timeLeft = starts_at + 60s - now` (250ms interval ile guncelle)
  - Realtime:
    - `supabase.channel('ana-sahne')` ile `postgres_changes` on `ana_sahne_view`
    - `presence.track({ user_id: 'anonymous' })` for viewer counting
    - `presence.on('sync', () => { setViewers(presenceState.count) })`
  - Cleanup:
    - `useEffect` return'de: `supabase.removeChannel(ch)`, `cancelled = true`
  - Loading/error states:
    - `isLoading` → true on mount, false after first fetch
    - `error` → catch Supabase errors
    - `isFinished` → `room?.status === 'finished'` (3s gecikmeli transition icin)

  **Must NOT do**:
  - Profilleri `profiles` tablosundan cekme (her zaman `public_profiles` kullan)
  - View'de olmayan kolonlari query'de isteme
  - Presence'ta kullanici kimligi gibi PII gonder

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Realtime subscription + Presence + cleanup pattern'i dikkatli implementasyon gerektirir. Hatali cleanup memory leak'e yol acar.
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 migration + Task 2 RLS)
  - **Parallel Group**: Wave 1 (sequential)
  - **Blocks**: Task 6-10 (Ana Sahne components)
  - **Blocked By**: Tasks 1, 2

  **References**:
  - `src/hooks/useBlitzRoom.ts` — existing realtime subscription pattern (useEffect with cleanup, cancelled flag, postgres_changes)
  - Supabase Presence docs: `https://supabase.com/docs/guides/realtime/presence`
  - `src/pages/BlitzRoom.tsx` — existing timer pattern (250ms interval)
  - `src/hooks/useBlitzRoom.ts` — BlitzRoom interface for type alignment (NOT: `src/types/blitz.ts` mevcut degil)

  **Acceptance Criteria**:
  - [ ] `src/hooks/useAnaSahne.ts` created
  - [ ] Hook returns correct interface with all fields
  - [ ] Loading state: returns true initially, false after data arrives
  - [ ] Realtime: view updates when blitz_rooms changes
  - [ ] Presence: track() called on mount, untrack() on unmount
  - [ ] Cleanup: removeChannel called on unmount
  - [ ] `bun test` → PASS
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios**:
  ```
  Scenario: Hook returns correct initial state
    Tool: Bash (vitest)
    Preconditions: Test file created at src/hooks/__tests__/useAnaSahne.test.ts
    Steps:
      1. Mock supabase.from('ana_sahne_view').select().single() returns null
      2. Mock supabase.channel() returns mock channel
      3. renderHook(() => useAnaSahne())
      4. Assert: result.current.isLoading === true
      5. Assert: result.current.room === null
      6. Assert: result.current.error === null
    Expected Result: Initial state is loading with no data
    Evidence: .omo/evidence/task-04-hook-initial.txt

  Scenario: Presence track/untrack lifecycle
    Tool: Bash (vitest)
    Preconditions: Same test setup
    Steps:
      1. renderHook(() => useAnaSahne())
      2. Assert: mockChannel.track was called with { user_id: 'anonymous' }
      3. unmount()
      4. Assert: supabase.removeChannel was called with mockChannel
    Expected Result: Presence is tracked on mount, cleaned up on unmount
    Evidence: .omo/evidence/task-04-hook-presence.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-04-hook-initial.txt`
  - [ ] `task-04-hook-presence.txt`
  - [ ] `task-04-hook-realtime.txt`
  - [ ] `task-04-hook-finished.txt`

  **Commit**: YES (groups with T1/T2/T3)
  - Message: `feat(ana-sahne): add useAnaSahne hook with Presence integration`
  - Files: `src/hooks/useAnaSahne.ts src/hooks/__tests__/useAnaSahne.test.ts`
  - Pre-commit: `bun test src/hooks/__tests__/useAnaSahne.test.ts && tsc --noEmit`



- [x] 6. **PlayerCard component**

  **What to do**:
  - Create `src/components/AnaSahne/PlayerCard.tsx`
  - Props: `{ username: string; side: 'long' | 'short' | null; pnl: number; pnlPct: number; isWinner: boolean; index: number }`
  - Display:
    - Rank badge (1st/2nd) with color coding
    - Username (truncated at 12 chars)
    - Side indicator: LONG = green up arrow, SHORT = red down arrow
    - PnL: green/red text with +/- prefix
    - PnL% in smaller text below
    - Glass card styling (follow existing pattern: `rounded-2xl glass border border-border/40`)
  - Animation: Framer Motion `motion.div` with `initial={{ opacity: 0, y: 8 }}` `animate={{ opacity: 1, y: 0 }}`
  - Follow existing BlitzRoom.tsx leaderboard pattern (colors, layout, typography)

  **Must NOT do**:
  - Add click handlers or navigation
  - Show PII (no user_id, no email, no balance)
  - Add any write operations

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with glass card styling, Framer Motion animations, color-coded PnL display
  - **Skills**: `/frontend-ui-ux` for glass card pattern matching

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 7, 8, 9, 10)
  - **Blocks**: Task 11 (Index integration)
  - **Blocked By**: None (no deps, uses only props)

  **References**:
  - `src/pages/BlitzRoom.tsx:288-332` — existing leaderboard card pattern (colors, layout, Framer Motion)
  - `src/components/ui/card.tsx` — Card + glass styling pattern
  - `src/lib/utils.ts:cn()` — class merging utility

  **Acceptance Criteria**:
  - [ ] `src/components/AnaSahne/PlayerCard.tsx` created
  - [ ] Component renders username, side indicator, PnL with correct colors
  - [ ] `pnl > 0` → green text, `pnl < 0` → red text
  - [ ] `side === 'long'` → green up arrow, `side === 'short'` → red down arrow
  - [ ] Framer Motion animation applied on mount
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios**:
  ```
  Scenario: PlayerCard renders correctly for winning player
    Tool: Playwright (component test)
    Preconditions: None
    Steps:
      1. Render <PlayerCard username="Alice" side="long" pnl={25.50} pnlPct={12.75} isWinner={true} index={0} />
      2. Assert: username "Alice" visible
      3. Assert: "↑" or green arrow visible (long side)
      4. Assert: "+$25.50" visible in green
      5. Assert: "+12.75%" visible
    Expected Result: Card shows all player info with correct colors
    Evidence: .omo/evidence/task-06-playercard-winner.txt

  Scenario: PlayerCard renders for losing player
    Tool: Playwright
    Preconditions: None
    Steps:
      1. Render <PlayerCard username="Bob" side="short" pnl={-10.00} pnlPct={-5.0} isWinner={false} index={1} />
      2. Assert: "↓" or red arrow visible (short side)
      3. Assert: "-$10.00" visible in red
    Expected Result: Card shows red PnL and down arrow
    Evidence: .omo/evidence/task-06-playercard-loser.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-06-playercard-winner.txt`
  - [ ] `task-06-playercard-loser.txt`

  **Commit**: NO (groups with T9)

- [x] 7. **CountdownCircle component**

  **What to do**:
  - Create `src/components/AnaSahne/CountdownCircle.tsx`
  - Props: `{ timeLeft: number | null; isActive: boolean; size?: number }`
  - SVG circle with `stroke-dashoffset` animation:
    - Full circle = 60s, shrinking as time decreases
    - Color: green (>30s), yellow (10-30s), red (<10s)
    - Center shows remaining time as `0:ss`
  - When `isActive=false`: show "—:—" in center, gray circle
  - When `timeLeft=null`: show spinning animation (loading state)
  - Size prop defaults to 120px

  **Must NOT do**:
  - Use Framer Motion for the circle animation (pure SVG/CSS transition for performance)
  - Add any interactive elements

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: SVG animation with stroke-dashoffset, color transitions, responsive sizing
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 8, 9, 10)
  - **Blocks**: Task 11
  - **Blocked By**: None

  **References**:
  - `src/pages/BlitzRoom.tsx:198-212` — existing timer pattern (Framer Motion countdown)
  - SVG stroke-dashoffset pattern: circle circumference = 2 * PI * r, animate stroke-dashoffset from 0 to circumference

  **Acceptance Criteria**:
  - [ ] `src/components/AnaSahne/CountdownCircle.tsx` created
  - [ ] SVG circle renders with correct size
  - [ ] `timeLeft=60` → full circle, green color
  - [ ] `timeLeft=30` → half circle, yellow color
  - [ ] `timeLeft=5` → minimal arc, red color
  - [ ] Center text shows correct time format
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios**:
  ```
  Scenario: CountdownCircle shows correct time and arc
    Tool: Playwright
    Preconditions: None
    Steps:
      1. Render <CountdownCircle timeLeft={45} isActive={true} />
      2. Assert: center text shows "0:45"
      3. Assert: SVG circle stroke color is green (not red/yellow)
      4. Render <CountdownCircle timeLeft={5} isActive={true} />
      5. Assert: center text shows "0:05"
      6. Assert: SVG circle stroke color is red
    Expected Result: Timer display matches timeLeft value with correct color
    Evidence: .omo/evidence/task-07-countdown-colors.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-07-countdown-colors.txt`

  **Commit**: NO (groups with T9)

- [x] 8. **EmptyArena + FinishedBanner components**

  **What to do**:
  - Create `src/components/AnaSahne/EmptyArena.tsx`:
    - Props: `{ message?: string }`
    - Displayed when no featured room is active
    - Centered text: "Şu anda canlı maç yok" / "No live matches right now"
    - Subtle pulse animation (CSS, not Framer Motion)
    - Default message prop handles i18n from parent
  - Create `src/components/AnaSahne/FinishedBanner.tsx`:
    - Props: `{ winner: string | null; pot: number; onComplete: () => void }`
    - Displayed for 3 seconds after room finishes
    - CSS `opacity` fade out over 3s
    - Shows: "🏆 {winner} kazandı! / {winner} won!" + prize amount
    - After 3s, calls `onComplete()` which triggers EmptyArena transition
    - **NOT**: Framer Motion (use CSS transition per spec)

  **Must NOT do**:
  - Add Framer Motion to FinishedBanner (spec says CSS opacity fade)
  - Add interactive elements (no buttons)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI components with CSS animation, responsive layout
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 9, 10)
  - **Blocks**: Task 11
  - **Blocked By**: None

  **References**:
  - `src/pages/BlitzRoom.tsx:339-380` — existing result modal pattern (winner display, prize display)
  - `src/components/ui/card.tsx` — glass card pattern

  **Acceptance Criteria**:
  - [ ] `src/components/AnaSahne/EmptyArena.tsx` created
  - [ ] `src/components/AnaSahne/FinishedBanner.tsx` created
  - [ ] EmptyArena shows with default message
  - [ ] FinishedBanner shows winner + pot, fades out after 3s
  - [ ] FinishedBanner calls onComplete after fade
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios**:
  ```
  Scenario: EmptyArena displays when no match
    Tool: Playwright
    Preconditions: None
    Steps:
      1. Render <EmptyArena />
      2. Assert: message text is visible
      3. Assert: pulse animation class is applied
    Expected Result: Empty state renders with animation
    Evidence: .omo/evidence/task-08-empty-arena.txt

  Scenario: FinishedBanner fades out after 3s
    Tool: Playwright
    Preconditions: None
    Steps:
      1. Render <FinishedBanner winner="Alice" pot={100} onComplete={() => console.log('done')} />
      2. Assert: "Alice" and "$100" visible
      3. Wait 3500ms
      4. Assert: element opacity is 0 (or hidden)
    Expected Result: Banner shows winner info then fades
    Evidence: .omo/evidence/task-08-finished-banner.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-08-empty-arena.txt`
  - [ ] `task-08-finished-banner.txt`

  **Commit**: NO (groups with T9)

- [x] 9. **AnaSahne.tsx parent orchestrator component**

  **What to do**:
  - Create `src/components/AnaSahne/AnaSahne.tsx`
  - Props: `{ room: AnaSahneState['room']; participants: AnaSahneState['participants']; timeLeft: number | null; viewers: number; isLoading: boolean; isFinished: boolean; error: string | null }`
  - Composition:
    - Loading state: Skeleton cards (use `<Skeleton>` from `src/components/ui/skeleton.tsx`)
    - Error state: EmptyArena with error message
    - Empty state (no room): EmptyArena
    - Active state: Grid layout with CountdownCircle + PlayerCards
    - Finished state: FinishedBanner on top, then EmptyArena after 3s
  - Layout:
    - Desktop: horizontal layout — CountdownCircle left, PlayerCards right
    - Mobile: vertical layout
    - Section header: "🔴 CANLI" badge + viewer count + room info (symbol, entry fee)
  - State machine: `loading → active → finished → empty` (transition managed inside)

  **Must NOT do**:
  - Handle any user interaction (navigation, authentication)
  - Fetch data directly (all data comes from parent via props)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: State management for 4-state machine, responsive layout, skeleton loading
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 10)
  - **Blocks**: Task 11
  - **Blocked By**: None (props interface known from Task 4 hook)

  **References**:
  - `src/components/ui/skeleton.tsx` — Skeleton component pattern
  - `src/pages/BlitzRoom.tsx:179-382` — existing room display layout pattern
  - `src/hooks/useAnaSahne.ts` — AnaSahneState interface (Task 4)

  **Acceptance Criteria**:
  - [ ] `src/components/AnaSahne/AnaSahne.tsx` created
  - [ ] Loading state: shows Skeletons
  - [ ] Error state: shows EmptyArena
  - [ ] Active state: shows CountdownCircle + PlayerCards + viewer count
  - [ ] Finished state: shows FinishedBanner then transition to EmptyArena
  - [ ] Desktop layout: horizontal; Mobile layout: vertical
  - [ ] Viewer count badge visible
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios**:
  ```
  Scenario: AnaSahne renders all states correctly
    Tool: Playwright
    Preconditions: None
    Steps:
      1. Render with { isLoading: true } → assert Skeleton visible
      2. Render with { error: "error" } → assert EmptyArena visible
      3. Render with { room: mockRoom, participants: [...], timeLeft: 30, viewers: 5, isLoading: false, isFinished: false }
         → assert CountdownCircle visible with 0:30
         → assert PlayerCard(s) visible
         → assert "5" viewer count visible
         → assert "🔴 CANLI" badge visible
      4. Render with { isFinished: true } → assert FinishedBanner visible initially
    Expected Result: All 4 states render correctly
    Evidence: .omo/evidence/task-09-anasahne-states.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-09-anasahne-states.txt`

  **Commit**: YES (groups with T7, T8, T9)
  - Message: `feat(ana-sahne): add Core UI components (PlayerCard, CountdownCircle, EmptyArena, FinishedBanner, AnaSahne)`
  - Files: `src/components/AnaSahne/*.tsx`
  - Pre-commit: `bun test && tsc --noEmit`

- [x] 10. **AnaSahne index.ts barrel export**

  **What to do**:
  - Create `src/components/AnaSahne/index.ts`
  - Export all components: `AnaSahne`, `PlayerCard`, `CountdownCircle`, `EmptyArena`, `FinishedBanner`

  **Must NOT do**:
  - Add any logic, only re-exports

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Trivial barrel export file
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 6, 7, 8, 9)
  - **Blocks**: Task 11
  - **Blocked By**: None

  **References**:
  - Barrel export pattern: standard `export { default as X } from './X'` format

  **Acceptance Criteria**:
  - [ ] `src/components/AnaSahne/index.ts` created
  - [ ] All 5 components exported
  - [ ] `import { AnaSahne } from '@/components/AnaSahne'` works

  **QA Scenarios**:
  ```
  Scenario: Barrel export resolves
    Tool: Bash (tsc)
    Preconditions: All AnaSahne components exist
    Steps:
      1. tsc --noEmit src/components/AnaSahne/index.ts → assert 0 errors
    Expected Result: All exports resolve correctly
    Evidence: .omo/evidence/task-10-barrel.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-10-barrel.txt`

  **Commit**: NO (groups with T9)

- [x] 11. **Index.tsx + i18n integration**

  **What to do**:
  - Update `src/pages/Index.tsx`:
    - `import { AnaSahne } from '@/components/AnaSahne'`
    - `import { useAnaSahne } from '@/hooks/useAnaSahne'`
    - Inside `{!user && ...}` hero section, INSERT `<AnaSahne />` ABOVE the hero content:
      ```tsx
      {!user && (
        <AppShell>
          {import.meta.env.VITE_ANA_SAHNE_ENABLED === 'true' && <AnaSahneSection />}
          <section className="px-6 py-20 ..."> // existing hero
        </AppShell>
      )}
      ```
    - `AnaSahneSection` is a thin wrapper that calls `useAnaSahne()` and passes data to `<AnaSahne>`
    - The existing hero/CTA section remains UNCHANGED below Ana Sahne
  - Update `src/lib/i18n.ts`:
    - Add new keys in both `tr` and `en`:
      ```typescript
      // ana sahne
      live_now: "CANLI",          // tr: "CANLI", en: "LIVE"
      viewers: "izleyici",        // tr: "izleyici", en: "viewers"
      no_live_match: "Şu anda canlı maç yok",  // en: "No live matches right now"
      match_finished: "Maç bitti", // en: "Match finished"
      won_match: "kazandı",       // en: "won"
      prize_pool: "Ödül",         // en: "Prize"
      watching: "izliyor",        // en: "watching"
      player: "Oyuncu",           // en: "Player"
      ```
  - Add `formatViewerCount(n: number)` helper to `src/lib/i18n.ts` or inline (1K/2.5K format)

  **Must NOT do**:
  - Remove or replace existing hero section content
  - Move Index.tsx to use React Router's `dynamic()` or lazy loading for Ana Sahne (it's a small component)
  - Add new pages or routes

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple file changes, i18n integration, feature flag gating — coordination required
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Wave 2 Ana Sahne components)
  - **Parallel Group**: Wave 3 (with 12, 13, 14)
  - **Blocks**: F1-F4 verification
  - **Blocked By**: Tasks 3 (feature flag), 6-10 (Ana Sahne components)

  **References**:
  - `src/pages/Index.tsx` — existing hero section structure (lines 31-68)
  - `src/lib/i18n.ts` — existing key format (flat object, nested categories by comments)
  - `src/contexts/AppContext.tsx` — `lang` state access pattern

  **Acceptance Criteria**:
  - [ ] Index.tsx imports AnaSahne and useAnaSahne
  - [ ] `VITE_ANA_SAHNE_ENABLED=true` → Ana Sahne renders above hero
  - [ ] `VITE_ANA_SAHNE_ENABLED=false` → Ana Sahne NOT rendered
  - [ ] i18n keys added for tr AND en
  - [ ] Viewer count displays correctly
  - [ ] Existing hero section unchanged
  - [ ] `bun test` → PASS
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios**:
  ```
  Scenario: Ana Sahne renders when enabled
    Tool: Playwright
    Preconditions: VITE_ANA_SAHNE_ENABLED=true, build with this flag
    Steps:
      1. Navigate to /
      2. Assert: "CANLI" or "LIVE" badge visible (depends on lang)
      3. Assert: hero CTA buttons still visible below Ana Sahne
    Expected Result: Ana Sahne section visible above hero on homepage
    Evidence: .omo/evidence/task-11-index-anasahne-visible.png

  Scenario: Ana Sahne hidden when disabled
    Tool: Playwright
    Preconditions: VITE_ANA_SAHNE_ENABLED=false, build with this flag
    Steps:
      1. Navigate to /
      2. Assert: "CANLI" badge NOT visible
      3. Assert: hero section renders normally
    Expected Result: No Ana Sahne when feature flag is off
    Evidence: .omo/evidence/task-11-index-flag-off.txt

  Scenario: i18n keys resolve correctly
    Tool: Bash (bun)
    Preconditions: i18n.ts updated
    Steps:
      1. bun -e "import {t} from './src/lib/i18n'; const tr=t('tr'); console.log(tr.live_now, tr.viewers)"
      2. bun -e "import {t} from './src/lib/i18n'; const en=t('en'); console.log(en.live_now, en.viewers)"
    Expected Result: Turkish and English keys print without undefined
    Evidence: .omo/evidence/task-11-i18n-keys.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-11-index-anasahne-visible.png`
  - [ ] `task-11-index-flag-off.txt`
  - [ ] `task-11-i18n-keys.txt`

  **Commit**: YES
  - Message: `feat(ana-sahne): integrate Ana Sahne into Index.tsx with i18n`
  - Files: `src/pages/Index.tsx src/lib/i18n.ts`
  - Pre-commit: `bun test && tsc --noEmit`

- [x] 12. **Blitz sub-component barrel export + index documentation**

  **What to do**:
  - Create `src/components/blitz/index.ts` (if not created in Task 5):
    - Export: `BlitzTimer`, `TradeActions`, `BlitzLeaderboard`
  - Ensure `src/pages/BlitzRoom.tsx` imports from `@/components/blitz`

  **Must NOT do**:
  - Add new logic or features

  **Recommended Agent Profile**:
  - **Category**: `writing`
    - Reason: Barrel export creation + ensuring clean imports
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: YES (independent)
  - **Parallel Group**: Wave 3 (with Tasks 11, 13, 14)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 5

  **References**:
  - `src/components/AnaSahne/index.ts` (Task 10) — barrel export pattern

  **Acceptance Criteria**:
  - [ ] `src/components/blitz/index.ts` created with all exports
  - [ ] `src/pages/BlitzRoom.tsx` imports from barrel
  - [ ] `tsc --noEmit` → 0 errors

  **QA Scenarios**:
  ```
  Scenario: Barrel export resolves
    Tool: Bash (tsc)
    Preconditions: All blitz sub-components exist
    Steps:
      1. tsc --noEmit src/components/blitz/index.ts → assert 0 errors
      2. grep "from '@/components/blitz'" src/pages/BlitzRoom.tsx → assert found
    Expected Result: Barrel export works, BlitzRoom uses it
    Evidence: .omo/evidence/task-12-blitz-barrel.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-12-blitz-barrel.txt`

  **Commit**: YES (with T5)
  - Message: included in T5 commit
  - Files: `src/components/blitz/index.ts`
  - Pre-commit: `tsc --noEmit`

- [x] 13. **FAZ 4 PostgreSQL trigger testing + verification**

  **What to do**:
  - NOT: creating new trigger (already in Task 1 migration)
  - Verification tests:
    1. Write integration test script that:
       - Creates test room with 2 participants
       - Opens orders for both
       - Updates room `status = 'finished'` with a `winner_id`
       - Asserts: `platform_revenue` has new row with correct `amount = fee_collected`
       - Asserts: `profiles.real_balance` for winner increased by `(pot - fee_collected)`
       - Asserts: no changes to existing `guard_profiles_financial_update` trigger behavior
    2. Write edge case tests:
       - Tie case (`winner_id = null`): fee still collected, nobody gets prize
       - Trigger idempotency: updating `status = 'finished'` twice doesn't double-pay
       - Concurrent finish: non-service_role caller cannot trigger (RLS blocks)

  **Must NOT do**:
  - Modify the trigger itself (testing only)
  - Create new Edge Functions

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration test script against Supabase, edge case verification
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1 migration having trigger)
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 14)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:
  - `supabase/migrations/20260609065635_331de86c-cdad-4b77-ae7f-0f520999227c.sql` — platform_revenue table
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql` — blitz tables + existing RLS
  - `supabase/migrations/20260505070823_8924cb41-3e3e-4850-a722-9f24fa9bd0ad.sql` — guard_profiles_financial_update trigger

  **Acceptance Criteria**:
  - [ ] Test script verifies correct balance update
  - [ ] Test script verifies platform_revenue recording
  - [ ] Test script verifies tie case
  - [ ] Test script verifies idempotency
  - [ ] All tests pass

  **QA Scenarios**:
  ```
  Scenario: FAZ 4 trigger pays winner correctly
    Tool: Bash (supabase + curl)
    Preconditions: Migration applied, test room available
    Steps:
      1. Run test script: bash .omo/scripts/test-faz4-trigger.sh
      2. Assert: exit code 0
      3. Assert: output contains "Winner paid: OK"
      4. Assert: output contains "Platform revenue recorded: OK"
      5. Assert: output contains "Tie case: OK"
      6. Assert: output contains "Idempotency: OK"
    Expected Result: All FAZ 4 trigger tests pass
    Evidence: .omo/evidence/task-13-faz4-trigger.txt

  Scenario: guard_profiles_financial_update still blocks non-service caller
    Tool: Bash (curl)
    Preconditions: Authenticated user session
    Steps:
      1. curl -X PATCH -H "Authorization: Bearer $USER_TOKEN" "$SUPABASE_URL/rest/v1/profiles?id=eq.$UID" -H "Content-Type: application/json" -d '{"real_balance": 999999}'
      2. Assert: HTTP 401 or 403 (not 200)
    Expected Result: Guard trigger still protects balance fields
    Evidence: .omo/evidence/task-13-guard-still-works.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-13-faz4-trigger.txt`
  - [ ] `task-13-guard-still-works.txt`

  **Commit**: YES
  - Message: `test(faz4): add integration tests for payout trigger`
  - Files: `.omo/scripts/test-faz4-trigger.sh`
  - Pre-commit: `bash .omo/scripts/test-faz4-trigger.sh`

- [x] 14. **Waiting room timeout cleanup mechanism**

  **What to do**:
  - Add a cleanup mechanism for `blitz_rooms` with `status = 'waiting'` that never get a second player:
  - Option A (recommended): Add a cron-like function that cancels rooms older than N minutes
    - Create `public.cleanup_stale_rooms()` SECURITY DEFINER function:
      ```sql
      UPDATE public.blitz_rooms
      SET status = 'cancelled'
      WHERE status = 'waiting'
        AND created_at < now() - interval '30 minutes';
      ```
    - This can be called by the existing `blitz-settler-10s` cron (modify to add this call) OR a new cron
  - **Decision**: Add to `blitz-settle-room` Edge Function's existing cron → modify `blitz-settler-10s` to also call this cleanup (in addition to room settlement)
  - Actually: Keep it SIMPLE. Edge Function call every 10s already runs. Add the cleanup SQL as a function called by cron, or run via the existing `blitz-settler-10s` by adding a cleanup endpoint.
  - **Simplest approach**: Add a Supabase pg_cron job that runs every 5 minutes:
    ```sql
    SELECT cron.schedule('blitz-cleanup-stale', '*/5 * * * *', $$UPDATE public.blitz_rooms SET status = 'cancelled', updated_at = now() WHERE status = 'waiting' AND created_at < now() - interval '30 minutes'$$);
    ```

  **Must NOT do**:
  - Create new Redis keys for cleanup tracking
  - Modify existing blitz Edge Functions logic
  - Cancel rooms that just started waiting (< 30 minutes old)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Cron integration with existing pg_cron, must not break existing schedules
  - **Skills**: none

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on understanding existing cron setup from Task 1)
  - **Parallel Group**: Wave 3 (with Tasks 11, 12, 13)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1

  **References**:
  - `supabase/migrations/20260605072952_43e4b19f-5974-471e-ae4b-c494fedc12ed.sql` — existing cron pattern (cron.schedule with pg_net)
  - `supabase/migrations/20260609063751_a7fad7a7-1fe5-4328-823b-5b95ddfe7f8d.sql` — blitz-settler-10s cron pattern
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql` — blitz_rooms status enum values

  **Acceptance Criteria**:
  - [ ] New migration file creates cron job
  - [ ] `supabase db push --dry-run` → 0 errors
  - [ ] `SELECT * FROM cron.job WHERE jobname = 'blitz-cleanup-stale'` → exists after migration
  - [ ] Room with `created_at < now() - 30 minutes` and `status = 'waiting'` gets cancelled

  **QA Scenarios**:
  ```
  Scenario: Stale waiting room gets cleaned up
    Tool: Bash (supabase SQL)
    Preconditions: Migration applied, at least one stale waiting room exists
    Steps:
      1. supabase sql "UPDATE blitz_rooms SET created_at = '2024-01-01' WHERE status = 'waiting' LIMIT 1"
      2. supabase sql "SELECT cron.schedule('test-cleanup','* * * * *', $$UPDATE blitz_rooms SET status = 'cancelled' WHERE status = 'waiting' AND created_at < now() - interval '30 minutes'$$)"
      3. Wait 70s for cron to fire
      4. supabase sql "SELECT COUNT(*) FROM blitz_rooms WHERE status = 'waiting' AND created_at < '2024-01-02'" → assert 0
    Expected Result: Stale rooms are cancelled
    Evidence: .omo/evidence/task-14-stale-cleanup.txt
  ```

  **Evidence to Capture**:
  - [ ] `task-14-stale-cleanup.txt`

  **Commit**: YES
  - Message: `feat(blitz): add waiting room timeout cleanup via pg_cron`
  - Files: `supabase/migrations/*cleanup.sql`
  - Pre-commit: `supabase db push --dry-run`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `bun test`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `feat(ana-sahne): add migration, RLS, feature flag, useAnaSahne hook`
- **Wave 2**: `feat(ana-sahne): add UI components (PlayerCard, CountdownCircle, EmptyArena, FinishedBanner, AnaSahne)`
- **Wave 3**: `refactor(blitz): extract BlitzRoom sub-components` (Task 5)
- **Wave 3**: `feat(ana-sahne): integrate Index + i18n, verify FAZ 4, add waiting room cleanup`
- **Final**: `chore: post-implementation cleanup`

---

## Success Criteria

### Verification Commands
```bash
curl -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/ana_sahne_view?select=*"  # 200, PII yok
curl -H "apikey: $ANON_KEY" "$SUPABASE_URL/rest/v1/blitz_rooms?select=id"    # 401 (anon erisemez)
bun test                 # PASS
tsc --noEmit             # 0 errors
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Oracle Phase 2/3 passed
- [ ] Momus OKAY (if high accuracy mode)
