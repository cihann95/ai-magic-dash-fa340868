## BÖLÜM 1 — TECH STACK
FRONTEND:
  - Framework/kütüphane: React 18.3.1 / Vite 5.4.19
  - UI kütüphanesi: shadcn (Radix UI + Tailwind CSS)
  - State yönetimi: React Context (AppContext)
  - Grafik kütüphanesi: TradingView Advanced Chart Widget + Recharts
  - Paket yöneticisi: npm (package-lock.json mevcut, tek paket yöneticisi olarak sabitlendi)
BACKEND:
  - Supabase kullanılıyor mu?: Evet
    - Edge Functions listesi: ai-analyze, ai-chat, ai-risk-monitor, ai-strategy, ai-trade-coach, blitz-admin-topup, blitz-analytics-writer, blitz-join-private, blitz-matchmake, blitz-settle-room, blitz-tick-order, daily-brief, execute-trade, manage-copy-settings, manage-follow, manage-order, news-feed, price-feed, reset-demo-account, send-push, trade-mirror, weekly-digest
    - Realtime subscription var mı?: Evet — notifications, price_cache, coach_insights, copy_settings, blitz_rooms, blitz_participants, blitz_orders, user_stats, positions, orders, price_alerts vb.
    - RLS aktif mi?: Evet — profiles, positions, trades, orders, notifications, public_profiles, copy_settings, coach_insights, push_subscriptions, emotional_logs, followers, blitz_rooms, blitz_participants, blitz_orders, platform_revenue, real_balance_ledger, settlement_ledger, slippage_config, analytics_events, observability_log vb.
  - Harici API'ler:
    - Binance WebSocket (wss://stream.binance.com:9443/) — kripto fiyatları
    - Binance REST — 24h change desteğiyle ticker
    - TradingView widget — grafik verisi
    - OpenRouter / AI provider — ai-analyze, ai-chat, ai-strategy, ai-trade-coach, trade-mirror vb.
    - Upstash Redis — fail-open cache/backing
DEPLOYMENT:
  - Hosting: Vercel
  - CI/CD: GitHub Actions (frontend-tests, edge-function-tests, blitz-types-sync, crash-test)
  - Ortamlar: prod bilgisi net değil; staging kalıbı görünmüyor; .env’de default development var
## BÖLÜM 2 — PROJE MİMARİSİ
DOSYA YAPISI (yalnızca kritik klasörler):
/
├── src/
│   ├── pages/         → /, /auth, /reset-password, /portfolio, /history, /watchlist, /settings, /leaderboard, /achievements, /heatmap, /social, /coach, /journal, /insights, /blitz, /blitz/:roomId, /admin/blitz, * (NotFound)
│   ├── components/
│   │   ├── trading/   → AccountAIPanel, AlertsPanel, ChartPanel, IntentDialog, OpenPositionsPanel, OrderTicket, SymbolList, TradeActions
│   │   ├── blitz/     → BlitzLeaderboard, BlitzTimer
│   │   └── ui/        → shadcn/ui bileşenleri
│   │       └── AnaSahne/
│   ├── lib/           → binanceStream.ts, symbols.ts, config.ts, feature-flags.ts, i18n.ts, utils.ts, observability.ts, pushSubscribe.ts, achievements.ts, blitzSfx.ts, edge-function-types.ts
│   ├── hooks/         → useLivePrices.ts, useBlitzRoom.ts, useAnaSahne.ts, useAlertNotifications.ts, useAnalytics.ts, useEmotionalSignal.ts, useSpectatorBroadcast.ts, useWeeklyDigest.ts, useKeyboardShortcuts.ts, useMobile.tsx, useToast.ts
│   ├── contexts/      → AppContext.tsx
│   └── integrations/
│       └── supabase/  → client.ts, types.ts
├── supabase/
│   ├── functions/     → 15+ edge function
│   └── migrations/    → 39 migration
└── .env / .env.example
VERİTABANI TABLOLARI:
- user_roles → RLS var
  - id, user_id, role (app_role enum: admin/user), created_at
- profiles → RLS var
  - id, display_name, avatar_url, demo_balance, initial_balance, real_balance, real_balance_locked, preferred_language, preferred_theme, trader_persona, last_weekly_digest_at, preferred_view, created_at, updated_at
- positions → RLS var (financial update korumalı: backend-only)
  - id, user_id, symbol, asset_class, side, quantity, entry_price, current_price, opened_at, updated_at
- trades → RLS var (client insert kaldırılmış; immutable; genişletilmiş)
  - id, user_id, symbol, asset_class, side, action, quantity, price, total, pnl, executor, executed_at, copied_from, leader_user_id, planned_tp, planned_sl, plan_adherence, intent_tag, intent_note
- orders → RLS var
  - id, user_id, symbol, asset_class, order_type, side, quantity, trigger_price, limit_price, position_id, status, filled_at, fill_price, expires_at, created_at, updated_at
- price_cache → RLS var
  - symbol, asset_class, price, change_24h, change_pct_24h, volume_24h, updated_at
- price_alerts → RLS var
  - id, user_id, symbol, asset_class, direction, target_price, triggered, triggered_at, note, created_at
- watchlist → RLS var (kolon detayı: doldurulmadı)
- notifications → RLS var
  - id, user_id, type, title, body, link, metadata (jsonb), read, created_at
- public_profiles → RLS var
  - user_id, username, bio, is_active, show_portfolio, show_trades, copyable, created_at, updated_at
- achievements → RLS var (kolon detayı: doldurulmadı)
- user_stats → RLS var (sensitive columns backend-only korumalı)
  - user_id, onboarding_completed, xp, level, total_pnl, total_trades, profitable_trades, best_trade_pnl, current_streak, longest_streak, last_active_date, ai_uses, asset_classes_traded, updated_at
- user_achievements → RLS var (public read: show_portfolio opt-in)
  - kolon detayı: doldurulmadı
- copy_settings → RLS var
  - id, follower_id, leader_id, enabled, ratio, max_position_usd, asset_classes, created_at, updated_at
- coach_insights → RLS var
  - id, user_id, category, severity, title, body, metadata (jsonb), acknowledged, created_at
- push_subscriptions → RLS var
  - id, user_id, endpoint, p256dh, auth, user_agent, created_at
- emotional_logs → RLS var
  - id, user_id, trade_id, signal_type, mood, symbol, created_at
- followers → RLS var
  - kolon detayı: doldurulmadı
- ai_conversations → RLS var (kolon detayı: doldurulmadı)
- ai_messages → RLS var (kolon detayı: doldurulmadı)
- daily_briefs → RLS var (kolon detayı: doldurulmadı)
- trade_journal → RLS var (kolon detayı: doldurulmadı)
- blitz_rooms → RLS var
  - id, symbol, entry_fee, status (blitz_status), mode (blitz_mode), invite_code, max_players, starts_at, ends_at, start_price, winner_id, pot, fee_collected, created_by, updated_by, created_at, updated_at, is_featured
- blitz_participants → RLS var
  - kolon detayı: doldurulmadı
- blitz_orders → RLS var
  - kolon detayı: doldurulmadı
- platform_revenue → RLS var
  - id, source, room_id, amount, currency, metadata (jsonb), created_at
- real_balance_ledger → RLS var
  - id, user_id, granted_by, amount, reason, created_at
- settlement_ledger → RLS var
  - id, room_id, idempotency_key, settlement_type, winner_id, prize_amount, fee_collected, pot_total, participant_count, status, error_message, metadata (jsonb), created_at
- slippage_config → RLS var
  - symbol, max_slippage_pct, mode, updated_at
- analytics_events → RLS var (kolon detayı: doldurulmadı)
- analytics_events_staging → RLS var (kolon detayı: doldurulmadı)
- observability_log → görünüyor (kolon detayı: doldurulmadı)
VIEWS:
- activity_feed (security_invoker)
- ana_sahne_view (security_invoker + security_barrier)
- platform_revenue_daily (security_invoker)
ENUMS:
- app_role: admin, user
- blitz_status: waiting, active, settling, finished, cancelled
- blitz_mode: public, private
- blitz_side: long, short
## BÖLÜM 3 — MODÜLLER VE ÖZELLİKLER
TRADE PANELİ:
  - Alım/satım işlemi akışı: UI (OrderTicket / TradeActions) → Supabase Edge Functions (execute-trade / blitz-tick-order / blitz-settle-room vb.) → service_role ile positions, trades, user_stats, price_cache, blitz_orders, real_balance_ledger güncellenir. Client direct INSERT/UPDATE prohibit edilmiştir.
  - Desteklenen enstrümanlar: Crypto (Binance üzerinden 8 sembol: BTCUSD, ETHUSD, SOLUSD, BNBUSD, XRPUSD, DOGEUSD, ADAUSD, AVAXUSD) + Ek menuki semboller FOREX/Hisse/Emtia desteği var gibi görünüyor; ancak canlı fiyat akışı kriptoya odaklı
  - Emir tipleri: Limit, Stop, Take Profit, Stop Loss (sembol seviyesinde slippage kontrolü var)
FİYAT SİSTEMİ:
  - Fiyat kaynağı: Binance WebSocket trade stream + ticker; ayrıca supabase price_cache + pg_cron tetiklemeli price-feed edge function
  - Güncelleme yöntemi: WebSocket (anlık tick) + Supabase Realtime (postgres_changes) + 5sn polling yedek (useLivePrices)
  - Cache var mı?: Evet — public.price_cache + client tarafında window.__binance_stream singleton buffer + Upstash Redis (opsiyonel)
GRAFİK SİSTEMI:
  - Kütüphane: TradingView Advanced Chart Widget (embed-widget-advanced-chart.js) + Recharts
  - Veri kaynağı: TradingView kendi sunucularından chart verisi; canlı tick için Binance + price_cache
  - Desteklenen zaman dilimleri: TradingView widget içinde varsayılan "60" (1h) görülüyor; UI tarafında timeframe değiştirme görünmüyor
KİMLİK DOĞRULAMA:
  - Yöntem: Supabase Auth (signUp + signInWithPassword)
  - Oturum yönetimi: supabase.auth.onAuthStateChange + localStorage (persistSession: true)
  - Korumalı route'lar: ProtectedRoute ile korunan sayfalar — Portfolio, History, Watchlist, Settings, Leaderboard, Achievements, Heatmap, Social, Coach, Journal, Insights, Blitz, BlitzRoom, AdminBlitz
POPUP / ONBOARDING:
  - Hoşgeldin popup'ı: src/components/OnboardingTour.tsx
  - Gösterim koşulu: user_stats.onboarding_completed == false ise ilk girişte göster; bitince supabase.rpc("mark_onboarding_complete") çağrılır
OBSERVABILITY:
  - Sentry entegrasyonu: @sentry/react kurulu, Sentry.init() VITE_SENTRY_DSN ile başlatılıyor (tracesSampleRate: 0.1, sadece prod'da aktif)
  - ErrorBoundary: Sentry.ErrorBoundary ile App.tsx wrap edildi; ErrorFallback bileşeni "Bir şeyler ters gitti" + "Sayfayı Yenile" butonu + dev modda teknik detay accordion
  - Global error listeners: unhandledrejection ve window.error listener'ları Sentry'ye raporluyor
  - Edge Functions observability: _shared/observability.ts ile logObservability() RPC'si kullanılıyor; manage-order ve AI fonksiyonlarında hata durumlarında observability_log tablosuna yazılıyor
  - Frontend observability.ts: Sentry captureException + captureMessage entegrasyonu mevcut
TEST COVERAGE:
  - manage-order test dosyası: supabase/functions/__tests__/manage-order.test.ts — 7 senaryo (place valid/invalid/auth/rate-limit, cancel valid/forbidden/not-open)
  - Breakpoint senaryoları: 375px (iPhone SE), 768px (iPad), 1280px (laptop), 1920px (desktop) — mobile Tabs layout, desktop ResizablePanelGroup
## BÖLÜM 4 — BİLİNEN SORUNLAR
SORUN 1:
  - Belirti: npm ve birden fazla lockfile aynı repoda var
  - Hata mesajı: yok (potansiyel kurulum/CI çakışması)
  - Etkilenen dosya/fonksiyon: package.json, package-lock.json
  - Kök neden tahmini: araştırılmadı (birden fazla paket yöneticisi kullanımı izleniyor)
  - Öncelik: yüksek
  - Durum: ÇÖZÜLDÜ — bun.lock ve bun.lockb silindi; .gitignore'a eklendi; package.json'a engines + packageManager eklendi
SORUN 2:
  - Belirti: Client-side trade/position yazma politikaları migration'larda kaldırıldı; frontend hala eski writable çağrılar yapıyor olabilir
  - Hata mesajı: 401/403 Forbidden veya RLS violation
  - Etkilenen dosya/fonksiyon: src/components/trading/OrderTicket.tsx → manage-order Edge Function'a yönlendirildi
  - Kök neden tahmini: frontend'de direk client insert/update kalıntısı olabilir; backend authoritativeness’e geçildi
  - Öncelik: kritik
  - Durum: ÇÖZÜLDÜ — OrderTicket.tsx'teki orders.insert() ve orders.update() manage-order Edge Function'ına dönüştürüldü. Positions/trades tablolarında zaten client-side write yok.
SORUN 3:
  - Belirti: price_cache RLS anon politika migration'larda birden fazla değişiklik geçirdi
  - Hata mesajı: 401/403 veya boş fiyat cache
  - Etkilenen dosya/fonksiyon: supabase/migrations/*price_cache* + src/hooks/useLivePrices.ts
  - Kök neden tahmini: production hard fix migration'ları akışı sırasında policy override olabilir
  - Öncelik: yüksek
  - Durum: ÇÖZÜLDÜ — Migration 20260618223000 ile anon SELECT policy eklendi; useLivePrices.ts try/catch + fallback ile korunuyor
SORUN 4:
  - Belirti: AI edge function'ları hata/timeout mapping'leri varyasyonlu
  - Hata mesajı: 503, AI_TIMEOUT, skipped reason codes
  - Etkilenen dosya/fonksiyon: tüm AI edge function'ları standartlaştırıldı
  - Kök neden tahmini: sadece trade-mirror'a özel AbortController + OpenRouter error mapping eklendi; diğer AI fonksiyonlarında henüz kontrol edilmedi
  - Öncelik: yüksek
  - Durum: ÇÖZÜLDÜ — 7 AI edge function'ında tutarlı error envelope ({error, code, retryable} / {skipped, reason, code, retryable}) uygulandı
SORUN 5:
  - Belirti: manage-order Edge Function'ı yeni yazıldı, production'da test edilmedi
  - Hata mesajı: potansiyel request validation, auth, ownership hataları
  - Etkilenen dosya/fonksiyon: supabase/functions/manage-order/index.ts
  - Kök neden: yeni fonksiyon için test coverage yoktu
  - Öncelik: kritik
  - Durum: ÇÖZÜLDÜ — 7 senaryo için unit test oluşturuldu (supabase/functions/__tests__/manage-order.test.ts); OrderTicket.tsx'e retry butonu eklendi
SORUN 6:
  - Belirti: Sentry DSN env var'ları tanımlı ama SDK kullanılmıyordu; observability_log tablosu boştu
  - Hata mesajı: production hataları izlenemiyor
  - Etkilenen dosya/fonksiyon: src/lib/observability.ts, src/App.tsx, supabase/functions/_shared/
  - Kök neden: Sentry SDK kurulmamış, ErrorBoundary yoktu
  - Öncelik: yüksek
  - Durum: ÇÖZÜLDÜ — @sentry/react kuruldu, Sentry.init() eklendi, ErrorFallback bileşeni yazıldı, edge function'larda observability_log entegrasyonu sağlandı
SORUN 7:
  - Belirti: Realtime subscription'lar component unmount'ta cleanup edilmeyebilir → memory leak + duplicate event
  - Hata mesajı: konsolda "channel already exists" uyarıları, memory artışı
  - Etkilenen dosya/fonksiyon: src/hooks/useAlertNotifications.ts, src/components/trading/OrderTicket.tsx
  - Kök neden: channel isimleri generic (price_alerts_user, orders_user) — userId içermiyordu
  - Öncelik: yüksek
  - Durum: ÇÖZÜLDÜ — tüm channel isimlerine userId suffix eklendi; cleanup fonksiyonları zaten mevcuttu doğrulandı
SORUN 8:
  - Belirti: lg altında (<1024px) ResizablePanelGroup dikey modda mobile'da kullanışsız
  - Hata mesajı: drag handle mobilde işlevsiz, içeriğe erişim zor
  - Etkilenen dosya/fonksiyon: src/pages/Index.tsx
  - Kök neden: responsive layout için mobile-specific UI yoktu
  - Öncelik: orta
  - Durum: ÇÖZÜLDÜ — lg altında ResizablePanelGroup yerine Tabs (Pozisyonlar/AI) ile tek alanda geçiş; useLocalStorage hook'u ile son sekme hatırlanıyor
SORUN 9:
  - Belirti: E2E test senaryoları eksikti — sadece auth ve blitz vardı
  - Hata mesajı: dashboard, order ticket, mobile responsive testleri yoktu
  - Etkilenen dosya/fonksiyon: e2e/critical-flows.spec.ts (yeni oluşturuldu)
  - Kök neden: production readiness için kritik user flow'lar test edilmemişti
  - Öncelik: yüksek
  - Durum: ÇÖZÜLDÜ — 5 senaryo yazıldı (auth, dashboard, order ticket, mobile, blitz)
SORUN 10:
  - Belirti: Bundle optimize edilmemişti — tek chunk tüm vendor'ları içeriyordu
  - Hata mesajı: büyük bundle → yavaş yükleme
  - Etkilenen dosya/fonksiyon: vite.config.ts (manualChunks eklendi)
  - Kök neden: manualChunks konfigürasyonu eksikti
  - Öncelik: orta
  - Durum: ÇÖZÜLDÜ — vendor-react, vendor-supabase, vendor-charts, vendor-ui ayrıldı
## BÖLÜM 5 — ORTAM DEĞİŞKENLERİ
.env dosyasındaki KEY isimleri ve açıklamaları:
- NODE_ENV
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY
- VITE_ANA_SAHNE_ENABLED
- VITE_VAPID_PUBLIC_KEY
- VITE_SENTRY_DSN
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SUPABASE_ANON_KEY
- LOVABLE_API_KEY
- UPSTASH_REDIS_REST_URL
- UPSTASH_REDIS_REST_TOKEN
- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- VAPID_SUBJECT
- SENTRY_DSN
- LOG_LEVEL
- OPENROUTER_API_KEY
Supabase Dashboard → Settings → Edge Functions → Secrets’ta ayrıca yönetilenler:
- x-cron-secret (Supabase Vault içinde cron_secret adıyla saklı; Supabase Secrets listesinde ayrıca görülmüyorsa DB Vault kullanılıyor)
- OPENROUTER_API_KEY (edge fonksiyonlarda env olarak bekleniyor)
Eksik olduğundan şüphelenenler:
  ⚠️ EKSİK OLABİLİR: VITE_SUPABASE_ANON_KEY — eski fallback ismi hala destekleniyor (.env.example’da var), ama proje canlı ortamda VITE_SUPABASE_PUBLISHABLE_KEY ana isimle taşınacak
  ⚠️ EKSİK OLABİLİR: OPENROUTER_API_KEY — .env.example’da Edge Functions bölümünde adı geçiyor; Edge Deployment Secrets’ta tanımlı olması gerekir
## BÖLÜM 6 — BAĞIMLILIKLAR
package.json kritik paketleri:
CORE:
- react: 18.3.1
- react-dom: 18.3.1
- vite: 5.4.19
- typescript: 5.8.3
- @vitejs/plugin-react-swc: 3.11.0
UI:
- @radix-ui/*: 1.1.x / 1.2.x / 1.3.x karışık sürümler (accordion, alert-dialog, aspect-ratio, avatar, checkbox, collapsible, context-menu, dialog, dropdown-menu, hover-card, label, menubar, navigation-menu, popover, progress, radio-group, scroll-area, select, separator, slider, slot, switch, tabs, toast, toggle, toggle-group, tooltip)
- tailwindcss: 3.4.17
- @tailwindcss/typography: 0.5.16
- tailwind-merge: 2.6.0
- class-variance-authority: 0.7.1
- clsx: 2.1.1
- framer-motion: 12.40.0
- lucide-react: 0.462.0
- sonner: 1.7.4
- cmdk: 1.1.1
- embla-carousel-react: 8.6.0
- vaul: 0.9.9
- react-resizable-panels: 2.1.9
- shadcn klasik seti için next-themes: 0.3.0 (React 18 + Vite ortamında şüpheli olabilir)
- input-otp: 1.4.2
- react-day-picker: 8.10.1
DATA:
- recharts: 3.8.1
- @tanstack/react-query: 5.83.0
- @tanstack/query-core: 5.83.0
- zod: 3.25.76
- react-hook-form: 7.61.1
- @hookform/resolvers: 3.10.0
- date-fns: 3.6.0
BACKEND:
- @supabase/supabase-js: 2.103.3
TESTS:
- vitest: 3.2.4
- @vitest/coverage-v8: 3.2.4
- @testing-library/react: 16.0.0
- @testing-library/jest-dom: 6.6.0
- @playwright/test: 1.61.0
SORUNLU OLABİLECEKLER:
  - Son 30 günde versiyon değişti mi?: framer-motion 12.40.0 (major), recharts 3.8.1, @tanstack/react-query 5.83.x, radix-ui 1.2/1.3 karışık
  - Birbirleriyle çakışan paket var mı?: react-router-dom 6.30.1 + cmdk + dialog/popover kombinasyonu modal routing ile çakışabilir; next-themes 0.3.0 Vite uygulamasında mantıksal uyumsuzluk; bun.lock + package-lock.json eşzamanlılığı paket yönetimi riski yaratıyor
────────────────────────────
📋 PROJE ÖZETİ (3-5 cümle):
Proje, React 18 + Vite + Supabase üzerine kurulu bir trading dashboard ve "Blitz" oyun modu içeriyor. Fiyat verisi Binance WebSocket ve Supabase Realtime/postgres_changes ile price_cache’ten servis edilirken, grafikler TradingView Advanced Chart Widget ile sağlanıyor. Supabase Auth + RLS ile güçlü bir güvenlik katmanı kurulmuş; son migration’larda client-side trade/position yazmaları kaldırılıp Edge Functions + service_role authoritativeness’e geçilmiştir. Açık riskler: paket yönetisinde npm/bun çakışması ve price_cache RLS/policy akışındaki geçmiş değişikliklerin prod etkisiyle, AI edge fonksiyonlarının hata/timeout yaklaşımlarının standart olmayan dağılımı.
⚠️ HEMEN DİKKAT EDİLMESİ GEREKENLER:
1) Litelock çakışması: repo aynı anda package-lock.json ve bun.lock taşıyor; tek paket yöneticisine sabitlenmeli
2) Client trade write engeli: migration’larda “revolk insert/update” uygulandı; eğer frontend hala client tarafından trade/position/order insert/update yapıyorsa 403 alınır — dirençli eşleşme sağlanmalı
3) price_cache RLS akışı: birden fazla migration ile override edildi; prod DB şeması ile `.env.example`/frontend beklentisi tekrar kontrol edilmeli
4) cron_secret taşınması: pg_cron → edge function çağrısı için Supabase Vault’ta saklanıyor; yeni ortamda Vault secret kurulumu unutulabilir
5) AI edge timeout/handle sapması: sadece trade-mirror’da standartlaştırıldı; ai-chat/ai-risk-monitor/ai-strategy/ai-trade-coach/ai-analyze/daily-brief/weekly-digest’te benzer değil
## BÖLÜM 7 — DEPLOYMENT REHBERİ

VERCEL DEPLOYMENT:
  - Hosting: Vercel (otomatik deploy, main dalına push ile)
  - Zorunlu env var'lar (Vercel Dashboard → Settings → Environment Variables):
    * VITE_SUPABASE_URL — Supabase proje URL'i
    * VITE_SUPABASE_PUBLISHABLE_KEY — Supabase anon key
    * VITE_ANA_SAHNE_ENABLED — Ana Sahne section toggle (true/false)
  - Opsiyonel env var'lar:
    * VITE_VAPID_PUBLIC_KEY — Web Push bildirimleri
    * VITE_SENTRY_DSN — Sentry hata takibi

SUPABASE EDGE FUNCTIONS:
  - Deploy yöntemi: Manuel (deploy-all.sh) veya CI (GitHub Actions + SUPABASE_ACCESS_TOKEN)
  - Manuel deploy: bash supabase/deploy-all.sh --project-ref <REF>
  - Fonksiyon sayısı: 21 (health endpoint dahil)
  - JWT gereksinimleri: price-feed, news-feed, health public (--no-verify-jwt), diğerleri auth gerektirir
  - Health endpoint: GET /functions/v1/health → {status, timestamp, version, checks: {database, redis}}
  - Uptime monitoring: GitHub Actions her 15 dakikada health check (.github/workflows/uptime-check.yml)
  - Smoke test: npm run smoke-test → deploy sonrası otomatik doğrulama

GITHUB SECRETS:
  - SUPABASE_ACCESS_TOKEN: Supabase Dashboard → Account → Access Tokens
  - SUPABASE_PROJECT_ID: Supabase Dashboard → Settings → General → Reference ID
  - Bu secret'lar eklendiğinde CI otomatik deploy eder
  - Eksikse deploy-edge-functions workflow skip edilir (fail olmaz)

CI/CD AKIŞ:
  1. Push → GitHub Actions tetiklenir
  2. Frontend Unit Tests (vitest) → tüm testler geçmeli
  3. Edge Function Tests (vitest) → edge function testleri
  4. Blitz Types Sync Check → type senkronizasyonu
  5. Hard Technical Audit → crash test suite
  6. E2E Tests (Playwright) → kritik user flow'lar
  7. Deploy Edge Functions → deploy-all.sh ile tüm fonksiyonlar
  8. Health Check → /functions/v1/health → 200 veya 401
  9. Smoke Test → npm run smoke-test
  10. Vercel → otomatik build & deploy

SENTRY PRODUCTION:
  - release: VITE_APP_VERSION (package.json version)
  - ignoreErrors: ResizeObserver, Non-Error promise rejection, ChunkLoadError
  - beforeSend: console.error noise filter
  - tracesSampleRate: 0.1 (prod'da %10 tracing)

## BÖLÜM 8 — GÜVENLİK

RATE LIMITING:
  - Upstash Redis-backed sliding window rate limiting
  - Tüm para hareketi yapan fonksiyonlarda aktif
  - Fail-open: Redis down ise rate limit bypass
  - Limitler: execute-trade(10/dk), blitz-matchmake(5/dk), ai-chat(20/dk), ai-analyze(10/dk)

INPUT VALIDATION:
  - Zod schema validation tüm critical endpoint'lerde
  - execute-trade: 8 geçerli sembol, pozitif miktar, max 1M
  - manage-order: discriminatedUnion (place/cancel)
  - blitz-join-private: invite_code alphanumeric, 4-32 karakter
  - AI fonksiyonları: zaten Zod kullanıyordu

CORS:
  - Shared _shared/cors.ts ile merkezi yapılandırma
  - ALLOWED_ORIGIN env var'ı ile production'da kısıtlanabilir
  - Varsayılan: * (development)

SECURITY HEADERS (vercel.json):
  - CSP: TradingView widget frame-src dahil
  - HSTS: 1 yıl
  - X-Frame-Options: DENY
  - X-Content-Type-Options: nosniff

JWT:
  - Tüm user-facing fonksiyonlarda JWT doğrulama aktif
  - Public endpoint'ler: price-feed, news-feed (pg_cron çağrısı)
  - System endpoint'ler: send-push (DB trigger), blitz-settle-room (cron)
  - Admin endpoint'ler: blitz-admin-topup (admin role check)

real_balance_ledger:
  - Immutable: UPDATE/DELETE policy'leri yok
  - INSERT sadece service_role
  - granted_by kolonu her zaman dolu

## BÖLÜM 9 — FEATURE STATUS

GENEL DURUM:
  - Toplam sayfa: 17 (auth dahil)
  - Çalışan: 17 (%100) ✅
  - Eksik: 0

SAYFA DURUMLARI:
  - / (Index): ✅ Çalışıyor — trading dashboard, sembol listesi, grafik, pozisyonlar, AI panel (height zinciri düzeltildi)
  - /portfolio: ✅ Çalışiyor — positions, trades, profiles, live prices, PnL hesaplama
  - /history: ✅ Çalışıyor — loading state eklendi (Faz 6)
  - /watchlist: ✅ Çalışıyor — watchlist CRUD, live prices
  - /settings: ✅ Çalışıyor — profil, public profil, tema, push, demo reset
  - /leaderboard: ✅ Çalışıyor — get_leaderboard RPC, join/leave
  - /achievements: ✅ Çalışıyor — achievements + user_achievements
  - /heatmap: ✅ Çalışıyor — useLivePrices, renkli grid
  - /social: ✅ Çalışıyor — edge function write, error/empty/loading state (Faz 7)
  - /coach: ✅ Çalışıyor — coach_insights + ai-trade-coach edge function (AI context eklendi)
  - /journal: ✅ Çalışıyor — trade_journal CRUD
  - /insights: ✅ Çalışıyor — intent mirror, plan discipline, emotion mirror
  - /blitz: ✅ Çalışıyor — matchmaking, private room, queue
  - /blitz/:roomId: ✅ Çalışıyor — 60s timer, trading, leaderboard, settlement
  - /admin/blitz: ✅ Çalışıyor — admin role check, revenue dashboard, top-up
  - /auth: ✅ Çalışıyor — Supabase Auth
  - /reset-password: ✅ Çalışıyor — Supabase Auth

COPY TRADING FLOW:
  1. Follow: /social → manage-follow edge function → followers INSERT ✅
  2. Copy Settings: /social → manage-copy-settings edge function → copy_settings UPSERT ✅
  3. Trade Mirror: trade-mirror edge function ✅
  4. Trigger: pg_trigger ile tetikleniyor ✅
  - Tüm write'lar edge function üzerinden (client-side write yok)

EDGE FUNCTION KULLANIMI:
  - execute-trade: /, /portfolio (trading)
  - manage-order: / (order ticket)
  - manage-follow: /social (takip et/bırak)
  - manage-copy-settings: /social (copy ayarları)
  - ai-chat: / (AI panel — anlık fiyat + pozisyon + bakiye ile)
  - ai-analyze: / (AI panel — anlık fiyat + pozisyon + bakiye ile)
  - ai-strategy: / (AI panel — anlık fiyat + pozisyon + bakiye ile)
  - ai-trade-coach: /coach (davranış analizi + anlık portföy context)
  - ai-risk-monitor: / (cron — tüm pozisyonları tarar)
  - blitz-matchmake: /blitz
  - blitz-join-private: /blitz
  - blitz-tick-order: /blitz/:roomId
  - blitz-settle-room: /blitz/:roomId (cron)
  - blitz-admin-topup: /admin/blitz
  - trade-mirror: pg_trigger
  - reset-demo-account: /settings
  - health: CI/monitoring

AI CONTEXT (Faz 8):
  - build-ai-context.ts: 5 veri kaynağı (price_cache, positions, profiles, user_stats, trades)
  - Her kaynak bağımsız try/catch — partial context on failure
  - ai-analyze: symbol + price + positions + balance + recentTrades
  - ai-chat: positions + balance + recentTrades + selectedSymbol
  - ai-strategy: price + positions + balance + recentTrades
  - ai-trade-coach: behavior stats + portfolio context
  - AccountAIPanel: selectedSymbol tüm AI çağrılarına gönderiliyor

AI MODEL KARARI:
  - Tüm AI fonksiyonları: openai/gpt-4o-mini (OpenRouter üzerinden)
  - OPENROUTER_API_KEY: Supabase Secrets'ta tanımlı (16 Haz 2026)
  - LOVABLE_API_KEY: .env'de var ama edge function'larda kullanılmıyor (vestigial)
  - Karar: Model yükseltme yapılmayacak, gpt-4o-mini ile devam

HATA YÖNETİMİ (Faz 8):
  - edge-error.ts: callEdgeFunction wrapper — Supabase raw error parse, Türkçe mesajlar, retry
  - Tüm frontend edge function çağrıları callEdgeFunction üzerinden
  - Spesifik error codes: INSUFFICIENT_BALANCE, ROOM_FULL, LOCK_FAILED, AI_TIMEOUT, vb.

UI DÜZELTMELERİ (Faz 8):
  - AccountAIPanel: TabsContent height zinciri düzeltildi (min-h-0 + data-[state] pattern)
  - Mobil layout: TabsContent height düzeltildi

DEPLOY DURUMU:
  - 22 Haz 2026: ai-analyze, ai-chat, ai-strategy, ai-trade-coach deploy edildi (build-ai-context entegrasyonu)
  - Tüm AI fonksiyonları artık güncel fiyat + portföy context'i alıyor

🏁 Faz 8 tamamlandı — AI context + error handling + UI düzeltmeleri. Edge functions deploy edildi.
