# Edge Function Fix — Rollback Planı

> **Plan**: `.omo/plans/edge-function-fix.md`
> **Kapsam**: 4 shared modül + 16 edge function (toplam 20 dosya)
> **Commit'ler**: 4 implementasyon + 1 lint fix
> **Hedef**: Her fonksiyon için geri alma prosedürü dokümante edildi
> **Dil**: Türkçe

---

## Rollback Stratejisi Özeti

Değişiklikler 3 implementasyon commit'ine bölünmüştür. Her commit bağımsız olarak `git revert` ile geri alınabilir. Sıralama önemlidir — shared modüller diğer fonksiyonlardan önce geri alınmalıdır.

### Commit Bağımlılıkları

```
571b938 (lint fix) ── bağımsız, her zaman son
    ↑
914a2ad (Wave 3: AI) ── bağımlı: Wave 2
    ↑
36435a7 (Wave 2: core) ── bağımlı: Wave 1
    ↑
e056d39 (Wave 1: shared) ── kök, bağımsız
```

**Tavsiye edilen sıra**: e056d39 → 36435a7 → 914a2ad → 571b938 (ileri sırada)
**Alternatif**: 571b938 → 914a2ad → 36435a7 → e056d39 (geri sırada, önerilir)

---

## Commit Bazlı Rollback

### 1. `e056d39` — Wave 1: Shared Modüller

**Mesaj**: `fix(shared): Wave 1 - ConfigError graceful degradation, Redis hardening, rate limit headers, body size limit`

**Revert komutu**:
```bash
git revert e056d39 --no-edit
```

**Kapsadığı dosyalar**:
| Dosya | Değişiklik |
|-------|-----------|
| `_shared/config.ts` | ConfigError try-catch ile sarıldı, production'da degrade config döner, `isConfigValid()` eklendi |
| `_shared/redis.ts` | 3s AbortController timeout, RedisConnectionError/RedisTimeoutError/RedisCommandError sınıfları, `redisHealthCheck()`, `safe()` wrapper'ı geliştirildi |
| `_shared/rate-limit.ts` | `RateLimitResult.windowMs` eklendi, X-RateLimit-Policy header'ı, rate limit aşıldığında structured log |
| `_shared/body-size-limit.ts` | **YENİ DOSYA**: `checkBodySize()` — 1MB limit, 413 döner |

**Doğrulama adımları**:
1. `_shared/body-size-limit.ts` silindiğini kontrol et (yeni dosyaydı)
2. `_shared/config.ts`'de try-catch bloğunun ve `isConfigValid()`'in kalktığını kontrol et
3. `_shared/redis.ts`'de timeout, error sınıfları ve health check'in kalktığını kontrol et
4. `_shared/rate-limit.ts`'de windowMs ve X-RateLimit-Policy header'ının kalktığını kontrol et
5. `grep -r "checkBodySize" supabase/functions/` ile hiçbir import kalmadığını doğrula (Wave 2/3 kaldıysa conflict olur)

**Risk seviyesi**: YÜKSEK — Bu commit diğer tüm dalgaların bağımlısıdır. Önce Wave 2 ve Wave 3 revert edilmelidir.

---

### 2. `36435a7` — Wave 2: Core Fonksiyonlar

**Mesaj**: `fix(core): Wave 2 - execute-trade, price-feed, blitz functions, send-push, reset-demo-account`

**Revert komutu**:
```bash
git revert 36435a7 --no-edit
```

**Kapsadığı fonksiyonlar**: 8 edge function (aşağıda detaylı)

**Doğrulama adımları**:
1. Her fonksiyonda `checkBodySize()` import ve çağrısının kalktığını kontrol et
2. Structured error code'ların (`code: "PRICE_UNAVAILABLE"` vb.) kalktığını kontrol et
3. Request timing log'larının kalktığını kontrol et
4. `git diff 36435a7^..36435a7 --stat` ile 8 dosyanın da değiştiğini doğrula

**Risk seviyesi**: ORTA — Wave 1'e bağımlıdır. Wave 1 revert edilirse önce Wave 2 revert edilmelidir.

---

### 3. `914a2ad` — Wave 3: AI Fonksiyonlar

**Mesaj**: `fix(ai): add OpenRouter error mapping to all AI functions`

**Revert komutu**:
```bash
git revert 914a2ad --no-edit
```

