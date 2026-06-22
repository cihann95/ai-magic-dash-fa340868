# Manuel Test Senaryoları — F3 Real Manual QA

**Tarih:** 2026-06-22
**Amaç:** Remote Supabase ortamında tarayıcı ile çalıştırılacak adım adım test senaryoları

---

## Akış 1: Blitz Oynama (Kullanıcı Tarafı)

### Senaryo 1.1: Yetersiz bakiyede buton disabled + tooltip
1. Kullanıcı login ol (`/auth`)
2. `/blitz` sayfasına git
3. "Gerçek Bakiye" kartında bakiyenin `$0.00` olduğunu doğrula
4. "Eşleşme bul" butonuna hover ol
5. **Beklenen:** Buton disabled (soluk), tooltip "Bakiye yetersiz. Minimum $5 gerekli." + "Bakiye Yükle →" linki
6. "Bakiye Yükle →" linkine tıkla → `/settings` sayfasına yönlendirme

### Senaryo 1.2: Davet kodu oluştur + kalıcı kart + kopyala
1. Admin `/admin/blitz` sayfasından test kullanıcısına $100 top-up yap
2. Kullanıcı `/blitz` sayfasına git
3. Bakiye kartında `$100.00` gör
4. "Özel Oda" sekmesine geç
5. Entry fee $5 seç
6. "Davet kodu oluştur" butonuna tıkla
7. **Beklenen:** Kalıcı kart görünür, içinde 6-8 karakterli kod (büyük font, mono)
8. "Kopyala" butonuna tıkla → clipboard'a kopyalandı, buton "Kopyalandı!" olur
9. "Odanın hazır olması bekleniyor..." spinner görünür
10. "İptal" butonu visible

### Senaryo 1.3: Davet kodu ile katılma
1. 2. kullanıcı login ol
2. `/blitz` → "Özel Oda" sekmesi
3. 1. kullanıcının kodunu "DAVET KODU" input'una yapıştır
4. "Katıl" butonuna tıkla
5. **Beklenen:** Her iki kullanıcı da `/blitz/{roomId}` sayfasına yönlendirilir

### Senaryo 1.4: Quick match iptal + bakiye kilidi açılır
1. Kullanıcı $100 bakiye ile quick match'e gir (Eşleşme bul)
2. "Rakip aranıyor..." spinner görünür
3. "İptal" butonuna tıkla
4. **Beklenen:** "Kuyruktan çıktın" toast, bakiye kilidi açılır (DB: `real_balance_locked = 0`)

### Senaryo 1.5: Error toast görünür
1. Redis env var'ı kaldır (veya sunucu offline simüle et)
2. "Eşleşme bul" butonuna tıkla
3. **Beklenen:** `toast.error` görünür ("Eşleştirme servisi geçici olarak kullanılamıyor"), spinner durur

---

## Akış 2: Admin Akışı

### Senaryo 2.1: Admin kullanıcı listesi + arama + filtre
1. Admin login ol
2. TopBar dropdown → "Admin Panel" → "Kullanıcılar"
3. `/admin/users` sayfası yüklenir
4. Tabloda tüm kullanıcılar görünür (id, display_name, real_balance, role, durum)
5. "Arama" input'una "test" yaz → debounce 300ms → sadece "test" içeren kullanıcılar
6. "Rol" filtresi → "Admin" seç → sadece admin kullanıcılar
7. "Durum" filtresi → "Banlı" seç → sadece banlı kullanıcılar
8. Sayfalama butonları çalışır (Geri/İleri)

### Senaryo 2.2: Rol değiştir onay dialog
1. Kullanıcı satırında "..." menüsü → "Admin Yap" tıkla
2. **Beklenen:** Dialog: "[Kullanıcı adı] kullanıcısının rolü user → admin olarak değiştirilsin mi?"
3. "Onayla" tıkla → toast: "[Kullanıcı adı] rolü admin olarak değiştirildi"
4. Tablo yenilenir, badge "admin" olur
5. Tekrar "Admin'i Kaldır" → rol user olur

### Senaryo 2.3: Ban onay dialog + sebep
1. Kullanıcı menüsü → "Banla" tıkla
2. **Beklenen:** Dialog: "[Kullanıcı adı] banlanacak."
3. "Ban Sebebi" input'una "Şüpheli aktivite" yaz (min 5 karakter)
4. "Banla" butonu enabled olur
5. "Banla" tıkla → toast: "[Kullanıcı adı] banlandı"
6. Durum sütununda "Banlı" badge görünür

