

# Birleşik Plan: Demo Veriyi Kaldır + Sprint 1 "Wow" Özellikleri

İki planı tek implementasyonda birleştiriyorum: (A) tüm sahte/sentetik veriyi sil ve tamamen gerçek piyasa verisine geç, (B) bir üst seviyeye taşıyacak Sprint 1 özelliklerini ekle.

## A) Build Hatalarını Düzelt
`src/components/ui/chart.tsx` — recharts Tooltip/Legend prop tipleri için shadcn'ın güncel `ComponentProps<typeof RechartsPrimitive.Tooltip>` pattern'i ile yeniden yaz; `payload`/`label` ve `verticalAlign` doğru cast edilsin.

## B) Tüm Sahte Veriyi Kaldır

**`supabase/functions/price-feed/index.ts`** — sentetik fiyat üretimini sil. Yerine:
- **Kripto** → Binance public API (gerçek) ✓
- **Hisse, ETF, Forex, Emtia, Endeks** → Yahoo Finance public quote API (`query1.finance.yahoo.com/v7/finance/quote?symbols=...`), tek istekte batch çekim, User-Agent header ile
- Çekilemeyen sembol için `price_cache` güncelleme YOK (eski veri kalır, "stale" olarak işaretlenir)

**`src/lib/symbols.ts`**:
- Her sembole `yahoo` ticker alanı ekle (AAPL, EURUSD=X, GC=F, ^GSPC, BTC-USD vb.)
- `fallbackPrice()` ve `FALLBACK_PRICES` sabitlerini **tamamen sil**

**`supabase/functions/execute-trade/index.ts`** — client'tan gelen `price`'a güvenme. `price_cache`'ten anlık fiyatı oku, yoksa 400 + "Fiyat alınamıyor, lütfen tekrar deneyin" döndür. Ayrıca `updated_at` 5 dk'dan eskiyse stale uyarısı.

**`src/components/trading/ChartPanel.tsx`, `OrderTicket.tsx`, `SymbolList.tsx`, `Portfolio.tsx`, `AlertsPanel.tsx`** — `fallbackPrice` çağrılarını kaldır. Fiyat yoksa:
- UI'da "—" + küçük spinner
- AL/SAT/Emir butonları **disabled** + tooltip "Fiyat verisi bekleniyor"
- Stale veri (>5dk) için sarı "Veri eski" badge

## C) Sprint 1 — "Wow" Etkisi Özellikleri

### 1. Bildirim Merkezi (Notification Center)
- Yeni tablo `notifications` (user_id, type, title, body, link, read, created_at) + RLS
- TopBar'a **zil ikonu** + okunmamış sayısı badge'i + Popover liste
- Realtime subscribe → yeni bildirim toast + zil titreşimi
- Türler: `price_alert`, `order_filled`, `trade_executed`, `achievement`, `daily_brief`, `ai_signal`
- `execute-trade`, `price-feed` (alert tetiklendiğinde), `daily-brief` notification insert eder
- Bildirim üzerine tıklayınca `link`'e git + okundu işaretle

### 2. Heatmap Sayfası (`/heatmap`)
- Yeni sayfa: tüm semboller kare grid, kare boyutu sembol "ağırlığı", renk = % değişim (koyu yeşil → koyu kırmızı)
- Asset class filtreleri (chip'ler)
- `price_cache`'ten realtime besleme, hover'da mini detay
- Kareye tıkla → `/?symbol=XXX` ile trading paneline atla
- BottomNav ve sol menüye "Heatmap" linki

### 3. Optimistic UI + Animasyonlu Sayılar
- `OrderTicket` ve `ChartPanel` AL/SAT akışında: butona basınca pozisyon listesine **anında** geçici satır eklensin (opacity-60), backend onayı gelince finalize / hata gelince geri al
- `formatPrice` etrafında `<AnimatedNumber>` komponenti — fiyat değişiminde tabular-nums roll-up + kısa yeşil/kırmızı flash arka plan
- Tüm ana liste/kartlar için `Skeleton` boş-state'leri ekle (SymbolList, Portfolio, History, Leaderboard)

### 4. Proaktif AI Uyarıları
- Yeni edge function `ai-risk-monitor` (cron 15dk'da bir):
  - Kullanıcının açık pozisyonlarını tarar
  - Tek sembolde >%50 ağırlık → "Konsantrasyon riski" notification
  - Toplam P&L günlük -%5 altında → "Disiplin uyarısı" notification
  - Tek pozisyon -%10 → "Stop-loss düşün" notification
- Her uyarı `notifications` tablosuna düşer; sağ panel AI sekmesinde "Aktif uyarılar" kartı

### 5. UX İyileştirmeleri (Hızlı)
- TopBar zil ikonu + bildirim popover
- Mobil bottom-nav'a Heatmap ekle
- Tüm "Yatırım tavsiyesi değildir" disclaimer'larını AI çıktılarında ortak `<AIDisclaimer>` komponentine çıkar

## D) Veritabanı Migration
Tek migration:
- `notifications` tablosu (id, user_id, type, title, body, link, read, created_at) + RLS (kullanıcı kendi bildirimlerini görür/günceller, edge function service role ile insert eder)
- `notifications` realtime publication'a eklenir
- Cron: `ai-risk-monitor` her 15 dk

## E) Doğrulama Sırası (implementasyon sonu)
1. Build temiz (chart.tsx hataları yok)
2. `price-feed` çağrılır → `price_cache` Yahoo + Binance ile dolar
3. Fiyat yoksa AL/SAT disabled
4. Trade yapılır → bildirim zilde görünür + toast
5. Heatmap sayfası canlı renk değişir
6. Optimistic UI: AL bas → pozisyon anında listede

## Teknik Notlar
- Yahoo Finance: `User-Agent: Mozilla/5.0` header şart; rate limit'e karşı 50 sembollük batch
- Realtime: `notifications` ve `price_cache` publication'a eklenmeli
- Optimistic UI için lokal state + rollback; React Query yok, mevcut pattern korunur
- AnimatedNumber: küçük custom hook (rAF tabanlı, library yok)