**Kapsadığı fonksiyonlar**: 8 edge function (aşağıda detaylı)

**Doğrulama adımları**:
1. Her AI fonksiyonunda OpenRouter error mapping'in kalktığını kontrol et
2. 30s AbortController timeout'ların kalktığını kontrol et
3. Structured error code'ların kalktığını kontrol et
4. `console.error(JSON.stringify({event: "request", ...}))` timing log'larının kalktığını kontrol et

**Risk seviyesi**: DÜŞÜK — En bağımsız commit. Sadece Wave 2'nin üzerine biner.

---

### 4. `571b938` — Lint Fix

**Mesaj**: `fix(lint): irregular whitespace and unused variable in Wave 1-3 files`

**Revert komutu**:
```bash
git revert 571b938 --no-edit
```

**Kapsadığı dosyalar**:
| Dosya | Değişiklik |
|-------|-----------|
| `_shared/body-size-limit.ts` | Yorum satırlarındaki irregular whitespace (non-breaking space → normal space) |
| `_shared/redis.ts` | Yorum satırlarındaki irregular whitespace |
| `execute-trade/index.ts` | Kullanılmayan `statsData` değişkeni `_statsData` olarak rename edildi |

**Doğrulama adımları**:
1. Yorum satırlarında non-breaking space'lerin geri geldiğini kontrol et (opsiyonel)
2. `execute-trade/index.ts`'de `_statsData`'nın `statsData`'ya döndüğünü kontrol et

**Risk seviyesi**: ÇOK DÜŞÜK — Sadece lint uyarılarını düzeltir. İşlevsel değişiklik içermez.

---

## Fonksiyon Bazında Detaylı Rollback

Aşağıda her fonksiyon için ne değiştiği, nasıl geri alınacağı ve doğrulama adımları listelenmiştir.

---

### Paylaşımlı Modüller (_shared/)

#### 1. `_shared/config.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `e056d39` |
| **Değişiklik** | `loadConfig()` try-catch ile sarıldı. Production'da ConfigError yakalanır, boş string'lerle degrade config döner. `isConfigValid()` eklendi (supabaseUrl/serviceRoleKey/anonKey/openrouterApiKey boş mu diye kontrol eder). Development modunda hata fırlatmaya devam eder. |
| **Revert** | `git revert e056d39` (tüm Wave 1 ile birlikte) veya selective: `git checkout e056d39^ -- supabase/functions/_shared/config.ts` |
| **Doğrulama** | `loadConfig()`'un try-catch içermediğini, `isConfigValid()` fonksiyonunun olmadığını kontrol et. Original config herhangi bir eksik env var'da direkt ConfigError fırlatır. |
| **Risk** | YÜKSEK — Tüm edge function'lar config'i import eder. Eğer hala eksik env var varsa cold start crash yaşanabilir. |

#### 2. `_shared/redis.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `e056d39` |
| **Değişiklik** | Her operasyona 3s AbortController timeout eklendi. `RedisConnectionError`, `RedisTimeoutError`, `RedisCommandError` sınıfları eklendi. `safe()` wrapper'ı hata kategorizasyonu ve structured log yapacak şekilde geliştirildi. `redisHealthCheck()` eklendi. `setNxEx`, `hgetall` manuel try-catch'leri `safe()`'e taşındı. |
| **Revert** | `git revert e056d39` (tüm Wave 1 ile birlikte) veya selective: `git checkout e056d39^ -- supabase/functions/_shared/redis.ts` |
| **Doğrulama** | Timeout mantığının, error sınıflarının, `redisHealthCheck()`'in olmadığını kontrol et. `safe()` wrapper'ının sadece basit try-catch + console.error yaptığını doğrula. |
| **Risk** | ORTA — Redis operasyonları timeout olmadan çalışır (sonsuza kadar bekleyebilir). Fail-open davranışı korunur. |

