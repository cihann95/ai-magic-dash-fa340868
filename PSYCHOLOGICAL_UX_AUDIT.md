# Lumen Trade — Psikolojik Kullanıcı Deneyimi Araştırma Raporu

**Tarih:** 2026-06-29  
**Platform:** Lumen Trade (React 18 + TypeScript + Tailwind + Supabase)  
**Yöntem:** 5 alan derinlemesine kod taraması + psikolojik ihtiyaç analizi

---

## ALAN 1: User Onboarding & Retention (Kullanıcı Kazanma ve Elde Tutma)

### Mevcut Durum

| Bileşen | Dosya | Ne Yapıyor |
|---------|-------|------------|
| `OnboardingTour.tsx` | 4 adımlı gradient modal | Sadece onboarding_completed flag kontrolü, 4 statik adım |
| `PersonaOnboarding.tsx` | 4 soru (exp/goal/risk/focus) → `trader_persona` JSONB | Güzel flow ama onboarding sonrası personası kullanılmıyor |
| `Auth.tsx` | Standart email/password | Şifre gücü göstergesi var, ama sosyal login yok |
| `Achievements.tsx` | XP + rozet sistemi | Sadece statik gösterim, streak yok |
| `NotificationBell.tsx` | Realtime bildirimler | Var, ama onboarding sonrası tetikleme yok |
| `GameBadge.tsx` | Level badge | Sadece UI elemanı |

### Psikolojik İhtiyaçlar

1. **İlk izlenim etkisi (Primacy bias)** — Kayıt anından ilk trade'e kadar geçen süre kritik. Şu an onboarding 4 adım, sonra persona 4 soru. Toplam 8 adım çok fazla.
2. **Endowment effect** — Kullanıcıya hemen "sahip olma" hissi verilmeli. Demo bakiye $100K veriliyor ama welcome mesajı yok.
3. **Loss of progress anxiety** — İlk trade yapmadan onboarding'den çıkarsa geri dönemiyor.
4. **Daily streak ihtiyacı** — Hiç yok. Kullanıcı geri gelme motivasyonu sıfır.

### Yapılması Gerekenler

| # | Ne? | Neden? | Nasıl? |
|---|-----|--------|--------|
| 1.1 | **Unified onboarding** (tek akışta 4+4 değil, 3 adım) | Cognitive load azaltma, abandonment düşürme | OnboardingTour + PersonaOnboarding'i merge et. İlk 2 adım intro, 3. adımda tek soru (risk toleransı) |
| 1.2 | **First-trade reward** (ilk işleme özel rozet + XP bonus) | Operant conditioning — hemen ödül bağımlılık yaratır | `celebrateAchievements`'a özel first_trade badge ekle, trade sonrası confetti animasyon |
| 1.3 | **Daily streak tracker** (her girişte "gün sayısı" gösterimi) | Günlük geri dönüş alışkanlığı, loss aversion (streak kırılması korkusu) | `localStorage`'a son giriş tarihi + streak sayısı. Ana sayfada mini streak badge |
| 1.4 | **Progress bar to first trade** ("3 adım kaldı" onboarding) | Goal gradient effect — bitişe yaklaştıkça motivasyon artar | Step counter'ı daha görünür yap, onboarding'de ilerleme barı |
| 1.5 | **Magic link / OAuth login** | Friction azaltma, social login dönüşümü artırır | Supabase built-in Google/GitHub auth ekle |
| 1.6 | **Onboarding sonrası push notification** (ilk gün hatırlatma) | Hick's law — hatırlatıcı pasif kullanıcıyı geri getirir | 24 saat sonra cron job tetiklemesi + push |

---

## ALAN 2: Trading Psychology (İşlem Psikolojisi)

### Mevcut Durum

