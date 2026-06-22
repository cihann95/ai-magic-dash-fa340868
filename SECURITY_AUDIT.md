# Security Audit — Faz 4

## Rate Limiting

| Fonksiyon | Limit/dk | Key Prefix | Durum |
|-----------|----------|------------|-------|
| execute-trade | 10 | rl:exec | ✅ |
| manage-order | 30 | rl:order | ✅ |
| blitz-matchmake | 5 | rl:blitz-match | ✅ |
| blitz-join-private | 5 | rl:blitz-join | ✅ |
| blitz-settle-room | 3 | rl:blitz-settle | ✅ (system-called) |
| blitz-admin-topup | 2 | rl:admin-topup | ✅ |
| ai-chat | 20 | rl:ai | ✅ |
| ai-analyze | 10 | rl:ai | ✅ |
| ai-strategy | 15 | rl:ai | ✅ |
| ai-trade-coach | 15 | rl:ai | ✅ |
| ai-risk-monitor | 15 | rl:ai | ✅ |
| reset-demo-account | 2 | rl:reset-demo | ✅ |
| blitz-tick-order | 30 | rl:blitz-tick | ✅ |

Backend: Upstash Redis (fail-open — Redis down ise rate limit bypass)

## Input Validation (Zod)

| Fonksiyon | Schema | Durum |
|-----------|--------|-------|
| execute-trade | TradeRequestSchema | ✅ |
| manage-order | ManageOrderSchema (discriminatedUnion) | ✅ |
| blitz-join-private | JoinPrivateSchema | ✅ |
| ai-chat | ChatRequestSchema | ✅ |
| ai-analyze | AnalyzeRequestSchema | ✅ |
| ai-strategy | StrategyRequestSchema | ✅ |
| ai-trade-coach | TradeCoachRequestSchema | ✅ |

## CORS

- Shared cors.ts: ALLOWED_ORIGIN veya CORS_ORIGIN env var'ı ile yapılandırılabilir
- Varsayılan: * (development)
- Production'da: ALLOWED_ORIGIN=https://lumen.trade gibi kısıtlanmalı
- Tüm edge function'lar shared corsHeaders kullanıyor

## Security Headers (vercel.json)

| Header | Value | Durum |
|--------|-------|-------|
| Content-Security-Policy | default-src 'self'; script-src ... | ✅ |
| Strict-Transport-Security | max-age=31536000; includeSubDomains | ✅ |
| X-Frame-Options | DENY | ✅ |
| X-Content-Type-Options | nosniff | ✅ |
| Referrer-Policy | strict-origin-when-cross-origin | ✅ |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | ✅ |

## JWT Verification

| Fonksiyon | JWT | Role Check | Durum |
|-----------|-----|------------|-------|
| execute-trade | Evet | — | ✅ |
| manage-order | Evet | — | ✅ |
| blitz-matchmake | Evet | — | ✅ |
| blitz-join-private | Evet | — | ✅ |
| blitz-settle-room | Hayır (system) | — | ✅ (cron/service_role) |
| blitz-admin-topup | Evet | admin | ✅ |
| ai-chat | Evet | — | ✅ |
| ai-analyze | Evet | — | ✅ |
| ai-strategy | Evet | — | ✅ |
| ai-trade-coach | Evet | — | ✅ |
| ai-risk-monitor | Evet | — | ✅ |
| reset-demo-account | Evet | — | ✅ |
| price-feed | Hayır (public) | — | ✅ (--no-verify-jwt) |
| news-feed | Hayır (public) | — | ✅ (--no-verify-jwt) |
| send-push | Hayır (DB trigger) | — | ✅ (service_role) |

## real_balance_ledger

- Tablo: real_balance_ledger
- INSERT: Sadece service_role (RLS policy yok → service_role bypass)
- UPDATE/DELETE: Policy yok → service_role dışında erişim yok
- granted_by: blitz-admin-topup'ta caller.id olarak set ediliyor
- Durum: ✅ Immutable (UPDATE/DELETE policy'leri yok)

## Öneriler

1. Production'da ALLOWED_ORIGIN env var'ı kısıtlanmalı
2. Blitz-settle-room sadece service_role ile çağrılmalı (zaten böyle)
3. send-push sadece DB trigger ile çağrılmalı (zaten böyle)