#### 3. `_shared/rate-limit.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `e056d39` |
| **Değişiklik** | `RateLimitResult` interface'ine `windowMs` alanı eklendi. `createRateLimitResponse()`'a `X-RateLimit-Policy` header'ı eklendi. `addRateLimitHeaders()`'a `X-RateLimit-Policy` eklendi. `rateLimit()` fonksiyonuna rate limit aşıldığında structured log eklendi. |
| **Revert** | `git revert e056d39` (tüm Wave 1 ile birlikte) veya selective: `git checkout e056d39^ -- supabase/functions/_shared/rate-limit.ts` |
| **Doğrulama** | `windowMs` alanının interface'de olmadığını, `X-RateLimit-Policy` header'ının gönderilmediğini, rate limit log'unun basit `console.error` olduğunu kontrol et. |
| **Risk** | DÜŞÜK — Sadece header ve log eklemesi. Rate limit mantığı değişmedi. |

#### 4. `_shared/body-size-limit.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `e056d39` |
| **Değişiklik** | **YENİ DOSYA**. `checkBodySize(req, maxSizeBytes?)` fonksiyonu: Content-Length header ile fast-path, body okuma ile fallback. 1MB default limit. 413 döner. |
| **Revert** | `git revert e056d39` (tüm Wave 1 ile birlikte) — dosya tamamen silinir. Veya manuel: `rm supabase/functions/_shared/body-size-limit.ts` |
| **Doğrulama** | Dosyanın silindiğini kontrol et. `grep -r "checkBodySize" supabase/functions/` hiçbir sonuç dönmemeli (Wave 2/3 import'ları da revert edilmiş olmalı). |
| **Risk** | ORTA — Bu dosyayı silmeden önce tüm import'ların kaldırıldığından emin olunmalı. Aksi halde Derleme hatası. |

---

### Wave 2 Fonksiyonları (36435a7)

#### 5. `execute-trade/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `36435a7` (+ `571b938` lint) |
| **Değişiklik** | `checkBodySize()` import + çağrı eklendi. `fetchBinancePrice()`'a 5s AbortController timeout eklendi. Tüm hata dönüşlerine `code` ve `retryable` alanları eklendi. `PRICE_UNAVAILABLE` → 429, `PRICE_STALE` → 429. `Deno.serve` handler'ında try-catch ile structured 500. Request timing log (`duration_ms`). Lint fix: `statsData` → `_statsData`. |
| **Revert** | `git revert 36435a7` (tüm Wave 2 ile birlikte) |
| **Selektif revert** | `git checkout 36435a7^ -- supabase/functions/execute-trade/index.ts` (lint fix sonrasını korumak için `571b938^` kullan) |
| **Doğrulama** | `checkBodySize` import'u yok. `fetchBinancePrice()`'da timeout yok. Hata mesajlarında `code` ve `retryable` yok. `duration_ms` log'u yok. |
| **Risk** | DÜŞÜK — Sadece hata yönetimi ve log eklentisi. Ticaret mantığı değişmedi. |

#### 6. `price-feed/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `36435a7` |
| **Değişiklik** | `fetchBinance()` ve `fetchYahoo()` fonksiyonları yeniden yazıldı: her sembol için try-catch, 5s AbortController timeout, `{updates, failed}` döner. Empty response kontrolü. `fetchYahooChart()`'a 5s timeout eklendi. |
| **Revert** | `git revert 36435a7` (tüm Wave 2 ile birlikte) veya selective: `git checkout 36435a7^ -- supabase/functions/price-feed/index.ts` |
| **Doğrulama** | `fetchBinance()` basit `fetch()` çağrısı yapıyor (timeout yok, try-catch yok). Dönüş tipi `PriceUpdate[]`. `fetchYahoo()` `Promise.all` ile çalışıyor, failed array yok. |
| **Risk** | DÜŞÜK — API timeout'ları kalkar (sonsuza kadar bekleyebilir). Partial failure handling kalkar (tek sembol hatası tüm feed'i çökertebilir). |

#### 7. `blitz-matchmake/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `36435a7` |
| **Değişiklik** | `checkBodySize()` import + çağrı. Tüm Redis operasyonları (`lrem`, `lpop`, `rpush`, `expire`) try-catch ile sarıldı (fail-open). Tüm hata dönüşlerine `code` alanı eklendi (`LOCK_FAILED`, `ROOM_CREATE_FAILED`, `PRICE_UNAVAILABLE`). Price Redis'ten çekilirken try-catch. Request timing log. |
| **Revert** | `git revert 36435a7` (tüm Wave 2 ile birlikte) veya selective: `git checkout 36435a7^ -- supabase/functions/blitz-matchmake/index.ts` |
| **Doğrulama** | `checkBodySize` import'u yok. Redis operasyonları try-catch'siz. Hata mesajlarında `code` yok. `duration_ms` log'u yok. |
| **Risk** | DÜŞÜK — Redis fail-open kalkar, Redis hatası direkt 500 dönebilir. |

