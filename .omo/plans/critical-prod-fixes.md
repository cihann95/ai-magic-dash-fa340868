# Kritik Production Sorunları Düzeltme Planı

## TL;DR

> **Özet**: Canlıdaki platformda 4 kritik sorun düzeltilecek: (1) Blitz butonları çalışmıyor (real_balance=0 + sessiz catch + Redis fail-open + cancel bakiye leak), (2) bakiye yükleme akışı karmaşık (Settings'te balance yok, admin top-up UUID manuel, dual settlement), (3) admin yetkileri kısıtlı (reset-demo-account kırık, RLS admin override az, admin sayfaları/yetkileri eksik), (4) AI Trade Coach bildirim kâr oranı yanlış (trade-mirror AI'a fiyat verisi gitmiyor, AI yüzde uyduruyor).
>
> **Deliverables**:
> - Blitz matchmaking/davet/iptal akışı düzeltilmiş, bakiye kontrolü + UI feedback + Redis check
> - Settings.tsx'te bakiye gösterimi + ledger geçmişi, AppContext'te real_balance + Realtime
> - AdminBlitz top-up UI kullanıcı arama + onay dialog + geçmiş
> - /admin/users, /admin/rooms, /admin/settings sayfaları + yeni admin edge function'lar
> - RLS admin override policy'leri + blitz_payout_trigger DROP + reset-demo-account/analytics_events fix
> - trade-mirror AI prompt yeniden yazılmış (fiyat verisi + sert kurallar) + execute-trade notification dolar+yüzde
>
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 3 wave + final
> **Critical Path**: Task 1 (RLS migration) + Task 2 (frontend infra) → Wave 2 UI pages → Task 15 routing integration → Task 17 deploy

---

## Context

### Original Request
Kullanıcı (admin) canlıdaki sitede 4 kritik sorun bildirdi:
1. Blitz ekranında "Hızlı maç için Eşleşme bul" veya "Davet kodu oluştur" çalışmıyor
2. Blitz için gerekli bakiyenin nereden/nasıl yatırılacağı belirsiz — admin olarak bile bilmiyor
3. Admin yetkileri çok kısıtlı veya yok
4. AI Trade Coach işlem kapattığında bildirim içeriği yanlış (yanlış kâr oranı vb)

### Interview Summary
**Key Discussions**:
- Blitz bakiye modeli: `real_balance` kalıcı, admin top-up yeterli, ödeme entegrasyonu (Stripe/kripto) sonradan
- Para çekme (withdrawal): sonradan, ödeme entegrasyonuyla
- Admin yetki kapsamı: P0 bug fix'leri + kullanıcı yönetim + Blitz oda yönetimi + Revenue dashboard zenginleştir + Sistem ayarları sayfası. OUT: tüm işlemleri görme, settlement/observability/analytics sekmeleri, toplu push (sonradan)
- AI Coach: trade-mirror prompt'a fiyat verisi ekle + prompt'ları tam yeniden yaz + execute-trade title dolar+yüzde
- Test: Sadece QA senaryoları (Playwright/tmux/curl), unit test yok
- Deploy: Vercel otomatik + supabase/deploy-all.sh manuel, plan içinde
- Öncelik: Tam paralel — 4 sorun wave'lerde

**Research Findings** (4 paralel explore agent):
- **Blitz**: `handle_new_user()` real_balance set etmiyor (DEFAULT 0). blitz-matchmake/ blitz-join-private `real_balance - real_balance_locked >= entry_fee` check → herkes 402. Catch blokları sessiz (Blitz.tsx:69-71,96-98,111-113). Redis fail-open (UPSTASH env yoksa rpush=0 ama "queued" döner, bakiye kilitlenir). Cancel handler (mode:cancel) bakiye kilidini açmıyor. Davet kodu toast'ta geçici.
- **Bakiye**: Settings.tsx'te balance bölümü TAMAMEN YOK. Ödeme entegrasyonu sıfır. AppContext'te real_balance yok. AdminBlitz.tsx:158 UUID manuel yapıştırma. Onay dialog yok. "Blitz cüzdanı" etiketi yanıltıcı. Dual settlement (blitz-settle-room + blitz_payout_trigger). real_balance_ledger RLS kullanıcı kendi kayıtlarını görüyor ama UI yok.
- **Admin**: Sadece 1 admin sayfası (/admin/blitz). reset-demo-account/index.ts:41,45 `profiles.is_admin` sütunu VERITABANINDA YOK — herkes 403. analytics_events policy `raw_user_meta_data->>'role'` kullanıyor, has_role() değil. RLS admin SELECT sadece 4 tablo (platform_revenue, real_balance_ledger, settlement_ledger, observability_log). user_roles INSERT/UPDATE/DELETE policy'si YOK. Admin yapma UI yok. ProtectedRoute admin check yok. AppContext'te isAdmin yok.
- **AI Coach**: Kâr ORANI (yüzde) HİÇBİR KODDA hesaplanmaz. trades.pnl dolar NUMERIC(20,2). trade-mirror/index.ts:69-77 AI'a sadece pnl (dolar), symbol, side gönderiyor — entry_price, quantity, current_price YOK. Sistem prompt "kazanma oranı" istiyor. AI yüzde uyduruyor. execute-trade/index.ts:294-296 title sadece dolar gösteriyor.

### Metis Review
Atlandı (kullanıcı talebiyle).

---

## Work Objectives

### Core Objective
Canlıdaki 4 kritik production sorununu düzeltmek: Blitz butonları çalışır hale, bakiye akışı anlaşılır ve yönetilebilir, admin yetkileri fonksiyonel, AI Coach bildirimleri doğru kâr gösterir.

### Concrete Deliverables
- RLS migration: admin SELECT policy'leri (profiles, trades, positions, blitz_rooms, blitz_participants, blitz_orders, notifications, user_stats, user_roles), user_roles admin INSERT/UPDATE policy, blitz_payout_trigger DROP, analytics_events policy has_role fix
- reset-demo-account/index.ts: profiles.is_admin → has_role() RPC
- AppContext.tsx: real_balance, real_balance_locked, isAdmin state + Realtime subscription
- useIsAdmin() hook
- ProtectedRoute.tsx: requiredRole prop
- TopBar.tsx: admin linkleri dropdown
- Blitz.tsx: catch toast, davet kodu kalıcı UI, bakiye ön kontrol, etiket düzeltme
- blitz-matchmake/index.ts: cancel handler bakiye leak fix + Redis check + 503 uyarı
- trade-mirror/index.ts: AI prompt yeniden yaz (entry_price, quantity, current_price + sert kurallar + JSON schema çıktı)
- execute-trade/index.ts: notification title dolar + yüzde
- Settings.tsx: bakiye gösterimi + real_balance_ledger geçmişi
- AdminBlitz.tsx: top-up UI (kullanıcı arama autocomplete, onay dialog, son top-up geçmişi), revenue dashboard zenginleştir
- /admin/users, /admin/rooms, /admin/settings sayfaları
- Yeni admin edge function'lar: admin-list-users, admin-set-user-role, admin-ban-user, admin-cancel-room, admin-settle-room, admin-slippage-config
- App.tsx: admin route'ları integration
- deploy-all.sh çalıştırma + Vercel deploy

### Definition of Done
- [ ] Blitz "Eşleşme bul" butonu yeterli bakiyeyle çalışır, eksik bakiyede net uyarı
- [ ] Blitz "Davet kodu oluştur" butonu çalışır, kod kalıcı UI'da göster + kopyala
- [ ] Blitz cancel bakiye kilidini açar
- [ ] Redis yoksa quick match 503 + kullanıcı uyarısı
- [ ] Settings.tsx'te bakiye + ledger geçmişi görünür
- [ ] AdminBlitz top-up kullanıcı arama + onay dialog + geçmiş
- [ ] /admin/users, /admin/rooms, /admin/settings çalışır
- [ ] reset-demo-account adminler için çalışır
- [ ] AI Coach bildiriminde kâr oranı doğru (fiyat verisi + prompt kuralı)
- [ ] execute-trade notification dolar + yüzde
- [ ] blitz_payout_trigger DROP edilmiş, settlement tek yol
- [ ] Tüm edge function'lar deploy edilmiş, Vercel main branch'ta

### Must Have
- Tüm 4 sorunun kök neden düzeltmesi (yamama değil)
- RLS policy'ler has_role() ile tutarlı
- Yeni admin edge function'larında has_role() admin check + rate limit
- AppContext real_balance Realtime ile güncel
- AI prompt'larında "yüzde uydurma yok" kuralı
- Her task'da QA senaryoları (Playwright/tmux/curl)

### Must NOT Have (Guardrails)
- Ödeme entegrasyonu (Stripe/Iyzico/kripto) — sonradan, bu plan dışı
- Para çekme (withdrawal) akışı — sonradan
- Tüm işlemleri görme/iptal /admin/trades sayfası — sonradan
- Settlement/observability/analytics sekmeleri AdminBlitz'de — sonradan
- Toplu push bildirim UI — sonradan
- handle_new_user'a real_balance=100000 ekleme — kullanıcı seçmedi, admin top-up yeterli
- Unit test yazma — sadece QA senaryoları
- AI prompt'larda yüzde uydurma serbestliği
- Client-side real_balance write — guard trigger korunacak
- Mevcut RLS policy'leri koru, sadece admin override EKLE
- analytics_events policy'de raw_user_meta_data kalmasın — has_role() olmalı

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification agent-executed.

### Test Decision
- **Infrastructure exists**: YES (vitest + Playwright)
- **Automated tests**: None (sadece QA senaryoları)
- **Framework**: N/A — sadece Playwright/tmux/curl ile QA
- **Agent-Executed QA**: ALWAYS (mandatory)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Playwright (playwright skill) - Navigate, interact, assert DOM, screenshot
- **TUI/CLI**: interactive_bash (tmux) - Run command, send keystrokes, validate output
- **API/Backend**: Bash (curl) - Send requests, assert status + response fields
- **DB/Migration**: Bash (supabase migration sql) - Apply migration, query, assert rows/policies
- **Edge Function**: Bash (curl) - Call edge function, assert response shape + status

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - 8 tasks, MAX PARALLEL):
├── Task 1: RLS migration (admin policies + blitz_payout_trigger DROP + analytics_events fix + reset-demo-account fix) [deep]
├── Task 2: Frontend infra (AppContext real_balance + Realtime + useIsAdmin + ProtectedRoute + TopBar admin link) [deep]
├── Task 3: Blitz.tsx UX fixes (catch toast, davet kodu kalıcı, ön kontrol, etiket) [visual-engineering]
├── Task 4: blitz-matchmake cancel leak + Redis check fix [deep]
├── Task 5: trade-mirror AI prompt yeniden yaz [deep]
├── Task 6: execute-trade notification title dolar + yüzde [quick]
├── Task 7: Admin edge functions batch A (users: list, set-role, ban) [deep]
└── Task 8: Admin edge functions batch B (rooms: cancel, settle; settings: slippage) [deep]

Wave 2 (UI Pages - 6 tasks, parallel, depends on Wave 1):
├── Task 9: Settings.tsx bakiye bölümü (depends: 2) [visual-engineering]
├── Task 10: AdminBlitz top-up UI iyileştirme (depends: 2, 7) [visual-engineering]
├── Task 11: /admin/users sayfası (depends: 2, 7) [visual-engineering]
├── Task 12: /admin/rooms sayfası (depends: 2, 8) [visual-engineering]
├── Task 13: /admin/settings sayfası (depends: 2, 8) [visual-engineering]
└── Task 14: AdminBlitz revenue dashboard zenginleştir (depends: 1, 2) [visual-engineering]

Wave 3 (Integration - 3 tasks):
├── Task 15: App.tsx admin routing integration (depends: 11, 12, 13) [quick]
├── Task 16: blitz_payout_trigger DROP verification + settlement tek yol test (depends: 1) [deep]
└── Task 17: Deploy (depends: ALL) [quick]

Wave FINAL (4 parallel reviews):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high + playwright)
└── F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 14, Task 2 → Tasks 9-13 → Task 15 → Task 17 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 8 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | - | 14, 16 |
| 2 | - | 9, 10, 11, 12, 13, 14 |
| 3 | - | 17 |
| 4 | - | 17 |
| 5 | - | 17 |
| 6 | - | 17 |
| 7 | - | 10, 11 |
| 8 | - | 12, 13 |
| 9 | 2 | 17 |
| 10 | 2, 7 | 17 |
| 11 | 2, 7 | 15 |
| 12 | 2, 8 | 15 |
| 13 | 2, 8 | 15 |
| 14 | 1, 2 | 17 |
| 15 | 11, 12, 13 | 17 |
| 16 | 1 | 17 |
| 17 | ALL | F1-F4 |

### Agent Dispatch Summary

