# Lumen Trade — Production Hardening

## TL;DR

> **Quick Summary**: Lumen Trade'in demo trading platformunu production'a hazır hale getirmek için finansal çekirdek doğrulaması, CI/CD kurulumu, tip güvenliği kademeli açılımı, production sertleştirme ve temizlik工作的 planı.
>
> **Deliverables**:
> - Tüm kritik güvenlik açıkları kapatılmış
> - CI/CD pipeline aktif ve yeşil
> - Type safety kademeli olarak artırılmış (noImplicitAny: true, strictNullChecks: true)
> - Rate limiting ve input validation eklenmiş
> - Production monitoring (Sentry) aktif
> - README ve test coverage artırılmış
>
> **Estimated Effort**: Large (birkaç gün)
> **Parallel Execution**: YES - 6 faz, Phase 0 paralel, sonraki fazlar sıralı
> **Critical Path**: T0.1-T0.4 → T1.1-T1.3 → T2.1-T2.2 → T3.1-T3.3 → T4.1-T4.3 → T5.1-T5.7

---

## Context

### Original Request
Kullanıcı, Lumen Trade projesinin production'a hazır hale getirilmesi için detaylı bir iş listesi (GÖREV LİSTESİ — LUMEN TRADE PRODUCTION HARDENING) sağladı. Her görev için dosya, kabul kriteri ve bağımlılık belirtilmişti.

### Interview Summary
**Key Discussions**:
- 5 faz, 22 görev tanımlandı
- Fazlar sırayla yürütülecek (Phase 0 hariç paralel)
- Her görev tamamlanmadan önce kanıt (test çıktısı, log) üretilecek
- TypeScript config kademeli açılacak (flag flip değil)

### Metis Review
Metis bu planı değerlendirmedi (kullanıcı zaten detaylı plan sağlamıştı).

---

## Work Objectives

### Core Objective
Lumen Trade'in production'a hazır, güvenli, test edilmiş ve izlenebilir hale getirilmesi.

### Concrete Deliverables
- Audit script sonuçları (PASS/FAIL)
- CI pipeline yeşil run
- `as any` sayısı 21'den düşürülmüş
- Rate limiting eklentisi
- Zod validation eklentisi
- Sentry/Redis/VAPID prod entegrasyonu
- README dokümantasyonu
- Test coverage raporu

### Definition of Done
- [ ] Tüm fazlar tamamlandı
- [ ] Tüm kabul kriterleri sağlandı
- [ ] Build + test PASS
- [ ] Audit script'leri PASS

### Must Have
- Finansal çekirdek testleri (execute-trade, blitz-matchmake, blitz-tick-order, blitz-settle-room)
- CI/CD pipeline aktif
- NoImplicitAny: true
- Rate limiting

### Must NOT Have (Guardrails)
- Flag flip ile TypeScript güvenliği (kademeli olmalı)
- Production'a geçmeden önce eksik test
- Eksik env variable

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Vitest + Testing Library)
- **Automated tests**: Tests-after (her görev kendi testini yazacak)
- **Framework**: Vitest ^3.2.4

### QA Policy
Her görev için agent-executed QA. Evidence .omo/evidence/ altına kaydedilecek.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 0 (PHASE 0 — Doğrulama/Keşif, PARALEL):
├── Task T0.1: .omo sentezi [quick]
├── Task T0.2: Audit script çalıştır [quick]
├── Task T0.3: CI revert analiz [quick]
└── Task T0.4: activity_feed audit [quick]

Wave 1 (PHASE 1 — Finansal Çekirdek, SEQUENTIAL):
├── Task T1.1: Concurrency/idempotency testleri [deep]
├── Task T1.2: Ledger invariant kontrolü [unspecified-high]
└── Task T1.3: Bulunan açıkları kapat [deep]

Wave 2 (PHASE 2 — CI/CD, SEQUENTIAL):
├── Task T2.1: CI pipeline etkinleştir [unspecified-high]
└── Task T2.2: Staging smoke test [unspecified-high]

Wave 3 (PHASE 3 — Tip Güvenliği, SEQUENTIAL):
├── Task T3.1: as any kök neden analizi [unspecified-high]
├── Task T3.2: Tip extension dosyası [unspecified-high]
└── Task T3.3: strictNullChecks kademeli aç [deep]

Wave 4 (PHASE 4 — Production Sertleştirme, SEQUENTIAL):
├── Task T4.1: Rate limiting [deep]
├── Task T4.2: Zod validation [unspecified-high]
└── Task T4.3: Prod servis anahtarları [unspecified-high]