#### 8. `blitz-tick-order/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `36435a7` |
| **Değişiklik** | `checkBodySize()` import + çağrı. Tüm hata dönüşlerine structured `code` eklendi (`UNAUTHORIZED`, `CLOCK_DRIFT`, `INVALID_JSON`, `FORBIDDEN_FIELD`, `MISSING_FIELDS`, `INVALID_IDEMPOTENCY_KEY`, `IDEMPOTENCY_CONFLICT`, `ROOM_NOT_FOUND`, `PRICE_UNAVAILABLE`, `INVALID_PARAMS`, `RPC_ERROR`, `VALIDATION_ERROR`, `SLIPPAGE_EXCEEDED`, `ORDER_INSERT_FAILED`, `LOCK_FAILED`, `ORDER_NOT_FOUND`, `TIMESTAMP_FAILED`, `CLOSE_FAILED`). Tüm hata dönüşlerinden önce timing log. |
| **Revert** | `git revert 36435a7` (tüm Wave 2 ile birlikte) veya selective: `git checkout 36435a7^ -- supabase/functions/blitz-tick-order/index.ts` |
| **Doğrulama** | `checkBodySize` import'u yok. Hata mesajları sade string (code'suz). `duration_ms` log'u yok. |
| **Risk** | DÜŞÜK — Sadece hata kategorizasyonu ve log. İş mantığı değişmedi. |

#### 9. `blitz-settle-room/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `36435a7` |
| **Değişiklik** | Advisory lock acquisition 5s timeout (AbortController + Promise.race). Lock başarısız → `LOCK_BUSY` (409). Settlement phase log'ları eklendi (lock/validate/settle/distribute/cleanup). Her participant güncellemesi try-catch ile sarıldı (partial settlement koruması). Request timing log. |
| **Revert** | `git revert 36435a7` (tüm Wave 2 ile birlikte) veya selective: `git checkout 36435a7^ -- supabase/functions/blitz-settle-room/index.ts` |
| **Doğrulama** | Advisory lock'ta timeout yok. Lock başarısız → `{ok: true, reason: "locked_by_other_session"}` (hata değil). Participant güncellemeleri try-catch'siz. Phase log'ları yok. |
| **Risk** | ORTA — Lock timeout kalkarsa advisory lock sonsuza kadar bekleyebilir (DB bağlantısı tükenebilir). |

#### 10. `blitz-join-private/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `36435a7` |
| **Değişiklik** | `checkBodySize()` import + çağrı. Balance lock conditional UPDATE (TOCTOU koruması) — `.eq("real_balance_locked", ...)` eklendi. Price Redis → price_cache fallback. Price yoksa 503 `PRICE_UNAVAILABLE`. Tüm hata dönüşlerine `code` alanı eklendi. Request timing log. |
| **Revert** | `git revert 36435a7` (tüm Wave 2 ile birlikte) veya selective: `git checkout 36435a7^ -- supabase/functions/blitz-join-private/index.ts` |
| **Doğrulama** | `checkBodySize` yok. Balance lock direkt update (conditional WHERE yok — TOCTOU açığı geri gelir). Price fallback yok. Price yoksa oda sessizce active'e çekilmez (hata fırlatmaz). |
| **Risk** | ORTA — TOCTOU race condition geri gelir (çifte bakiye kilitleme). |

#### 11. `send-push/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `36435a7` |
| **Değişiklik** | VAPID key kontrolü: eksikse 503 `VAPID_NOT_CONFIGURED` (önceden 200 `{skipped: true}` dönüyordu). JWT oluşturma try-catch ile sarıldı (hata → -1 döner, crash olmaz). Request timing log. |
| **Revert** | `git revert 36435a7` (tüm Wave 2 ile birlikte) veya selective: `git checkout 36435a7^ -- supabase/functions/send-push/index.ts` |
| **Doğrulama** | VAPID eksikse 200 `{skipped: true}` döner (503 değil). JWT hatası try-catch'siz (crash olabilir). `duration_ms` log'u yok. |
| **Risk** | DÜŞÜK — VAPID eksikken 503 yerine 200 döner (client tarafı farkı anlamayabilir). |

