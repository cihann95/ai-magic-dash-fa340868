# Feature Audit — Faz 7

## Sayfa Durum Tablosu

| Sayfa | Veri Kaynağı | Loading State | Error State | Edge Function | Durum |
|-------|-------------|---------------|-------------|---------------|-------|
| / (Index) | useLivePrices + SymbolList + ChartPanel + OpenPositionsPanel + AccountAIPanel | ✅ | ❌ | execute-trade, manage-order, ai-* | ✅ Çalışıyor |
| /portfolio | positions + trades + profiles + useLivePrices | ✅ (Promise.all) | ❌ | — | ✅ Çalışıyor |
| /history | trades | ✅ (Skeleton) | ❌ | — | ✅ Çalışıyor |
| /watchlist | watchlist + useLivePrices | ✅ (callback load) | ❌ | — | ✅ Çalışıyor |
| /settings | profiles + public_profiles + push | ✅ | ❌ (toast ile) | reset-demo-account | ✅ Çalışıyor |
| /leaderboard | get_leaderboard RPC + public_profiles | ❌ | ❌ | — | ✅ Çalışıyor |
| /achievements | achievements + user_achievements | ❌ | ❌ | — | ✅ Çalışıyor |
| /heatmap | useLivePrices | ✅ (hook) | ❌ | — | ✅ Çalışıyor |
| /social | followers + activity_feed + copy_settings + get_leaderboard | ✅ (Skeleton) | ✅ (retry) | manage-follow, manage-copy-settings | ✅ Çalışıyor |
| /coach | coach_insights + ai-trade-coach | ✅ | ✅ (toast) | ai-trade-coach | ✅ Çalışıyor |
| /journal | trade_journal + trades | ✅ | ❌ | — | ✅ Çalışıyor |
| /insights | trades + emotional_logs | ✅ | ❌ | — | ✅ Çalışıyor |
| /blitz | blitz_rooms + blitz-matchmake + blitz-join-private | ✅ | ✅ (toast) | blitz-matchmake, blitz-join-private | ✅ Çalışıyor |
| /blitz/:roomId | useBlitzRoom + blitz-tick-order + blitz-settle-room | ✅ | ✅ (toast) | blitz-tick-order, blitz-settle-room | ✅ Çalışıyor |
| /admin/blitz | platform_revenue + platform_revenue_daily + has_role | ✅ | ✅ (toast) | blitz-admin-topup | ✅ Çalışıyor |
| /auth | Supabase Auth | — | ✅ (toast) | — | ✅ Çalışıyor |
| /reset-password | Supabase Auth | — | ✅ (toast) | — | ✅ Çalışıyor |

**Skor: 17/17 (%100)**

## Copy Trading Flow Durumu (Faz 7 Sonrası)

1. **Follow**: /social → `manage-follow` edge function → followers INSERT ✅
2. **Copy Settings**: /social → `manage-copy-settings` edge function → copy_settings UPSERT ✅
3. **Trade Mirror**: trade-mirror edge function → leader trade yaptığında follower'a mirror ✅
4. **Trigger**: pg_trigger ile tetikleniyor ✅

**Not**: Tüm write'lar edge function üzerinden yapılıyor. Client-side write yok.

## Edge Function Listesi

| Fonksiyon | Kullanım | JWT | Rate Limit |
|-----------|----------|-----|------------|
| execute-trade | /, /portfolio | ✅ | 10/dk |
| manage-order | / | ✅ | 30/dk |
| manage-follow | /social | ✅ | 10/dk |
| manage-copy-settings | /social | ✅ | 5/dk |
| ai-chat | / | ✅ | 20/dk |
| ai-analyze | / | ✅ | 10/dk |
| ai-strategy | / | ✅ | 15/dk |
| ai-trade-coach | /coach | ✅ | 15/dk |
| ai-risk-monitor | / | ✅ | 15/dk |
| blitz-matchmake | /blitz | ✅ | 5/dk |
| blitz-join-private | /blitz | ✅ | 5/dk |
| blitz-tick-order | /blitz/:roomId | ✅ | 30/dk |
| blitz-settle-room | /blitz/:roomId | ✅ | 3/dk |
| blitz-admin-topup | /admin/blitz | ✅ | 2/dk |
| trade-mirror | pg_trigger | ✅ | — |
| reset-demo-account | /settings | ✅ | 2/dk |
| health | CI/monitoring | ❌ | — |
| price-feed | pg_cron | ❌ | — |
| news-feed | pg_cron | ❌ | — |

## RLS Durumu

- `followers`: INSERT/DELETE policy (self only) ✅
- `copy_settings`: INSERT/UPDATE/DELETE policy (self + follower check) ✅
- `guard_copy_settings_update` trigger: leader_id/follower_id immutability ✅
- Edge function'lar service_role kullanıyor → RLS bypass ✅

## Öneriler (Kalan)

1. **Kısa Vade**: /leaderboard loading state ekle
2. **Orta Vade**: Tüm sayfalarda error boundary ekle
3. **Uzun Vade**: /history, /watchlist, /settings error state ekle