Wave 5 (PHASE 5 — Temizlik/İyileştirme, PARALEL):
├── Task T5.1: README yaz [quick]
├── Task T5.2: Lint hataları düzelt [quick]
├── Task T5.3: Build chunk optimizasyonu [quick]
├── Task T5.4: Coverage raporu [quick]
├── Task T5.5: Blitz tip senkronizasyon [quick]
├── Task T5.6: Kritik sayfa testleri [unspecified-high]
└── Task T5.7: Test dosyası convention [quick]

Wave FINAL (After ALL tasks):
├── Task F1: Plan compliance audit
├── Task F2: Code quality review
├── Task F3: Real QA
└── Task F4: Scope fidelity check
```

---

## TODOs

- [ ] 0. T0.1 — .omo Analizlerini Sentezle

  **What to do**:
  - `.omo/reports/threat-model.md`, `.omo/plans/production-hardening.md`, `.omo/notepads/production-readiness/learnings.md` dosyalarını oku
  - Mevcut rapor Bölüm 9 (güvenlik) ve Bölüm 12 (aksiyon planı) ile karşılaştır
  - Çelişen, eksik kalan veya zaten çözülmüş olduğu iddia edilen ama gerçekte çözülmemiş maddeleri liste halinde ver

  **Must NOT do**:
  - Dosyaları değiştirme
  - Varsayım yapma

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0 (T0.1, T0.2, T0.3, T0.4 ile birlikte)
  - **Blocks**: T1.3
  - **Blocked By**: Yok

  **References**:
  - `.omo/reports/threat-model.md` — 855 satır, güvenlik analizi
  - `.omo/plans/production-readiness.md` — 3165 satır, production hazırlık planı
  - `.omo/notepads/production-readiness/learnings.md` — 595 satır, öğrenilenler

  **Acceptance Criteria**:
  - [ ] Karşılaştırma tablosu (mevcut rapor maddesi vs .omo bulgusu vs durum)
  - [ ] Dosya yolu ve satır numarası referansları

  **QA Scenarios**:
  ```
  Scenario: Sentez tablosu oluşturuldu
    Tool: Bash (cat/diff)
    Steps:
      1. Dosyaları oku
      2. Karşılaştırma tablosunu .omo/evidence/t0.1-synthesis.md olarak kaydet
      3. Tabloda en az 10 madde bul
    Expected Result: Tablo eksiksiz, her madde için durum belirtilmiş
    Evidence: .omo/evidence/t0.1-synthesis.md
  ```

  **Commit**: NO (sadece okuma)

---

- [ ] 1. T0.2 — Audit Script'lerini Çalıştır

  **What to do**:
  - `scripts/audit/_run_all.ts` ile üç audit script'ini çalıştır
  - Her birinin PASS/FAIL durumunu, hangi açığı/zafiyeti test ettiğini ve sonucunu raporla
  - Sonuçları `.omo/evidence/t0.2-audit/` altına kaydet

  **Must NOT do**:
  - Script'leri değiştirme
  - Hataları görmezden gelme

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0
  - **Blocks**: T1.3
  - **Blocked By**: Yok

  **References**:
  - `scripts/audit/_run_all.ts` — Ana çalıştırıcı (198 satır)
  - `scripts/audit/arbitrage-exploit.ts` — Arbitraj exploit testi (102 satır)
  - `scripts/audit/concurrency-bomb.ts` — Concurrency test (143 satır)
  - `scripts/audit/redis-leak-probe.ts` — Redis leak testi (77 satır)
  - `scripts/audit/_mock_server.ts` — Mock server (403 satır)

  **Acceptance Criteria**:
  - [ ] Her script için çalıştırma logu
  - [ ] PASS/FAIL durumu
  - [ ] Bulunan sorunların açıklaması (varsa)
  - [ ] Sonuçlar `.omo/evidence/t0.2-audit/` altında

  **QA Scenarios**:
  ```
  Scenario: Audit scriptleri çalıştırıldı
    Tool: Bash (deno run)
    Steps:
      1. deno run --frozen --no-prompt -A scripts/audit/_run_all.ts
      2. Çıktıyı kaydet
      3. Her script için PASS/FAIL kontrol et
    Expected Result: 3/3 PASS veya bulunan sorunlar listelenmiş
    Failure Indicators: Herhangi bir script'in FAIL olması (sorun varsa raporlanmalı)
    Evidence: .omo/evidence/t0.2-audit/run-output.txt
  ```

  **Commit**: NO

---

- [ ] 2. T0.3 — CI Revert Sebebini Doğrula

  **What to do**:
  - `a505afd` commit'inin revert ettiği orijinal commit'i bul
  - Diff'ini ve commit mesajını incele
  - Revert sebebi sadece "OAuth scope" mu, yoksa CI içinde başka bir başarısızlık var mı?

  **Must NOT do**:
  - Commit değiştirme

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0
  - **Blocks**: T2.1
  - **Blocked By**: Yok

  **References**:
  - Commit geçmişi: `git log --oneline -10`
  - Orijinal commit: `79b2e1a` (ci(crash-test))
  - Revert commit: `a505afd`

  **Acceptance Criteria**:
  - [ ] Orijinal commit hash'i
  - [ ] Revert sebebinin doğrulanmış açıklaması
  - [ ] Başka başarısızlık olup olmadığı

  **QA Scenarios**:
  ```
  Scenario: CI revert analiz edildi
    Tool: Bash (git show, git diff)
    Steps:
      1. git show 79b2e1a — orijinal commit
      2. git diff 79b2e1a^..79b2e1a — değişiklikler
      3. GitHub Actions log kontrolü (varsa)
      4. Sonucu .omo/evidence/t0.3-ci-revert.md olarak kaydet
    Expected Result: Net bir sebep açıklaması
    Evidence: .omo/evidence/t0.3-ci-revert.md
  ```

  **Commit**: NO

---

- [ ] 3. T0.4 — activity_feed SECURITY DEFINER View'ını Denetle

  **What to do**:
  - `supabase/migrations/20260610000001_security_hardening.sql` dosyasından view tanımını çıkar
  - Hangi tablolara hangi kolonlarla erişim sağlıyor kontrol et
  - RLS politikalarını bypass eden bir okuma var mı?

  **Must NOT do**:
  - Migration'ı değiştirme
  - Test verisi ekleme

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 0
  - **Blocks**: Yok
  - **Blocked By**: Yok

  **References**:
  - `supabase/migrations/20260610000001_security_hardening.sql` satır 168 — view tanımı
  - `src/pages/Social.tsx` satır 55 — view'e erişim

  **Acceptance Criteria**:
  - [ ] View tanımının analizi
  - [ ] "RLS bypass riski var/yok" sonucu
  - [ ] Varsa örnek exploit query

  **QA Scenarios**:
  ```
  Scenario: activity_feed view audit
    Tool: Bash (grep, cat)
    Steps:
      1. Migration dosyasında "activity_feed" ara
      2. View tanımını çıkar
      3. SECURITY DEFINER olup olmadığını kontrol et
      4. Hangi tablolara eriştiğini listele
      5. RLS bypass riskini değerlendir
    Expected Result: Net bir risk değerlendirmesi
    Evidence: .omo/evidence/t0.4-activity-feed-audit.md
  ```

  **Commit**: NO

---

- [ ] 4. T1.1 — Kritik Edge Function'lara Concurrency/Idempotency Testi

  **What to do**:
  - execute-trade, blitz-matchmake, blitz-tick-order, blitz-settle-room için:
    - (a) Aynı isteğin paralel/tekrarlı gönderilmesi (idempotency testi)
    - (b) Race condition senaryosu (örn. aynı pozisyonu aynı anda kapatma)
    - (c) Row-level locking'in beklendiği gibi çalıştığının testi
  - Her fonksiyon için en az 2 test yaz

  **Must NOT do**:
  - Edge Function'ları değiştirme (sadece test)
  - Gerçek Supabase'e bağlanma (unit test)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (Sequential)
  - **Parallel Group**: Wave 1
  - **Blocks**: T1.3
  - **Blocked By**: T0.2

  **References**:
  - `supabase/functions/execute-trade/index.ts` — 380 satır, en kritik
  - `supabase/functions/blitz-matchmake/index.ts` — 356 satır
  - `supabase/functions/blitz-tick-order/index.ts` — 224 satır
  - `supabase/functions/blitz-settle-room/index.ts` — 255 satır

  **Acceptance Criteria**:
  - [ ] Her fonksiyon için en az 2 test (idempotency + race condition)
  - [ ] Test çıktısı PASS
  - [ ] Test dosyaları `supabase/functions/__tests__/` altında

  **QA Scenarios**:
  ```
  Scenario: Concurrency testleri yazıldı ve geçti
    Tool: Bash (vitest run)
    Steps:
      1. Test dosyalarını oluştur
      2. vitest run supabase/functions/__tests__/ çalıştır
      3. Tüm testlerin PASS olduğunu doğrula
    Expected Result: 8+ test, 0 failure
    Evidence: .omo/evidence/t1.1-concurrency-tests.txt
  ```

  **Commit**: YES
  - Message: `test(edge): add concurrency and idempotency tests for critical functions`

---

- [ ] 5. T1.2 — blitz_settle_ledger için Invariant Kontrolü

  **What to do**:
  - "Ledger toplamı her an sıfıra denk gelmeli" invariant sorgusu yaz
  - Test verisiyle çalıştır
  - Sapma var mı kontrol et

  **Must NOT do**:
  - Production verisine dokunma
  - Migration ekleme

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (T1.1 ile paralel olabilir, bağımlılığı yok)
  - **Parallel Group**: Wave 1
  - **Blocks**: T1.3
  - **Blocked By**: Yok

  **References**:
  - `scripts/monitoring-queries.sql` — Mevcut monitoring sorguları
  - `supabase/migrations/20260610000002_settlement_integrity.sql` — Ledger tablosu tanımı (276 satır)

  **Acceptance Criteria**:
  - [ ] SQL sorgusu yazıldı
  - [ ] Test verisiyle çalıştırıldı
  - [ ] Sapma var/yok sonucu

  **QA Scenarios**:
  ```
  Scenario: Ledger invariant kontrolü
    Tool: Bash (psql/sql)
    Steps:
      1. Invariant sorgusunu yaz
      2. Test verisi oluştur (önce ledger'a ekle, sonra kontrol et)
      3. Sorguyu çalıştır
      4. Sonucu kaydet
    Expected Result: Toplam = 0 (invariant korunuyor)
    Evidence: .omo/evidence/t1.2-ledger-invariant.sql
  ```

  **Commit**: YES
  - Message: `test(db): add blitz_settle_ledger invariant check query`

---

- [ ] 6. T1.3 — Bulunan Açıkları Kapat

  **What to do**:
  - T0.2 ve T1.1'de bulunan her açık için fix uygula
  - Fix'i test ile doğrula

  **Must NOT do**:
  - Yeni özellik ekleme
  - Scope creep

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1
  - **Blocks**: T2.1, T4.1
  - **Blocked By**: T0.2, T1.1

  **References**:
  - T0.2 sonuçları
  - T1.1 sonuçları

  **Acceptance Criteria**:
  - [ ] Her açık için "önce FAIL → sonra PASS" test çıktısı
  - [ ] Build PASS
  - [ ] Mevcut testler PASS

  **QA Scenarios**:
  ```
  Scenario: Açıklar kapatıldı
    Tool: Bash (vitest run, deno run)
    Steps:
      1. T0.2 ve T1.1 sonuçlarını oku
      2. Her açık için fix uygula
      3. Testleri çalıştır
      4. Build kontrol et
    Expected Result: Tüm açık fix'leri test edilmiş, build PASS
    Evidence: .omo/evidence/t1.3-fixes-applied.md
  ```

  **Commit**: YES (varsa)
  - Message: `fix(security): address audit findings from T0.2 and T1.1`

---

- [ ] 7. T2.1 — CI Pipeline'ı Yeniden Etkinleştir

  **What to do**:
  - T0.3 bulgularına göre workflow'u düzelt
  - Workflow'a PHASE 0/1'de yazılan testleri ve audit script'lerini dahil et

  **Must NOT do**:
  - Manuel deploy
  - Test edilmemiş workflow push etme

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: T2.2, T5.5
  - **Blocked By**: T0.3, T1.3

  **References**:
  - `.github/workflows/ci.yml` — Orijinal workflow (revert edildi)
  - T0.3 sonuçları

  **Acceptance Criteria**:
  - [ ] GitHub Actions'ta yeşil bir CI run linki/logu
  - [ ] Workflow test ve audit script'lerini çalıştırıyor

  **QA Scenarios**:
  ```
  Scenario: CI pipeline yeşil
    Tool: Bash (gh run list, gh run view)
    Steps:
      1. Workflow dosyasını düzelt
      2. Push et
      3. gh run list ile run'ı kontrol et
      4. gh run view ile başarılı olduğunu doğrula
    Expected Result: CI run SUCCESS
    Evidence: .omo/evidence/t2.1-ci-green.png
  ```

  **Commit**: YES
  - Message: `ci: restore and enhance GitHub Actions workflow`

---

- [ ] 8. T2.2 — Staging Ortamı Kur ve Smoke Test

  **What to do**:
  - Staging Supabase projesi (veya mevcut wufhbvshqhiiwjrvfzey'i staging olarak kullan)
  - .env'i bağla, migrasyonları çalıştır, Edge Functions'ı deploy et
  - E2E smoke test: kayıt ol → demo bakiye al → trade aç → Blitz odasına katıl → odayı settle et

  **Must NOT do**:
  - Production verisine dokunma
  - Gerçek para kullanma

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2
  - **Blocks**: T4.3
  - **Blocked By**: T1.3, T2.1

  **References**:
  - `.env` — Mevcut env ayarları
  - `supabase/config.toml` — Proje ID: wufhbvshqhiiwjrvfzey

  **Acceptance Criteria**:
  - [ ] Her adımın çalıştığını gösteren log/ekran çıktısı
  - [ ] DB'de tutarlı son durum (pozisyon, bakiye, ledger)

  **QA Scenarios**:
  ```
  Scenario: Staging smoke test
    Tool: Bash (curl, playwright)
    Steps:
      1. .env'i staging ile güncelle
      2. supabase migration up
      3. supabase functions deploy
      4. Kayıt ol
      5. Demo bakiye al
      6. Trade aç
      7. Blitz odasına katıl
      8. Odabı settle et
      9. Sonuçları doğrula
    Expected Result: Tüm adımlar başarılı
    Evidence: .omo/evidence/t2.2-staging-smoke.txt
  ```

  **Commit**: NO

---

- [ ] 9. T3.1 — 21 `as any` Kullanımının Kök Neden Analizi

  **What to do**:
  - Her `as any`/cast için: Supabase types eksikliği mi (view/RPC tip tanımı yok), yoksa gerçek tip uyumsuzluğu mu?
  - Sınıflandır

  **Must NOT do**:
  - Kod değiştirme (sadece analiz)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T3.2
  - **Blocked By**: Yok

  **References**:
  - `src/components/trading/*.tsx` — 9 adet `as any`
  - `src/hooks/useAnalytics.ts` — AnalyticsRpcClient cast
  - `src/hooks/useAnaSahne.ts` — UnregisteredTableClient cast
  - `src/pages/Social.tsx` — activity_feed cast

  **Acceptance Criteria**:
  - [ ] Tablo: dosya, satır, sebep kategorisi, önerilen çözüm

  **QA Scenarios**:
  ```
  Scenario: Kök neden analizi tamamlandı
    Tool: Bash (grep, read)
    Steps:
      1. Tüm `as any` kullanımını bul
      2. Her birini kategorize et
      3. Tabloyu .omo/evidence/t3.1-any-analysis.md olarak kaydet
    Expected Result: 21 kalem listelenmiş, her biri kategorize edilmiş
    Evidence: .omo/evidence/t3.1-any-analysis.md
  ```

  **Commit**: NO

---

- [ ] 10. T3.2 — Eksik View/RPC Tipleri için Manuel Tip Extension Dosyası

  **What to do**:
  - `src/integrations/supabase/types.extra.ts` dosyası oluştur
  - ana_sahne_view, insert_analytics_event RPC ve diğer eksik tip tanımlarını ekle
  - Bu tipleri kullanarak ilgili `as any`'leri kaldır

  **Must NOT do**:
  - Auto-generated types.ts'yi değiştirme
  - Mevcut tip uyumsuzluklarını gizleme

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: T3.3
  - **Blocked By**: T3.1

  **References**:
  - T3.1 sonuçları
  - `src/integrations/supabase/types.ts` — Mevcut auto-generated tipler (1233 satır)

  **Acceptance Criteria**:
  - [ ] `as any` sayısı 21'den X'e düştü (rapor edilen sayı)
  - [ ] Build başarılı

  **QA Scenarios**:
  ```
  Scenario: Tip extension eklendi, as any azaldı
    Tool: Bash (grep, build)
    Steps:
      1. types.extra.ts dosyasını oluştur
      2. İlgili dosyalarda as any'leri kaldır
      3. as any sayısını kontrol et
      4. Build çalıştır
    Expected Result: as any sayısı azalmış, build PASS
    Evidence: .omo/evidence/t3.2-type-extension.md
  ```

  **Commit**: YES
  - Message: `fix(types): add Supabase view/RPC type extensions, reduce any casts`

---

- [ ] 11. T3.3 — strictNullChecks'i Kademeli Aç

  **What to do**:
  - Önce src/lib/ ve src/hooks/ için strict mod aç
  - Hata sayısını raporla ve düzelt
  - Sonra src/components/, en son src/pages/

  **Must NOT do**:
  - Tüm dosyalarda aynı anda açma
  - Hataları `// @ts-ignore` ile gizleme

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: T5.6
  - **Blocked By**: T3.2

  **References**:
  - `tsconfig.json` satır 13 — `strictNullChecks: false`
  - `tsconfig.app.json` — AppConfig

  **Acceptance Criteria**:
  - [ ] Her aşama için "önce N hata → düzeltme → 0 hata" raporu
  - [ ] Her aşamada build+test PASS
  - [ ] NoImplicitAny: true

  **QA Scenarios**:
  ```
  Scenario: strictNullChecks kademeli açıldı
    Tool: Bash (tsc, vitest run)
    Steps:
      1. src/lib/ için aç → hata say → düzelt → test
      2. src/hooks/ için aç → hata say → düzelt → test
      3. src/components/ için aç → hata say → düzelt → test
      4. src/pages/ için aç → hata say → düzelt → test
      5. noImplicitAny: true yap → hata say → düzelt → test
    Expected Result: 0 tsc hatası, tüm testler PASS
    Evidence: .omo/evidence/t3.3-strict-null-checks.md
  ```

  **Commit**: YES
  - Message: `fix(types): enable strictNullChecks and noImplicitAny, fix all type errors`

---

- [ ] 12. T4.1 — Edge Functions'a Rate Limiting Ekle

  **What to do**:
  - Özellikle execute-trade ve blitz-tick-order için kullanıcı/IP bazlı rate limit
  - Upstash Redis varsa onu kullan, fail-open mantığını koru

  **Must NOT do**:
  - Rate limit'i çok sıkı ayarlama (false positive)
  - Redis yoksa rate limit'i devre dışı bırakma

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4
  - **Blocks**: T5.5
  - **Blocked By**: T1.3

  **References**:
  - `supabase/functions/_shared/redis.ts` — Mevcut Redis utility (123 satır)
  - `supabase/functions/execute-trade/index.ts` — 380 satır
  - `supabase/functions/blitz-tick-order/index.ts` — 224 satır

  **Acceptance Criteria**:
  - [ ] Rate limit aşıldığında 429 dönen test

  **QA Scenarios**:
  ```
  Scenario: Rate limit çalışıyor
    Tool: Bash (curl/scripts)
    Steps:
      1. Rate limit middleware ekle
      2. Hızlıca çok fazla istek gönder
      3. 429 response al
    Expected Result: 429 status code, rate limit header'ları
    Evidence: .omo/evidence/t4.1-rate-limit.md
  ```

  **Commit**: YES
  - Message: `feat(security): add rate limiting to critical Edge Functions`

---

- [ ] 13. T4.2 — AI Fonksiyonlarına Zod Input Validation Ekle

  **What to do**:
  - Her AI fonksiyonu için request body'ye Zod schema validation ekle

  **Must NOT do**:
  - Mevcut davranışları değiştirme
  - Zod'u Edge Function'a import ederken hata yapma

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (T4.1 ile paralel olabilir)
  - **Parallel Group**: Wave 4
  - **Blocks**: Yok
  - **Blocked By**: Yok

  **References**:
  - `supabase/functions/ai-analyze/index.ts`
  - `supabase/functions/ai-chat/index.ts`
  - `supabase/functions/ai-strategy/index.ts`
  - `supabase/functions/ai-trade-coach/index.ts`
  - `supabase/functions/ai-risk-monitor/index.ts`

  **Acceptance Criteria**:
  - [ ] Geçersiz input'ta 400 dönen test
  - [ ] Geçerli input'ta davranış değişmedi

  **QA Scenarios**:
  ```
  Scenario: Zod validation çalışıyor
    Tool: Bash (curl/scripts)
    Steps:
      1. Her AI fonksiyonuna geçersiz JSON gönder
      2. 422/400 response al
      3. Geçerli JSON gönder
      4. Normal response al
    Expected Result: Geçersiz input → 400, geçerli input → normal
    Evidence: .omo/evidence/t4.2-zod-validation.md
  ```

  **Commit**: YES
  - Message: `feat(security): add Zod input validation to AI Edge Functions`

---

- [ ] 14. T4.3 — Prod Servis Anahtarlarını Kur

  **What to do**:
  - Sentry DSN, VAPID keys, Upstash Redis prod instance kurulumu ve bağlanması

  **Must NOT do**:
  - Gerçek anahtarları commit'leme
  - Mock değerleri prod'da bırakma

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 4
  - **Blocks**: Yok
  - **Blocked By**: T2.2

  **References**:
  - `.env` — Mevcut env ayarları
  - `.env.example` — Tüm değişkenlerin açıklamaları

  **Acceptance Criteria**:
  - [ ] Her servis için bir gerçek event/log üretildiğinin kanıtı

  **QA Scenarios**:
  ```
  Scenario: Prod servisleri aktif
    Tool: Bash (curl, sentry-cli)
    Steps:
      1. Sentry test hatası gönder
      2. Sentry dashboard'da gör
      3. VAPID keys ile test push gönder
      4. Redis prod instance'a bağlan
    Expected Result: Tüm servisler aktif
    Evidence: .omo/evidence/t4.3-prod-services.md
  ```

  **Commit**: NO

---

- [ ] 15. T5.1 — README.md Yaz

  **What to do**:
  - Proje kurulumu, mimari, env değişkenleri, test çalıştırma adımlarını yaz

  **Must NOT do**:
  - Boş README bırakma

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: Yok
  - **Blocked By**: T0.1

  **References**:
  - `package.json` — Mevcut script'ler
  - `.env.example` — Env değişkenleri

  **Acceptance Criteria**:
  - [ ] README.md en az 100 satır
  - [ ] Kurulum adımları doğru ve çalışılabilir

  **QA Scenarios**:
  ```
  Scenario: README yazıldı
    Tool: Bash (wc -l, grep)
    Steps:
      1. README.md'yi oku
      2. İçeriği kontrol et (kurulum, mimari, env, test)
      3. Satır sayısını kontrol et
    Expected Result: Kapsamlı README
    Evidence: .omo/evidence/t5.1-readme.md
  ```

  **Commit**: YES
  - Message: `docs: add comprehensive README with setup, architecture, and testing guide`

---

- [ ] 16. T5.2 — Lint Hatalarını Düzelt

  **What to do**:
  - `src/hooks/useAnaSahne.ts` satır 4, 10 — kullanılmayan import'ları kaldır

  **Must NOT do**:
  - Yeni lint kuralı ekleme

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: Yok
  - **Blocked By**: Yok

  **References**:
  - `src/hooks/useAnaSahne.ts` satır 4, 10

  **Acceptance Criteria**:
  - [ ] ESLint 0 error

  **QA Scenarios**:
  ```
  Scenario: Lint temiz
    Tool: Bash (eslint)
    Steps:
      1. Import'ları kaldır
      2. ESLint çalıştır
      3. 0 hata doğrula
    Expected Result: 0 errors, 0 warnings (as any hariç)
    Evidence: .omo/evidence/t5.2-lint-clean.txt
  ```

  **Commit**: YES
  - Message: `fix(lint): remove unused imports in useAnaSahne`

---

- [ ] 17. T5.3 — Build Chunk Optimizasyonu

  **What to do**:
  - Recharts/CartesianChart için dynamic import, ana chunk'ı 1.3MB'ın altına çek

  **Must NOT do**:
  - Lazy loading'i bozma
  - Tüm kütüphaneyi kaldırma

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: Yok
  - **Blocked By**: Yok

  **References**:
  - `vite.config.ts` — Vite yapılandırması
  - `src/components/ui/chart.tsx` — Recharts kullanımı (310 satır)

  **Acceptance Criteria**:
  - [ ] Ana chunk < 1MB (öncesi/sonrası karşılaştırma)

  **QA Scenarios**:
  ```
  Scenario: Build chunk küçültüldü
    Tool: Bash (vite build, ls -la)
    Steps:
      1. Mevcut build boyutunu kaydet
      2. Optimizasyonu uygula
      3. Yeni build boyutunu karşılaştır
    Expected Result: Ana chunk 1.3MB → <1MB
    Evidence: .omo/evidence/t5.3-chunk-optimize.md
  ```

  **Commit**: YES
  - Message: `perf(build): optimize bundle size, split Recharts chunk`

---

- [ ] 18. T5.4 — Coverage Raporu Ekle

  **What to do**:
  - `vitest.config.ts`'e coverage ayarı ekle

  **Must NOT do**:
  - Test sayısını artırma (sadece ayar)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5
  - **Blocks**: Yok
  - **Blocked By**: Yok

  **References**:
  - `vitest.config.ts` — Mevcut test yapılandırması

  **Acceptance Coverage**:
  - [ ] Coverage raporu çıktısı (gerçek %)

  **QA Scenarios**:
  ```
  Scenario: Coverage raporu alındı
    Tool: Bash (vitest run --coverage)
    Steps:
      1. vitest.config.ts'e coverage ekle
      2. vitest run --coverage çalıştır
      3. Coverage çıktısını kaydet
    Expected Result: Coverage raporu (%30+ hedef)
    Evidence: .omo/evidence/t5.4-coverage.txt
  ```

  **Commit**: YES
  - Message: `test: add vitest coverage configuration`

---

- [ ] 19. T5.5 — Blitz Tip Senkronizasyon Script'i

  **What to do**:
  - İki dosya arasında farkları tespit eden basit bir karşılaştırma script'i yaz
  - CI'a ekle

  **Must NOT do**:
  - Dosyaları otomatik değiştirme (sadece uyarı)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5
  - **Blocks**: Yok
  - **Blocked By**: T2.1

  **References**:
  - `src/types/blitz.ts` — Frontend tipleri
  - `supabase/functions/_shared/blitz-types.ts` — Edge Function tipleri

  **Acceptance Criteria**:
  - [ ] Script çalışıyor ve farkları buluyor

  **QA Scenarios**:
  ```
  Scenario: Tip senkronizasyon kontrolü çalışıyor
    Tool: Bash (node/deno script)
    Steps:
      1. Scripti yaz
      2. Çalıştır
      3. Fark olup olmadığını kontrol et
    Expected Result: Script çalışıyor, mevcut durumda 0 fark
    Evidence: .omo/evidence/t5.5-blitz-sync.txt
  ```

  **Commit**: YES
  - Message: `chore: add blitz types sync check script`

---

- [ ] 20. T5.6 — Kritik Sayfalar İçin Test Yaz

  **What to do**:
  - Portfolio, Settings, Blitz, Index için test yaz

  **Must NOT do**:
  - E2E test (sadece unit test)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5
  - **Blocks**: Yok
  - **Blocked By**: T3.3

  **References**:
  - `src/pages/Portfolio.tsx` — 208 satır
  - `src/pages/Settings.tsx` — 215 satır
  - `src/pages/Blitz.tsx` — 234 satır
  - `src/pages/Index.tsx` — Ana sayfa

  **Acceptance Criteria**:
  - [ ] Her sayfa için en az 1 test
  - [ ] Test çıktısı PASS

  **QA Scenarios**:
  ```
  Scenario: Sayfa testleri yazıldı
    Tool: Bash (vitest run)
    Steps:
      1. Test dosyalarını oluştur
      2. vitest run çalıştır
      3. Tüm testlerin PASS olduğunu doğrula
    Expected Result: 4+ yeni test, 0 failure
    Evidence: .omo/evidence/t5.6-page-tests.txt
  ```

  **Commit**: YES
  - Message: `test(pages): add unit tests for Portfolio, Settings, Blitz, Index`

---

- [ ] 21. T5.7 — Test Dosyası Convention'ı Belirle ve Uygula

  **What to do**:
  - Tüm test dosyalarını `__tests__/` altında topla
  - Convention belirle

  **Must NOT do**:
  - Test dosyalarını silme

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 5
  - **Blocks**: Yok
  - **Blocked By**: T5.6

  **References**:
  - Mevcut test dosyaları konumları

  **Acceptance Criteria**:
  - [ ] Tüm test dosyaları __tests__/ altında
  - [ ] vitest config güncellenmiş

  **QA Scenarios**:
  ```
  Scenario: Test convention uygulandı
    Tool: Bash (find, vitest run)
    Steps:
      1. Tüm test dosyalarını bul
      2. __tests__/ altına taşı
      3. vitest config'i güncelle
      4. Tüm testlerin hala çalıştığını doğrula
    Expected Result: Tüm testler __tests__/ altında, PASS
    Evidence: .omo/evidence/t5.7-test-convention.md
  ```

  **Commit**: YES
  - Message: `refactor(test): consolidate test files under __tests__/ directories`

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `vitest run`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: empty state, invalid input, rapid actions. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **T1.1**: `test(edge): add concurrency and idempotency tests`
- **T1.2**: `test(db): add blitz_settle_ledger invariant check`
- **T1.3**: `fix(security): address audit findings`
- **T2.1**: `ci: restore and enhance GitHub Actions workflow`
- **T3.2**: `fix(types): add Supabase view/RPC type extensions`
- **T3.3**: `fix(types): enable strictNullChecks and noImplicitAny`
- **T4.1**: `feat(security): add rate limiting`
- **T4.2**: `feat(security): add Zod input validation`
- **T5.1**: `docs: add comprehensive README`
- **T5.2**: `fix(lint): remove unused imports`
- **T5.3**: `perf(build): optimize bundle size`
- **T5.4**: `test: add vitest coverage`
- **T5.5**: `chore: add blitz types sync check`
- **T5.6**: `test(pages): add page unit tests`
- **T5.7**: `refactor(test): consolidate test directories`

---

## Success Criteria

### Verification Commands
```bash
npm test        # Expected: Tests 60+ passed (0 failures)
npm run build   # Expected: Built in Xs, no errors
npx eslint .    # Expected: 0 errors
npx tsc --noEmit # Expected: 0 errors
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Build successful
- [ ] CI pipeline green