- **Wave 1**: 8 tasks — T1 → `deep`, T2 → `deep`, T3 → `visual-engineering`, T4 → `deep`, T5 → `deep`, T6 → `quick`, T7 → `deep`, T8 → `deep`
- **Wave 2**: 6 tasks — T9-T14 → `visual-engineering`
- **Wave 3**: 3 tasks — T15 → `quick`, T16 → `deep`, T17 → `quick`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` + `playwright`, F4 → `deep`

---

## TODOs

- [ ] 1. RLS Migration: Admin SELECT Policy'leri + blitz_payout_trigger DROP + analytics_events Fix + reset-demo-account Fix

  **What to do**:
  - Yeni migration dosyası oluştur: `supabase/migrations/{timestamp}_critical_prod_fixes_rls.sql`
  - **Admin SELECT policy EKLE** (mevcut policy'leri koru, sadece admin override ekle) şu tablolara: `profiles` (admin tümünü gör), `trades` (admin tümünü gör), `positions` (admin tümünü gör), `blitz_rooms` (admin tümünü gör), `blitz_participants` (admin tümünü gör), `blitz_orders` (admin tümünü gör), `notifications` (admin tümünü gör), `user_stats` (admin tümünü gör), `user_roles` (admin tümünü gör + INSERT/UPDATE policy admin için), `public_profiles` (admin tümünü gör)
  - Tüm admin policy'ler `public.has_role(auth.uid(), 'admin')` kullanacak — `raw_user_meta_data` KULLANMA
  - **DROP TRIGGER**: `DROP TRIGGER IF EXISTS blitz_payout_trigger ON blitz_rooms;` + `DROP FUNCTION IF EXISTS blitz_payout_trigger();` (migration'da tanımlıysa). Edge function (blitz-settle-room) tek ödeme yolu kalır.
  - **analytics_events policy fix**: `20260610000003_analytics_foundation.sql:80-84` policy'sini `raw_user_meta_data->>'role'='admin'` yerine `public.has_role(auth.uid(), 'admin')` ile değiştir (yeni migration ile override)
  - **reset-demo-account edge function fix**: `supabase/functions/reset-demo-account/index.ts:41,45` — `profile.is_admin !== true` yerine `has_role()` RPC çağrısı: `const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" }); if (!isAdmin) return 403`
  - Migration'ı test et: `supabase db execute` veya local Supabase ile

  **Must NOT do**:
  - Mevcut RLS policy'leri SİLME — sadece admin override EKLE
  - user_roles INSERT/UPDATE policy'sini authenticated'e açma — sadece admin
  - `raw_user_meta_data` kullanmaya geri dönme
  - handle_new_user'a real_balance ekleme (bu plan dışı)
  - Blitz oda settlement logic'ini değiştirme — sadece trigger'ı DROP et

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: SQL migration + RLS policy + edge function fix + güvenlik kritik. Bir hata tüm DB erişimini kırabilir.
  - **Skills**: []
    - Plan-driven çalışma, migration test gerekiyor.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2-8)
  - **Blocks**: Task 14 (revenue dashboard admin policy bekler), Task 16 (trigger DROP verification)
  - **Blocked By**: None

  **References**:
  - `supabase/migrations/20260417103732_e491246f-19d3-423e-9ebb-ccdd4a8cfa4d.sql:19` — user_roles mevcut RLS (sadece auth.uid()=user_id SELECT)
  - `supabase/migrations/20260417103732_e491246f-19d3-423e-9ebb-ccdd4a8cfa4d.sql:35` — profiles mevcut RLS (sadece auth.uid()=id)
  - `supabase/migrations/20260417103732_e491246f-19d3-423e-9ebb-ccdd4a8cfa4d.sql:55,78` — positions, trades RLS
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql:69,102,137` — blitz_rooms, blitz_participants, blitz_orders RLS
  - `supabase/migrations/20260610000003_analytics_foundation.sql:80-84` — analytics_events policy (raw_user_meta_data — DÜZELTİLECEK)
  - `supabase/migrations/20260609234136_ana_sahne.sql:144-204` — blitz_payout_trigger tanımı (DROPLANECEK)
  - `supabase/functions/reset-demo-account/index.ts:41,45` — `profiles.is_admin` (varolmayan sütun — DÜZELTİLECEK)
  - `supabase/migrations/20260609065635_331de86c-cdad-4b77-ae7f-0f520999227c.sql:21,44` — platform_revenue, real_balance_ledger admin SELECT policy ÖRNEK (has_role kullanım pattern'i)
  - `public.has_role()` RPC — `20260417103732_e491246f-19d3-423e-9ebb-ccdd4a8cfa4d.sql` içinde tanımlı

  **WHY Each Reference Matters**:
  - user_roles RLS: admin INSERT/UPDATE policy ekle — kullanıcı rolü değiştirme edge function'ları (Task 7) bunu bekler
  - profiles/trades/positions/blitz_*/notifications/user_stats RLS: admin SELECT ekle — admin sayfaları (Task 11, 12, 14) bunu bekler
  - analytics_events policy: raw_user_meta_data kırık — has_role() ile değiştir
  - blitz_payout_trigger: dual settlement riski — DROP et, edge function tek yol
  - reset-demo-account: varolmayan is_admin sütunu — has_role() kullan
  - platform_revenue/real_balance_ledger admin policy: has_role() kullanım ÖRNEĞİ — yeni policy'ler bu pattern'i izlesin

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: RLS admin SELECT policy - profiles tablosu
    Tool: Bash (supabase db execute)
    Preconditions: Migration uygulanmış, admin ve normal kullanıcı tanımlı
    Steps:
      1. Admin JWT ile: SELECT id, display_name, real_balance FROM profiles LIMIT 10;
      2. Assert: 10 satır döner (tüm kullanıcılar)
      3. Normal kullanıcı JWT ile: SELECT id, display_name, real_balance FROM profiles LIMIT 10;
      4. Assert: Sadece kendi satırı döner (auth.uid()=id policy aktif)
    Expected Result: Admin tüm profilleri görür, normal kullanıcı sadece kendini
    Failure Indicators: Admin RLS violation alır, veya normal kullanıcı tüm profilleri görür
    Evidence: .omo/evidence/task-1-rls-admin-profiles.txt

  Scenario: RLS admin SELECT policy - trades tablosu
    Tool: Bash (supabase db execute)
    Preconditions: Migration uygulanmış, en az 2 kullanıcıda trade var
    Steps:
      1. Admin JWT ile: SELECT user_id, symbol, pnl FROM trades LIMIT 50;
      2. Assert: Tüm kullanıcıların trade'leri döner
      3. Normal kullanıcı JWT ile: SELECT user_id, symbol, pnl FROM trades LIMIT 50;
      4. Assert: Sadece kendi trade'leri döner
    Expected Result: Admin tüm trade'leri görür, normal kullanıcı sadece kendini
    Evidence: .omo/evidence/task-1-rls-admin-trades.txt

  Scenario: user_roles admin INSERT/UPDATE policy
    Tool: Bash (supabase db execute)
    Preconditions: Migration uygulanmış
    Steps:
      1. Admin JWT ile: INSERT INTO user_roles (user_id, role) VALUES ('target-uuid', 'admin');
      2. Assert: INSERT başarılı
      3. Normal kullanıcı JWT ile: INSERT INTO user_roles (user_id, role) VALUES ('uuid', 'admin');
      4. Assert: RLS violation (403/permission denied)
    Expected Result: Admin rol atayabilir, normal kullanıcı atayamaz
    Evidence: .omo/evidence/task-1-rls-admin-user-roles.txt

  Scenario: blitz_payout_trigger DROP edilmiş
    Tool: Bash (supabase db execute)
    Preconditions: Migration uygulanmış
    Steps:
      1. SELECT tgname FROM pg_trigger WHERE tgname = 'blitz_payout_trigger';
      2. Assert: 0 satır (trigger yok)
      3. blitz-settle-room edge function'ı manuel tetikle (cron JWT ile)
      4. Assert: Kazanan real_balance'ı doğru artar, çifte ödeme olmaz
    Expected Result: Trigger yok, settlement tek yoldan çalışır
    Evidence: .omo/evidence/task-1-blitz-payout-trigger-dropped.txt

  Scenario: analytics_events policy has_role ile çalışır
    Tool: Bash (supabase db execute)
    Preconditions: Migration uygulanmış, user_roles'ta admin atanmış kullanıcı
    Steps:
      1. Admin JWT ile (user_roles'tan): SELECT * FROM analytics_events LIMIT 10;
      2. Assert: Satırlar döner (raw_user_meta_data bağımsız)
    Expected Result: user_roles'tan admin yapılan analytics'i görebilir
    Failure Indicators: Admin boş sonuç alır (raw_user_meta_data policy'si hala aktif)
    Evidence: .omo/evidence/task-1-analytics-policy-fix.txt

  Scenario: reset-demo-account adminler için çalışır
    Tool: Bash (curl)
    Preconditions: Edge function deploy edilmiş, admin JWT
    Steps:
      1. curl -X POST $SUPABASE_URL/functions/v1/reset-demo-account -H "Authorization: Bearer $ADMIN_JWT" -d '{"user_id":"target-uuid"}'
      2. Assert: 200 OK + {success: true}
      3. curl -X POST $SUPABASE_URL/functions/v1/reset-demo-account -H "Authorization: Bearer $NORMAL_JWT" -d '{"user_id":"target-uuid"}'
      4. Assert: 403 Forbidden
    Expected Result: Admin reset yapabilir, normal kullanıcı 403
    Evidence: .omo/evidence/task-1-reset-demo-account-fix.txt
  ```

  **Commit**: YES
  - Message: `feat(db): RLS admin policies + blitz_payout_trigger DROP + reset-demo-account fix`
  - Files: `supabase/migrations/{timestamp}_critical_prod_fixes_rls.sql`, `supabase/functions/reset-demo-account/index.ts`

- [x] 2. Frontend Infra: AppContext real_balance + Realtime + useIsAdmin + ProtectedRoute + TopBar

  **What to do**:
  - **AppContext.tsx**: State'e `realBalance: number`, `realBalanceLocked: number`, `isAdmin: boolean` ekle. Profile fetch sırasında bu alanları doldur. Realtime subscription: `profiles` tablosunda kendi satırında UPDATE → state güncelle. Auth değişince fetch + subscribe, logout'ta unsubscribe.
  - **src/hooks/useIsAdmin.ts** (yeni): `const { isAdmin } = useApp(); return isAdmin;` — tek yerden admin check.
  - **src/components/ProtectedRoute.tsx**: `requiredRole?: "admin"` prop ekle. Eğer `requiredRole === "admin"` ve `!isAdmin` → redirect `/` + toast "Admin yetkisi gerekli". Mevcut auth check korunsun.
  - **src/components/TopBar.tsx**: User menü dropdown'una admin kullanıcı için "Admin Panel" link ekle (sadece isAdmin true ise). Sub-linkler: Kullanıcılar (/admin/users), Blitz Odaları (/admin/rooms), Sistem Ayarları (/admin/settings), Revenue (/admin/blitz).
  - **AppContext.tsx**: Profile fetch mevcut `real_balance`, `real_balance_locked` alanları okusun (profiles tablosunda bu kolonlar var — migration `20260608124235.sql`)

  **Must NOT do**:
  - Client-side real_balance WRITE yapma — guard trigger koruması var, sadece oku
  - useIsAdmin'i hardcoded admin UUID'lerle yapma — has_role() / DB'den gelmeli
  - ProtectedRoute'da mevcut auth check'i kaldırma — sadece admin check ekle
  - TopBar'a normal kullanıcı için admin link ekleme

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: State yönetimi + Realtime + routing guard — tüm app'e etki eder. Bir hata tüm sayfaları kırar.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3-8)
  - **Blocks**: Tasks 9, 10, 11, 12, 13, 14 (hepsi AppContext + useIsAdmin bekler)
  - **Blocked By**: None

  **References**:
  - `src/contexts/AppContext.tsx` — mevcut state (user, session, lang, theme), genişletilecek
  - `src/components/ProtectedRoute.tsx:4-10` — mevcut sadece user!==null check
  - `src/components/TopBar.tsx` — user menü dropdown
  - `src/components/CommandPalette.tsx:24,67` — mevcut has_role() RPC çağrı pattern'i (örnek)
  - `src/hooks/useToast.ts` — toast gösterimi
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql` — profiles.real_balance, real_balance_locked kolonları
  - `src/integrations/supabase/client.ts` — Realtime client

  **WHY Each Reference Matters**:
  - AppContext: Tüm app'in state merkezi — real_balance + isAdmin burada tek kaynak
  - ProtectedRoute: Admin route'ları koruyacak — requiredRole prop ekle
  - TopBar: Admin erişimi buradan — dropdown'a admin linkleri
  - CommandPalette has_role pattern: isAdmin state'i nasıl doldurulacak örneği
  - profiles kolonları: real_balance, real_balance_locked OKU — fetch sırasında

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: AppContext real_balance state dolu
    Tool: Playwright (playwright skill)
    Preconditions: Kullanıcı login, profiles.real_balance=100 (admin top-up ile)
    Steps:
      1. Playwright: page.goto('/blitz')
      2. Assert: page.locator('[data-testid="real-balance"]').textContent() === '100.00'
      3. DB'den real_balance'ı 200 yap (admin top-up)
      4. Assert: 2 saniye içinde UI 200.00 güncellenir (Realtime)
    Expected Result: Bakiye DB değişince UI'da otomatik güncellenir
    Evidence: .omo/evidence/task-2-appcontext-realtime.png

  Scenario: useIsAdmin hook doğru çalışır
    Tool: Playwright
    Preconditions: Admin kullanıcı login, normal kullanıcı login
    Steps:
      1. Admin login → page.goto('/admin/users') → Assert: sayfa yüklenir
      2. Normal kullanıcı login → page.goto('/admin/users') → Assert: redirect '/' + toast "Admin yetkisi gerekli"
    Expected Result: Admin admin sayfasına erişir, normal kullanıcı redirect
    Evidence: .omo/evidence/task-2-protected-route-admin.png

  Scenario: TopBar admin link sadece admin görür
    Tool: Playwright
    Preconditions: Admin ve normal kullanıcı login
    Steps:
      1. Admin login → click user menu dropdown → Assert: "Admin Panel" link görünür
      2. Normal kullanıcı login → click user menu dropdown → Assert: "Admin Panel" link YOK
    Expected Result: Admin link sadece admin kullanıcının menüsünde
    Evidence: .omo/evidence/task-2-topbar-admin-link.png

  Scenario: Logout Realtime cleanup
    Tool: Playwright
    Preconditions: Kullanıcı login
    Steps:
      1. Login → goto '/blitz' → bakiye gör
      2. Logout → login farklı kullanıcı → goto '/blitz'
      3. Assert: 2. kullanıcının bakiyesi göster (1. kullanıcıdan artık kalma yok)
    Expected Result: Logout'ta eski bakiye state'i kalmaz
    Evidence: .omo/evidence/task-2-logout-cleanup.png
  ```

  **Commit**: YES
  - Message: `feat(app): AppContext real_balance + Realtime + useIsAdmin + ProtectedRoute + TopBar`
  - Files: `src/contexts/AppContext.tsx`, `src/hooks/useIsAdmin.ts`, `src/components/ProtectedRoute.tsx`, `src/components/TopBar.tsx`

