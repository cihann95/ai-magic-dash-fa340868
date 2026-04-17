

# Modern Fintech Trading Paneli — Plan

Görseldeki Barclays panelinin tüm işlevselliğini kapsayan, **Robinhood/Revolut tarzı modern fintech** estetiğinde, AI destekli, demo-bakiyeli bir trading paneli. Sonradan gerçek broker (Alpaca) entegrasyonuna geçmeye hazır altyapıyla.

## 🎨 Tasarım Dili
- **Koyu tema** ana, açık tema seçeneği (üst sağda toggle)
- Mor → mavi degrade vurgular, glassmorphism kartlar
- Yumuşak gradient arka plan, neon değil — profesyonel ama sıcak
- Inter / Geist fontu, monospace sayılar (tabular-nums)
- Tüm renkler `index.css`'te HSL token olarak; tutarlı tasarım sistemi
- Tam responsive — mobilde tek sütun, tablette 2, desktop'ta 3 bölmeli görseldeki layout

## 🧭 Üst Navigasyon
- Sembol kategorileri: **Para birimleri · Hisse senetleri · Emtialar · Endeksler · Kripto · ETF**
- Tema toggle, dil seçici (TR/EN), Giriş Yap / Üye Ol butonları (giriş yapınca avatar menüsü)

## 📊 Ana Trading Görünümü (3 Bölme)

**Sol Panel — Sembol Listesi**
- Arama kutusu, kategori filtresi
- Sembol satırları: ikon + isim + fiyat + 24s değişim (% yeşil/kırmızı) + piyasa durumu (Açık/Kapalı)
- Tıklayınca grafiği değiştirir, watchlist'e ekle/çıkar

**Orta Panel — Grafik + İşlem**
- Sekmeler: **Grafik** / **Bilgi** (sembol detayları, hacim, market cap)
- TradingView Advanced Chart widget gömülü (tüm araçlar, çizimler, göstergeler dahil)
- Zaman aralıkları: 1d, 5d, 1a, 3a, 1y, 5y
- Alt kısım: **Sat (kırmızı) / Tutar girişi / Satın Al (yeşil)** butonları
- Tek tıkla işlem toggle'ı, gerekli marj & PIP göstergesi

**Sağ Panel — Hesap & AI**
- **Bakiye kartı**: Demo bakiye, kâr/zarar, kullanılabilir marj
- **AI Asistan** (sekmeler):
  - **Analiz**: Seçili sembol için AI piyasa yorumu (trend, destek/direnç, AL/SAT/BEKLE sinyali) — Lovable AI Gateway / Gemini ile
  - **Haberler**: Gerçek finans haberleri + AI özeti + bullish/bearish duyarlılık skoru
  - **Sohbet**: "NATGAS bugün neden düştü?" gibi sorulara cevap veren streaming AI chat
- **Açık pozisyonlar** listesi (kâr/zarar canlı)

## 💼 Diğer Sayfalar
- **Portföy**: Tüm pozisyonlar, geçmiş işlemler, P&L grafiği, varlık dağılım pasta grafiği
- **İşlem Geçmişi**: Filtrelenebilir tablo, CSV export
- **Watchlist**: Kullanıcının takip ettiği semboller
- **Ayarlar**: Profil, tema, dil, demo bakiyesini sıfırla, broker API anahtarları (gerçek moda geçiş için hazır alan)

## 🔐 Kimlik Doğrulama (Lovable Cloud)
- E-posta + şifre giriş/kayıt, "Şifremi unuttum" akışı
- `profiles` tablosu (kullanıcı bilgileri), `user_roles` tablosu (admin/user — RLS güvenliği için ayrı)
- Auto-confirm açık (e-posta doğrulama beklemeden test için)

## 🧮 Backend (Lovable Cloud / Supabase)

**Tablolar:**
- `profiles` — kullanıcı profili, demo bakiye (varsayılan $100,000)
- `positions` — açık pozisyonlar (sembol, miktar, giriş fiyatı, yön)
- `trades` — tüm işlem geçmişi
- `watchlist` — kullanıcı takip listesi
- `ai_conversations` + `ai_messages` — AI sohbet geçmişi
- Tümünde RLS: kullanıcı sadece kendi verisini görür

**Edge Functions:**
- `execute-trade` — emir doğrulama, bakiye kontrolü, pozisyon aç/kapa
- `ai-analyze` — sembol için AI teknik/temel analiz (Gemini)
- `ai-chat` — streaming AI sohbet
- `news-feed` — finans haberlerini çek + AI ile özetle/skorla
- `market-quote` — anlık fiyat (TradingView widget zaten bunu yapıyor; pozisyon değerleme için yedek)

**Broker soyutlama katmanı:**  
`execute-trade` fonksiyonu içinde `executor: 'demo' | 'alpaca'` seçimi. Şimdi demo modda çalışır; gerçeğe geçişte sadece Alpaca adapter'ı eklenir, UI değişmez.

## 🤖 AI Özellikleri
- **Lovable AI Gateway** üzerinden Google Gemini (varsayılan: `gemini-3-flash-preview`)
- Hiçbir API anahtarı kullanıcıdan istenmez (Lovable Cloud otomatik sağlar)
- Streaming yanıtlar, markdown render
- Rate-limit (429) ve kredi (402) hataları kullanıcıya toast ile gösterilir

## ✅ Bitirme
- Tüm ekranlar mobilde test edilebilir
- "Demo bakiyesini sıfırla" butonu ayarlarda
- README'ye gerçek broker geçişi için kısa not

