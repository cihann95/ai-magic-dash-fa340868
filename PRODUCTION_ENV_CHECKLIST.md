# Production Environment Checklist — Vercel Deployment

Bu dosya **Vercel'e deploy** için gerekli ortam değişkenlerini listeler.

> **ÖNEMLİ:** Edge Function değişkenleri (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `OPENROUTER_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SENTRY_DSN`, `LOG_LEVEL`, `x-cron-secret`) **Vercel'de DEĞİL**, **Supabase Dashboard → Edge Functions → Environment Variables** bölümünde ayarlanır. Vercel'e sadece `VITE_*` prefix'li frontend değişkenleri eklenir.

---

## Frontend Değişkenleri (Vercel'e eklenir — `VITE_*` prefix'li, tarayıcıda görünür)

| Değişken | Zorunlu | Eksikse Ne Bozulur |
|----------|---------|-------------------|
| VITE_SUPABASE_URL | Evet | Supabase bağlantısı kurulamaz, tüm API çağrıları (auth, realtime, database) başarısız olur — uygulama tamamen çalışmaz |
| VITE_SUPABASE_PUBLISHABLE_KEY | Evet | Supabase anon key eksik → kimlik doğrulama başarısız, Realtime abonelikleri çalışmaz, RLS politikaları engellenir |
| VITE_ANA_SAHNE_ENABLED | Hayır | `false` varsayılanı alır → Ana Sahne (landing page hero bölümü) gizlenir, sadece bu bölüm etkilenir |
| VITE_VAPID_PUBLIC_KEY | Hayır | Web Push bildirimleri çalışmaz (tarayıcı push aboneliği oluşturulamaz), bildirim izni istenemez |
| VITE_SENTRY_DSN | Hayır | Frontend hata takibi (Sentry) devre dışı kalır, production hataları görüntülenemez |

---

## Edge Function Değişkenleri (Supabase Dashboard'da ayarlanır — Vercel'de YOK)

| Değişken | Zorunlu | Eksikse Ne Bozulur |
|----------|---------|-------------------|
| SUPABASE_URL | Evet | Edge function'lar Supabase'e bağlanamaz — tüm backend işlemleri (trade, AI, blitz, notifications) çöker |
| SUPABASE_SERVICE_ROLE_KEY | Evet | Service role yetkisi olmadan RLS bypass edilemez → positions, trades, orders, user_stats, real_balance_ledger yazılamaz |
| SUPABASE_ANON_KEY | Evet | Anon key ile client-compatible çağrılar yapılamaz, bazı edge function'lar (public read) başarısız olur |
| OPENROUTER_API_KEY | Evet | Tüm AI özellikleri (ai-analyze, ai-chat, ai-strategy, ai-trade-coach, trade-mirror, daily-brief, weekly-digest) çalışmaz — 503/timeout döner |
| UPSTASH_REDIS_REST_URL | Hayır | Fail-open cache devre dışı kalır → price cache, rate limit, session cache yavaşlar ama uygulama çökmez |
| UPSTASH_REDIS_REST_TOKEN | Hayır | Upstash auth olmadan Redis erişilemez → yukarıdaki gibi fail-open davranır |
| VAPID_PUBLIC_KEY | Hayır | Push notification edge function'ları (send-push) VAPID imzalayamaz → push gönderimi başarısız olur |
| VAPID_PRIVATE_KEY | Hayır | Push imzalama için private key eksik → send-push edge function çalışmaz |
| VAPID_SUBJECT | Hayır | VAPID subject (mailto:) eksik → push protokol standardına uymaz, bazı tarayıcılar reddeder |
| SENTRY_DSN | Hayır | Backend (edge function) hata takibi devre dışı → sunucu hataları Sentry'ye raporlanmaz |
| LOG_LEVEL | Hayır | `info` varsayılanı alır → debug/log seviyesi kontrol edilemez, observability azalır |
| x-cron-secret (Supabase Vault) | Evet* | pg_cron tetiklemeli edge function'lar (price-feed, daily-brief, weekly-digest, reset-demo-account) yetkilendirme hatası verir — *Vault'ta `cron_secret` adıyla saklı, Supabase Secrets listesinde görünmeyebilir |

---

## Diğer / Genel Değişkenler

| Değişken | Zorunlu | Eksikse Ne Bozulur |
|----------|---------|-------------------|
| NODE_ENV | Hayır | `development` varsayılanı alır → production build optimizasyonları (minify, tree-shaking) etkilenebilir, Vite dev-only kodları production'a sızabilir |

---

## Eski / Fallback İsimler (Desteklenir ama Kullanılmamalı)

| Değişken | Not |
|----------|-----|
| VITE_SUPABASE_ANON_KEY | Eski fallback isim — proje `VITE_SUPABASE_PUBLISHABLE_KEY` ana isimle taşınacak; her ikisi de tanımlıysa publishable key öncelikli |

---

## Doğrulama Komutları

```bash
# Vercel'de frontend env'leri kontrol
vercel env ls

# Supabase Dashboard'da edge function env'leri kontrol
# UI: Project → Edge Functions → Environment Variables

# Build-time doğrulama (Vite)
npm run build  # VITE_* eksikse build başarısız olur
```

---

## Deploy Sırası

1. **Supabase Dashboard** → Edge Functions → Environment Variables: Yukarıdaki "Edge Function Değişkenleri" tablosundakileri gir
2. **Supabase Vault** → `cron_secret` olarak `x-cron-secret` değerini kaydet
3. **Vercel** → Project Settings → Environment Variables: Sadece `VITE_*` prefix'li 5 değişkeni gir
4. Deploy et → `npm run build` geçmeli, runtime'da Supabase bağlantısı kurulmalı