- [ ] 3. Blitz.tsx UX Fixes: Catch Toast + Davet Kodu Kalıcı UI + Ön Kontrol + Etiket

  **What to do**:
  - **Catch bloklarına toast error ekle** (`src/pages/Blitz.tsx:69-71, 96-98, 111-113`): Her catch'ta `toast.error(err.message || "İşlem başarısız")` ekle (callEdgeFunction zaten toast gösterir ama duplicate önlemek için err.message kontrol et, eğer boşsa generic mesaj). Ayrıca state'i sıfırla (queueing, creating, joining).
  - **Davet kodu kalıcı UI**: `createPrivate()` başarılı olunca toast yerine (veya ek olarak) kalıcı bir kart göster: `waitingRoomId` set + `inviteCode` state'e kaydet. Kart UI: büyük fontla kod, "Kopyala" butonu (navigator.clipboard.writeText), "Odanın hazır olması bekleniyor" mesajı, "İptal" butonu (mode:cancel çağır). Realtime ile oda status='active' olunca otomatik navigate `/blitz/${room_id}`.
  - **Bakiye ön kontrol**: Buton tıklamadan önce `available = realBalance - realBalanceLocked` hesapla (AppContext'ten). Eğer `available < entryFee` → buton `disabled` + tooltip "Yetersiz bakiye. Mevcut: $X, Gerekli: $Y" + "Bakiye Yükle" linki (Settings'e yönlendir).
  - **Etiket düzeltme**: "Blitz cüzdanı" → "Gerçek Bakiye" (`Blitz.tsx:146`). Alt açıklama: "Blitz ve platform işlemleri için kullanılan bakiye. Admin tarafından yüklenir."
  - **entryFee seçici**: Mevcut entryFee seçici (varsa) korunsun, yoksa ekle: $5, $10, $25, $50.

  **Must NOT do**:
  - callEdgeFunction'ın toast'unu duplike etme — err.message boşsa generic göster
  - Davet kodunu URL'den alma — backend'den gelsin (zaten öyle)
  - Bakiye kontrolü için edge function çağırma — AppContext'teki state kullan
  - "Blitz cüzdanı" etiketini başka bir yerde değiştirme — sadece Blitz.tsx:146

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI değişiklikleri — kalıcı kart, disabled buton, tooltip, etiket. Görsel doğrulama gerek.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4-8)
  - **Blocks**: Task 17 (deploy)
  - **Blocked By**: None (AppContext real_balance'i kullanır ama Task 2 ile paralel — Task 2 gelmeden de ön kontrolü AppContext'ten değil local fetch'ten yapabilir; ancak idealde Task 2 önce bitmeli. Pratikte paralel — entegrasyon Task 17'de)

  **References**:
  - `src/pages/Blitz.tsx:30-38` — mevcut profile fetch (real_balance, real_balance_locked)
  - `src/pages/Blitz.tsx:56-71` — quickMatch() + catch (sessiz — DÜZELTİLECEK)
  - `src/pages/Blitz.tsx:86-99` — createPrivate() + catch (DÜZELTİLECEK)
  - `src/pages/Blitz.tsx:101-114` — joinPrivate() + catch (DÜZELTİLECEK)
  - `src/pages/Blitz.tsx:143-156` — bakiye gösterimi ("Blitz cüzdanı" — DÜZELTİLECEK)
  - `src/pages/Blitz.tsx:41-54` — Realtime subscription blitz_participants
  - `src/lib/edge-error.ts:91-116` — callEdgeFunction toast gösterimi
  - `src/hooks/useToast.ts` — toast API

  **WHY Each Reference Matters**:
  - Catch blokları: Sessiz hataları görünür yap
  - createPrivate: Davet kodu kalıcı UI ekle
  - Bakiye gösterimi: Ön kontrol + etiket düzelt
  - Realtime subscription: Oda status='active' olunca navigate

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Yetersiz bakiyede buton disabled + tooltip
    Tool: Playwright
    Preconditions: Kullanıcı login, realBalance=0, realBalanceLocked=0
    Steps:
      1. page.goto('/blitz')
      2. Assert: "Eşleşme bul" buton disabled
      3. Hover buton → Assert: tooltip "Yetersiz bakiye. Mevcut: $0.00, Gerekli: $5.00"
      4. Assert: "Bakiye Yükle" linki görünür, href='/settings'
    Expected Result: Yetersiz bakiyede buton disabled + net yönlendirme
    Evidence: .omo/evidence/task-3-blitz-button-disabled.png

  Scenario: Davet kodu kalıcı UI + kopyala
    Tool: Playwright
    Preconditions: Kullanıcı login, realBalance=100 (admin top-up)
    Steps:
      1. page.goto('/blitz')
      2. entryFee $5 seç, click "Davet kodu oluştur"
      3. Assert: Kalıcı kart görünür, içinde 6-8 karakterli kod
      4. Assert: "Kopyala" butonu görünür
      5. Click "Kopyala" → Assert: clipboard'ta kod var
      6. Assert: Toast "Davet kodu: XYZ123" DAHA UZUN süre visible (veya yok, kalıcı kart yeterli)
    Expected Result: Davet kodu kalıcı, kopyalanabilir
    Evidence: .omo/evidence/task-3-invite-code-permanent.png

  Scenario: Hata durumunda toast error
    Tool: Playwright
    Preconditions: Kullanıcı login, Redis down (UPSTASH env yok simüle)
    Steps:
      1. page.goto('/blitz'), realBalance=100
      2. Click "Eşleşme bul"
      3. Assert: toast.error görünür, mesaj "Eşleştirme servisi geçici olarak kullanılamıyor" (veya edge function'dan dönen hata)
      4. Assert: spinner durur, buton eski haline döner
    Expected Result: Hata durumunda kullanıcıya net feedback
    Evidence: .omo/evidence/task-3-blitz-error-toast.png

  Scenario: Etiket "Gerçek Bakiye" doğru
    Tool: Playwright
    Preconditions: Kullanıcı login
    Steps:
      1. page.goto('/blitz')
      2. Assert: page.locator('text=Gerçek Bakiye').visible()
      3. Assert: "Blitz cüzdanı" texti YOK
    Expected Result: Etiket düzeltilmiş
    Evidence: .omo/evidence/task-3-etiket-gercek-bakiye.png
  ```

  **Commit**: YES
  - Message: `fix(blitz): catch toast + davet kodu kalıcı UI + ön kontrol + etiket`
  - Files: `src/pages/Blitz.tsx`

- [ ] 4. blitz-matchmake Cancel Bakiye Leak Fix + Redis Check + 503 Uyarı

  **What to do**:
  - **Cancel handler bakiye leak fix** (`supabase/functions/blitz-matchmake/index.ts:137-169`): `mode: "cancel"` handler'ına `real_balance_locked -= entry_fee` EKLE. Conditional UPDATE (TOCTOU koruması): `UPDATE profiles SET real_balance_locked = real_balance_locked - entry_fee WHERE id = user.id AND real_balance_locked >= entry_fee`. Eğer kullanıcı kuyrukta değilse (Redis lrem 0 döner) veya waiting room'da değilse, balance unlock yine yapılsın (idempotent) — kilitli bakiye varsa aç. Stale queue cleanup (`releaseStaleBalances:29-82`) sadece waiting room'ları temizliyordu — buna `queue_joined` durumu için TTL check ekle (kuyrukta > 5 dakika olanları unlock).
  - **Redis check + 503 uyarı** (`supabase/functions/blitz-matchmake/index.ts:139-142, 233-236, 240-243, 262-270`): `mode: "quick"` handler'ında Redis `rpush` çağrısından önce `redisEnabled` kontrol et. Eğer `redisEnabled === false` (UPSTASH_REDIS_REST_URL/TOKEN env yok) → 503 `{error: "Eşleştirme servisi geçici olarak kullanılamıyor", code: "MATCHMAKER_UNAVAILABLE", retryable: true}` döner. Frontend'de (Task 3 catch) bu durumda toast göster. Aynı şekilde `lpop` için: Redis yoksa 503. Cancel handler'ında Redis yoksa: sadece DB'den bakiye unlock yap (Redis bağımsız), 200 döner.
  - **`mode: "create_private"` Redis bağımlılığını kaldır**: create_private Redis kullanmıyor (sadece DB) — bu zaten güvenli, dokunma.
  - **Log düzeltme**: `console.error` yerine `console.warn` (her requestte error log'u flooding'i — `blitz-matchmake/index.ts:165,166,182,196,212,255,280,307,325,344,363,409`).

  **Must NOT do**:
  - Redis'i tamamen kaldırma — sadece check ekle, yoksa 503
  - Cancel handler'da bakiye unlock'ı atla — her durumda unlock yap
  - Stale cleanup TTL'i kısaltma — 5 dakika makul
  - create_private akışını değiştirme

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Edge function mantığı + bakiye güvenliği. Bir hata bakiye leak veya çifte unlock yapar.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-3, 5-8)
  - **Blocks**: Task 17 (deploy)
  - **Blocked By**: None

  **References**:
  - `supabase/functions/blitz-matchmake/index.ts:29-82` — releaseStaleBalances (waiting room cleanup — genişletilecek)
  - `supabase/functions/blitz-matchmake/index.ts:137-169` — mode:cancel handler (bakiye unlock YOK — EKLENECEK)
  - `supabase/functions/blitz-matchmake/index.ts:172-186` — balance check
  - `supabase/functions/blitz-matchmake/index.ts:230-284` — mode:quick handler (Redis bağımlı — 503 EKLENECEK)
  - `supabase/functions/blitz-matchmake/index.ts:240-243, 262-270` — Redis lpop/rpush
  - `supabase/functions/_shared/redis.ts:20-23, 65-122` — redisEnabled check + fail-open (bu fonksiyonlar hala fail-open ama edge function düzeyinde 503 döneceğiz)
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql:8-28` — guard_profiles_financial_update (service_role unlock'a izin verir)

  **WHY Each Reference Matters**:
  - Cancel handler: Bakiye leak fix — her iptal entry_fee kaybettirmesin
  - Quick handler Redis: 503 ile kullanıcı uyar, sessiz fail değil
  - Stale cleanup: queue_joined durumu için TTL
  - guard trigger: service_role unlock'a izin verir, anon/authenticated izin vermez

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Cancel bakiye kilidini açar
    Tool: Bash (curl)
    Preconditions: Kullanıcı real_balance=100, real_balance_locked=5 (kuyrukta)
    Steps:
      1. curl -X POST $SUPABASE_URL/functions/v1/blitz-matchmake -H "Authorization: Bearer $JWT" -d '{"mode":"cancel"}'
      2. Assert: 200 OK
      3. DB: SELECT real_balance, real_balance_locked FROM profiles WHERE id=$USER_ID
      4. Assert: real_balance=100, real_balance_locked=0 (kilidi açıldı)
    Expected Result: Cancel sonrası bakiye kilidi açılır
    Failure Indicators: real_balance_locked hala 5 (leak devam)
    Evidence: .omo/evidence/task-4-cancel-unlock.txt

  Scenario: Redis yoksa quick match 503
    Tool: Bash (curl)
    Preconditions: UPSTASH_REDIS_REST_URL env var YOK (geçici olarak sil)
    Steps:
      1. curl -X POST $SUPABASE_URL/functions/v1/blitz-matchmake -H "Authorization: Bearer $JWT" -d '{"mode":"quick","symbol":"BTCUSD","entry_fee":5}'
      2. Assert: 503 + {error: "Eşleştirme servisi geçili olarak kullanılamıyor", code: "MATCHMAKER_UNAVAILABLE", retryable: true}
    Expected Result: Redis yoksa net 503, sessiz queued değil
    Evidence: .omo/evidence/task-4-redis-503.txt

  Scenario: Cancel idempotent (kuyrukta değilse)
    Tool: Bash (curl)
    Preconditions: Kullanıcı kuyrukta değil, real_balance_locked=0
    Steps:
      1. curl -X POST $SUPABASE_URL/functions/v1/blitz-matchmake -H "Authorization: Bearer $JWT" -d '{"mode":"cancel"}'
      2. Assert: 200 OK (hata değil)
      3. DB: real_balance_locked hala 0
    Expected Result: Cancel idempotent, kuyrukta değilse hata vermez
    Evidence: .omo/evidence/task-4-cancel-idempotent.txt

  Scenario: Stale queue cleanup TTL
    Tool: Bash (curl)
    Preconditions: Kullanıcı kuyrukta 6 dakikadır (TTL 5dk geçti), real_balance_locked=5
    Steps:
      1. Başka bir kullanıcı quick match çağır (releaseStaleBalances tetiklenir)
      2. DB: ilk kullanıcı real_balance_locked=0 (cleanup yapıldı)
    Expected Result: Stale kuyruk girişleri otomatik temizlenir
    Evidence: .omo/evidence/task-4-stale-cleanup.txt
  ```

  **Commit**: YES
  - Message: `fix(blitz): cancel bakiye leak + Redis check 503 + stale queue TTL`
  - Files: `supabase/functions/blitz-matchmake/index.ts`

- [x] 5. trade-mirror AI Prompt Yeniden Yaz: Fiyat Verisi + Sert Kurallar + JSON Schema Çıktı

  **What to do**:
  - **AI prompt'a fiyat verisi ekle** (`supabase/functions/trade-mirror/index.ts:60-77`): `compact` map'ine `entry_price`, `quantity`, `current_price` EKLE. Bu veriler trades tablosunda yok (sadece pnl, price, quantity) — positions veya trades'den türet. Mevcut trade için: `current.entry_price` positions'tan (kapanmış pozisyon), `current.exit_price` = `current.price` (trades.price), `current.quantity` = trades.quantity. Geçmiş 30 trade için: `entry_price` (trades tablosunda yoksa positions'tan veya trades metadata'dan), `exit_price` = trades.price.
  - **Sistem prompt tam yeniden yaz** (`trade-mirror/index.ts:69-73`): Sert kurallar:
    - "Verilen pnl BİR DOLAR TUTARIDIR, yüzde DEĞİL. Yüzde üretme, hesaplama."
    - "Eğer yüzde gerekiyorsa: pnlPct = (pnl / (entry_price * quantity)) * 100. Sadece bu formülü kullan, başka yüzde üretme."
    - "Çıktı JSON formatında: {observation: '1-2 cümle', pattern: 'saat/gün/semböl/niyet kalıbı veya null', winRate: 'son 30 işlemde kazanma oranı %X veya null'}"
    - "Türkçe yanıtla, samimi ve kısa. Kesin yargı yok, 'olabilir mi?' ile bitir."
    - "Sadece verilen veriyi kullan. Verilmeyen veriyi uydurma."
  - **AI çağrıya JSON mode zorla**: OpenRouter API'ye `response_format: { type: "json_object" }` parametresi ekle (model destekliyorsa — gpt-4o-mini destekler).
  - **Notification body'yi AI observation'ından al**: `body: parsed.observation` (JSON parse). Title'a pnl dolar + pnlPct yüzde ekle: `🪞 ${intentMap[current.intent_tag]} → +$${pnl.toFixed(2)} (+${pnlPct.toFixed(1)}%)`.
  - **pnlPct hesapla (kod'da)**: `pnlPct = entry_price > 0 ? (pnl / (entry_price * quantity)) * 100 : 0` — long/short yönü pnl'de zaten işlenmiş (execute-trade'de), burada tekrar yön çevirme. Sadece mutlak yüzde.

  **Must NOT do**:
  - AI'a serbest metin ürettirme — JSON schema zorunlu
  - pnlPct'yi AI'a hesaplattırma — kod'da hesapla, AI'a gönder
  - Mevcut intent_tag pattern'ini değiştirme
  - trade-mirror'ı sync yapma — fire-and-forget kalsın

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: AI prompt + JSON parsing + notification format. Bir hata yanlış bildirim tüm kullanıcılar.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-4, 6-8)
  - **Blocks**: Task 17 (deploy)
  - **Blocked By**: None

  **References**:
  - `supabase/functions/trade-mirror/index.ts:60-77` — compact map + AI prompt (DÜZELTİLECEK)
  - `supabase/functions/trade-mirror/index.ts:164-192` — title + body + notification INSERT
  - `supabase/functions/trade-mirror/index.ts:84-130` — AI çağrı (OpenRouter)
  - `supabase/functions/execute-trade/index.ts:213-217` — pnl hesaplama (long/short işlenmiş)
  - `supabase/migrations/20260417103732_e491246f-19d3-423e-9ebb-ccdd4a8cfa4d.sql:47,71` — positions.entry_price, trades.pnl kolonları
  - `src/components/NotificationBell.tsx:49-58` — notification gösterimi (title + body)

  **WHY Each Reference Matters**:
  - compact map: entry_price, quantity, current_price EKLE
  - AI prompt: sert kurallar + JSON schema
  - notification title: pnl dolar + pnlPct yüzde
  - execute-trade pnl: long/short işlenmiş, pnlPct sadece mutlak yüzde

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: AI gözlem JSON formatında + doğru pnl
    Tool: Bash (curl)
    Preconditions: Kullanıcı en az 5 trade yapmış, son trade kapalı
    Steps:
      1. Trade close tetikle (execute-trade) → trade-mirror fire
      2. DB: SELECT title, body, metadata FROM notifications WHERE type='ai_signal' ORDER BY created_at DESC LIMIT 1
      3. Assert: title format "🪞 [intent] → +$X.XX (+Y.Y%)" veya "🪞 [symbol] aynası"
      4. Assert: body AI observation metni (1-2 cümle Türkçe)
      5. Assert: pnlPct = (pnl / (entry_price * quantity)) * 100 ile tutarlı (±0.1% tolerans)
    Expected Result: Bildirim doğru dolar + yüzde içerir, AI yüzde uydurmaz
    Failure Indicators: body'de "%50 kâr" gibi uyduruk yüzde, title'da yüzde yok
    Evidence: .omo/evidence/task-5-ai-coach-notification.txt

  Scenario: AI JSON parse hatası
    Tool: Bash (curl)
    Preconditions: AI çağrı mock'lu (geçersiz JSON döner)
    Steps:
      1. trade-mirror'ı manuel tetikle (mock AI ile)
      2. Assert: notification oluşturulur (fallback body: "İşlem kapatıldı: +$X.XX (+Y.Y%)")
      3. Assert: hata log'lanır ama notification yine de gönderilir
    Expected Result: AI JSON parse başarısız olsa da notification gönderilir
    Evidence: .omo/evidence/task-5-ai-json-fallback.txt

  Scenario: pnl sıfır veya negatif
    Tool: Bash (curl)
    Preconditions: Trade küçük zararla kapatılmış (pnl=-5)
    Steps:
      1. Trade close → trade-mirror fire
      2. DB: notification title "🪞 [intent] → -$5.00 (-1.2%)"
      3. Assert: işaret doğru, yüzde doğru
    Expected Result: Negatif kâr doğru gösterilir
    Evidence: .omo/evidence/task-5-ai-negative-pnl.txt
  ```

  **Commit**: YES
  - Message: `fix(ai): trade-mirror prompt fiyat verisi + sert kurallar + JSON schema`
  - Files: `supabase/functions/trade-mirror/index.ts`

- [ ] 6. execute-trade Notification Title: Dolar + Yüzde

  **What to do**:
  - **Notification title'a yüzde ekle** (`supabase/functions/execute-trade/index.ts:294-296`): Mevcut title `✖ ${symbol} kapatıldı (+$${pnl.toFixed(2)})` → `✖ ${symbol} kapatıldı (+$${pnl.toFixed(2)} (+${pnlPct.toFixed(1)}%))`. pnlPct kod'da hesapla: `const pnlPct = entry > 0 ? (pnl / (entry * qty)) * 100 : 0;` (entry = pos.entry_price, qty = pos.quantity). Negatif kâr için: `(${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)} (${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%))`.
  - **metadata'ya pnlPct ekle** (`execute-trade/index.ts:298`): `metadata: { symbol, side, action, qty: quantity, price, pnl, pnlPct, copied_from, plan_adherence: planAdherence }`.
  - **body'ye de yüzde ekle** (opsiyonel): `${quantity} @ $${price} • Toplam $${total.toFixed(2)} • Kâr: +$${pnl.toFixed(2)} (+${pnlPct.toFixed(1)}%)`.

  **Must NOT do**:
  - AI çağırma — sadece kod'da hesapla
  - pnl hesaplama mantığını değiştirme (`execute-trade/index.ts:216` doğru) — sadece pnlPct ekle
  - Long/short yönünü pnlPct'de tekrar çevirme — pnl'de zaten işlenmiş
  - Fee kesintisi ekleme (kullanıcı seçmedi)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Tek dosya, tek fonksiyon, küçük değişiklik.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-5, 7-8)
  - **Blocks**: Task 17 (deploy)
  - **Blocked By**: None

  **References**:
  - `supabase/functions/execute-trade/index.ts:213-217` — pnl hesaplama (entry, qty, pos.side)
  - `supabase/functions/execute-trade/index.ts:291-300` — notification INSERT (title + body + metadata — DÜZELTİLECEK)
  - `supabase/migrations/20260417103732_e491246f-19d3-423e-9ebb-ccdd4a8cfa4d.sql:47,71` — positions.entry_price, trades.pnl

  **WHY Each Reference Matters**:
  - pnl hesaplama: entry, qty zaten var — pnlPct = (pnl / (entry * qty)) * 100
  - notification title: dolar + yüzde formatı

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Trade close notification dolar + yüzde
    Tool: Bash (curl)
    Preconditions: Kullanıcı login, açık pozisyon var (BTCUSD long, entry=$50000, qty=0.1)
    Steps:
      1. curl -X POST $SUPABASE_URL/functions/v1/execute-trade -H "Authorization: Bearer $JWT" -d '{"symbol":"BTCUSD","side":"sell","quantity":0.1,"action":"close","position_id":"...","price":51000}'
      2. DB: SELECT title, body, metadata FROM notifications WHERE type='trade_executed' ORDER BY created_at DESC LIMIT 1
      3. Assert: title "✖ BTCUSD kapatıldı (+$100.00 (+2.0%))"
      4. Assert: metadata.pnl=100, metadata.pnlPct=2.0
    Expected Result: Notification hem dolar hem yüzde gösterir
    Evidence: .omo/evidence/task-6-execute-trade-notification.txt

  Scenario: Negatif kâr doğru gösterilir
    Tool: Bash (curl)
    Preconditions: Pozisyon BTCUSD long, entry=$50000, qty=0.1, current=$49000
    Steps:
      1. Close trade at $49000
      2. DB: notification title "✖ BTCUSD kapatıldı (-$100.00 (-2.0%))"
      3. Assert: işaretler doğru
    Expected Result: Negatif kâr doğru format
    Evidence: .omo/evidence/task-6-execute-trade-negative.txt
  ```

  **Commit**: YES
  - Message: `fix(ai): execute-trade notification dolar + yüzde`
  - Files: `supabase/functions/execute-trade/index.ts`

- [ ] 7. Admin Edge Functions Batch A: admin-list-users + admin-set-user-role + admin-ban-user

  **What to do**:
  - **Yeni edge function: `supabase/functions/admin-list-users/index.ts`**:
    - Auth + `has_role()` admin check (yoksa 403)
    - Rate limit: 10/dk
    - Query: `SELECT p.id, p.display_name, p.avatar_url, p.demo_balance, p.real_balance, p.real_balance_locked, p.created_at, ur.role, pu.username, pu.is_active FROM profiles p LEFT JOIN user_roles ur ON ur.user_id = p.id LEFT JOIN public_profiles pu ON pu.user_id = p.id ORDER BY p.created_at DESC LIMIT $limit OFFSET $offset` (pagination: limit=50, offset query param)
    - Arama: `?search=email` veya `?search=username` → ILIKE filter
    - Return: `{users: [...], total: N}`
  - **Yeni edge function: `supabase/functions/admin-set-user-role/index.ts`**:
    - Auth + admin check
    - Rate limit: 5/dk
    - Body: `{user_id, role: "admin"|"user"}` (Zod validate)
    - UPSERT user_roles: `INSERT INTO user_roles (user_id, role) VALUES (...) ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role`
    - real_balance_ledger'a yazma (rol değişimi finansal değil)
    - Return: `{success: true, user_id, role}`
  - **Yeni edge function: `supabase/functions/admin-ban-user/index.ts`**:
    - Auth + admin check
    - Rate limit: 5/dk
    - Body: `{user_id, banned: true|false, reason?: string}`
    - Ban mekanizması: `public_profiles.is_active = false` (mevcut kolon) + auth.users banned (eğer Supabase Auth ban API varsa). Basit tut: sadece public_profiles.is_active toggle. İleride auth ban eklenebilir.
    - Açık blitz odalarını iptal et (banlanan kullanıcının waiting/active odaları → cancelled)
    - Return: `{success: true, user_id, banned}`
  - **Tümü _shared/cors.ts, _shared/redis.ts (rate limit) kullanacak**

  **Must NOT do**:
  - Admin check'siz edge function — has_role() zorunlu
  - user_roles INSERT/UPDATE policy'sini authenticated'e açma — edge function service_role kullanır (Task 1 RLS policy admin override bekler ama service_role bypass zaten)
  - Ban için auth.users tablosunu direkt değiştirme — Supabase Auth admin API kullan (eğer kolay ise) veya sadece public_profiles.is_active
  - Banlanan kullanıcının bakiyesine dokunma — sadece oda iptal

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 3 yeni edge function + güvenlik + user_roles değişimi. Ban akışı blitz odalarını da etkiler.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-6, 8)
  - **Blocks**: Tasks 10 (admin top-up kullanıcı arama), 11 (/admin/users sayfası)
  - **Blocked By**: None (service_role RLS bypass, Task 1 beklemesine gerek yok)

  **References**:
  - `supabase/functions/blitz-admin-topup/index.ts:26-31` — admin check pattern (has_role RPC)
  - `supabase/functions/_shared/cors.ts` — CORS shared
  - `supabase/functions/_shared/redis.ts` — rate limit shared
  - `supabase/functions/_shared/auth.ts` (varsa) veya blitz-admin-topup'taki auth pattern
  - `supabase/migrations/20260417103732_e491246f-19d3-423e-9ebb-ccdd4a8cfa4d.sql:19` — user_roles tablosu
  - `supabase/migrations/20260417103732_e491246f-19d3-423e-9ebb-ccdd4a8cfa4d.sql:35` — profiles tablosu
  - `public_profiles` tablosu — is_active kolonu (ban için)
  - `src/lib/edge-error.ts` — callEdgeFunction (frontend çağrı pattern)
  - `src/lib/edge-function-types.ts` — tip tanımları (yeni AdminUser, AdminListUsersResponse ekle)

  **WHY Each Reference Matters**:
  - blitz-admin-topup: has_role admin check pattern — aynı pattern kullan
  - _shared: CORS + rate limit — tüm yeni fonksiyonlar kullanır
  - user_roles tablosu: rol değişimi UPSERT
  - public_profiles.is_active: ban mekanizması
  - edge-function-types: frontend tip güvenliği için yeni tipler ekle

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: admin-list-users admin için çalışır
    Tool: Bash (curl)
    Preconditions: Admin JWT, en az 5 kullanıcı var
    Steps:
      1. curl -X GET $SUPABASE_URL/functions/v1/admin-list-users -H "Authorization: Bearer $ADMIN_JWT"
      2. Assert: 200 + {users: [...], total: N} (N >= 5)
      3. Assert: her user'da id, display_name, real_balance, role alanları var
      4. curl with ?search=test → Assert: sadece test içeren kullanıcılar
    Expected Result: Admin tüm kullanıcıları listeler + arama çalışır
    Evidence: .omo/evidence/task-7-admin-list-users.txt

  Scenario: admin-list-users normal kullanıcı 403
    Tool: Bash (curl)
    Preconditions: Normal kullanıcı JWT
    Steps:
      1. curl -X GET $SUPABASE_URL/functions/v1/admin-list-users -H "Authorization: Bearer $NORMAL_JWT"
      2. Assert: 403 Forbidden
    Expected Result: Admin olmayan erişemez
    Evidence: .omo/evidence/task-7-admin-list-users-403.txt

  Scenario: admin-set-user-role rol değiştirir
    Tool: Bash (curl)
    Preconditions: Admin JWT, target kullanıcı rol='user'
    Steps:
      1. curl -X POST $SUPABASE_URL/functions/v1/admin-set-user-role -H "Authorization: Bearer $ADMIN_JWT" -d '{"user_id":"target-uuid","role":"admin"}'
      2. Assert: 200 + {success: true}
      3. DB: SELECT role FROM user_roles WHERE user_id='target-uuid' → 'admin'
      4. Tekrar 'user' yap → Assert: role='user'
    Expected Result: Rol değişimi çalışır
    Evidence: .omo/evidence/task-7-admin-set-role.txt

  Scenario: admin-ban-user banlar + odaları iptal eder
    Tool: Bash (curl)
    Preconditions: Admin JWT, target kullanıcının aktif/waiting blitz odası var
    Steps:
      1. curl -X POST $SUPABASE_URL/functions/v1/admin-ban-user -H "Authorization: Bearer $ADMIN_JWT" -d '{"user_id":"target-uuid","banned":true,"reason":"şüpheli aktivite"}'
      2. Assert: 200 + {success: true, banned: true}
      3. DB: SELECT is_active FROM public_profiles WHERE user_id='target-uuid' → false
      4. DB: SELECT status FROM blitz_rooms WHERE created_by='target-uuid' AND status IN ('waiting','active') → hepsi 'cancelled'
    Expected Result: Ban + oda iptal birlikte çalışır
    Evidence: .omo/evidence/task-7-admin-ban.txt
  ```

  **Commit**: YES
  - Message: `feat(admin): admin-list-users + admin-set-user-role + admin-ban-user edge functions`
  - Files: `supabase/functions/admin-list-users/index.ts`, `supabase/functions/admin-set-user-role/index.ts`, `supabase/functions/admin-ban-user/index.ts`, `src/lib/edge-function-types.ts`

- [ ] 8. Admin Edge Functions Batch B: admin-cancel-room + admin-settle-room + admin-slippage-config

  **What to do**:
  - **Yeni edge function: `supabase/functions/admin-cancel-room/index.ts`**:
    - Auth + admin check + rate limit 10/dk
    - Body: `{room_id, reason?: string}` (Zod)
    - blitz_rooms status'u 'cancelled' yap (UPDATE, service_role)
    - Tüm katılımcıların real_balance_locked'ı aç: `UPDATE profiles SET real_balance_locked = real_balance_locked - entry_fee WHERE id IN (SELECT user_id FROM blitz_participants WHERE room_id = $room_id)`
    - Notification: her katılımcıya "Blitz odası iptal edildi: $reason, bakiyeniz iade edildi"
    - Return: `{success: true, room_id, refund_count: N}`
  - **Yeni edge function: `supabase/functions/admin-settle-room/index.ts`**:
    - Auth + admin check + rate limit 5/dk
    - Body: `{room_id, winner_id?: string}` (winner_id opsiyonel — verilmezse en yüksek pnl'li katılımcı)
    - Mevcut `blitz-settle-room/index.ts` mantığını çağır veya duplicate. Ideal: blitz-settle-room'u yeniden kullan, sadece admin auth ile. blitz-settle-room şu an cron/HTTP — admin JWT ile de çağrılabilir olmalı. Basit yaklaşım: admin-settle-room, blitz-settle-room'u internal fetch ile çağır (service_role token ile), veya direkt settlement logic'i duplicate.
    - Settlement: pot = entry_fee * participant_count, fee = pot * 0.1 (veya mevcut fee oranı), prize = pot - fee. Winner real_balance += prize, herkes real_balance -= entry_fee, real_balance_locked -= entry_fee. platform_revenue INSERT. settlement_ledger INSERT (idempotent).
    - blitz_rooms status = 'finished', winner_id set
    - Return: `{success: true, room_id, winner_id, prize, fee}`
  - **Yeni edge function: `supabase/functions/admin-slippage-config/index.ts`**:
    - Auth + admin check + rate limit 5/dk
    - Body: `{symbol, max_slippage_pct, mode}` (Zod) veya GET ile tüm config listele
    - UPSERT slippage_config: `INSERT INTO slippage_config (symbol, max_slippage_pct, mode) VALUES (...) ON CONFLICT (symbol) DO UPDATE SET ...`
    - GET: `SELECT * FROM slippage_config ORDER BY symbol`
    - Return: `{success: true}` veya `{configs: [...]}`

  **Must NOT do**:
  - admin-settle-room settlement logic'ini blitz-settle-room'dan tamamen duplicate etme — yeniden kullan veya refactoring yap
  - slippage_config RLS policy'sini authenticated'e açma — service_role kullan
  - admin-cancel-room bakiye unlock'u atla — her katılımcı için
  - Notification göndermeyi unutma

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: 3 yeni edge function + finansal settlement + bakiye unlock. Bir hata çifte ödeme veya bakiye kaybı.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1-7)
  - **Blocks**: Tasks 12 (/admin/rooms), 13 (/admin/settings)
  - **Blocked By**: None

  **References**:
  - `supabase/functions/blitz-settle-room/index.ts:108-142` — settlement logic (refund + prize + platform_revenue + settlement_ledger)
  - `supabase/functions/blitz-settle-room/index.ts:160-171` — settlement_ledger idempotency
  - `supabase/functions/blitz-admin-topup/index.ts:26-31` — admin check pattern
  - `supabase/functions/_shared/cors.ts`, `_shared/redis.ts` — shared
  - `supabase/migrations/20260610000001_security_hardening.sql` — slippage_config tablosu
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql:96-111` — blitz_participants
  - `supabase/migrations/20260609065635_331de86c-cdad-4b77-ae7f-0f520999227c.sql:27-46` — platform_revenue tablosu
  - `supabase/migrations/20260610000002_settlement_integrity.sql` — settlement_ledger

  **WHY Each Reference Matters**:
  - blitz-settle-room: settlement logic — admin-settle-room yeniden kullan veya duplicate
  - slippage_config: UPSERT pattern
  - blitz_participants: cancel room katılımcı bakiye unlock için
  - platform_revenue: fee kaydı
  - settlement_ledger: idempotency

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: admin-cancel-room oda iptal + bakiye iade
    Tool: Bash (curl)
    Preconditions: Admin JWT, aktif blitz odası (2 katılımcı, entry_fee=$5, real_balance_locked=5 her birinde)
    Steps:
      1. curl -X POST $SUPABASE_URL/functions/v1/admin-cancel-room -H "Authorization: Bearer $ADMIN_JWT" -d '{"room_id":"...","reason":"hile şüphesi"}'
      2. Assert: 200 + {success: true, refund_count: 2}
      3. DB: blitz_rooms status='cancelled'
      4. DB: her katılımcı real_balance_locked=0 (5 iade edildi)
      5. DB: her katılımcıya notification (type='blitz_cancelled')
    Expected Result: Oda iptal + bakiyeler iade + bildirim
    Evidence: .omo/evidence/task-8-admin-cancel-room.txt

  Scenario: admin-settle-room manuel sonuçlandır
    Tool: Bash (curl)
    Preconditions: Admin JWT, aktif bitmiş blitz odası (status='active', süresi dolmuş)
    Steps:
      1. curl -X POST $SUPABASE_URL/functions/v1/admin-settle-room -H "Authorization: Bearer $ADMIN_JWT" -d '{"room_id":"...","winner_id":"user-uuid"}'
      2. Assert: 200 + {success: true, winner_id, prize, fee}
      3. DB: blitz_rooms status='finished', winner_id set
      4. DB: winner real_balance += prize, tüm katılımcılar real_balance -= entry_fee, real_balance_locked -= entry_fee
      5. DB: platform_revenue INSERT, settlement_ledger INSERT
    Expected Result: Manuel settlement çalışır, çifte ödeme olmaz (idempotent)
    Evidence: .omo/evidence/task-8-admin-settle-room.txt

  Scenario: admin-settle-room idempotent
    Tool: Bash (curl)
    Preconditions: Aynı oda zaten settle edilmiş
    Steps:
      1. curl -X POST admin-settle-room aynı room_id ile
      2. Assert: 200 + {success: true, already_settled: true} veya 409 idempotent
      3. DB: winner real_balance aynı (çifte ödeme yok)
    Expected Result: Tekrar settle çifte ödeme yapmaz
    Evidence: .omo/evidence/task-8-admin-settle-idempotent.txt

  Scenario: admin-slippage-config UPSERT
    Tool: Bash (curl)
    Preconditions: Admin JWT
    Steps:
      1. curl -X POST admin-slippage-config -d '{"symbol":"BTCUSD","max_slippage_pct":0.5,"mode":"strict"}'
      2. Assert: 200 + {success: true}
      3. DB: SELECT * FROM slippage_config WHERE symbol='BTCUSD' → max_slippage_pct=0.5
      4. curl -X GET admin-slippage-config → Assert: BTCUSD listed
    Expected Result: Slippage config UPSERT + GET çalışır
    Evidence: .omo/evidence/task-8-admin-slippage.txt
  ```

  **Commit**: YES
  - Message: `feat(admin): admin-cancel-room + admin-settle-room + admin-slippage-config edge functions`
  - Files: `supabase/functions/admin-cancel-room/index.ts`, `supabase/functions/admin-settle-room/index.ts`, `supabase/functions/admin-slippage-config/index.ts`, `src/lib/edge-function-types.ts`

- [ ] 9. Settings.tsx Bakiye Bölümü: Gösterim + Ledger Geçmişi

  **What to do**:
  - **Settings.tsx'e yeni "Bakiye" sekmesi/kartı ekle**: Mevcut sekmeler (profil, public profil, tema, push, demo reset) korunacak. Yeni "Gerçek Bakiye" kartı:
    - Üst kısımda 3 değer: Mevcut Bakiye (`real_balance - real_balance_locked`), Toplam Bakiye (`real_balance`), Kilitli (`real_balance_locked`). AppContext'ten al (Task 2).
    - "Bakiye Yükle" butonu — admin top-up yolu açık yazı: "Bakiyeniz yönetici tarafından yüklenir. İletişime geçin." (Ödeme entegrasyonu sonradan)
    - "Geçmiş" alt bölümü: real_balance_ledger tablosundan kullanıcının kendi kayıtları (RLS izin veriyor — `20260609065635.sql:44`). Sütunlar: Tarih, Miktar (+/-), Açıklama (reason), Yükleyen (granted_by → display_name JOIN). Pagination veya son 50 kayıt.
    - Realtime: real_balance_ledger'da kendi user_id'sine INSERT olunca UI güncelle.
  - **DB query**: `SELECT rbl.id, rbl.amount, rbl.reason, rbl.created_at, p.display_name AS granted_by_name FROM real_balance_ledger rbl LEFT JOIN profiles p ON p.id = rbl.granted_by WHERE rbl.user_id = $auth.uid() ORDER BY rbl.created_at DESC LIMIT 50`

  **Must NOT do**:
  - "Bakiye Yükle" butonuna ödeme entegrasyonu ekleme — sadece "İletişime geçin" mesajı
  - real_balance'ı client-side değiştirme — sadece oku
  - Ledger'da başka kullanıcının kayıtlarını gösterme — RLS zaten korur ama UI'da filter unutma
  - Para çekme butonu ekleme (kullanıcı seçmedi)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI kart + liste + realtime. Görsel doğrulama gerek.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 içinde)
  - **Parallel Group**: Wave 2 (with Tasks 10-14)
  - **Blocks**: Task 17 (deploy)
  - **Blocked By**: Task 2 (AppContext real_balance)

  **References**:
  - `src/pages/Settings.tsx` — mevcut sayfa (220 satır, balance bölümü YOK — EKLENECEK)
  - `src/contexts/AppContext.tsx` — Task 2 sonrası realBalance, realBalanceLocked state
  - `supabase/migrations/20260609065635_331de86c-cdad-4b77-ae7f-0f520999227c.sql:27-46` — real_balance_ledger tablosu (id, user_id, granted_by, amount, reason, created_at)
  - `supabase/migrations/20260609065635_331de86c-cdad-4b77-ae7f-0f520999227c.sql:44` — real_balance_ledger RLS: kullanıcı kendi kayıtlarını SELECT, admin hepsini
  - `src/components/ui/Tabs.tsx`, `src/components/ui/Card.tsx` — shadcn UI bileşenleri

  **WHY Each Reference Matters**:
  - Settings.tsx: Bakiye kartı buraya ekle
  - AppContext: realBalance state — kart buradan okur
  - real_balance_ledger: Geçmiş listesi bu tablodan
  - RLS policy: Kullanıcı kendi kayıtlarını görür — UI filter user_id=auth.uid()

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Settings bakiye kartı görünür
    Tool: Playwright
    Preconditions: Kullanıcı login, real_balance=100, real_balance_locked=5
    Steps:
      1. page.goto('/settings')
      2. Assert: "Gerçek Bakiye" kartı görünür
      3. Assert: Mevcut Bakiye "$95.00", Toplam "$100.00", Kilitli "$5.00"
      4. Assert: "Bakiye Yükle" butonu görünür + "İletişime geçin" mesajı
    Expected Result: Bakiye kartı 3 değeri doğru gösterir
    Evidence: .omo/evidence/task-9-settings-balance-card.png

  Scenario: Ledger geçmişi listelenir
    Tool: Playwright
    Preconditions: Kullanıcıda en az 2 ledger kaydı var (admin top-up)
    Steps:
      1. page.goto('/settings')
      2. Assert: "Geçmiş" bölümünde en az 2 satır
      3. Assert: her satırda Tarih, Miktar (+/-), Açıklama, Yükleyen alanları var
      4. Assert: en yeni en üstte
    Expected Result: Ledger geçmişi doğru listelenir
    Evidence: .omo/evidence/task-9-settings-ledger.png

  Scenario: Realtime ledger güncelle
    Tool: Playwright
    Preconditions: Kullanıcı login, Settings sayfası açık
    Steps:
      1. Admin top-up yap (kullanıcıya $50)
      2. Assert: 2 saniye içinde Settings'de bakiye $50 artar + yeni ledger satırı görünür
    Expected Result: Realtime ile bakiye + ledger anlık güncellenir
    Evidence: .omo/evidence/task-9-settings-realtime.png
  ```

  **Commit**: YES
  - Message: `feat(settings): gerçek bakiye kartı + ledger geçmişi + realtime`
  - Files: `src/pages/Settings.tsx`

- [ ] 10. AdminBlitz Top-up UI İyileştirme: Kullanıcı Arama + Onay Dialog + Geçmiş

  **What to do**:
  - **Kullanıcı arama autocomplete** (`src/pages/AdminBlitz.tsx:158`): Mevcut manuel UUID input'u değiştir. Yeni autocomplete: input'a yazı yazınca `admin-list-users?search=...` çağır (Task 7), dropdown'da sonuçlar (display_name + username + email + id). Seçince `selectedUser` state'e kaydet, UUID alanı hidden. Min 3 karakter sonra arama, debounce 300ms.
  - **Onay dialog'u**: "Uygula" butonuna tıklanınca AlertDialog aç: "Kullanıcı: {display_name} ({id}), Miktar: ${amount}, Açıklama: {reason}. Onaylıyor musunuz?" + "Onayla" / "İptal" butonları. "Onayla" → blitz-admin-topup çağır.
  - **reason zorunlu + kategorize**: reason alanı `select` olsun: "karşılama bonusu", "manuel iade", "promosyon", "yarışma ödülü", "diğer". "Diğer" seçilirse ek text input aç.
  - **Son top-up geçmişi**: Alt kısımda son 10 top-up işlemini göster. Query: `SELECT rbl.id, rbl.user_id, rbl.amount, rbl.reason, rbl.created_at, p.display_name AS target_name FROM real_balance_ledger rbl LEFT JOIN profiles p ON p.id = rbl.user_id ORDER BY rbl.created_at DESC LIMIT 10`. Tablo: Tarih, Kullanıcı, Miktar, Açıklama.

  **Must NOT do**:
  - UUID manuel girişi kalma — autocomplete ile değiştir
  - Onay dialog'suz bakiye değiştirme — her top-up'da zorunlu
  - reason boş geçme — kategori seçimi zorunlu
  - Geçmişte başka admin'in işlemlerini gizleme — tüm real_balance_ledger göster

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Form + autocomplete + dialog + tablo UI.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 içinde)
  - **Parallel Group**: Wave 2 (with Tasks 9, 11-14)
  - **Blocks**: Task 17 (deploy)
  - **Blocked By**: Task 2 (AppContext), Task 7 (admin-list-users)

  **References**:
  - `src/pages/AdminBlitz.tsx:65-83,150-178` — mevcut top-up UI (DÜZELTİLECEK)
  - `supabase/functions/admin-list-users/index.ts` — Task 7 sonrası arama endpoint
  - `supabase/functions/blitz-admin-topup/index.ts` — top-up endpoint (değişmiyor)
  - `supabase/migrations/20260609065635_331de86c-cdad-4b77-ae7f-0f520999227c.sql:27-46` — real_balance_ledger (geçmiş için)
  - `src/components/ui/AlertDialog.tsx` — shadcn onay dialog
  - `src/components/ui/Command.tsx` (cmdk) — autocomplete için

  **WHY Each Reference Matters**:
  - AdminBlitz.tsx: Mevcut top-up UI değiştir
  - admin-list-users: Autocomplete arama endpoint
  - real_balance_ledger: Son 10 işlem geçmişi
  - AlertDialog: Onay dialog UI

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Kullanıcı arama autocomplete
    Tool: Playwright
    Preconditions: Admin login, en az 5 kullanıcı
    Steps:
      1. page.goto('/admin/blitz')
      2. Top-up formunda "Kullanıcı" input'una "test" yaz
      3. Assert: 300ms sonra dropdown açılır, kullanıcılar listelenir
      4. Bir kullanıcı seç → Assert: input'ta display_name görünür, UUID hidden state'e kaydedilir
    Expected Result: UUID manuel değil, autocomplete ile seçim
    Evidence: .omo/evidence/task-10-admin-topup-autocomplete.png

  Scenario: Onay dialog zorunlu
    Tool: Playwright
    Preconditions: Admin login, kullanıcı seçili, miktar $50
    Steps:
      1. "Uygula" butonuna tıkla
      2. Assert: AlertDialog açılır, "Kullanıcı: X, Miktar: $50, Açıklama: ..." gösterir
      3. "İptal" tıkla → Assert: top-up yapılmadı (DB'de real_balance değişmedi)
      4. Tekrar "Uygula" → "Onayla" → Assert: top-up yapıldı
    Expected Result: Onay olmadan top-up yapılmaz
    Evidence: .omo/evidence/task-10-admin-topup-confirm.png

  Scenario: reason kategori zorunlu
    Tool: Playwright
    Preconditions: Admin login
    Steps:
      1. Kullanıcı seç, miktar $50, reason BOŞ bırak
      2. "Uygula" → Assert: form validasyon hatası "Açıklama kategorisi zorunlu"
      3. reason "karşılama bonusu" seç → Assert: form geçerli
    Expected Result: reason kategori seçilmeden top-up yapılmaz
    Evidence: .omo/evidence/task-10-admin-topup-reason.png

  Scenario: Son top-up geçmişi
    Tool: Playwright
    Preconditions: Admin login, en az 3 top-up yapılmış
    Steps:
      1. page.goto('/admin/blitz')
      2. Assert: "Son Top-up İşlemleri" tablosu görünür, en az 3 satır
      3. Assert: Tarih, Kullanıcı, Miktar, Açıklama sütunları var
      4. Assert: en yeni en üstte
    Expected Result: Son 10 top-up listelenir
    Evidence: .omo/evidence/task-10-admin-topup-history.png
  ```

  **Commit**: YES
  - Message: `feat(admin): top-up UI kullanıcı arama + onay dialog + reason kategori + geçmiş`
  - Files: `src/pages/AdminBlitz.tsx`