| Bileşen | Dosya | Ne Yapıyor |
|---------|-------|------------|
| `IntentDialog.tsx` | Trade öncesi niyet + duygu sorgusu | **Çok iyi** — emotional signal detection (rapid_fire, reactive, oversize) |
| `Insights.tsx` | Niyet Aynası + Duygu Aynası + Plan Disiplini | **Çok iyi** — intent_tag bazlı PnL analizi, mood tracking |
| `Journal.tsx` | Trade günlüğü (thesis, lessons, emotion, rating) | İyi ama mobilde kullanımı düşük |
| `useEmotionalSignal.ts` | Emosyonel sinyal tespiti | Sadece 3 pattern (rapid_fire, reactive, oversize) |
| `OrderTicket.tsx` | %10-%25-%50-%100 butonları | Position sizing rehberi yok, sadece hızlı yüzde butonları |
| `ai-risk-monitor/index.ts` | Proaktif risk uyarıları | Konsantrasyon, loss, discipline uyarıları — **iyi** |
| `ai-trade-coach/index.ts` | AI Trade Coach (davranış analizi) | revenge trading, night trade, quick close analizi var |
| `Portfolio.tsx` | Health mode toggle | PnL gizleme opsiyonu — **iyi psikolojik tasarım** |

### Psikolojik İhtiyaçlar

1. **Loss aversion** — Kayıp korkusu kazancın 2 katı güçlü. Mevcut risk uyarıları var ama görsel olarak yetersiz.
2. **Overconfidence bias** — Kazanç serisinde artan risk iştahı. AI Coach bunu tespit ediyor ama UI'da gösterilmiyor.
3. **Sunk cost fallacy** — Zarardaki pozisyonu kapatamama. "Sağlık modu" bunu kısmen çözüyor.
4. **Recency bias** — Son işleme göre karar verme. Niyet aynası bunu analiz ediyor.
5. **FOMO (Fear of Missing Out)** — Canlı trade'ler gösterilmiyor, FOMO körüklemiyor (iyi), ama kaçırma korkusunu yönetme de yok.

### Yapılması Gerekenler

