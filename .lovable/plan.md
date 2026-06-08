## Lumen-Blitz — FAZ 1: Lobi, Oda ve Eşleşme Altyapısı

60 saniyelik P2P finansal yarışma odalarının temelini atıyoruz. Bu fazda DB şeması, cüzdan, eşleşme ve oda yaşam döngüsünü kuracağız. UI ve dopamin katmanı sonraki fazlara.

### Kararlar (sizden onaylandı)
- **In-memory:** Upstash Redis (REST) — `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` secret olarak eklenecek
- **Cüzdan:** Yeni `profiles.real_balance` alanı (demo'dan ayrı, manuel kredi ile başlar, ödeme entegrasyonu yok)
- **Eşleşme:** 1v1 otomatik kuyruk + davet kodu ile özel oda (genişletilebilir mimari — sonradan multi-player eklenebilir)
- **Ses/animasyon:** Bu fazda yok; minimal toast + temel sayaç. FAZ 3'te eklenir.

---

### 1. Veritabanı Şeması (migration)

```text
profiles
  + real_balance       numeric DEFAULT 0     (guard trigger ile korunur)
  + real_balance_locked numeric DEFAULT 0    (aktif odalarda kilitli)

blitz_rooms
  id              uuid PK
  symbol          text       (SYMBOLS listesinden)
  entry_fee       numeric    (>0)
  status          enum: waiting | active | settling | finished | cancelled
  mode            enum: public | private
  invite_code     text       (private için, unique)
  max_players     int        DEFAULT 2
  starts_at       timestamptz
  ends_at         timestamptz
  start_price     numeric    (active'e geçerken Redis'ten snapshot)
  winner_id       uuid
  pot             numeric    (toplam havuz)
  fee_collected   numeric    (%5 komisyon, FAZ 4'te aktif)
  created_at, updated_at

blitz_participants
  id, room_id, user_id
  joined_at
  final_pnl       numeric
  final_balance   numeric
  rank            int
  UNIQUE(room_id, user_id)

blitz_orders     (oda içi mikro işlemler — RAM kopyası Redis'te)
  id, room_id, user_id
  side            enum: long | short
  amount          numeric        ($5/$10/$25/$50)
  entry_price     numeric
  exit_price      numeric
  pnl             numeric
  opened_at, closed_at
```

- Tüm tablolarda RLS açık; `service_role` tam, `authenticated` yalnızca kendi satırlarına SELECT.
- GRANT'lar her tablo için migration içinde.
- `update_updated_at_column` trigger'ı `blitz_rooms`'a bağlanır.
- `profiles.real_balance` için mevcut `guard_profiles_financial_update` trigger'ı güncellenir: bu alan da yalnız `service_role` tarafından yazılabilir.
- Realtime publication'a `blitz_rooms`, `blitz_participants`, `blitz_orders` eklenir.

### 2. Upstash Redis Entegrasyonu

Secret istenecek: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

Edge functions için hafif yardımcı: `supabase/functions/_shared/redis.ts` (REST `pipeline` wrapper).

Key tasarımı:
```text
blitz:queue:{symbol}:{entry_fee}        → List (bekleyen user_id'ler, FIFO)
blitz:room:{room_id}                    → Hash (status, start_price, ends_at)
blitz:room:{room_id}:users              → Set
blitz:room:{room_id}:positions          → Hash (user_id → JSON pozisyon)
blitz:price:{symbol}                    → String (son fiyat, price-feed yazar)
```

Mevcut `price-feed` fonksiyonuna küçük ek: her tick'te `blitz:price:{symbol}` SET.

### 3. Edge Functions (yeni)

| Fonksiyon | Görev |
|---|---|
| `blitz-matchmake` | Kullanıcı "Hızlı Maç" → kuyruğa ekle. Kuyrukta hazır rakip varsa atomik `LPOP`, oda oluştur, `real_balance` kilitle, ikisini de Realtime ile bilgilendir. Private mod: `invite_code` ile oda yarat. |
| `blitz-join-private` | Davet kodu ile odaya katılım. |
| `blitz-cancel-queue` | Kullanıcı kuyruktan çıkar. |
| `blitz-tick-order` | Oda aktifken LONG/SHORT emir aç/kapa. Redis'e yaz, `blitz_orders`'a satır at. (FAZ 2 UI buraya bağlanır — backend hazır olacak) |
| `blitz-settle-room` | Oda süresi dolduğunda: tüm açık pozisyonları son fiyattan kapat, PnL'leri hesapla, kazananı belirle, %5 komisyon kes, kazananın `real_balance`'ına net ödülü ekle, kaybedenin kilidini düşür, `status=finished`, Realtime broadcast. |

Hepsi `verify_jwt` default (in-code JWT doğrulama). `service_role` ile DB yazar.

### 4. 60 Saniyelik Zamanlayıcı

pg_cron her 5 saniyede bir çalışır: süresi dolmuş `active` odaları bulup `blitz-settle-room` çağırır (`x-cron-secret` ile).

```text
SELECT cron.schedule('blitz-settler-5s', '*/5 * * * * *', ...)
```

Yedek: client de `ends_at` bittiğinde fonksiyonu tetikleyebilir (idempotent — settle iki kez çağrılırsa ikincisi no-op).

### 5. Frontend (minimal — sadece akışı çalıştırmak için)

- Yeni route: `/blitz` (lobi: sembol + entry_fee seçimi + "Hızlı Maç" + "Özel Oda Oluştur/Katıl")
- Yeni route: `/blitz/:roomId` (oda: 60s sayaç, mevcut TradingView 1m grafik, LONG/SHORT iki büyük buton, miktar quick-pick, basit canlı PnL listesi)
- `BottomNav` ve `CommandPalette`'a Blitz girişi
- Realtime hook: `useBlitzRoom(roomId)` → katılımcılar + statü
- Tüm UI shadcn/ui + mevcut tema; ses/animasyon yok

### 6. Güvenlik
- `real_balance` ve `real_balance_locked` yalnız service_role tarafından yazılır (guard trigger genişletilir)
- Matchmaking ve settle: transaction güvenliği için tek edge function içinde sıralı işlem (Postgres advisory lock + Redis atomik komutlar)
- RLS: kullanıcı yalnızca üyesi olduğu odanın participant/order satırlarını görebilir

### 7. GitHub
- Tüm değişiklikler otomatik GitHub'a sync olur (mevcut bağlantı)
- Commit: `feat(blitz): phase 1 — rooms, matchmaking, settlement engine`

---

### Bu fazda YAPILMAYACAKLAR (sonraki fazlar)
- FAZ 2: Cilalı UI (canlı leaderboard animasyonları, framer-motion)
- FAZ 3: Ses + havai fişek + flaş efektleri
- FAZ 4: Komisyon dashboard'u, `platform_revenue` tablosu raporları
- Ödeme entegrasyonu (real_balance manuel kredilenir)

### Onay sonrası ilk aksiyonlar
1. `add_secret` → UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN (Upstash'ten ücretsiz alınır)
2. Migration uygula (DB şeması)
3. Edge functions yaz + price-feed'e Redis push ekle
4. pg_cron job'u kur
5. Minimal `/blitz` ve `/blitz/:roomId` sayfalarını oluştur
6. GitHub'a push (otomatik)