- [ ] 11. /admin/users Sayfası: Liste + Arama + Rol Değiştir + Ban

  **What to do**:
  - **Yeni sayfa: `src/pages/AdminUsers.tsx`**:
    - Route: `/admin/users` (App.tsx'te Task 15 ile eklenecek)
    - ProtectedRoute ile `requiredRole="admin"` (Task 2)
    - Üst kısımda arama input (debounce 300ms, min 3 karakter) + rol filter dropdown (tümü/admin/user) + ban filter (tümü/aktif/banlı)
    - Tablo: display_name, username, email (varsa), rol (admin/user badge), real_balance, demo_balance, oluşturma tarihi, durum (aktif/banlı), aksiyonlar
    - Pagination: 50 kullanıcı/sayfa, "İleri"/"Geri" butonları
    - Aksiyonlar (satır bazında):
      - "Rol Değiştir": admin↔user toggle buton. Onay dialog: "X kullanıcısının rolü admin→user değiştirilsin mi?"
      - "Banla"/"Banı Kaldır": toggle. Onay dialog: "X banlansın mı? Açık blitz odaları iptal edilecek." + reason input (zorunlu)
      - "Bakiye Yükle": /admin/blitz'e yönlendir (kullanıcı preselected query param ile)
    - Veri kaynağı: admin-list-users edge function (Task 7)
    - Realtime: profiles/user_roles/public_profiles UPDATE → tablo güncelle (opsiyonel)

  **Must NOT do**:
  - Tüm kullanıcıları tek seferde yükleme — pagination zorunlu
  - Rol değişimi/ban without onay dialog — her aksiyonda dialog
  - Kullanıcı silme (hard delete) — sadece ban (is_active toggle)
  - Email gösterme — public_profiles'de email yok, sadece username. Email gerekirse ayrı task.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Yeni sayfa + tablo + filter + dialog.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 içinde)
  - **Parallel Group**: Wave 2 (with Tasks 9, 10, 12-14)
  - **Blocks**: Task 15 (App.tsx routing)
  - **Blocked By**: Task 2 (useIsAdmin, ProtectedRoute), Task 7 (admin-list-users, admin-set-user-role, admin-ban-user)

  **References**:
  - `src/pages/AdminBlitz.tsx` — mevcut admin sayfa pattern (has_role check, edge function çağrı)
  - `supabase/functions/admin-list-users/index.ts` — Task 7 (liste + arama)
  - `supabase/functions/admin-set-user-role/index.ts` — Task 7 (rol değiştir)
  - `supabase/functions/admin-ban-user/index.ts` — Task 7 (ban)
  - `src/components/ProtectedRoute.tsx` — Task 2 (requiredRole="admin")
  - `src/hooks/useIsAdmin.ts` — Task 2
  - `src/components/ui/Table.tsx`, `src/components/ui/AlertDialog.tsx`, `src/components/ui/Select.tsx` — shadcn UI

  **WHY Each Reference Matters**:
  - AdminBlitz: Admin sayfa pattern — aynı mimari
  - admin-* edge functions: Veri kaynağı + aksiyonlar
  - ProtectedRoute: Sayfa admin guard'ı

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: /admin/users admin erişir
    Tool: Playwright
    Preconditions: Admin login
    Steps:
      1. page.goto('/admin/users')
      2. Assert: sayfa yüklenir, arama + filter + tablo görünür
      3. Assert: tabloda en az 1 kullanıcı (admin kendisi)
    Expected Result: Admin kullanıcıları listeler
    Evidence: .omo/evidence/task-11-admin-users-page.png

  Scenario: Normal kullanıcı redirect
    Tool: Playwright
    Preconditions: Normal kullanıcı login
    Steps:
      1. page.goto('/admin/users')
      2. Assert: redirect '/' + toast "Admin yetkisi gerekli"
    Expected Result: Admin olmayan erişemez
    Evidence: .omo/evidence/task-11-admin-users-redirect.png

  Scenario: Arama + filter çalışır
    Tool: Playwright
    Preconditions: Admin login, "testuser1", "testuser2", "admin" kullanıcıları var
    Steps:
      1. Arama input'una "test" yaz
      2. Assert: sadece testuser1 ve testuser2 listelenir
      3. Rol filter "admin" seç → Assert: tablo boş (testuser'lar user rolünde)
      4. Rol filter "tümü" + arama "admin" → Assert: admin kullanıcı listelenir
    Expected Result: Arama + filter birlikte çalışır
    Evidence: .omo/evidence/task-11-admin-users-search-filter.png

  Scenario: Rol değiştir onay dialog
    Tool: Playwright
    Preconditions: Admin login, target kullanıcı rol='user'
    Steps:
      1. Target satırda "Rol Değiştir" (admin yap) tıkla
      2. Assert: dialog "X kullanıcısının rolü user→admin değiştirilsin mi?"
      3. "Onayla" → Assert: badge 'admin' olur, DB'de user_roles role='admin'
    Expected Result: Rol değişimi onaylı + doğru
    Evidence: .omo/evidence/task-11-admin-users-role-change.png

  Scenario: Ban onay dialog + oda iptal
    Tool: Playwright
    Preconditions: Admin login, target aktif, açık blitz odası var
    Steps:
      1. Target satırda "Banla" tıkla
      2. Assert: dialog + reason input zorunlu
      3. reason "şüpheli" yaz, "Onayla"
      4. Assert: durum "banlı" olur, DB'de public_profiles.is_active=false
      5. DB: target'ın blitz odaları status='cancelled'
    Expected Result: Ban + oda iptal birlikte
    Evidence: .omo/evidence/task-11-admin-users-ban.png

  Scenario: Pagination
    Tool: Playwright
    Preconditions: Admin login, 60+ kullanıcı var
    Steps:
      1. Assert: tabloda 50 kullanıcı
      2. "İleri" tıkla → Assert: 10+ kullanıcı (51-60)
      3. "Geri" tıkla → Assert: ilk 50
    Expected Result: Pagination çalışır
    Evidence: .omo/evidence/task-11-admin-users-pagination.png
  ```

  **Commit**: YES
  - Message: `feat(admin): /admin/users sayfası + arama + rol değiştir + ban`
  - Files: `src/pages/AdminUsers.tsx`

- [ ] 12. /admin/rooms Sayfası: Blitz Oda Yönetimi

  **What to do**:
  - **Yeni sayfa: `src/pages/AdminRooms.tsx`**:
    - Route: `/admin/rooms` (App.tsx'te Task 15)
    - ProtectedRoute requiredRole="admin"
    - Filter: status (waiting/active/settling/finished/cancelled), sembol, tarih aralığı, mode (public/private)
    - Tablo: oda ID (kısa), sembol, entry_fee, status, mode, katılımcı sayısı, pot, fee_collected, winner, oluşturma tarihi, bitiş tarihi, aksiyonlar
    - Aksiyonlar (status'e göre):
      - waiting/active: "İptal Et" (admin-cancel-room, onay dialog + reason)
      - active (süresi dolmuş): "Sonuçlandır" (admin-settle-room, winner seç dialog — dropdown'da katılımcılar veya "en yüksek pnl")
      - finished/cancelled: "Detay" (modal: katılımcılar + her birinin pnl + settlement ledger kaydı)
    - Veri kaynağı: RLS admin SELECT (Task 1) ile `blitz_rooms` + `blitz_participants` JOIN. Veya yeni edge function `admin-list-rooms` (basit — eklenebilir veya direkt client query RLS ile). Basit tut: direkt client query (RLS admin SELECT izin verir, Task 1).
    - Realtime: blitz_rooms UPDATE → tablo güncelle

  **Must NOT do**:
  - admin-list-rooms edge function ekleme — RLS admin SELECT (Task 1) yeterli, direkt client query
  - Oda oluşturma UI ekleme — admin sadece yönetir, oluşturma kullanıcı tarafı
  - Settlement logic'i UI'da duplicate etme — admin-settle-room çağır
  - Detay modal'da başka odanın verisini gösterme — oda ID'ye filter

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Yeni sayfa + tablo + filter + dialog + modal.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 içinde)
  - **Parallel Group**: Wave 2 (with Tasks 9-11, 13, 14)
  - **Blocks**: Task 15 (App.tsx routing)
  - **Blocked By**: Task 1 (RLS admin SELECT blitz_rooms), Task 2 (ProtectedRoute), Task 8 (admin-cancel-room, admin-settle-room)

  **References**:
  - `src/pages/AdminBlitz.tsx` — admin sayfa pattern
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql:63-72` — blitz_rooms RLS (Task 1 sonrası admin SELECT)
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql:96-111` — blitz_participants
  - `supabase/functions/admin-cancel-room/index.ts` — Task 8
  - `supabase/functions/admin-settle-room/index.ts` — Task 8
  - `supabase/migrations/20260610000002_settlement_integrity.sql` — settlement_ledger (detay modal için)

  **WHY Each Reference Matters**:
  - blitz_rooms RLS: Admin SELECT (Task 1) — direkt client query
  - admin-cancel-room/admin-settle-room: Aksiyon endpoint'leri
  - settlement_ledger: Detay modal'da settlement kaydı

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: /admin/rooms admin erişir
    Tool: Playwright
    Preconditions: Admin login, en az 2 blitz oda var
    Steps:
      1. page.goto('/admin/rooms')
      2. Assert: tablo yüklenir, en az 2 satır
      3. Assert: filter (status, sembol, tarih, mode) görünür
    Expected Result: Admin odaları listeler
    Evidence: .omo/evidence/task-12-admin-rooms-page.png

  Scenario: Status filter
    Tool: Playwright
    Preconditions: Admin login, waiting ve finished odalar var
    Steps:
      1. Status filter "waiting" seç
      2. Assert: sadece waiting odalar listelenir
      3. Status filter "finished" → Assert: sadece finished
    Expected Result: Status filter çalışır
    Evidence: .omo/evidence/task-12-admin-rooms-filter.png

  Scenario: Oda iptal
    Tool: Playwright
    Preconditions: Admin login, waiting oda var
    Steps:
      1. Waiting oda satırında "İptal Et" tıkla
      2. Assert: dialog + reason input
      3. reason "iptal" yaz, "Onayla"
      4. Assert: status 'cancelled' olur, katılımcı bakiyeleri iade
    Expected Result: Oda iptal + bakiye iade
    Evidence: .omo/evidence/task-12-admin-rooms-cancel.png

  Scenario: Manuel settle
    Tool: Playwright
    Preconditions: Admin login, active oda (süresi dolmuş)
    Steps:
      1. Active oda "Sonuçlandır" tıkla
      2. Assert: dialog, winner dropdown (katılımcılar + "en yüksek pnl")
      3. Winner seç, "Onayla"
      4. Assert: status 'finished', winner set, settlement_ledger kayıt
    Expected Result: Manuel settlement çalışır
    Evidence: .omo/evidence/task-12-admin-rooms-settle.png

  Scenario: Detay modal
    Tool: Playwright
    Preconditions: Admin login, finished oda var
    Steps:
      1. Finished oda "Detay" tıkla
      2. Assert: modal açılır, katılımcılar + pnl + settlement ledger görünür
    Expected Result: Detay modal doğru veri gösterir
    Evidence: .omo/evidence/task-12-admin-rooms-detail.png
  ```

  **Commit**: YES
  - Message: `feat(admin): /admin/rooms sayfası + oda yönetimi (iptal/settle/detay)`
  - Files: `src/pages/AdminRooms.tsx`

- [ ] 13. /admin/settings Sayfası: Sistem Ayarları (slippage_config)

  **What to do**:
  - **Yeni sayfa: `src/pages/AdminSettings.tsx`**:
    - Route: `/admin/settings` (App.tsx'te Task 15)
    - ProtectedRoute requiredRole="admin"
    - "Slippage Konfigürasyonu" bölümü: Tablo — sembol, max_slippage_pct, mode, updated_at, aksiyonlar (düzenle). "Yeni Ekle" butonu — form (sembol, max_slippage_pct, mode: strict/loose/off). "Kaydet" → admin-slippage-config (Task 8) UPSERT.
    - Mevcut semboller: BTCUSD, ETHUSD, SOLUSD, BNBUSD, XRPUSD, DOGEUSD, ADAUSD, AVAXUSD (8 kripto). Eksik olanlar için default ekle.
    - Edit dialog: sembol (readonly), max_slippage_pct (0-5 arası, step 0.1), mode (select). "Kaydet" + "İptal".
    - Veri kaynağı: slippage_config RLS tüm authenticated okuyabilir (mevcut), admin yazma admin-slippage-config (Task 8).

  **Must NOT do**:
  - slippage_config'i client-side değiştirme — admin-slippage-config endpoint kullan
  - 0-5 aralı dışı değerlere izin verme — validasyon
  - Mode "off" durumunda slippage check'i tamamen kapatma mantığı ekleme — sadece config kaydet, runtime mantığı ayrı

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Yeni sayfa + tablo + form + dialog.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 içinde)
  - **Parallel Group**: Wave 2 (with Tasks 9-12, 14)
  - **Blocks**: Task 15 (App.tsx routing)
  - **Blocked By**: Task 2 (ProtectedRoute), Task 8 (admin-slippage-config)

  **References**:
  - `src/pages/AdminBlitz.tsx` — admin sayfa pattern
  - `supabase/migrations/20260610000001_security_hardening.sql:42` — slippage_config tablosu + RLS
  - `supabase/functions/admin-slippage-config/index.ts` — Task 8 (UPSERT + GET)
  - `src/lib/symbols.ts` — mevcut 8 kripto sembol listesi

  **WHY Each Reference Matters**:
  - slippage_config tablosu: Veri kaynağı
  - admin-slippage-config: UPSERT endpoint
  - symbols.ts: 8 sembol — eksik olanlara default ekle

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: /admin/settings admin erişir
    Tool: Playwright
    Preconditions: Admin login
    Steps:
      1. page.goto('/admin/settings')
      2. Assert: "Slippage Konfigürasyonu" tablosu görünür
      3. Assert: 8 sembol listelenir (eksikler default eklenmiş)
    Expected Result: Admin slippage config görür
    Evidence: .omo/evidence/task-13-admin-settings-page.png

  Scenario: Slippage config düzenle
    Tool: Playwright
    Preconditions: Admin login, BTCUSD max_slippage_pct=0.5
    Steps:
      1. BTCUSD satırında "Düzenle" tıkla
      2. max_slippage_pct = 1.0 yap, mode = "strict"
      3. "Kaydet"
      4. Assert: tablo güncellenir, DB'de slippage_config BTCUSD max_slippage_pct=1.0
    Expected Result: Config düzenleme çalışır
    Evidence: .omo/evidence/task-13-admin-settings-edit.png

  Scenario: Yeni sembol ekle
    Tool: Playwright
    Preconditions: Admin login
    Steps:
      1. "Yeni Ekle" tıkla
      2. sembol "NEWUSD", max_slippage_pct 0.3, mode "loose"
      3. "Kaydet"
      4. Assert: tabloya NEWUSD eklenir
    Expected Result: Yeni sembol config ekleme çalışır
    Evidence: .omo/evidence/task-13-admin-settings-add.png

  Scenario: Validasyon — aralık dışı
    Tool: Playwright
    Preconditions: Admin login
    Steps:
      1. max_slippage_pct = 10.0 yaz
      2. "Kaydet" → Assert: hata "0-5 arası olmalı"
    Expected Result: Aralık dışı değer reddedilir
    Evidence: .omo/evidence/task-13-admin-settings-validation.png
  ```

  **Commit**: YES
  - Message: `feat(admin): /admin/settings sayfası + slippage config yönetimi`
  - Files: `src/pages/AdminSettings.tsx`

- [ ] 14. AdminBlitz Revenue Dashboard Zenginleştir: Grafik + Tarih Aralığı + Breakdown

  **What to do**:
  - **Mevcut AdminBlitz.tsx revenue bölümünü zenginleştir**: Şu an sadece son 50 kayıt + günlük özet. Ekle:
    - **Tarih aralığı seçici**: DateRangePicker (son 7 gün, son 30 gün, son 90 gün, özel aralık)
    - **Grafik**: Recharts ile günlük revenue line chart (tarih aralığına göre). X eksen: tarih, Y eksen: toplam fee_collected.
    - **Breakdown**: Sembol bazlı pie chart (BTCUSD %40, ETHUSD %30 vb.), Kaynak bazlı pie chart (blitz %80, vb.)
    - **KPI kartları**: Toplam Revenue (aralıkta), Toplam Oda Sayısı, Ortalama Fee/Oda, En Yüksek Tekil Fee
    - **Detay tablo**: Tarih aralığındaki platform_revenue kayıtları (sembol, kaynak, miktar, oda ID, tarih). Pagination 50/sayfa.
    - Veri kaynağı: RLS admin SELECT platform_revenue (Task 1 ile admin override zaten var) + `platform_revenue_daily` view (mevcut).

  **Must NOT do**:
  - Çok karmaşık grafik ekleme — line + 2 pie + KPI yeterli
  - Realtime güncelleme ekleme — manuel refresh yeterli (revenue anlık değil)
  - Export (CSV/PDF) ekleme — sonradan

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dashboard + grafik + filter.
  - **Skills**: [`frontend-ui-ux`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2 içinde)
  - **Parallel Group**: Wave 2 (with Tasks 9-13)
  - **Blocks**: Task 17 (deploy)
  - **Blocked By**: Task 1 (RLS admin SELECT — platform_revenue zaten var ama sembol bazlı breakdown için blitz_rooms JOIN gerek), Task 2 (AppContext)

  **References**:
  - `src/pages/AdminBlitz.tsx` — mevcut revenue bölümü (DÜZELTİLECEK)
  - `supabase/migrations/20260609065635_331de86c-cdad-4b77-ae7f-0f520999227c.sql:21` — platform_revenue RLS admin SELECT (mevcut)
  - `platform_revenue_daily` view — mevcut (günlük özet)
  - `supabase/migrations/20260608124235_88afb6c3-f0b7-461f-ba4f-6aed1fff5959.sql:63-72` — blitz_rooms (sembol bazlı breakdown için JOIN)
  - `recharts` kütüphanesi — zaten kurulu (package.json)
  - `src/components/ui/DatePicker.tsx` veya benzeri — tarih aralığı

  **WHY Each Reference Matters**:
  - AdminBlitz: Mevcut revenue bölümü zenginleştir
  - platform_revenue RLS: Admin SELECT (mevcut)
  - blitz_rooms: Sembol bazlı breakdown için JOIN
  - recharts: Grafik kütüphanesi

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Revenue dashboard zengin görünür
    Tool: Playwright
    Preconditions: Admin login, en az 10 platform_revenue kaydı var
    Steps:
      1. page.goto('/admin/blitz')
      2. Assert: Tarih aralığı seçici görünür (varsayılan: son 30 gün)
      3. Assert: KPI kartları (Toplam Revenue, Oda Sayısı, Ortalama Fee, En Yüksek Fee) görünür
      4. Assert: Line chart (günlük revenue) görünür
      5. Assert: 2 pie chart (sembol bazlı, kaynak bazlı) görünür
      6. Assert: Detay tablo görünür
    Expected Result: Zengin dashboard tüm bileşenlerle
    Evidence: .omo/evidence/task-14-admin-revenue-dashboard.png

  Scenario: Tarih aralığı değiştir
    Tool: Playwright
    Preconditions: Admin login
    Steps:
      1. Tarih aralığı "son 7 gün" seç
      2. Assert: KPI + grafik + tablo sadece son 7 gün verisini gösterir
      3. "son 90 gün" seç → Assert: daha geniş aralık
    Expected Result: Tarih aralığı tüm bileşenleri filtreler
    Evidence: .omo/evidence/task-14-admin-revenue-date-range.png

  Scenario: Breakdown pie chart doğru
    Tool: Playwright
    Preconditions: Admin login, BTCUSD ve ETHUSD odalarından revenue var
    Steps:
      1. Sembol bazlı pie chart'ta BTCUSD ve ETHUSD dilimleri görünür
      2. Assert: yüzdeler doğru (DB ile karşılaştır)
    Expected Result: Sembol bazlı breakdown doğru
    Evidence: .omo/evidence/task-14-admin-revenue-breakdown.png

  Scenario: Detay tablo pagination
    Tool: Playwright
    Preconditions: Admin login, 60+ revenue kaydı (son 30 gün)
    Steps:
      1. Assert: tabloda 50 satır
      2. "İleri" → 10+ satır
      3. "Geri" → ilk 50
    Expected Result: Pagination çalışır
    Evidence: .omo/evidence/task-14-admin-revenue-pagination.png
  ```

  **Commit**: YES
  - Message: `feat(admin): revenue dashboard zenginleştir (grafik + tarih aralığı + breakdown)`
  - Files: `src/pages/AdminBlitz.tsx`

- [ ] 15. App.tsx Admin Routing Integration

  **What to do**:
  - **App.tsx'e yeni route'lar ekle**:
    - `/admin/users` → `AdminUsers` (lazy import)
    - `/admin/rooms` → `AdminRooms` (lazy import)
    - `/admin/settings` → `AdminSettings` (lazy import)
    - Mevcut `/admin/blitz` korunsun
    - Hepsini `ProtectedRoute requiredRole="admin"` ile sar (Task 2)
  - **Lazy import**: `const AdminUsers = lazy(() => import("./pages/AdminUsers"))` — bundle boyutu korunsun. Suspense fallback Skeleton.
  - **NotFound catch-all**: `/admin/*` için bilinmeyen admin route → redirect `/admin/blitz` (varsayılan admin sayfası).

  **Must NOT do**:
  - ProtectedRoute'ı atlayıp sayfa içi has_role check'e güvenme — route seviyesi guard zorunlu
  - Tüm admin sayfalarını tek bundle'a yükleme — lazy import
  - Mevcut /admin/blitz route'unu kaldırma

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Tek dosya, route tanımları, küçük değişiklik.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Wave 2)
  - **Blocks**: Task 17 (deploy)
  - **Blocked By**: Tasks 11, 12, 13 (sayfa component'leri hazır olmalı)

  **References**:
  - `src/App.tsx:64` — mevcut /admin/blitz route (pattern)
  - `src/components/ProtectedRoute.tsx` — Task 2 (requiredRole prop)
  - `src/pages/AdminUsers.tsx` — Task 11
  - `src/pages/AdminRooms.tsx` — Task 12
  - `src/pages/AdminSettings.tsx` — Task 13
  - `src/pages/NotFound.tsx` — mevcut catch-all

  **WHY Each Reference Matters**:
  - App.tsx: Route tanımları buraya
  - ProtectedRoute: requiredRole="admin" ile sar
  - Admin sayfaları: Lazy import

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Admin route'lar erişilebilir
    Tool: Playwright
    Preconditions: Admin login
    Steps:
      1. page.goto('/admin/users') → Assert: AdminUsers yüklenir
      2. page.goto('/admin/rooms') → Assert: AdminRooms yüklenir
      3. page.goto('/admin/settings') → Assert: AdminSettings yüklenir
      4. page.goto('/admin/blitz') → Assert: AdminBlitz yüklenir (mevcut)
    Expected Result: Tüm admin route'lar çalışır
    Evidence: .omo/evidence/task-15-admin-routes.png

  Scenario: Normal kullanıcı redirect
    Tool: Playwright
    Preconditions: Normal kullanıcı login
    Steps:
      1. page.goto('/admin/users') → Assert: redirect '/' + toast
      2. page.goto('/admin/rooms') → Assert: redirect '/' + toast
      3. page.goto('/admin/settings') → Assert: redirect '/' + toast
    Expected Result: Admin olmayan tüm admin route'lardan redirect
    Evidence: .omo/evidence/task-15-admin-routes-redirect.png

  Scenario: Bilinmeyen admin route
    Tool: Playwright
    Preconditions: Admin login
    Steps:
      1. page.goto('/admin/unknown') → Assert: redirect '/admin/blitz'
    Expected Result: Bilinmeyen admin route varsayılana
    Evidence: .omo/evidence/task-15-admin-unknown-route.png

  Scenario: Lazy load bundle ayrı
    Tool: Bash (npm run build)
    Preconditions: Build çalıştır
    Steps:
      1. npm run build
      2. Assert: dist/assets/AdminUsers-*.js, AdminRooms-*.js, AdminSettings-*.js ayrı chunk'lar
    Expected Result: Admin sayfaları ayrı bundle, ana bundle şişmez
    Evidence: .omo/evidence/task-15-lazy-bundle.txt
  ```

  **Commit**: YES
  - Message: `feat(app): admin route'lar (users/rooms/settings) + lazy load + ProtectedRoute guard`
  - Files: `src/App.tsx`

- [ ] 16. blitz_payout_trigger DROP Verification + Settlement Tek Yol Test

  **What to do**:
  - **Migration doğrula** (Task 1 sonrası): `SELECT tgname FROM pg_trigger WHERE tgname = 'blitz_payout_trigger'` → 0 satır. `SELECT proname FROM pg_proc WHERE proname = 'blitz_payout_trigger'` → 0 satır (function da drop edilmeli).
  - **Settlement tek yol test**: Bir blitz odası settle et (admin-settle-room ile veya cron ile). DB'de kontrol et:
    - winner real_balance sadece 1 kez artmış (çifte ödeme yok)
    - platform_revenue'da 1 kayıt (duplicate yok)
    - settlement_ledger'da 1 kayıt, idempotency_key unique
  - **blitz-settle-room edge function'da trigger bağımlılığı varsa temizle**: Eğer edge function `blitz_payout_trigger`'a güveniyorsa (ör. status='finished' UPDATE'i trigger'ı tetikliyordu) — artık edge function kendisi ödeme yapıyor (zaten yapıyordu, Task 1'de trigger DROP edildi). Kod'da trigger'a referans varsa kaldır.
  - **Idempotency test**: Aynı odayı 2 kez settle etmeye çalış → 2. çağrı `already_settled` döner, çifte ödeme olmaz.

  **Must NOT do**:
  - Migration'ı tekrar apply etme — Task 1 zaten yaptı
  - blitz-settle-room logic'ini değiştirme — sadece trigger bağımlılık kaldır (varsa)
  - Settlement fee oranını değiştirme

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Verifikasyon + olası kod temizliği + finansal güvenlik testi.
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3 içinde, Task 15 ile paralel)
  - **Parallel Group**: Wave 3 (with Task 15, 17)
  - **Blocks**: Task 17 (deploy)
  - **Blocked By**: Task 1 (migration + trigger DROP)

  **References**:
  - `supabase/migrations/{timestamp}_critical_prod_fixes_rls.sql` — Task 1 migration (trigger DROP)
  - `supabase/migrations/20260609234136_ana_sahne.sql:144-204` — eski blitz_payout_trigger tanımı (referans)
  - `supabase/functions/blitz-settle-room/index.ts:108-142` — settlement logic (trigger bağımlılık kontrol)
  - `supabase/functions/blitz-settle-room/index.ts:160-171` — settlement_ledger idempotency

  **WHY Each Reference Matters**:
  - Migration: Trigger DROP doğrula
  - blitz-settle-room: Trigger'a referans varsa kaldır
  - settlement_ledger: Idempotency test

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: blitz_payout_trigger DROP edilmiş
    Tool: Bash (supabase db execute)
    Preconditions: Task 1 migration uygulanmış
    Steps:
      1. SELECT tgname FROM pg_trigger WHERE tgname = 'blitz_payout_trigger'
      2. Assert: 0 satır
      3. SELECT proname FROM pg_proc WHERE proname = 'blitz_payout_trigger'
      4. Assert: 0 satır (function da drop)
    Expected Result: Trigger ve function tamamen kaldırılmış
    Evidence: .omo/evidence/task-16-trigger-dropped.txt

  Scenario: Settlement tek yol — çifte ödeme yok
    Tool: Bash (curl)
    Preconditions: Test blitz odası (2 katılımcı, entry_fee=$5, pot=$10)
    Steps:
      1. winner real_balance BEFORE = $100
      2. admin-settle-room ile settle et
      3. winner real_balance AFTER = $100 + $9 (prize = pot - fee = 10 - 1 = 9)
      4. Assert: sadece 1 kez artış (çifte ödeme yok)
      5. platform_revenue: 1 kayıt, amount=$1
      6. settlement_ledger: 1 kayıt, idempotency_key unique
    Expected Result: Tek settlement yolu, çifte ödeme yok
    Evidence: .omo/evidence/task-16-settlement-single-path.txt

  Scenario: Idempotency — 2. settle reddedilir
    Tool: Bash (curl)
    Preconditions: Oda zaten settle edilmiş
    Steps:
      1. admin-settle-room aynı oda ile tekrar çağır
      2. Assert: 200 {already_settled: true} veya 409
      3. DB: winner real_balance aynı (2. ödeme yok)
      4. platform_revenue: hala 1 kayıt
    Expected Result: Tekrar settle çifte ödeme yapmaz
    Evidence: .omo/evidence/task-16-settlement-idempotent.txt

  Scenario: blitz-settle-room'da trigger referansı yok
    Tool: Bash (grep)
    Preconditions: Task 1 sonrası
    Steps:
      1. grep -r "blitz_payout_trigger" supabase/functions/
      2. Assert: 0 sonuç (edge function trigger'a referans etmiyor)
    Expected Result: Edge function trigger bağımsız
    Evidence: .omo/evidence/task-16-no-trigger-ref.txt
  ```

  **Commit**: YES
  - Message: `chore(settlement): trigger DROP verification + tek yol test + cleanup`
  - Files: (varsa) `supabase/functions/blitz-settle-room/index.ts`

- [ ] 17. Deploy: Edge Functions + Vercel

  **What to do**:
  - **Edge function deploy**: `bash supabase/deploy-all.sh --project-ref $SUPABASE_PROJECT_ID` — tüm 21+ fonksiyon (mevcut + yeni 6 admin fonksiyon: admin-list-users, admin-set-user-role, admin-ban-user, admin-cancel-room, admin-settle-room, admin-slippage-config). Yeni fonksiyonlar deploy-all.sh'a otomatik eklenir (klasör taranır).
  - **Vercel deploy**: main branch'e push → Vercel otomatik build & deploy. Veya `vercel --prod` manuel.
  - **Smoke test**: `npm run smoke-test` — deploy sonrası otomatik doğrulama (health endpoint, auth, kritik akışlar).
  - **Health check**: `curl $SUPABASE_URL/functions/v1/health` → 200 + {status, checks}.
  - **Yeni admin fonksiyonları test**: Her birini admin JWT ile curl ile çağır, 200 bekle.
  - **Migration doğrula**: Supabase Dashboard → Migration History → Task 1 migration uygulanmış.
  - **Env var kontrol**: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, OPENROUTER_API_KEY, SUPABASE_SERVICE_ROLE_KEY Supabase Secrets'ta tanılı. Eğer UPSTASH yoksa Task 4 503 dönecek (beklenen).

  **Must NOT do**:
  - main branch'e push etmeden önce tüm Wave 1-3 task'ları tamam olmalı
  - Migration'ı Supabase Dashboard'dan manuel apply etme — supabase migration CLI ile
  - Service role key'i client'a expose etme
  - Yeni admin fonksiyonları deploy etmeden RLS migration'ı apply etme — admin edge function'lar service_role ile RLS bypass, ama user_roles INSERT/UPDATE policy admin için Task 1 ile eklenmeli (service_role zaten bypass, ama tutarlılık için)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Deploy + smoke test, kod değişikliği yok.
  - **Skills**: [`git-master`]

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3 (after Task 15, 16)
  - **Blocks**: F1-F4 (final verification)
  - **Blocked By**: ALL Tasks (1-16)

  **References**:
  - `supabase/deploy-all.sh` — mevcut deploy script
  - `package.json` — `smoke-test` script
  - `.github/workflows/uptime-check.yml` — health check pattern
  - `vercel.json` — Vercel config
  - `.env.example` — env var referans
  - `PRODUCTION_ENV_CHECKLIST.md` — production env checklist

  **WHY Each Reference Matters**:
  - deploy-all.sh: Tüm edge function'ları deploy eder
  - smoke-test: Deploy sonrası otomatik doğrulama
  - vercel.json: Vercel config
  - PRODUCTION_ENV_CHECKLIST: Env var kontrol listesi

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Edge functions deploy
    Tool: Bash
    Preconditions: Tüm task'lar commit edilmiş, SUPABASE_ACCESS_TOKEN set
    Steps:
      1. bash supabase/deploy-all.sh --project-ref $SUPABASE_PROJECT_ID
      2. Assert: tüm fonksiyonlar deploy edilir (21+ fonksiyon, 6 yeni admin dahil)
      3. curl $SUPABASE_URL/functions/v1/health → 200 + {status: "ok", checks: {database: "ok", redis: "ok"|"degraded"}}
    Expected Result: Tüm edge function'lar deploy + health 200
    Evidence: .omo/evidence/task-17-edge-deploy.txt

  Scenario: Yeni admin fonksiyonlar çalışır
    Tool: Bash (curl)
    Preconditions: Edge functions deploy edilmiş, admin JWT
    Steps:
      1. curl admin-list-users → 200
      2. curl admin-set-user-role → 200 (test user)
      3. curl admin-ban-user → 200 (test user, sonra unban)
      4. curl admin-cancel-room → 200 (test oda)
      5. curl admin-settle-room → 200 (test oda)
      6. curl admin-slippage-config → 200 (GET + POST)
    Expected Result: 6 yeni admin fonksiyon çalışır
    Evidence: .omo/evidence/task-17-admin-functions.txt

  Scenario: Vercel deploy
    Tool: Bash (git + vercel)
    Preconditions: Tüm commit'ler main branch'te
    Steps:
      1. git push origin main (veya varcel --prod)
      2. Assert: Vercel build success
      3. curl $VERCEL_URL/ → 200 (frontend yüklenir)
      4. curl $VERCEL_URL/admin/users → 200 (admin sayfası)
    Expected Result: Frontend deploy + admin sayfalar erişilebilir
    Evidence: .omo/evidence/task-17-vercel-deploy.txt

  Scenario: Smoke test
    Tool: Bash
    Preconditions: Deploy tamam
    Steps:
      1. npm run smoke-test
      2. Assert: tüm smoke test senaryoları PASS
    Expected Result: Smoke test tüm kritik akışları doğrular
    Evidence: .omo/evidence/task-17-smoke-test.txt

  Scenario: Migration uygulanmış
    Tool: Bash (supabase migration list)
    Preconditions: Edge functions deploy
    Steps:
      1. supabase migration list --project-ref $SUPABASE_PROJECT_ID
      2. Assert: {timestamp}_critical_prod_fixes_rls.sql "Applied" status
    Expected Result: Task 1 migration uygulanmış
    Evidence: .omo/evidence/task-17-migration-applied.txt
  ```

  **Commit**: YES
  - Message: `chore: deploy critical prod fixes (edge functions + vercel + migration)`
  - Files: (deploy only, kod değişikliği yok)

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npm run build`, `npm test`, `npm run lint`. Review all changed files for: type suppression, empty catches, debug logging in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify no client-side real_balance write, no percentage hallucination in AI prompts.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration: Blitz oynama akışı (bakiye yükle → eşleşme → oda → işlem → settlement), admin akışı (login → /admin/users → rol değiştir → /admin/rooms → oda iptal → /admin/settings → slippage), AI coach akışı (trade close → notification → kâr oranı doğru). Edge cases: yetersiz bakiye, Redis yok, davet kodu yanlış, cancel sonra tekrar. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance: NO ödeme entegrasyonu, NO withdrawal, NO /admin/trades, NO settlement/observability sekmeleri, NO toplu push, NO handle_new_user real_balance=100000, NO unit test. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1 commits**: Her task kendi commit'i (8 commit)
  - `fix(blitz): catch toast + davet kodu kalıcı UI + ön kontrol + etiket`
  - `fix(blitz): cancel bakiye leak + Redis check 503`
  - `fix(ai): trade-mirror prompt fiyat verisi + sert kurallar`
  - `fix(ai): execute-trade notification dolar + yüzde`
  - `fix(admin): reset-demo-account has_role + analytics_events policy`
  - `feat(admin): admin edge functions batch A (users)`
  - `feat(admin): admin edge functions batch B (rooms/settings)`
  - `feat(app): AppContext real_balance + useIsAdmin + ProtectedRoute + TopBar`
  - `feat(db): RLS admin policies + blitz_payout_trigger DROP`
- **Wave 2 commits**: 6 commit (her sayfa)
- **Wave 3 commits**: 3 commit (routing, settlement verification, deploy)
- **Final**: `chore: deploy critical prod fixes`

---

## Success Criteria

### Verification Commands
```bash
npm run build           # Expected: PASS, no errors
npm run lint            # Expected: PASS
npm test                # Expected: PASS (mevcut testler)
npx tsc --noEmit        # Expected: PASS, no type errors

# Edge functions deploy
bash supabase/deploy-all.sh --project-ref $SUPABASE_PROJECT_ID  # Expected: all 21+ functions deployed

# RLS verification
supabase db execute --sql "SELECT polname FROM pg_policy WHERE polrelid = 'profiles'::regclass;" # Expected: admin SELECT policy

# blitz_payout_trigger verification
supabase db execute --sql "SELECT tgname FROM pg_trigger WHERE tgname = 'blitz_payout_trigger';" # Expected: 0 rows (DROP edilmiş)

# Admin edge function test
curl -X POST $SUPABASE_URL/functions/v1/admin-list-users -H "Authorization: Bearer $ADMIN_JWT" # Expected: 200 + users array

# Blitz matchmaking test (yeterli bakiye)
curl -X POST $SUPABASE_URL/functions/v1/blitz-matchmake -H "Authorization: Bearer $USER_JWT" -d '{"mode":"quick","symbol":"BTCUSD","entry_fee":5}' # Expected: 200 {status:"active"|"queued"} veya 503 (Redis yok)

# AI Coach test (trade close)
curl -X POST $SUPABASE_URL/functions/v1/execute-trade -H "Authorization: Bearer $USER_JWT" -d '{"symbol":"BTCUSD","side":"sell","quantity":0.1,"action":"close","position_id":"..."}' # Expected: 200, notification title +$X (+Y%)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent (ödeme/withdrawal/admin trades/settlement sekmeleri/toplu push/handle_new_user real_balance/unit test)
- [ ] All edge functions deploy edilmiş
- [ ] Vercel main branch deploy edilmiş
- [ ] QA evidence files .omo/evidence/ altında mevcut
