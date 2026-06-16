# Lumen Trade - AI Tabanlı Kripto Para Yatırım Platformu

## Proje Genel Bakış

Lumen Trade, yapay zeka destekli kripto para yatırım platformudur. Platform, AI algoritmaları kullanarak kripto para piyasalarını analiz eder, yatırım fırsatları önerir ve otomatik alım satım stratejileri uygular. Kullanıcı dostu arayüzü ile hem yeni başlayanlar hem de deneyimli yatırımcılar için idealdir.

## Özellikler

- **AI Destekli Analiz**: Kripto para piyasalarını gerçek zamanlı analiz eder
- **Yatırım Önerileri**: Kişiselleştirilmiş yatırım fırsatları sunar
- **Otomatik İşlemler**: Seçilen stratejilere göre otomatik alım satım yapar
- **Portföy Takibi**: Tüm yatırımlarınızı tek bir yerden takip eder
- **Risk Yönetimi**: Gelişmiş risk analizi ve kontrol mekanizmaları
- **Sosyal İşlemler**: Toplulukla etkileşim ve en iyi stratejileri paylaşır

## Kurulum

### Ön Koşullar

- Node.js v18 veya üzeri
- npm veya yarn
- Supabase hesabı (tercihen wufhbvshqhiiwjrvfzey)

### Adım Adım Kurulum

1. **Depoyu Klonla**
   ```bash
   git clone https://github.com/your-username/lumen-trade.git
   cd lumen-trade
   ```

2. **Bağımlılıkları Yükle**
   ```bash
   npm install
   # veya
   yarn install
   ```

3. **Çevre Değişkenlerini Yapılandır**
   ```bash
   cp .env.example .env
   ```
   `.env` dosyasını düzenleyerek Supabase URL'lerinizi ve API anahtarlarınızı girin.

4. **Supabase Bağlantısını Yapılandır**
   - Supabase projenize gidin: https://supabase.co
   - Edge Functions için gerekli ortam değişkenlerini ayarlayın
   - Gerekli veritabanı tablolarını oluşturun

5. **Bağlantıyı Test Et**
   ```bash
   npm run dev
   ```

   Uygulama http://localhost:5173 adresinde çalışmaya başlayacaktır.

## Proje Yapısı

```
.
├── src/
│   ├── components/          # React bileşenleri
│   ├── contexts/           # React context'ler
│   ├── hooks/              # özel hook'lar
│   ├── integrations/       # üçüncü taraf entegrasyonları
│   ├── lib/                # yardımcı fonksiyonlar
│   ├── pages/              # sayfa bileşenleri
│   ├── test/               # birim testleri
│   └── types/              # TypeScript tür tanımları
├── supabase/               # Supabase yapılandırması ve fonksiyonları
├── public/                 # statik dosyalar
├── scripts/                # yardımcı script'ler
└── .env.example           # ortam değişkenleri şablonu
```

## Mimari

### Frontend (Client-Side)

- **Framework**: React 18 + TypeScript
- **UI Library**: shadcn/ui + Tailwind CSS
- **Routing**: React Router DOM
- **State Management**: TanStack Query (önceki React Query)
- **Form Yönetimi**: React Hook Form + Zod
- **Tema**: next-themes
- **Bildirimler**: sonner
- **Hata Sınırı**: ErrorBoundary bileşeni

### Backend (Supabase)

- **Veritabanı**: PostgreSQL (Supabase ile yönetiliyor)
- **Edge Functions**: Deno tabanlı fonksiyonlar
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage
- **Realtime**: Supabase Realtime kanalı

### AI Entegrasyonu

- **AI Servisleri**: OpenAI veya benzeri yapay zeka API'leri
- **Algoritmalar**: Kendi yatırım stratejisi algoritmalarımız
- **Veri Kaynakları**: Birden çok kripto para borsasından veri çeker

## Ortam Değişkenleri

`.env.example` dosyasındaki tüm ortam değişkenlerini `.env` dosyasına kopyalayın ve değerlerini düzenleyin:

### Node.js Ortamı

```
NODE_ENV=development
```

### Frontend (Vite)

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
VITE_ANA_SAHNE_ENABLED=true
```

### Edge Functions (Deno / Supabase)

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
OPENROUTER_API_KEY=your_openrouter_api_key
```

