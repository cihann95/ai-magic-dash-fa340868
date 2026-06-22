# Deployment

## Edge Functions

`deploy-edge-functions` workflow'u sadece `SUPABASE_ACCESS_TOKEN` secret'ı mevcutsa çalışır.

### Secret Nasıl Eklenir

1. GitHub repo'ya git → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** tıkla
3. Name: `SUPABASE_ACCESS_TOKEN`
4. Value: Supabase Dashboard → **Account** → **Access Tokens** → token oluştur/kopyala
5. Kaydet

Ayrıca `SUPABASE_PROJECT_ID` secret'ı da gereklidir ( aynı sayfadan ekleyin).

Secret eklenmeden önce workflow **skip** edilir (fail olmaz).

## Edge Functions Manuel Deploy

Edge function'lar Supabase'e manuel deploy edilmeli. CI deploy için SUPABASE_ACCESS_TOKEN gereklidir.

### Ön Koşullar
- Supabase CLI kurulu olmalı (`npm i -g supabase`)
- Supabase hesabında login olmalı
- Proje ref bilinmeli

### Deploy Adımları

```bash
# Tüm fonksiyonları tek komutla deploy et
bash supabase/deploy-all.sh --project-ref <PROJECT_REF>
```

Script `--no-verify-jwt` flag'ini `price-feed` ve `news-feed` için otomatik ekler, diğerlerini auth-required olarak deploy eder. `SUPABASE_ACCESS_TOKEN` environment variable'ı set edilmelidir.

### JWT Doğrulama Gereksinimleri

| Fonksiyon | --no-verify-jwt | Neden |
|-----------|----------------|-------|
| price-feed | Evet | Public endpoint, anon erişim |
| news-feed | Evet | Public endpoint, anon erişim |
| manage-order | Hayır | Kullanıcı auth gerektirir |
| execute-trade | Hayır | Kullanıcı auth gerektirir |
| ai-chat | Hayır | Kullanıcı auth gerektirir |
| ai-analyze | Hayır | Kullanıcı auth gerektirir |
| ai-risk-monitor | Hayır | Kullanıcı auth gerektirir |
| ai-strategy | Hayır | Kullanıcı auth gerektirir |
| ai-trade-coach | Hayır | Kullanıcı auth gerektirir |
| blitz-matchmake | Hayır | Kullanıcı auth gerektirir |
| blitz-tick-order | Hayır | Kullanıcı auth gerektirir |
| blitz-settle-room | Hayır | Kullanıcı auth gerektirir |
| blitz-join-private | Hayır | Kullanıcı auth gerektirir |
| blitz-analytics-writer | Hayır | Kullanıcı auth gerektirir |
| blitz-admin-topup | Hayır | Admin auth gerektirir |
| daily-brief | Hayır | Kullanıcı auth gerektirir |
| weekly-digest | Hayır | Kullanıcı auth gerektirir |
| send-push | Hayır | Kullanıcı auth gerektirir |
| trade-mirror | Hayır | Kullanıcı auth gerektirir |
| reset-demo-account | Hayır | Kullanıcı auth gerektirir |

Public endpoint'ler için:
```bash
supabase functions deploy price-feed --no-verify-jwt
supabase functions deploy news-feed --no-verify-jwt
```
