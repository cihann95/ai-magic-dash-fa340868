

## Orchestrator Stratejilerini Platforma Entegre Et — Sprint 1

Orchestrator'ın 7 stratejisinden, **mevcut altyapıya en hızlı entegre olabilen ve gerçek davranışsal değer üreten** 3 tanesini seçtim (kendi tavsiyesine de uygun: **01, 03, 06**). Strateji 05 (kayıp gizleme) ek bonus olarak Portfolio'ya tek toggle ile geliyor. Diğerleri (kimlik onboarding, sessiz alarmlar, iptal akışı) Sprint 2'ye bırakılacak — çünkü ya henüz subscription katmanı yok (07) ya da geniş yeniden tasarım gerektiriyor (02).

---

### Strateji 06 — Zorunlu Niyet Kaydı ("Neden alıyorsun?")

**En yüksek ROI, en düşük teknik risk.** Her trade'e psikolojik bir mühür basar, sonra sonuçla yüzleştirir.

- `OrderTicket` → "AL/SAT" butonuna basınca küçük bir Dialog açılır:
  - 3 chip: **Teknik sinyal** / **Haber** / **Sezgi**
  - Opsiyonel 1 satırlık serbest metin ("Neden?")
  - "Vazgeç" / "Onayla" butonu — onayla'ya basınca trade execute olur
- Aynı mekanik `ChartPanel`'in hızlı AL/SAT akışı için de devreye girer
- Niyet `trades` tablosuna 2 yeni kolonla yazılır: `intent_tag`, `intent_note`
- **Pozisyon kapanırken** (execute-trade close path) bildirim oluşur:
  *"Sezgi ile açmıştın → +%4.2 kazandın 🎯"* veya *"Habere tepkiyle açmıştın → -$45"*
- Yeni sayfa: **`/insights`** (sol menüye link). İçeriği:
  - **"Niyet Aynası"** kartı: kullanıcının her etiketi için kapanmış trade ortalamaları (kazanç oranı, ortalama PnL, en iyi/en kötü)
  - Görsel bar: hangi etiket bu kullanıcıda en kazandırıyor

---

### Strateji 03 — İşlem Sonrası AI "Ayna"

Kullanıcıya tavsiye değil, **gözlem** sunar — kendi davranış kalıbını gösterir.

- Yeni edge function: **`trade-mirror`**
  - Trade kapandıktan sonra `execute-trade` içinden tetiklenir (close path'te, sadece kullanıcının kendi trade'i)
  - Son 90 günlük `trades` ve yeni `intent_tag`'leri okur
  - Lovable AI Gateway (`google/gemini-3-flash-preview`) ile 1-2 cümlelik gözlem üretir (tool calling ile structured output: `observation`, `pattern_type`)
  - Sonucu `coach_insights` tablosuna `category='mirror'` olarak yazar + `notifications` tablosuna düşer
- `coach_insights`'a INSERT politikası ekle (service role kullanılıyor zaten ama edge function user header ile gidiyorsa policy lazım) — migration ile çözülür
- Coach sayfasında "Aynalar" sekmesi: zaman akışı şeklinde gözlemler

Örnek çıktı: *"Son 3 zararlı trade'in de Cuma 18:00'dan sonraydı. Bu bir kalıp olabilir."*

---

### Strateji 01 — Duygusal Soğuma Katmanı (Hafif Versiyon)

**Tam davranışsal sinyal motorunu** (mouse hızı, ekran geçişi vs.) ilk sprintte kurmak aşırı geniş. Yerine **deterministik, yüksek-değerli tetikleyiciler** ile başlıyoruz:

- **Hot-streak/Tilt tespiti** — client-side hook `useEmotionalSignal`:
  - Son 5 dakikada ≥3 trade → "hızlı sıralı işlem" sinyali
  - Son trade kapatma anından itibaren <60sn içinde yeni AL/SAT denemesi → "tepkisel" sinyal
  - Bu trade'in büyüklüğü, kullanıcının son 20 trade'inin medyanından >3x → "aşırı pozisyon" sinyali