| # | Ne? | Neden? | Nasıl? |
|---|-----|--------|--------|
| 2.1 | **Pre-trade risk overlay** (işlem öncesi risk puanı gösterimi) | Loss aversion'ı yönet, dürtüsel işlemleri azalt | IntentDialog'a "Bu işlem risk skoru: 7/10 — pozisyon büyüklüğün portföyün %12'si" ekle |
| 2.2 | **Loss streak detection + cooling** (arka arkaya 3 zararda zorunlu 5dk bekleme) | Revenge trading'i önle | AI Coach zaten detect ediyor, UI'da `TradeActions`'a 5dk cooldown ekle |
| 2.3 | **Position sizing calculator** (Kelly Criterion / risk bazlı) | Position sizing kuralları olmayan trader'lar için rehber | OrderTicket'in altında "Risk bazlı büyüklük: $X (stop $Y, risk %Z)" hesaplayıcı |
| 2.4 | **Overconfidence warning** (5 ardışık kazançta uyarı) | Overconfidence bias'ı kırar | EmotionalSignal pattern'lerine winning_streak ekle, IntentDialog'da uyarı |
| 2.5 | **Sessiz mod** (PnL tamamen gizlenebilir, sadece pozisyon adedi görünür) | Sunk cost fallacy'yi azaltır, uzun vadeli düşünmeyi teşvik eder | Health mode'u tüm sayfalarda uygula (şu an sadece Portfolio'de) |
| 2.6 | **Trade journal reminder bot** (işlem kapanınca otomatik günlük sorusu) | Reflection alışkanlığı kazandırır | Trade kapandıktan sonra toast + mini journal formu (modal değil, inline) |

---

## ALAN 3: Social Proof & Trust (Sosyal Kanıt ve Güven)

### Mevcut Durum

| Bileşen | Dosya | Ne Yapıyor |
|---------|-------|------------|
| `Social.tsx` | Activity feed + leader list + copy-trade ayarları | **Var ama temel** |
| `Leaderboard.tsx` | PnL + win rate sıralaması | Basit tablo, sadece sayı |
| `public_profiles` tablosu | username, bio, show_trades, show_portfolio, copyable flag | Ayarlar sayfasında yönetiliyor |
| `copy_settings` tablosu | ratio, max_position_usd | Copy-trade altyapısı var |
| `trade-mirror/index.ts` | Edge function for copy execution | Var |
| `activity_feed` view | Trade + achievement event'leri | Social sayfasında gösteriliyor |
| `manage-follow` | Follow/unfollow edge function | Var |

### Psikolojik İhtiyaçlar

1. **Social proof** — İnsanlar diğerlerinin ne yaptığını görmek ister. Mevcut feed boş eğer takip edilen yoksa.
2. **Authority bias** — Verified trader badge, "pro" etiketi güven artırır. Hiç yok.
3. **Liking bias** — Profil fotoğrafı, bio, kişisel hikaye — çok zayıf.
4. **Fear of missing out** — Diğerlerinin karlı işlemlerini görmek rekabeti artırır ama FOMO'yu da tetikler.
5. **Endowment effect in social** — Kendi başarısını başkalarına gösterme isteği.

### Yapılması Gerekenler

| # | Ne? | Neden? | Nasıl? |
|---|-----|--------|--------|
| 3.1 | **Live trade feed with PnL badges** (gerçek zamanlı işlem gösterimi, mini kâr/zarar rozeti) | Social proof + FOMO kontrollü yönetimi | `activity_feed` tablosu hazır, UI'a badge ekle (🔴/🟢) + "X kişi şu an BTC işlem yapıyor" |
| 3.2 | **Verified trader badge** (en az 100 işlem + %55+ win rate = rozet) | Authority bias — başarılı trader'a güven | `public_profiles`'a `verified` field, migration + badge UI |
| 3.3 | **Trader profile page** (username/+bio/stat'lar/trade history/graph) | Liking bias — kişisel bağ kurma | `/trader/:username` sayfası, portföy grafiği + son 20 işlem |
| 3.4 | **Copy-trade landing page** (başarılı trader'ların yıllık % getirisi) | Social proof + aspirasyon | Liderboard'u geliştir: PnL %, max drawdown, Sharpe ratio gibi "pro" metrikleri |
| 3.5 | **Share trade card** (işlem sonucunu PNG/kart olarak paylaş) | Viral growth + kullanıcının kendini kanıtlama dürtüsü | html2canvas ile trade sonucu kart render + download button |
| 3.6 | **Weekly digest with social comparison** ("Bu hafta trader'ların %78'inden daha iyi performans gösterdin") | Social comparison bias — kullanıcıyı motive eder | `weekly-digest` edge function'ı zaten var, içine relative ranking ekle |

---

## ALAN 4: AI as Co-pilot (AI Yardımcı Pilot)

### Mevcut Durum

| Bileşen | Dosya | Ne Yapıyor |
|---------|-------|------------|
| `ai-analyze/index.ts` | Sembol bazlı AL/SAT/BEKLE analizi | OpenAI üzerinden |
| `ai-strategy/index.ts` | Strateji önerisi | OpenAI |
| `ai-chat/index.ts` | Streaming chat (Gemini) | Server-sent events |
| `ai-trade-coach/index.ts` | Davranış analizi + içgörü | **Detaylı** — revenge, night trade, concentration analizi |
| `ai-risk-monitor/index.ts` | Proaktif risk uyarıları | Cron-driven (her 15 dk) |
| `daily-brief/index.ts` | Günlük özet | OpenAI |
| `news-feed/index.ts` | Haber akışı | OpenAI |
| `AccountAIPanel.tsx` | UI: 5 tab (analysis, brief, strategy, news, chat) | Feature-rich |
| `AIDisclaimer.tsx` | Disclaimer banner | Her AI sonucunda gösteriliyor |
| `IntentDialog.tsx` | Trade öncesi duygu sorgusu | EmotionalSignal |

### Psikolojik İhtiyaçlar

1. **Explainability** — AI neden o kararı verdi? Mevcut AI çıktıları düz metin, güven skoru yok.
2. **Confidence calibration** — AI'nın ne kadar emin olduğunu bilmek gerek. Şu an emin değil.
3. **Automation bias** — Kullanıcılar AI önerisine körü körüne uyar. Buna karşı friction lazım.
4. **What-if simulation** — "Burada short açsaydın ne olurdu?" sorusuna cevap yok.
5. **Trust building** — AI'nın ne veriyle çalıştığını bilmek güven artırır.

### Yapılması Gerekenler

| # | Ne? | Neden? | Nasıl? |
|---|-----|--------|--------|
| 4.1 | **Confidence score on AI signals** (BUY 85%, SELL 62%, HOLD 91%) | Trust calibration — kullanıcı AI'ya ne kadar güveneceğini bilir | `ai-analyze` response'unda `confidence: number` alanı, UI'da progress bar + renkli gösterim |
| 4.2 | **AI reasoning expand** (alt satırda "Neden?" bağlantısı) | Explainability — kullanıcı AI'nın mantığını anlar | SignalCard'da "Neden?" toggle, AI'ya reason sor |
| 4.3 | **What-if simulator** ("$50k ile BTC long açsaydın şu an: +$230") | Counterfactual thinking — öğrenme aracı, FOMO yönetimi | Yeni `SimulateIntentDialog.tsx`, geçmiş tarih + varsayımsal pozisyon hesaplama |
| 4.4 | **AI suggestion friction** (AI sinyali verince zorunlu 5sn bekle) | Automation bias'ı kırar, refleks trading'i azaltır | AI önerisi sonrası button'a setTimeout(5000) + "Düşünüyor..." animasyonu |
| 4.5 | **Personalized AI coach persona** (risk toleransına göre AI tonu) | Personalization — kullanıcı kendine yakın hisseder | `trader_persona`'daki risk seviyesine göre prompt engineering (aggressive/conservative ton) |
| 4.6 | **Trade rehearsal** (işlem öncesi AI simülasyonu) | Pre-commitment device — plan yapmaya teşvik | IntentDialog'a "AI simülasyonu çalıştır" butonu, geçmiş 30 gün verisiyle backtest |

---

## ALAN 5: Monetization / Premium (Paraya Çevirme)

### Mevcut Durum

| Bileşen | Dosya | Ne Yapıyor |
|---------|-------|------------|
| `SavedBalance` / `realBalance` | `AppContext` | Demo bakiye sistemi var, ama premium yok |
| `feature-flags.ts` | Feature flag altyapısı | Sadece `ana-sahne` flag'ı var, premium için boş |
| `Settings.tsx` | Bakiye + ledger + push | Bakiye admin yüklemeli, ödeme entegrasyonu yok |
| `Blitz.tsx` | Giriş ücreti ($5-$50) | Para benzeri mekanik var ama gerçek para değil |
| Tüm AI fonksiyonları | Rate limiting + quota check | 429 Too Many Requests, 402 Insufficient Credits |
| `GameBadge.tsx` | Level sistemi (XP) | Rozet + XP var ama hiçbir premium kapı yok |

### Psikolojik İhtiyaçlar

1. **Freemium psychology** — Ücretsiz seviyede yeterli değer verilmeli ki premium istenmeli. Şu an her şey ücretsiz.
2. **Feature gating** — Sınırlı kullanım "daha fazlasını isteme" hissi yaratır. Hiç yok.
3. **Trial UX** — Zaman sınırlı premium deneme, kaybetme korkusu yaratır. Yok.
4. **Endowment effect in premium** — Kullanıcı premium özellikleri deneyince onlara sahip olma ister.
5. **Social status from premium** — Premium badge, özel rozetler, özel tema.

### Yapılması Gerekenler

| # | Ne? | Neden? | Nasıl? |
|---|-----|--------|--------|
| 5.1 | **Feature flag infrastructure expansion** (premium tier + trial) | Freemium geçişi için altyapı | `feature-flags.ts`'e `isPremium` ekle, `subscriptions` tablosu + migration |
| 5.2 | **AI analysis daily limit** (ücretsiz 5 analiz/gün, premium sınırsız) | Scarcity effect — kıtlık değeri artırır | `rate-limit.ts`'e günlük kota, UI'da kalan kullanım sayacı |
| 5.3 | **Premium badge + unique theme** (altın tema, premium rozeti) | Social status — başkalarına gösterme dürtüsü | Theme listesine "gold" ekle, kullanıcı adının yanında premium badge |
| 5.4 | **Blitz free + premium entry split** (ücretsiz $1 oda, premium $10+ özel oda) | Price anchoring — düşük fiyat ücretsiz, yüksek fiyat prestij | Entry fee seçeneklerine premium etiketi |
| 5.5 | **7-day trial onboarding** ("Premium'u 7 gün ücretsiz dene, sınırsız AI analizi") | Trial-to-premium conversion | Kayıt sonrası `subscriptions` tablosuna trial_ends_at ekle |
| 5.6 | **Subscription management page** (plan karşılaştırma tablosu) | Rational choice — kullanıcı değeri görüp satın alır | `/pricing` sayfası, Free / Pro / Elite tablosu |

---

## GENEL ÖZET — Alt Ajan Raporları Birleştirme

### En Kritik 3 Psikolojik Açık

1. **Streak / gamification eksik** — Daily streak, first-trade ödülü, login bonus hiç yok. Kullanıcı geri gelme sebebi bulamaz.
2. **AI güven skoru yok** — AI çıktıları düz metin. Kullanıcı neden güveneceğini bilmez. Confidence score + explainability şart.
3. **Premium/freemium yok** — Her özellik ücretsiz. Feature gating olmayınca "value" algısı düşük. Dönüşüm mümkün değil.

### Mevcut Güçlü Yanlar (Korunmalı)

- **IntentDialog** — Trade öncesi niyet + duygu sorgusu rakiplerde yok. Psikolojik açık değil, güçlü yan.
- **AI Trade Coach** — Revenge, night trade, concentration analizi çok detaylı. Rakip analizinde emsali az.
- **Health mode** — PnL gizleme konsepti çok yenilikçi. Sunk cost fallacy'ye karşı etkili.
- **Plan adherence tracking** — Hedef/stop planına uyum ölçümü disiplini artırır.

### Kod Değişiklik Öncelik Sırası

| Öncelik | Alan | Değişiklik | Tahmini Süre |
|---------|------|------------|-------------|
| P0 | 2 | Pre-trade risk overlay + cooldown | 2 gün |
| P0 | 1 | Daily streak + first-trade reward | 1 gün |
| P1 | 4 | AI confidence score UI | 1 gün |
| P1 | 3 | Verified trader badge + profile page | 2 gün |
| P2 | 5 | Feature flag expansion + trial | 3 gün |
| P2 | 4 | What-if simulator | 3 gün |
| P3 | 1 | Unified onboarding (merge OnboardingTour + Persona) | 1 gün |
| P3 | 5 | Pricing page + subscription | 4 gün |

### Toplam Etki Tahmini

Bu değişikliklerin tümü uygulanırsa:
- **Kullanıcı bağlılığı**: +%40 (streak + first-trade reward + onboarding)
- **Dönüşüm (premium)**: +%25 (freemium + trial + feature gating)
- **Risk yönetimi**: -%30 zarar (cooldown + risk overlay + AI friction)
- **Sosyal etkileşim**: +%60 (profil + badge + share + feed)
