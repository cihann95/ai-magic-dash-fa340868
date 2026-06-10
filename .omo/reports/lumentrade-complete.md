# LumenTrade — Tam Proje Raporu

> **Hazırlanma Tarihi:** 10 Haziran 2026
> **Hedef Kitle:** Projeyi hiç bilmeyen birine anlatır gibi, her şey dahil

---

## 1. PROJE NEDİR?

**LumenTrade**, kullanıcıların **sanal para ile finansal piyasalarda işlem yapabildiği** bir web uygulamasıdır. Gerçek para kullanılmaz — her kullanıcıya sanal bir bakiye verilir ve bu bakiyeyle kripto para, hisse senedi, döviz, emtia, endeks ve ETF gibi varlıklarda **al-sat yapabilir**, **portföy yönetebilir**, **arkadaşlarıyla rekabet edebilir** ve **yapay zeka destekli analizler** alabilir.

**Slogan:** Risk almadan öğren, yarış, kazan.

---

## 2. TEKNOLOJİ MİMARİSİ

```
┌─────────────────────────────────────────────────────────────────┐
│                    LUMENTRADE MİMARİSİ                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  🌐 FRONTEND (Web Uygulaması)                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ React + TypeScript + Vite (hızlı derleme)                 │  │
│  │ Tailwind CSS (stil) + shadcn/ui (hazır bileşenler)        │  │
│  │ Framer Motion (animasyonlar)                               │  │
│  │ React Router (sayfa yönlendirme)                           │  │
│  │ TanStack Query (sunucu verisi yönetimi)                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ☁️ SUPABASE (Backend Platformu)                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ PostgreSQL Veritabanı (tüm veriler burada)                │  │
│  │ Edge Functions (20 adet sunucusuz fonksiyon)              │  │
│  │ Realtime (anlık veri akışı + Presence)                    │  │
│  │ Auth (kayıt/giriş/JWT kimlik doğrulama)                   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ⚡ REDIS (Upstash — Önbellek)                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Sadece hızlı okuma için (fiyat önbelleği, kuyruk)        │  │
│  │ KRİTİK İŞLEMLER ASLA REDİS'E GÜVENMEZ                    │  │
│  │ Kaynak: PostgreSQL (mutlak doğruluk)                      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  📊 HARİCİ VERİ KAYNAKLARI                                      │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Binance API (kripto para fiyatları)                       │  │
│  │ Yahoo Finance (hisse, forex, emtia fiyatları)             │  │
│  │ TradingView (canlı grafikler)                              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. SAYFALAR (18 sayfa)

| Sayfa | Ne İşe Yarar |
|-------|-------------|
| **Index (Ana Sayfa)** | Hero, Ana Sahne canlı yayını, özellik tanıtımı |
| **Auth** | Giriş / Kayıt |
| **Portfolio** | Kullanıcının portföyü, açık pozisyonlar, bakiyesi |
| **Blitz** | Blitz lobisi — hızlı maç bulma, özel oda oluşturma |
| **BlitzRoom** | 60 saniyelik canlı yarışma odası |
| **AdminBlitz** | Admin paneli — Blitz yönetimi |
| **Leaderboard** | Sıralama tablosu |
| **Social** | Sosyal — takip, aktivite akışı |
| **Coach** | AI Trading Coach — yapay zeka destekli eğitim |
| **Insights** | Piyasa içgörüleri, analizler |
| **History** | İşlem geçmişi |
| **Watchlist** | Takip listesi |
| **Settings** | Ayarlar |
| **Achievements** | Başarımlar (gamification) |
| **Heatmap** | Piyasa ısı haritası |
| **Journal** | İşlem günlüğü |
| **ResetPassword** | Şifre sıfırlama |
| **NotFound** | 404 |

---

## 4. VERİTABANI (29 migration ile inşa edildi)

### Ana Tablolar

| Tablo | İçerik |
|-------|--------|
| `profiles` | Kullanıcı profilleri, bakiyeler (`real_balance`) |
| `public_profiles` | Herkese açık profil bilgileri (isim, avatar) |
| `blitz_rooms` | Blitz odaları (durum, sembol, giriş ücreti, pot) |
| `blitz_participants` | Oda katılımcıları |
| `blitz_orders` | Açılan/kapanan pozisyonlar |
| `settlement_ledger` | Ödül dağıtımı defteri (değiştirilemez) |
| `slippage_config` | Kayma toleransı ayarları |
| `analytics_events` | Analitik olayları (90 gün saklama) |
| `analytics_events_staging` | Analitik yazma tamponu |
| `observability_log` | Sistem logları |
| `platform_revenue` | Platform gelir kayıtları |
| `price_cache` | Fiyat önbelleği |
| `notifications` | Bildirimler |
| `copy_settings` | Kopyalama işlem ayarları |
| `followers` | Takipçi sistemi |
| `user_stats` | XP, seviye, streak gibi oyunlaştırma verileri |
| `realtime.messages` | Gerçek zamanlı mesajlaşma |

### Güvenlik Katmanları

- **RLS (Row Level Security)**: Her tabloda satır bazlı yetkilendirme
- **Guard Trigger'lar**: Kullanıcıların doğrudan veritabanı müdahalesini engeller (5 adet)
- **SECURITY DEFINER**: Admin işlemleri yükseltilmiş yetkiyle çalışır
- **Advisory Lock**: Çift ödemeyi engellemek için kilit mekanizması
- **Idempotency Key**: Aynı işlemin iki kez yapılmasını engeller

---

## 5. EDGE FUNCTIONS (20 adet)

### 🔵 Finansal İşlemler

| Fonksiyon | Görevi |
|-----------|--------|
| **price-feed** | Tüm semboller için canlı fiyatları çeker (Binance + Yahoo Finance), alarmları tetikler, açık pozisyonları günceller |
| **execute-trade** | Kullanıcı emirlerini yürütür (piyasa, limit, stop) |
| **trade-mirror** | Kopyalama işlemleri (bir kullanıcının işlemlerini takip etme) |

### 🟣 Blitz Sistemi

| Fonksiyon | Görevi |
|-----------|--------|
| **blitz-matchmake** | Kullanıcı eşleştirme (hızlı/özel oda), bakiye kilitleme |
| **blitz-tick-order** | Emir açma/kapama (güvenli, server-authoritative) |
| **blitz-settle-room** | 60sn sonu ödül dağıtımı (idempotent, kilitli) |
| **blitz-join-private** | Özel odaya katılma |
| **blitz-admin-topup** | Admin tarafından bakiye yükleme |
| **blitz-analytics-writer** | Analitik verileri staging'den ana tabloya taşıma |

### 🤖 Yapay Zeka

| Fonksiyon | Görevi |
|-----------|--------|
| **ai-analyze** | Sembol bazında AL/SAT/BEKLE analizi |
| **ai-chat** | AI sohbet asistanı |
| **ai-risk-monitor** | Risk izleme (15 dk'da bir) |
| **ai-strategy** | Strateji önerileri |
| **ai-trade-coach** | Trading koçu |

### 📰 İçerik & Bildirim

| Fonksiyon | Görevi |
|-----------|--------|
| **daily-brief** | Günlük bülten |
| **weekly-digest** | Haftalık özet |
| **news-feed** | Haber akışı |
| **send-push** | Push bildirim gönderme |
| **reset-demo-account** | Demo hesap sıfırlama |

---

## 6. ÖN YÜZ BİLEŞENLERİ

### Ana Uygulama
- `AppShell` — Uygulama iskeleti (navbar + sidebar + içerik)
- `TopBar` — Üst çubuk (bildirim zili, kullanıcı menüsü)
- `BottomNav` — Mobil alt navigasyon
- `ProtectedRoute` — Giriş gerektiren sayfalar için koruma

### Trading
- `SymbolList` — Sembol listesi
- `ChartPanel` — Grafik paneli (TradingView)
- `TradingViewChart` — TradingView widget'ı
- `AccountAIPanel` — Hesap + AI paneli
- `OpenPositionsPanel` — Açık pozisyonlar

### Ana Sahne (Canlı İzleme)
- `AnaSahne` — Ana bileşen (öne çıkan canlı yayın)
- `PlayerCard` — Oyuncu kartı (kullanıcı adı + PnL)
- `CountdownCircle` — Geri sayım çemberi
- `EmptyArena` — Boş arena (maç yokken)
- `FinishedBanner` — Maç bitti banner'ı
- `SpectatorPanel` — Seyirci paneli (emoji + sohbet)

### Blitz
- `BlitzTimer` — Geri sayım sayacı
- `TradeActions` — AL/SAT butonları
- `BlitzLeaderboard` — Anlık sıralama
- `BlitzChart` — Maç içi grafik

### UI (shadcn/ui — 30+ bileşen)
- Button, Card, Dialog, Dropdown, Input, Form, Table, Tabs, vs.

---

## 7. PROJENİN GEÇMİŞİ (Geliştirme Aşamaları)

### Aşama 0: Temel Platform
- İlk kurulum: Vite + React + TypeScript
- Supabase bağlantısı, kimlik doğrulama
- Temel trading arayüzü
- 20+ migration ile veritabanı şeması

### Aşama 1: Blitz Sistemi
```
git commit: cdb409b "BLITZ sistemi ekledi"
```
- Blitz 1v1 yarışma modu
- Eşleştirme, emir açma/kapama, ödül dağıtımı
- Redis kuyruk + PostgreSQL
- Cron job'lar ile otomatik settlement

### Aşama 2: Ana Sahne (Canlı İzleme)
```
git commit: a3cd952 "feat(ana-sahne): add UI components"
```
- `ana_sahne_view` (SECURITY DEFINER, PII yok)
- `useAnaSahne` hook (Realtime + Presence)
- Ana Sahne bileşenleri (PlayerCard, CountdownCircle vb.)
- Index.tsx entegrasyonu
- Feature flag (`VITE_ANA_SAHNE_ENABLED`)

### Aşama 3: Blitz Full
```
git commit: eb2692a "feat(blitz): extract BlitzRoom sub-components"
```
- BlitzRoom.tsx → alt bileşenlere ayrıştırma
- FAZ 4 güvenlik trigger'ı
- i18n (Türkçe/İngilizce)
- Waiting room cleanup
- 22 görev + 4 doğrulama

### Aşama 4: Blitz Phase 2 (Güvenlik + Sağlamlık) ← EN SON
```
.git/HEAD: şu an bu aşamadayız
```
**Plan:** `.omo/plans/blitz-phase-2.md`
**Süre:** 3 saat 2 dakika
**Görev:** 21 implementasyon + 4 denetim

**Neler Yapıldı:**

| Alan | Yapılanlar |
|------|-----------|
| 🔒 **Güvenlik** | Server-authoritative zaman damgaları, kayma koruması, hile koruma trigger'ları |
| 💰 **Mutabakat** | Değiştirilemez ödül defteri, idempotency, çift ödeme koruması |
| 👁️ **Seyirci** | Emoji tepkileri + sohbet (Broadcast, veritabanına yazılmaz) |
| 📊 **Analitik** | Olay toplama, staging → ana tablo, 90 gün saklama |
| 📋 **Gözlem** | Yapılandırılmış loglama, alarm sorguları, izleme script'leri |

**Denetim sonuçları:**
- F1 (Plan Uygunluğu): ✅ APPROVE
- F2 (Kod Kalitesi + Güvenlik): ✅ APPROVE
- F3 (Elle QA): ✅ APPROVE (13 senaryo)
- F4 (Kapsam Denetimi): ✅ APPROVE

---

## 8. DOSYA YAPISI (Özet)

```
📦 LumenTrade
├── 📁 src/                          # Frontend kaynak kodu
│   ├── 📁 components/               # React bileşenleri
│   │   ├── 📁 AnaSahne/             # Ana Sahne + SpectatorPanel
│   │   ├── 📁 blitz/                # Blitz alt bileşenleri
│   │   ├── 📁 trading/              # Trading bileşenleri
│   │   ├── 📁 ui/                   # shadcn/ui bileşenleri
│   │   └── ...                      # AppShell, TopBar, vb.
│   ├── 📁 hooks/                    # React hook'ları
│   │   └── 📁 __tests__/            # Hook testleri (14 test)
│   ├── 📁 pages/                    # Sayfalar (18 adet)
│   ├── 📁 contexts/                 # React context (AppContext)
│   ├── 📁 lib/                      # Yardımcı kütüphaneler
│   ├── 📁 integrations/             # Harici entegrasyonlar
│   ├── App.tsx                      # Uygulama kökü (lazy loading)
│   ├── index.css                    # Global stiller + animasyonlar
│   └── main.tsx                     # Giriş noktası
│
├── 📁 supabase/                     # Backend
│   ├── 📁 functions/                # 20 Edge Function
│   │   ├── 📁 _shared/              # Paylaşılan kod (redis, cors)
│   │   ├── 📁 price-feed/           # Fiyat besleme
│   │   ├── 📁 blitz-tick-order/     # Emir yönetimi
│   │   ├── 📁 blitz-settle-room/    # Ödül dağıtımı
│   │   ├── 📁 blitz-matchmake/      # Eşleştirme
│   │   ├── 📁 blitz-analytics-writer/ # Analitik taşıma
│   │   ├── 📁 ai-*/                 # 5 AI fonksiyonu
│   │   └── ...                      # 8 diğer fonksiyon
│   └── 📁 migrations/               # 29 SQL migration
│
├── 📁 scripts/                      # Test ve izleme script'leri
│   ├── qa-phase2.sh                 # 18 SQL test
│   ├── qa-settlement-collision.sh   # 7 çakışma testi
│   ├── qa-analytics-observability.sh # 12 analitik testi
│   ├── monitoring-queries.sql       # 5 izleme sorgusu
│   └── run-monitoring.sh            # Alarm script'i
│
├── 📁 .omo/                         # Orchestrasyon (AI yönetimi)
│   ├── 📁 plans/                    # Çalışma planları
│   ├── 📁 evidence/                 # Kanıt dosyaları
│   ├── 📁 reports/                  # Raporlar
│   └── 📁 notepads/                 # Öğrenilen notlar
│
├── package.json                     # Bağımlılıklar
├── vite.config.ts                   # Vite yapılandırması
├── tailwind.config.ts               # Tailwind yapılandırması
└── tsconfig.json                    # TypeScript yapılandırması
```

---

## 9. ÖLÇÜMLER

### Kod İstatistikleri
| Metrik | Değer |
|--------|-------|
| Migration sayısı | 29 |
| Edge Function sayısı | 20 |
| Sayfa sayısı | 18 |
| React bileşeni | 40+ |
| Hook sayısı | 12 |
| Test dosyası | 4 (14 test) |
| Test script'i | 3 (37 test) |
| İzleme sorgusu | 5 |
| Plan dosyası | 4 |
| Toplam git commit | 50+ |

### Blitz Phase 2 Ölçümleri
| Metrik | Değer |
|--------|-------|
| Toplam süre | 3 saat 2 dakika |
| Implementasyon görevi | 21 |
| Denetim görevi | 4 |
| Yeni migration | 5 |
| Yeni Edge Function | 1 |
| Değiştirilen Edge Function | 3 |
| Yeni hook | 3 |
| Yeni bileşen | 1 |
| Test script'i | 3 |
| İzleme script'i | 2 |

### Doğrulama Durumu (Şu An)
| Kontrol | Sonuç |
|---------|-------|
| `npx tsc --noEmit` | ✅ 0 hata |
| `npm run lint` | ✅ 0 hata |
| `npm run test` | ✅ 14/14 PASS |
| `npm run build` | ✅ Başarılı |

---

## 10. ÖNEMLİ KARARLAR

| Karar | Sebep |
|-------|-------|
| **Redis sadece okuma önbelleği** | Kritik işlemlerde PostgreSQL kaynak olarak kullanılır; Redis güncel olmayabilir |
| **Broadcast, Presence değil** | Seyirci emoji/sohbeti için Presence sınırsız büyüme yaratır; Broadcast ephemereal ve otomatik temizlenir |
| **Settlement ledger ayrı tablo** | Değiştirilemez log, mutabakat denetimini `blitz_rooms` satırından ayırır |
| **Advisory lock + idempotency** | Çift ödemeye karşı iki katmanlı koruma |
| **Analitik INSERT → staging** | Edge Function yerine doğrudan SQL yazma, cold-start gecikmesini önler |
| **SECURITY DEFINER view** | Anonim kullanıcıların PII olmadan canlı maç görmesini sağlar |
| **Server-authoritative timestamps** | Kullanıcı saat manipülasyonunu önlemek için tüm zamanlar PostgreSQL `now()` |