- Sinyal varsa OrderTicket onay Dialog'unun üstüne küçük yumuşak bir kart:
  - *"Şu an nasıl hissediyorsun? (3sn — atlayabilirsin)"*
  - 4 emoji butonu: 😌 sakin / 🎯 odaklı / ⚡ heyecanlı / 😤 kızgın
  - Atlanabilir, **işlem engellenmez**
- Cevap → `emotional_logs` tablosuna kaydedilir (signal_type, mood, trade_id)
- Haftalık özet `/insights` sayfasında: *"⚡ Heyecanlıyken yapılan 8 trade ortalama -$23. 😌 Sakinken yapılan 12 trade ortalama +$41."*

---

### Bonus: Strateji 05 (Hafif) — Portfolio "Sağlık Modu"

Tek toggle, büyük etki:
- Portfolio header'a `Switch`: "Pozisyon Sağlığı" ↔ "P&L"
- Sağlık modunda P&L sayıları gizli; yerine her pozisyon için: tutulma süresi, hedeften uzaklık (eğer alert varsa), volatilite-uyumu badge'i
- Tercih `profiles.preferred_view` kolonunda saklanır

---

## Veritabanı Migrationları

Tek migration:
```text
ALTER TABLE trades  ADD COLUMN intent_tag text,
                    ADD COLUMN intent_note text;
ALTER TABLE profiles ADD COLUMN preferred_view text DEFAULT 'pnl';

CREATE TABLE emotional_logs (
  id uuid PK, user_id uuid, trade_id uuid NULL,
  signal_type text,    -- 'rapid_fire' | 'reactive' | 'oversize' | 'manual'
  mood text,           -- 'calm' | 'focused' | 'excited' | 'angry' | NULL (atlandı)
  created_at timestamptz default now()
);
RLS: kendi user_id'in için ALL.

-- coach_insights'a INSERT policy ekle (auth.uid() = user_id)
```

---

## Dosya Değişiklik Haritası

```text
yeni:
  src/components/trading/IntentDialog.tsx       (S06 + S01 birleşik dialog)
  src/hooks/useEmotionalSignal.ts               (S01 client sinyal motoru)
  src/pages/Insights.tsx                        (S06 ayna + S01 mood özeti)
  supabase/functions/trade-mirror/index.ts      (S03 AI gözlem)

değişen:
  src/components/trading/OrderTicket.tsx        (Dialog akışı)
  src/components/trading/ChartPanel.tsx         (Dialog akışı)
  supabase/functions/execute-trade/index.ts     (intent_tag/note kabul + mirror tetikle)
  src/pages/Portfolio.tsx                       (sağlık toggle)
  src/pages/Coach.tsx                           ("Aynalar" sekmesi)
  src/components/AppShell.tsx + BottomNav       (/insights linki)
  src/lib/i18n.ts                               (yeni stringler)
  src/App.tsx                                   (/insights route)
```

---

## Doğrulama Sırası
1. Migration uygulanır → `trades.intent_tag` ve `emotional_logs` mevcut
2. AL butonuna basıldığında IntentDialog açılır, etiket seçilir, trade execute olur
3. (5dk içinde 3 trade) → Dialog'un üstünde mood prompt görünür
4. Pozisyon kapanır → 2-3 sn içinde bildirim çanı titrer ("Sezgi ile açmıştın → ...")
5. `/insights` açılır → niyet bazlı kazanç tablosu + mood özeti dolu
6. Portfolio sağlık toggle → P&L gizleniyor

---

## Sprint 2'ye Bırakılanlar (Onayla, sıradaki turda yaparız)
- **S02** Kimlik onboarding (4 soru + tema kişiselleştirme + kategori liderboard)
- **S04** Sessiz alarmlar (push'u kapatıp pull-only badge)
- **S07** İptal akışı (önce subscription/billing katmanı gerekir)

