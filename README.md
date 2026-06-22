# Lumen Trade

AI destekli kripto para yatırım platformu. Gerçek zamanlı fiyatlar, TradingView grafikleri, AI analiz, sosyal trading ve "Blitz" 1v1 oyun modu.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: shadcn/ui (Radix UI + Tailwind CSS)
- **Backend**: Supabase (PostgreSQL + Edge Functions + Auth + Realtime)
- **Grafikler**: TradingView Advanced Chart Widget + Recharts
- **AI**: OpenRouter API (7 edge function)
- **Deploy**: Vercel (frontend) + Supabase (backend)
- **Monitoring**: Sentry + GitHub Actions uptime check

## Kurulum

```bash
git clone https://github.com/cihann95/ai-magic-dash-fa340868.git
cd ai-magic-dash-fa340868
npm install
cp .env.example .env  # değerleri doldur
npm run dev
```

### Gerekli Env Var'lar

| Değişken | Açıklama |
|----------|----------|
| VITE_SUPABASE_URL | Supabase proje URL'i |
| VITE_SUPABASE_PUBLISHABLE_KEY | Supabase anon key |
| SUPABASE_SERVICE_ROLE_KEY | Edge Functions için service role key |
| OPENROUTER_API_KEY | AI analiz için OpenRouter API key |
| UPSTASH_REDIS_REST_URL | Rate limiting için Redis (opsiyonel) |

## Geliştirme

```bash
npm run dev          # Vite dev server (port 8080)
npm run build        # Production build
npm test             # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
npm run smoke-test   # Deploy sonrası doğrulama
```

### Edge Functions

```bash
# Tümünü deploy et
bash supabase/deploy-all.sh --project-ref <PROJECT_REF>

# Tek fonksiyon deploy et
supabase functions deploy execute-trade --project-ref <PROJECT_REF>
```

## Mimari

### Frontend

Sayfa tabanlı routing (React Router). Ana sayfa `/` trading dashboard'u — sol tarafta sembol listesi, ortada TradingView grafik, sağ tarafta pozisyonlar + AI paneli. Mobilde tabs ile geçiş.

15+ korumalı sayfa: portfolio, history, watchlist, settings, leaderboard, achievements, heatmap, social, coach, journal, insights, blitz, admin/blitz.

### Backend

20 Supabase Edge Function (Deno). Tüm write işlemleri edge function üzerinden yapılıyor (RLS ile korunuyor). AI fonksiyonları OpenRouter API kullanıyor.

Kritik edge function'lar:
- `execute-trade` / `manage-order` — işlem açma/kapama
- `blitz-matchmake` / `blitz-tick-order` — Blitz oyun modu
- `ai-chat` / `ai-analyze` / `ai-strategy` — AI analiz
- `trade-mirror` — copy trading

### Veritabanı

RLS aktif tüm tablolarda. Client-side write yok (edge function authoritativeness). Kritik tablolar: positions, trades, orders, user_stats, blitz_rooms, real_balance_ledger.

## Bilinen Sınırlamalar

- Copy trading: client-side write kullanıyor (edge function'a taşınacak)
- /history sayfasında loading state yok
- /social sayfasında error state yok
- AI fonksiyonları timeout alabilir (OpenRouter API bağımlılığı)
- Blitz modu beta aşamasında

## Deploy

- **Frontend**: Vercel — main branch'e push otomatik deploy tetikler
- **Edge Functions**: `SUPABASE_ACCESS_TOKEN` secret'ı eklendiğinde CI otomatik deploy eder
- **Monitoring**: GitHub Actions her 15 dakikada health check çalıştırır

Detaylı deploy rehberi için `DEPLOYMENT.md` dosyasına bakın.