#### 12. `reset-demo-account/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `36435a7` |
| **Değişiklik** | Admin rol kontrolü: `is_admin` değilse 403 `NOT_ADMIN`. İdempotency: `demo_balance === 100000` ise `{success: true, changes: 0}` döner (değişiklik yapmaz). Audit log: `analytics_events_staging`'e `demo_reset` event'i insert edilir. Request timing log. |
| **Revert** | `git revert 36435a7` (tüm Wave 2 ile birlikte) veya selective: `git checkout 36435a7^ -- supabase/functions/reset-demo-account/index.ts` |
| **Doğrulama** | Admin kontrolü yok (herkes reset yapabilir). İdempotency yok (her çağrıda reset yapar). Audit log yok. `duration_ms` log'u yok. |
| **Risk** | ORTA — Admin kontrolü kalkar, yetkisiz kullanıcılar demo hesap sıfırlayabilir. |

---

### Wave 3 Fonksiyonları (914a2ad)

#### 13. `ai-analyze/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `914a2ad` |
| **Değişiklik** | OpenRouter error mapping: 429→429 `AI_RATE_LIMITED`, 402→503 `QUOTA_EXCEEDED`, 500/502/503→503 `AI_UNAVAILABLE`, timeout (AbortError)→504 `AI_TIMEOUT`. 30s AbortController timeout. Structured request timing log. |
| **Revert** | `git revert 914a2ad` (tüm Wave 3 ile birlikte) veya selective: `git checkout 914a2ad^ -- supabase/functions/ai-analyze/index.ts` |
| **Doğrulama** | OpenRouter error mapping yok. 429 hala 429, 402 hala 402 döner (503'e mapped edilmez). Timeout yok. `duration_ms` log'u yok. |
| **Risk** | DÜŞÜK — OpenRouter 402/502 hatası direkt iletilir (graceful degradation yok). |

#### 14. `ai-chat/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `914a2ad` |
| **Değişiklik** | OpenRouter error mapping: 429→429 `RATE_LIMITED`, 402→503 `QUOTA_EXCEEDED`, 500/502/503→503 `AI_UNAVAILABLE`, timeout→504 `AI_TIMEOUT`. 30s AbortController timeout. Streaming error handling (TransformStream + pipeTo catch). Structured request timing log. |
| **Revert** | `git revert 914a2ad` (tüm Wave 3 ile birlikte) veya selective: `git checkout 914a2ad^ -- supabase/functions/ai-chat/index.ts` |
| **Doğrulama** | OpenRouter error mapping yok. 402 hala 402 döner. Stream hatasız passthrough. Timeout yok. `duration_ms` log'u yok. |
| **Risk** | DÜŞÜK — Streaming hata yönetimi kalkar, ortasında kesilen stream'ler 500 dönebilir. |

#### 15. `ai-strategy/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `914a2ad` |
| **Değişiklik** | OpenRouter error mapping: 429→429 `RATE_LIMITED`, 402→503 `QUOTA_EXCEEDED`, 500→503 `AI_UNAVAILABLE`, timeout→504 `AI_TIMEOUT`. 30s AbortController timeout. Structured request timing log. Catch bloğunda `code: "INTERNAL_ERROR"` eklendi. |
| **Revert** | `git revert 914a2ad` (tüm Wave 3 ile birlikte) veya selective: `git checkout 914a2ad^ -- supabase/functions/ai-strategy/index.ts` |
| **Doğrulama** | OpenRouter error mapping yok. 402/500 direkt iletilir. Timeout yok. `duration_ms` log'u yok. |
| **Risk** | DÜŞÜK |

#### 16. `ai-trade-coach/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `914a2ad` |
| **Değişiklik** | OpenRouter error mapping (`_lastAiError` modül değişkeni ile): 429→429 `RATE_LIMITED`, 402→503 `QUOTA_EXCEEDED`, 500+→503 `AI_UNAVAILABLE`, timeout→504 `AI_TIMEOUT`, parse hatası→503 `AI_PARSE_ERROR`. 30s AbortController timeout. `generateInsight()`'da JSON.parse try-catch. Structured request timing log. |
| **Revert** | `git revert 914a2ad` (tüm Wave 3 ile birlikte) veya selective: `git checkout 914a2ad^ -- supabase/functions/ai-trade-coach/index.ts` |
| **Doğrulama** | `_lastAiError` modül değişkeni yok. OpenRouter hataları direkt geçer (mapping yok). JSON.parse try-catch'siz (çökebilir). Timeout yok. |
| **Risk** | ORTA — JSON.parse hatası try-catch'siz kalırsa AI'dan bozuk JSON gelince crash olabilir. |

#### 17. `ai-risk-monitor/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `914a2ad` |
| **Değişiklik** | Her risk check (concentration/loss/discipline) için structured log (`{event: "risk_check", check: "...", alerts_created: N}`). Hata dönüşlerine `code` alanı eklendi (`UNAUTHORIZED`, `INVALID_BODY`, `RISK_MONITOR_ERROR`). Request timing log. |
| **Revert** | `git revert 914a2ad` (tüm Wave 3 ile birlikte) veya selective: `git checkout 914a2ad^ -- supabase/functions/ai-risk-monitor/index.ts` |
| **Doğrulama** | Risk check log'ları yok. Hata mesajlarında `code` yok. `duration_ms` log'u yok. |
| **Risk** | ÇOK DÜŞÜK — Sadece log eklemesi. |

#### 18. `daily-brief/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `914a2ad` |
| **Değişiklik** | OpenRouter error mapping: 429→429 `RATE_LIMITED`, 402→503 `QUOTA_EXCEEDED`, 500+→503 `AI_UNAVAILABLE`, timeout (AbortError)→504 `AI_TIMEOUT`. 30s AbortController timeout. Structured request timing log. Catch bloğunda `code: "INTERNAL_ERROR"`. |
| **Revert** | `git revert 914a2ad` (tüm Wave 3 ile birlikte) veya selective: `git checkout 914a2ad^ -- supabase/functions/daily-brief/index.ts` |
| **Doğrulama** | OpenRouter error mapping yok. 402 hala 402 döner. Timeout yok. `duration_ms` log'u yok. |
| **Risk** | DÜŞÜK |

#### 19. `weekly-digest/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `914a2ad` |
| **Değişiklik** | Null-safe sorting: `bestIntent` ve `dominantMood` için `?? null` eklendi (boş dizi sort hatasını önler). Hata dönüşlerine `code: "DIGEST_ERROR"` eklendi. Structured request timing log. |
| **Revert** | `git revert 914a2ad` (tüm Wave 3 ile birlikte) veya selective: `git checkout 914a2ad^ -- supabase/functions/weekly-digest/index.ts` |
| **Doğrulama** | `bestIntent` ve `dominantMood` atamalarında `?? null` yok. Hata mesajında `code` yok. `duration_ms` log'u yok. |
| **Risk** | ORTA — Null-safe sorting kalkarsa boş dizi üzerinde `[0]` çağrısı `undefined` döner, bu hata üretmez ama mantık hatası olabilir. |

#### 20. `trade-mirror/index.ts`

| Alan | Detay |
|------|-------|
| **Commit** | `914a2ad` |
| **Değişiklik** | OpenRouter 30s AbortController timeout. Fetch hatası → 504 `AI_TIMEOUT`. AI hata mapping: 429/402 → `{skipped: true}`, diğer hatalar → 503 `AI_{status}`. Structured request timing log. |
| **Revert** | `git revert 914a2ad` (tüm Wave 3 ile birlikte) veya selective: `git checkout 914a2ad^ -- supabase/functions/trade-mirror/index.ts` |
| **Doğrulama** | OpenRouter timeout yok. AI hatası direkt throw edilir (try-catch'te catch'lenir). Structured log yok. |
| **Risk** | DÜŞÜK |

---

## Toplu Rollback Komutları

### Seçenek 1: Tümünü Geri Al (Önerilen)

```bash
# Önce en son commit'ten başla (ters sıra)
git revert 571b938 --no-edit
git revert 914a2ad --no-edit
git revert 36435a7 --no-edit
git revert e056d39 --no-edit
```

### Seçenek 2: Tek Commit ile Tümünü Geri Al

```bash
# wave-1..HEAD arasındaki tüm commit'leri geri al
git revert e056d39..HEAD --no-edit
```

### Seçenek 3: Sadece Belirli Bir Fonksiyonu Geri Al

```bash
# Örnek: execute-trade'i Wave 2 öncesine döndür
git checkout 36435a7^ -- supabase/functions/execute-trade/index.ts
# Örnek: ai-analyze'i Wave 3 öncesine döndür
git checkout 914a2ad^ -- supabase/functions/ai-analyze/index.ts
```

---

## Conflict Durumları

| Durum | Çözüm |
|-------|-------|
| **Wave 1 revert edilirken Wave 2/3 duruyor** | Wave 1 revert edilemez — önce Wave 2 ve 3 revert edilmelidir. Wave 2/3, Wave 1'deki `checkBodySize` ve `isConfigValid`'i import eder. |
| **Lint fix (571b938) duruyor, diğerleri revert edildi** | Sorun yok. Lint fix bağımsızdır. `_statsData` değişken ismi `statsData` olsa da çalışır (kullanılmıyor). |
| **Selektif revert (tek dosya)** | `git checkout` ile yapılırsa commit grafiği bozulmaz. Ancak sonraki toplu revert'lerde conflict çıkabilir. |

---

## Rollback Sonrası Doğrulama

```bash
# 1. Derleme kontrolü
cd supabase && deno check functions/_shared/config.ts functions/_shared/redis.ts

# 2. Import hataları kontrolü
grep -r "checkBodySize\|_lastAiError\|redisHealthCheck" functions/ | grep -v "__tests__"

# 3. Değişiklikleri doğrula
git log --oneline -5
git diff --stat HEAD~4..HEAD  # revert edilen dosyaları gösterir

# 4. Her fonksiyonun import'larını kontrol et
for f in functions/*/index.ts; do
  echo "=== $f ==="
  head -20 "$f" | grep "import.*from"
done
```

---

## Acil Rollback Prosedürü

Eğer production'da acil rollback gerekiyorsa (örneğin tüm fonksiyonlar 5xx dönüyorsa):

```bash
# 1. En hızlı yol: tüm commit'leri tek hamlede geri al
git revert --no-edit e056d39..HEAD

# 2. Deploy et
# Supabase CLI ile:
npx supabase functions deploy --project-ref <PROJECT_REF>

# 3. Servis sağlığını kontrol et
curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/execute-trade \
  -H "Authorization: Bearer $ANON_KEY" \
  -d '{"symbol":"BTC","side":"buy","quantity":0.001}'
```

---

## Risk Matrisi

| Fonksiyon | Risk | Gerekçe |
|-----------|------|---------|
| `_shared/config.ts` | YÜKSEK | Tüm fonksiyonlar bağımlı, cold start crash riski |
| `_shared/redis.ts` | ORTA | Timeout kalkar, hang riski |
| `_shared/rate-limit.ts` | DÜŞÜK | Sadece header/log |
| `_shared/body-size-limit.ts` | ORTA | Import bağımlılığı |
| `execute-trade` | DÜŞÜK | Sadece error mapping |
| `price-feed` | DÜŞÜK | Timeout kalkar |
| `blitz-matchmake` | DÜŞÜK | Redis fail-open kalkar |
| `blitz-tick-order` | DÜŞÜK | Sadece error code |
| `blitz-settle-room` | ORTA | Lock timeout kalkar |
| `blitz-join-private` | ORTA | TOCTOU açığı geri gelir |
| `send-push` | DÜŞÜK | VAPID kontrolü kalkar |
| `reset-demo-account` | ORTA | Admin kontrolü kalkar |
| `ai-analyze` | DÜŞÜK | Error mapping kalkar |
| `ai-chat` | DÜŞÜK | Streaming hata yönetimi kalkar |
| `ai-strategy` | DÜŞÜK | Error mapping kalkar |
| `ai-trade-coach` | ORTA | JSON.parse crash riski |
| `ai-risk-monitor` | ÇOK DÜŞÜK | Sadece log |
| `daily-brief` | DÜŞÜK | Error mapping kalkar |
| `weekly-digest` | ORTA | Null-safe sorting kalkar |
| `trade-mirror` | DÜŞÜK | Error mapping kalkar |

---

*Doküman: `.omo/evidence/rollback-plan.md`*
*Oluşturma: 2026-06-18*
*Commit'ler: e056d39, 36435a7, 914a2ad, 571b938*