### Upstash Redis (isteğe bağlı, fail-open)

```
UPSTASH_REDIS_REST_URL=https://your-upstash-redis-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token
```

### Web Push VAPID Anahtarları (isteğe bağlı, push bildirimler için gerekli)

```
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:your-email@domain.com
```

### Gözlem

```
SENTRY_DSN=https://your-sentry-dsn@sentry.example.com/project-id
LOG_LEVEL=info
```

## Test Çalıştırma

### Birim Testleri

```bash
npm run test
# veya
npm run test:watch
```

### Test Çıktısı

- Testler `src/test/` dizininde bulunur
- Vitest tarafından çalıştırılır
- Jest benzeri API kullanır
- React bileşenleri için @testing-library/react kullanır

### Test Örneği

```typescript
// src/test/components/Portfolio.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Portfolio } from '@/pages/Portfolio';

describe('Portfolio', () => {
  it('bakiyeyi doğru şekilde gösterir', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <Portfolio />
      </QueryClientProvider>
    );
    expect(screen.getByText(/bakiye:/i)).toBeInTheDocument();
  });
});
```

## Geliştirme İş Akışı

### 1. Geliştirme Modu

```bash
npm run dev
```

### 2. Derleme Modu

```bash
npm run build
# veya geliştirme modunda derle
npm run build:dev
```

### 3. Önizleme

```bash
npm run preview
```

### 4. Kod Kalitesi

```bash
npm run lint
```

### 5. Otomatik Yenileme

```bash
npm run test:watch
```

## Dağıtım

### Vercel ile Dağıtım

```bash
npm run build
# dist klasörünü Vercel'e yükleyin
```

### Docker ile Dağıtım

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["npm", "run", "preview"]
```

## API Dokümantasyonu

Platformumuz aşağıdaki API uç noktalarını sağlar:

### Yatırım API'leri

- `POST /api/investments` - Yeni yatırım oluştur
- `GET /api/investments` - Tüm yatırımları getir
- `GET /api/investments/{id}` - Belirli bir yatırımı getir
- `PUT /api/investments/{id}` - Yatırımı güncelle
- `DELETE /api/investments/{id}` - Yatırımı sil

### Portföy API'leri

- `GET /api/portfolio` - Portföy özetini getir
- `GET /api/portfolio/{id}` - Belirli bir portföyü getir
- `POST /api/portfolio` - Yeni portföy oluştur

### AI Analiz API'leri

- `POST /api/analyze` - Kripto para analizi yap
- `GET /api/analyze/{id}` - Analiz sonucunu getir

## Katkıda Bulunma

### Git İş Akışı

1. `main` dalını fork edin
2. `feature/` dalını oluşturun
3. Geliştirmelerinizi yapın
4. Testleri çalıştırın
5. `main` dalına push yapın
6. Pull request oluşturun

### Kod Kalitesi

- Tüm kod TypeScript ile yazılmıştır
- ESLint ile kod kalitesi kontrolü
- Prettier ile kod biçimlendirme
- Jest/Vitest ile birim testleri
- React Testing Library ile test kütüphanesi

### Commit Kuralları

- Kısa ve açıklayıcı commit mesajları kullanın
- Conventional Commits formatını takip edin
- Açıklayıcı commit mesajları yazın

## Destek

### Sorunlar

GitHub Issues bölümünde sorun bildirin: https://github.com/your-username/lumen-trade/issues

### Dokümantasyon

En son dokümantasyon için GitHub Pages sitesine göz atın: https://your-username.github.io/lumen-trade

### Topluluk

Discord sunucumuza katılın: https://discord.gg/lumen-trade

## Lisans

Bu proje MIT Lisansı altında lisanslanmıştır. Daha fazla bilgi için LISANS dosyasına bakın.

## Teşekkürler

- Supabase - Backend hizmetleri için
- Vercel - Dağıtım platformu için
- shadcn/ui - UI bileşenleri için
- Tüm katkıda bulunanlar için

## İletişim

Lumen Trade ekibiyle iletişime geçmek için:
- E-posta: hello@lumen.trade
- Web sitesi: https://lumen.trade
- GitHub: https://github.com/your-username/lumen-trade

---
*Bu README.md dosyası otomatik olarak oluşturulmuştur. En son güncellemeler için GitHub deposunu takip edin.*