### Senaryo 2.4: Oda iptal + manuel settle
1. `/admin/rooms` sayfasına git
2. Durum filtresi → "Aktif" → aktif odaları göster
3. Bir odada "X" (iptal) butonuna tıkla
4. **Beklenen:** Dialog: "Bu oda iptal edilecek. Katılımcı bakiyeleri iade edilecek."
5. "İptal Et" tıkla → toast: "Oda iptal edildi"
6. Başka bir aktif odada "✓" (sonuçlandır) butonuna tıkla
7. **Beklenen:** Dialog: "Bu oda manuel sonuçlandırılacak."
8. "Sonuçlandır" tıkla → toast: "Oda sonuçlandırıldı"

### Senaryo 2.5: Slippage config UPSERT
1. `/admin/settings` sayfasına git
2. Tabloda sembollerin slippage değerleri görünür
3. "Düzenle" butonu → dialog açılır → "Max Slippage (%)" değiştir → "Kaydet"
4. "Yeni Ekle" butonu → sembol + slippage + mod gir → "Kaydet"
5. **Beklenen:** Tablo güncellenir, toast: "[SEMBOL] kaydedildi"

### Senaryo 2.6: AdminBlitz revenue dashboard
1. `/admin/blitz` sayfasına git
2. Tarih aralığı seçici görünür (7/30/90/gün + özel)
3. KPI kartları: Toplam Revenue, Toplam Oda, Ort. Fee/Oda, En Yüksek Fee
4. Günlük Gelir Trendi line chart
5. Sembol Bazlı + Kaynak Bazlı pie chart'lar
6. Detay tablosu: sayfalama ile gelir kayıtları
7. Top-up formu: kullanıcı arama autocomplete → miktar → kategori → "Uygula" → onay dialog

---

## Akış 3: AI Coach Akışı

### Senaryo 3.1: Trade close notification dolar + yüzde
1. Kullanıcı trade açar (BTCUSD long, qty=0.1, entry=$50,000)
2. Trade kapatır (sell at $51,000)
3. **Beklenen notification title:** `✖ BTCUSD kapatıldı (+$100.00 (+2.0%))`
4. **Beklenen notification body:** `0.1 @ $51000.00 • Toplam $5100.00 • Kâr: +$100.00 (+2.0%)`
5. **Beklenen metadata:** `{pnl: 100, pnlPct: 2.0}`

### Senaryo 3.2: Negatif kâr doğru gösterilir
1. BTCUSD long, entry=$50,000, qty=0.1
2. Close at $49,000
3. **Beklenen notification title:** `✖ BTCUSD kapatıldı (-$100.00 (-2.0%))`
4. İşaretler doğru: negatif dolar + negatif yüzde

### Senaryo 3.3: AI gözlem bildirimi
1. Trade close tetiklenir → `trade-mirror` fire-and-forget çağrılır
2. DB'den notification kontrol: `SELECT * FROM notifications WHERE type='ai_signal' ORDER BY created_at DESC LIMIT 1`
3. **Beklenen title:** `🪞 📊 Teknik sinyal → +$100.00 (+2.0%)` (intent_tag varsa)
4. **Beklenen body:** AI observation Türkçe 1-2 cümle
5. **Beklenen metadata:** `{pnlPct: 2.0}` — kod'da hesaplanmış, AI uydurmamış

### Senaryo 3.4: AI JSON parse fallback
1. AI hata dönerse (mock) → notification yine de gönderilir
2. Fallback body: `İşlem kapatıldı: +$100.00 (+2.0%)`

---

## Troubleshooting

| Sorun | Olasılık | Çözüm |
|-------|---------|-------|
| Buton disabled görünmüyor | realBalance AppContext'te yüklenmedi | Console'da `useApp().realBalance` kontrol |
| Davet kodu gelmiyor | `blitz-matchmake` edge function hatası | Supabase dashboard → Edge Functions → Logs |
| Admin sayfası 403 | `has_role()` RPC hatalı veya user_roles'ta admin yok | `SELECT * FROM user_roles WHERE user_id='...'` |
| Notification title'da yüzde yok | `execute-trade` eski versiyon deploy edilmiş | `supabase functions deploy execute-trade` |
| AI observation uyduruk | `trade-mirror` prompt eski | `supabase functions deploy trade-mirror` |
| Realtime güncellenmiyor | Supabase Realtime channel abone değil | Console'da channel durumunu kontrol |

---

## Uzaktan Test Komutları

```bash
# Top-up test
curl -X POST $SUPABASE_URL/functions/v1/blitz-admin-topup \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"TARGET_UUID","amount":100,"reason":"Test top-up"}'

# Admin list users
curl -X GET "$SUPABASE_URL/functions/v1/admin-list-users?limit=5" \
  -H "Authorization: Bearer $ADMIN_JWT"

# Notification kontrol
# Supabase Dashboard → SQL Editor:
# SELECT title, body, metadata FROM notifications WHERE user_id='USER_ID' ORDER BY created_at DESC LIMIT 5;
```
