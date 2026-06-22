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
