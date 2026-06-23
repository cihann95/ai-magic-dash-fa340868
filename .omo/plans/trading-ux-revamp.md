# Trading UX Revamp — Live Price Feel + AI Signal Cards + Cmd+K

## TL;DR

> **Quick Summary**: Sırasıyla 3 öncelik: (1) fiyat canlı hissettirme — design tokens + tick flash + sparkline + stat bar, (2) AI paneli signal card formatına çevirme, (3) CommandPalette'e Recent Trades grubu ekleme. 7 adım, 4 wave, 9 dosya.
>
> **Deliverables**:
> - Design token sistemi (--color-up/down/neutral, --color-surface-1/2/3, --color-border-subtle, --transition-tick/panel, .font-price)
> - SymbolList: 52px satır, sparkline, tick flash, font-price
> - ChartPanel: 36px stat bar + timeframe chip grubu
> - OrderTicket: preset butonlar + risk badge + Long/Short toggle + Collapsible TP/SL
> - OpenPositionsPanel: P&L framer-motion animasyon + mini bar + empty state
> - AccountAIPanel: signal card layout + typing animasyon + sliding tab indicator + Cmd+Enter
> - CommandPalette: Recent Trades grubu (mevcut dosyaya ekleme)
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Adım 1 (tokens) → Adım 2 (SymbolList) → Adım 3 (ChartPanel) → Adım 4+5 → Adım 6+7

---

## Context

### Original Request
Trading dashboard'u rakip platformlardan ayıracak 3 öncelik:
1. Fiyat canlı hissettirmeli — JetBrains Mono font, tick flash, sparkline
2. AI paneli sohbet kutusundan çıkmalı — signal card formatı
3. Cmd+K komut paleti — power user hızı

### Interview Summary
**Key Discussions**:
- 7 adım zorunlu sıra: tokens → SymbolList → ChartPanel → OrderTicket → OpenPositions → AccountAIPanel → CommandPalette
- Adım 1 onaylanmadan 2'ye, Adım 2-3 tamamlanmadan 4-5'e geçilmez
- Metis/Oracle atlandı (kullanıcı isteği)

**Research Findings** (5 paralel explore agent):
- JetBrains Mono ALREADY loaded (CSS @import, weights 400/500/600)
- `--bull`/`--bear` tokens exist — `--color-up`/`--color-down` bunları alias edecek
- `.tabular` class exists — `.font-price` ayrı class olacak
- **CommandPalette ALREADY EXISTS** (125 lines) ve AppShell.tsx'de mount edilmiş — sadece Recent Trades grubu eklenecek
- **cmdk v1.1.1 kurulu VE kullanılıyor** (kullanıcının "kullanılmıyor" varsayımı yanlış)
- **24h high/low verisi YOK** — price_cache DB'de bile yok. Stat bar "—" gösterecek.
- **24h volume** price_cache DB'de var ama LivePrice hook'unda yok. ChartPanel direct query yapacak.
- **Sparkline verisi YOK** — SymbolList local rolling window (ref array) ile own sparkline data'sını build edecek
- **AI yanıtları plain string** — signal card'lar generated title + static badge + symbol chip ile render edilecek
- **selectedSymbol AppContext'te YOK** — URL-driven (`?symbol=` param), CommandPalette zaten `go('/?symbol=...')` kullanıyor
- TradingViewChart.tsx interval HARDCODED "60" — timeframe chip için `interval` prop eklenecek (dosya red-line'da değil)
- Tüm shadcn bileşenleri mevcut: Collapsible, Badge, Command, Dialog, Tabs, Button, Input, ScrollArea
- framer-motion patterns: spring {stiffness:320, damping:26}, AnimatePresence, layout prop, key-based re-animation
- recharts patterns: AreaChart monotone + gradient (sparkline için)

### Metis Review
**Atlandı** (kullanıcı isteği — "herhangi bir Oracle Metis onayı almadan planı oluştur")

---

## Work Objectives

### Core Objective
Trading dashboard'u "fiyat hiç durmuyor" hissi veren, AI yanıtlarını karar-vermeye yönelik signal card'lara çeviren, ve Cmd+K ile power user hızına taşıyan bir UX revamp.

### Concrete Deliverables
- 9 dosya modifiye edilir (HİÇBİR red-line dosyaya dokunulmaz)
- Design token sistemi 3 tema için (:root, .dark, .terminal) kurulur
- 5 trading component restyle edilir (logic preserved, only visual layer)
- 1 component (TradingViewChart) minimal prop ekleme yapılır
- 1 component (CommandPalette) modifiye edilir (Recent Trades grubu)

### Definition of Done
- [ ] `npm run build` → 0 errors
- [ ] Tüm mevcut import'lar preserved
- [ ] Tüm hook çağrıları preserved (useLivePrices, useApp, useLivePrice)
- [ ] Tüm edge function çağrıları preserved (execute-trade, manage-order, ai-analyze, ai-strategy, daily-brief, news-feed, ai-chat)
- [ ] Tüm Supabase query'leri preserved
- [ ] Tüm Realtime subscription'lar preserved
- [ ] Tick flash animasyonu çalışır (artışta yeşil, düşüşte kırmızı)
- [ ] Sparkline render olur (≥3 data point varsa, yoksa gizli)
- [ ] Stat bar 24h volume gösterir (price_cache direct query)
- [ ] Timeframe chip widget interval'i günceller
- [ ] AI signal card formatında render olur
- [ ] Cmd+K palette Recent Trades grubu gösterir

### Must Have
- --color-up, --color-down, --color-neutral CSS variables (3 temada)
- --color-surface-1/2/3, --color-border-subtle CSS variables (3 temada)
- --transition-tick: 120ms ease-out, --transition-panel: 200ms ease
- .font-price class (JetBrains Mono, tabular-nums)
- @keyframes tick-flash-up, tick-flash-down
- SymbolList: 52px satır, sparkline (rolling window), tick flash
- ChartPanel: 36px stat bar, timeframe chip grubu (1m/5m/15m/1h/4h/1D)
- OrderTicket: %10/%25/%50/%100 preset, risk badge, Long/Short toggle, Collapsible TP/SL
- OpenPositionsPanel: P&L framer-motion animasyon, mini bar, empty state SVG
- AccountAIPanel: signal card, typing 3-dot pulse, sliding tab indicator, Cmd+Enter, inline retry
- CommandPalette: Recent Trades grubu (son 5 trade)

### Must NOT Have (Guardrails)
- supabase/ klasörüne DOKUNMA (migrations, functions, tüm içerik)
- src/hooks/ dosyalarının MANTIĞINI değiştirme (data kullanılır, hook değişmez)
- src/contexts/AppContext.tsx'i değiştirme
- src/integrations/supabase/ değiştirme
- src/lib/ dosyalarını değiştirme
- Edge function çağrılarını değiştirme (payload, function name, response handling)
- Supabase query'leri değiştirme (mevcut sorgular preserved)
- Realtime subscription'ları değiştirme
- TradingView widget CDN script koduna dokunma (sadece config'e interval prop ekle)
- useKeyboardShortcuts.ts'i değiştirme (Cmd+K zaten CommandPalette'te self-contained)
- App.tsx'i değiştirme (CommandPalette zaten AppShell'de mount)
- Yeni edge function yazma
- Yeni migration yazma
- AI slop: over-abstraction, gereksiz wrapper, generic naming
- reCAPTCHA yok, FingerprintJS yok (bu plan UI revamp, security değil)

### Spec Framework Integration
- **Detected Framework**: None
- N/A

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** - ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (project has build/lint)
- **Automated tests**: NO (bu UI revamp, test yazılmayacak — agent QA yeterli)
- **Framework**: N/A
- **Agent QA**: ALWAYS (mandatory)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.omo/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) - Navigate, interact, assert DOM, screenshot
- **Build/Lint**: Use Bash - `npm run build`, `npm run lint`, check exit codes

---

## Execution Strategy

### Parallel Execution Waves

> Kullanıcının zorunlu sırası: Adım 1 → (approve) → Adım 2+3 → Adım 4+5 → Adım 6+7
> Bağımlılık: Adım 1 (tokens) tüm diğerlerini blocker. Diğer adımlar sadece tokens'a bağlı.

```
Wave 1 (Start Immediately — foundation):
└── Task 1: Design Token Sistemi [quick]

Wave 2 (After Wave 1 — user approves tokens, then parallel):
├── Task 2: SymbolList restyle + sparkline + flash [visual-engineering]
└── Task 3: ChartPanel stat bar + timeframe chips [visual-engineering]

Wave 3 (After Wave 2 — parallel):
├── Task 4: OrderTicket presets + risk + toggle + Collapsible [visual-engineering]
└── Task 5: OpenPositionsPanel P&L animation + mini bar [visual-engineering]

Wave 4 (After Wave 3 — parallel):
├── Task 6: AccountAIPanel signal cards + typing + Cmd+Enter [visual-engineering]
└── Task 7: CommandPalette Recent Trades group [quick]

Wave FINAL (After ALL tasks — 4 parallel reviews):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high + playwright)
└── Task F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: Task 1 → Task 2 → Task 3 → Task 4 → Task 6 → F1-F4
Parallel Speedup: ~50% faster than sequential
Max Concurrent: 2 (Waves 2, 3, 4)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | None | 2, 3, 4, 5, 6, 7 | 1 |
| 2 | 1 | F1-F4 | 2 |
| 3 | 1 | F1-F4 | 2 |
| 4 | 1 (tokens), 2-3 done (user seq) | F1-F4 | 3 |
| 5 | 1 (tokens), 2-3 done (user seq) | F1-F4 | 3 |
| 6 | 1 (tokens), 4-5 done (user seq) | F1-F4 | 4 |
| 7 | 1 (tokens), 4-5 done (user seq) | F1-F4 | 4 |

### Agent Dispatch Summary

- **Wave 1**: **1** — T1 → `quick`
- **Wave 2**: **2** — T2 → `visual-engineering`, T3 → `visual-engineering`
- **Wave 3**: **2** — T4 → `visual-engineering`, T5 → `visual-engineering`
- **Wave 4**: **2** — T6 → `visual-engineering`, T7 → `quick`
- **FINAL**: **4** — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high` (+playwright), F4 → `deep`

---

## TODOs

- [x] 1. Design Token Sistemi — CSS variables + .font-price + @keyframes + Tailwind extension

  **What to do**:
  - **src/index.css** — `:root` (lines 9-44) bloğuna EKLE (mevcut token'ları BOZMA):
    ```css
    --color-up: var(--bull);
    --color-down: var(--bear);
    --color-neutral: 220 10% 50%;
    --color-surface-1: 240 10% 12%;
    --color-surface-2: 240 10% 10%;
    --color-surface-3: 240 10% 8%;
    --color-border-subtle: 240 5% 20%;
    --transition-tick: 120ms ease-out;
    --transition-panel: 200ms ease;
    ```
    NOT: `--color-up`/`--color-down` mevcut `--bull`/`--bear` değerlerini ALIAS eder (consistency). HSL formatında (shadcn convention).
  - **src/index.css** — `.dark` (lines 46-83) bloğuna aynı değişkenleri EKLE (dark-specific değerlerle):
    ```css
    --color-up: var(--bull);          /* dark --bull değeri */
    --color-down: var(--bear);        /* dark --bear değeri */
    --color-neutral: 220 10% 55%;
    --color-surface-1: 240 10% 14%;
    --color-surface-2: 240 10% 12%;
    --color-surface-3: 240 10% 10%;
    --color-border-subtle: 240 5% 22%;
    --transition-tick: 120ms ease-out;
    --transition-panel: 200ms ease;
    ```
  - **src/index.css** — `.terminal` (lines 85-123) bloğuna aynı değişkenleri EKLE (terminal-specific değerlerle):
    ```css
    --color-up: var(--bull);
    --color-down: var(--bear);
    --color-neutral: 180 10% 50%;
    --color-surface-1: 180 10% 10%;
    --color-surface-2: 180 10% 8%;
    --color-surface-3: 180 10% 6%;
    --color-border-subtle: 180 5% 18%;
    --transition-tick: 120ms ease-out;
    --transition-panel: 200ms ease;
    ```
  - **src/index.css** — `@layer base` (line 133 civarı, `.tabular` class'ın yanına) EKLE:
    ```css
    .font-price {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
    ```
  - **src/index.css** — Dosya sonuna (line 163 sonrası) EKLE:
    ```css
    @keyframes tick-flash-up {
      0% { color: hsl(var(--color-up)); }
      100% { color: inherit; }
    }
    @keyframes tick-flash-down {
      0% { color: hsl(var(--color-down)); }
      100% { color: inherit; }
    }
    @keyframes pulse-dots {
      0%, 80%, 100% { opacity: 0.3; }
      40% { opacity: 1; }
    }
    ```
  - **tailwind.config.ts** — `theme.extend.colors` (lines 17-69) bloğuna EKLE:
    ```typescript
    up: {
      DEFAULT: "hsl(var(--color-up))",
      foreground: "hsl(var(--color-up) / 0.9)",
    },
    down: {
      DEFAULT: "hsl(var(--color-down))",
      foreground: "hsl(var(--color-down) / 0.9)",
    },
    neutral: {
      DEFAULT: "hsl(var(--color-neutral))",
    },
    "surface-1": "hsl(var(--color-surface-1))",
    "surface-2": "hsl(var(--color-surface-2))",
    "surface-3": "hsl(var(--color-surface-3))",
    "border-subtle": "hsl(var(--color-border-subtle))",
    ```
  - **tailwind.config.ts** — `theme.extend.fontFamily` (lines 75-78) EKLE:
    ```typescript
    price: ['JetBrains Mono', 'Roboto Mono', 'ui-monospace', 'monospace'],
    ```
  - **tailwind.config.ts** — `theme.extend` içine yeni blok EKLE (transitionDuration):
    ```typescript
    transitionDuration: {
      tick: "120ms",
      panel: "200ms",
    },
    ```
  - **tailwind.config.ts** — `theme.extend.keyframes` (lines 79-85) EKLE:
    ```typescript
    "tick-flash-up": {
      "0%": { color: "hsl(var(--color-up))" },
      "100%": { color: "inherit" },
    },
    "tick-flash-down": {
      "0%": { color: "hsl(var(--color-down))" },
      "100%": { color: "inherit" },
    },
    "pulse-dots": {
      "0%, 80%, 100%": { opacity: "0.3" },
      "40%": { opacity: "1" },
    },
    ```
  - **tailwind.config.ts** — `theme.extend.animation` (lines 86-91) EKLE:
    ```typescript
    "tick-flash-up": "tick-flash-up 400ms ease-out",
    "tick-flash-down": "tick-flash-down 400ms ease-out",
    "pulse-dots": "pulse-dots 1.4s ease-in-out infinite",
    ```

  **Must NOT do**:
  - Mevcut CSS değişkenlerini SİLME veya DEĞİŞTİRME (--background, --foreground, --primary, --bull, --bear, vb.)
  - Mevcut utility class'ları silme (.glass, .gradient-bull, .tabular, vb.)
  - Mevcut @keyframes silme (float-up)
  - Mevcut tailwind config bloklarını silme
  - `shimmer` keyframe'i silme (dead code ama bu task'ın scope'u değil)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Sadece 2 dosyaya (index.css, tailwind.config.ts) additive değişiklik. Tekrarlayan ancak basit token ekleme.
  - **Skills**: []
    - No skill needed — pure CSS/Tailwind config.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 (alone)
  - **Blocks**: Tasks 2, 3, 4, 5, 6, 7
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - `src/index.css:9-44` — `:root` block (mevcut shadcn + custom token'lar, bu bloğun SONUNA ekle)
  - `src/index.css:46-83` — `.dark` block (dark overrides, bu bloğun SONUNA ekle)
  - `src/index.css:85-123` — `.terminal` block (terminal theme, bu bloğun SONUNA ekle)
  - `src/index.css:133` — `.tabular` class (bu class'ın yanına `.font-price` ekle)
  - `src/index.css:160-163` — `@keyframes float-up` (bu block'tan SONRA yeni keyframes ekle)

  **API/Type References**:
  - `tailwind.config.ts:17-69` — `theme.extend.colors` (bu bloğun SONUNA yeni color entries ekle)
  - `tailwind.config.ts:75-78` — `theme.extend.fontFamily` (bu bloğa `price` ekle)
  - `tailwind.config.ts:79-85` — `theme.extend.keyframes` (bu bloğa yeni keyframes ekle)
  - `tailwind.config.ts:86-91` — `theme.extend.animation` (bu bloğa yeni animations ekle)

  **WHY Each Reference Matters**:
  - `:root`/`.dark`/`.terminal` blokları: Token'lar 3 tema için de tanımlı olmalı. shadcn convention: her tema kendi değerlerini override eder.
  - `.tabular` line: `.font-price` class'ı `.tabular`'ın yanına eklenmeli — benzer amaç (mono font + tabular nums), ama `.font-price` ek olarak `letter-spacing: -0.02em` içerir.
  - `--bull`/`--bear` aliasing: Mevcut yeşil/kırmızı token'ları kullanmak, yeni bağımsız değerler tanımlamaktan daha tutarlı. Tek kaynak-of-truth.
  - HSL format: shadcn convention — `142 71% 45%` formatında (hue saturation lightness, spaces not commas). `hsl(var(--token))` ile kullanılır.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Build passes with new tokens
    Tool: Bash
    Preconditions: Tokens added to index.css and tailwind.config.ts
    Steps:
      1. Run `npm run build`
      2. Check exit code is 0
      3. Check output for "build successful" or equivalent
    Expected Result: Build succeeds with 0 errors
    Failure Indicators: Exit code non-zero, CSS/Tailwind compilation error
    Evidence: .omo/evidence/task-1-build-success.txt

  Scenario: CSS variables exist in all 3 themes
    Tool: Bash (grep)
    Preconditions: index.css updated
    Steps:
      1. Run `grep -c "\-\-color-up" src/index.css` — expect 3 (one per :root, .dark, .terminal)
      2. Run `grep -c "\-\-color-down" src/index.css` — expect 3
      3. Run `grep -c "\-\-transition-tick" src/index.css` — expect 3
      4. Run `grep -c "\.font-price" src/index.css` — expect ≥1 (class definition)
      5. Run `grep -c "tick-flash-up" src/index.css` — expect ≥2 (keyframe + animation reference)
    Expected Result: All counts match expected values
    Failure Indicators: Any count < expected (token missing in a theme)
    Evidence: .omo/evidence/task-1-tokens-present.txt

  Scenario: Tailwind config has new extensions
    Tool: Bash (grep)
    Preconditions: tailwind.config.ts updated
    Steps:
      1. Run `grep "price:" tailwind.config.ts` — expect match (fontFamily.price)
      2. Run `grep "surface-1" tailwind.config.ts` — expect match (color)
      3. Run `grep "tick-flash-up" tailwind.config.ts` — expect ≥2 matches (keyframe + animation)
      4. Run `grep "pulse-dots" tailwind.config.ts` — expect ≥2 matches
    Expected Result: All greps find matches
    Failure Indicators: Any grep returns no match
    Evidence: .omo/evidence/task-1-tailwind-config.txt

  Scenario: Original tokens NOT removed
    Tool: Bash (grep)
    Preconditions: index.css updated
    Steps:
      1. Run `grep "\-\-background:" src/index.css` — expect ≥3 (still in :root, .dark, .terminal)
      2. Run `grep "\-\-bull:" src/index.css` — expect ≥3
      3. Run `grep "\-\-bear:" src/index.css` — expect ≥3
      4. Run `grep "\.tabular" src/index.css` — expect ≥1 (class still exists)
      5. Run `grep "float-up" src/index.css` — expect ≥1 (keyframe still exists)
    Expected Result: All original tokens preserved
    Failure Indicators: Any original token missing
    Evidence: .omo/evidence/task-1-originals-preserved.txt
  ```

  **Commit**: YES
  - Message: `feat(design): add trading UX tokens — color-up/down, surface, font-price, tick-flash`
  - Files: `src/index.css`, `tailwind.config.ts`
  - Pre-commit: `npm run build`

- [x] 2. SymbolList — 52px satır + sparkline + tick flash + font-price

  **What to do**:
  - **src/components/trading/SymbolList.tsx** — Mevcut imports PRESERVE (lines 1-11: useEffect, useMemo, useState, useLivePrices, useApp, ASSET_LABELS, AssetClass, isMarketOpen, formatPrice, SymbolDef, SYMBOLS, t, cn, supabase, toast, Search, Star, StarOff)
  - **Yeni import EKLE** (mevcut import'lar korunarak):
    ```typescript
    import { LineChart, Line, ResponsiveContainer } from 'recharts';
    ```
  - **Local sparkline rolling window EKLE** (component body içinde, mevcut useState'lerden sonra):
    ```typescript
    const priceHistoryRef = useRef<Record<string, number[]>>({});
    // useLivePrices return'ünden her render'da price push et (max 20 point)
    // NOT: hook değiştirilmez, sadece return değeri okunur
    ```
    `useRef` import'u React'ten ekle (line 1'e `useRef` ekle, mevcut `useEffect, useMemo, useState` korunarak)
  - **JSX restyle** (lines 53-113, mevcut structure preserved, sadece className + layout değişir):
    - Her sembol satırı: `h-[52px]` yükseklik, `flex items-center gap-3 px-3` layout
    - Sol: sembol adı (`font-semibold text-sm`) + asset class badge (`<Badge variant="outline" className="text-[10px]">`)
    - Orta: mini sparkline — `<ResponsiveContainer width={40} height={24}>` ile `<LineChart data={history}>` + `<Line type="monotone" dataKey="price" stroke="hsl(var(--color-up))" strokeWidth={1} dot={false} />`. History < 3 point ise sparkline'ı GİZLE (`{history.length >= 3 && <ResponsiveContainer>...}`)
    - Sağ: fiyat (`<span className="font-price text-sm">`) + 24h değişim (`<span className={cn("text-xs", change >= 0 ? "text-up" : "text-down")}>`)
    - **Tick flash**: fiyat değişiminde, önceki fiyat ile karşılaştır. Artışta `animate-tick-flash-up` class'ı 400ms ekle, düşüşte `animate-tick-flash-down`. `useRef` ile önceki price'ı sakla, her tick'te karşılaştır.
    - **Seçili sembol**: sol kenarda `border-l-2 border-up` (veya `border-down` eğer düşüşte) — 2px accent çizgisi
    - **Hover**: `hover:bg-surface-1 transition-colors duration-panel`
  - **Sparkline data build** (component body içinde, mevcut useMemo'dan sonra):
    ```typescript
    // Her render'da livePrices'dan price'ları history'ye push et
    useEffect(() => {
      Object.keys(livePrices).forEach(sym => {
        const hist = priceHistoryRef.current[sym] ?? [];
        const newPrice = livePrices[sym]?.price;
        if (newPrice && hist[hist.length - 1] !== newPrice) {
          priceHistoryRef.current[sym] = [...hist, newPrice].slice(-20);
        }
      });
    }, [livePrices]);
    ```
  - **Recharts LineChart 40×24px** — no axes, no grid, no tooltip, just the line. Stroke color: `hsl(var(--color-up))` if last change positive, `hsl(var(--color-down))` if negative, `hsl(var(--color-neutral))` if flat.

  **Must NOT do**:
  - useLivePrices hook'unu değiştirme (sadece return değerini oku)
  - Mevcut Supabase query'leri değiştirme (watchlist CRUD lines 30-31, 45, 48)
  - Mevcut toggleWatch handler'ı değiştirme (lines 41-51)
  - Mevcut useMemo filter logic değiştirme (lines 35-39)
  - Mevcut import'ları silme
  - Edge function çağrısı EKLEME (bu component'te edge function yok, olmamalı)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI restyle + recharts sparkline + tick flash animation. Frontend-focused, visual precision needed.
  - **Skills**: []
    - No special skill needed — React + recharts + CSS animations.

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3)
  - **Parallel Group**: Wave 2 (with Task 3)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1 (tokens required)

  **References**:

  **Pattern References**:
  - `src/components/trading/SymbolList.tsx:1-11` — Mevcut imports (PRESERVE — yeni import ekle ama eskiyi silme)
  - `src/components/trading/SymbolList.tsx:20-26` — Mevcut hooks: useApp, t, useState (q, cat, watch), useLivePrices (PRESERVE)
  - `src/components/trading/SymbolList.tsx:28-33` — Mevcut useEffect watchlist fetch (PRESERVE)
  - `src/components/trading/SymbolList.tsx:35-39` — Mevcut useMemo filter (PRESERVE)
  - `src/components/trading/SymbolList.tsx:41-51` — Mevcut toggleWatch handler (PRESERVE)
  - `src/components/trading/SymbolList.tsx:53-113` — Mevcut JSX (RESTYLE — structure preserved, className değişir)

  **API/Type References**:
  - `src/hooks/useLivePrices.ts:LivePrice` interface — `{symbol, price, change_pct_24h, change_24h, updated_at}`. Bu hook'un RETURN değeri. Hook değiştirilmez.
  - `src/lib/symbols.ts:SymbolDef` — `{symbol, tv, yahoo?, binance?, name, asset_class, market_open?}`. Props'tan gelen `active: SymbolDef`.
  - `src/lib/symbols.ts:ASSET_LABELS` — `Record<AssetClass, {tr, en}>`. Badge için label.

  **Test References**:
  - `src/pages/Portfolio.tsx` — Recharts AreaChart pattern (sparkline için LineChart kullan, AreaChart değil, ama import pattern aynı: `import { LineChart, Line, ResponsiveContainer } from 'recharts'`)

  **External References**:
  - Recharts LineChart docs: https://recharts.org/en-US/api/LineChart — sparkline için minimal config (no axes, no grid)

  **WHY Each Reference Matters**:
  - Lines 1-11: Imports PRESERVE edilmezse build kırılır. Yeni import (recharts, useRef) EKLENİR ama mevcutlar SİLİNMEZ.
  - Lines 20-51: Hook logic + handler logic FROZEN. Sadece JSX (53-113) restyle edilir. Data flow preserved.
  - LivePrice interface: Hangi field'ların available olduğunu bil — `price`, `change_pct_24h` kullanılır. `high_24h`/`low_24h`/`volume_24h` YOK (bu component'te kullanılmayacak).
  - Portfolio.tsx recharts pattern: Proje'de recharts nasıl import ediliyor, hangi pattern kullanılıyor — aynı convention'ı follow et.
  - Sparkline rolling window: useLivePrices her tick'te yeni `price` döner. Biz bu price'ları ref'te biriktiririz (hook değiştirmeden). ≥3 point olunca sparkline render edilir.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: SymbolList renders with 52px rows and font-price
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user logged in, on dashboard page
    Steps:
      1. Navigate to `http://localhost:5173/`
      2. Wait for SymbolList to render (selector: `[class*="flex flex-col h-full"]` or symbol buttons)
      3. Get all symbol row elements (buttons with symbol names like BTC, ETH, AAPL)
      4. Measure first row height: `getBoundingClientRect().height` → expect 52 (±2px tolerance)
      5. Check price element has class `font-price` or inline style fontFamily includes 'JetBrains Mono'
      6. Screenshot the SymbolList
    Expected Result: Rows are 52px high, prices use font-price (JetBrains Mono)
    Failure Indicators: Row height ≠ 52px, price in sans-serif font
    Evidence: .omo/evidence/task-2-symbollist-rows.png

  Scenario: Tick flash animation on price change
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, SymbolList visible
    Steps:
      1. Navigate to dashboard, wait for SymbolList
      2. Get first symbol row's price element
      3. Wait for price to change (up to 10s — live prices update via Realtime)
      4. Capture the price element's class during the 400ms flash window
      5. Check for `animate-tick-flash-up` or `animate-tick-flash-down` class
    Expected Result: Flash animation class applied on price change
    Failure Indicators: No animation class, price changes without visual feedback
    Evidence: .omo/evidence/task-2-tick-flash.png
    Note: If no price change occurs within 10s, mark as "no live tick during test" — acceptable

  Scenario: Sparkline hidden when < 3 data points, shown when ≥ 3
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, fresh page load (sparkline empty initially)
    Steps:
      1. Navigate to dashboard, wait for SymbolList
      2. On initial load, verify sparkline NOT visible (no svg in 40×24px area)
      3. Wait 15s for price updates to accumulate (Realtime ticks)
      4. Re-check for sparkline svg element (`.recharts-surface` inside 40×24px container)
    Expected Result: Initially hidden, appears after sufficient ticks
    Failure Indicators: Sparkline shows with < 3 points, or never appears after 15s
    Evidence: .omo/evidence/task-2-sparkline.png

  Scenario: Original imports and hooks preserved
    Tool: Bash (grep)
    Preconditions: SymbolList.tsx updated
    Steps:
      1. `grep "useLivePrices" src/components/trading/SymbolList.tsx` — expect match
      2. `grep "useApp" src/components/trading/SymbolList.tsx` — expect match
      3. `grep "supabase.from" src/components/trading/SymbolList.tsx` — expect ≥3 (watchlist queries preserved)
      4. `grep "toggleWatch" src/components/trading/SymbolList.tsx` — expect match (handler preserved)
      5. `grep "ASSET_LABELS" src/components/trading/SymbolList.tsx` — expect match
    Expected Result: All original imports and hooks present
    Failure Indicators: Any grep returns no match
    Evidence: .omo/evidence/task-2-imports-preserved.txt
  ```

  **Commit**: YES
  - Message: `feat(symbol-list): add sparkline, tick flash, font-price rows`
  - Files: `src/components/trading/SymbolList.tsx`
  - Pre-commit: `npm run build`

- [x] 3. ChartPanel — 36px stat bar + timeframe chip grubu

  **What to do**:
  - **src/components/TradingViewChart.tsx** (94 lines, red-line'da DEĞİL) — minimal değişiklik:
    - Props interface'e `interval?: string` EKLE (default "60" korunur):
      ```typescript
      interface Props { symbol: string; theme: "dark" | "light"; interval?: string; }
      ```
    - Widget config'inde (line 36 civarı) `interval: "60"` → `interval: interval ?? "60"` değiştir
    - useEffect dependency array'ine `interval` EKLE (interval değişince widget re-init olsun)
    - Widget CDN script koduna DOKUNMA — sadece config parametresi dynamic yapılır
  - **src/components/trading/ChartPanel.tsx** (228 lines) — Mevcut imports PRESERVE (lines 1-22: useState, useLivePrice, useApp, SymbolDef, isMarketOpen, formatPrice, isStale, t, Tabs, TabsContent, TabsList, TabsTrigger, Button, Input, supabase, callEdgeFunction, ExecuteTradeResponse, toast, cn, TradingViewChart, OrderTicket, AlertsPanel, IntentDialog, celebrateAchievements, AnimatedNumber, icons)
    - Mevcut import'lar korunur. Yeni import EKLE: `Badge` from `@/components/ui/badge`
  - **Yeni state EKLE** (mevcut useState'lerden sonra, line 47 civarı):
    ```typescript
    const [timeframe, setTimeframe] = useState<string>("1h");
    const [volume24h, setVolume24h] = useState<number | null>(null);
    ```
  - **24h volume için direct price_cache query EKLE** (mevcut useEffect'lerden sonra, yeni useEffect):
    ```typescript
    useEffect(() => {
      if (!symbol?.symbol) return;
      supabase.from("price_cache")
        .select("volume_24h")
        .eq("symbol", symbol.symbol)
        .single()
        .then(({ data }) => setVolume24h(data?.volume_24h ?? null));
    }, [symbol?.symbol]);
    ```
    NOT: Bu bir READ query'dir. Mevcut query'ler DEĞİL. Hook (useLivePrice) değiştirilmez. Sadece component içinde ekstra bir read query.
  - **Timeframe mapping** (1m→"1", 5m→"5", 15m→"15", 1h→"60", 4h→"240", 1D→"D"):
    ```typescript
    const TF_MAP: Record<string, string> = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1D": "D" };
    ```
  - **JSX restyle** — Mevcut header bar (lines 111-148) DEĞİŞTIRILIR. Yeni structure:
    - **36px stat bar** (header bar'ın altına, Tabs'tan ÖNCE, Chart'ın ÜSTÜNE):
      ```jsx
      <div className="flex items-center gap-4 px-3 h-9 border-b border-border-subtle bg-surface-1/50 text-sm">
        <span className="font-price text-lg font-semibold">{formatPrice(price)}</span>
        <span className={cn("text-xs", (change ?? 0) >= 0 ? "text-up" : "text-down")}>
          {(change ?? 0) >= 0 ? "+" : ""}{change?.toFixed(2)}%
        </span>
        <span className="text-xs text-muted-foreground">24h H: <span className="font-price">—</span></span>
        <span className="text-xs text-muted-foreground">24h L: <span className="font-price">—</span></span>
        <span className="text-xs text-muted-foreground">Vol: <span className="font-price">{volume24h ? formatPrice(volume24h) : "—"}</span></span>
        <div className="ml-auto flex gap-1">
          {["1m","5m","15m","1h","4h","1D"].map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className={cn("px-2 py-0.5 text-xs rounded transition-colors",
                timeframe === tf ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
              {tf}
            </button>
          ))}
        </div>
      </div>
      ```
    - **24h high/low**: "—" gösterilir (veri YOK — LivePrice'da yok, price_cache DB'de de yok)
    - **24h volume**: price_cache direct query'den gelir (volume24h state)
    - **Stat bar fiyat tick flash**: önceki fiyat ile karşılaştır, `animate-tick-flash-up`/`animate-tick-flash-down` class ekle
    - **TradingViewChart'a interval prop EKLE**: `<TradingViewChart symbol={symbol.tv} theme={theme} interval={TF_MAP[timeframe]} />`
    - **Height fix**: wrapper `flex flex-col h-full`, stat bar `shrink-0 h-9`, chart container `flex-1 min-h-0`
    - Mevcut Tabs/header/bottom-bar preserved (sadece stat bar araya girer, timeframe chip stat bar'ın sağında)
  - **Mevcut executeTrade/requestTrade handlers PRESERVE** (lines 53-102) — DOKUNMA
  - **Mevcut IntentDialog PRESERVE** — DOKUNMA
  - **Mevcut AnimatedNumber** header bar'da kullanılmaya devam edilebilir VEYA stat bar'da font-price ile değiştirilebilir (stat bar'da font-price tercih edilir — kullanıcı "büyük fiyat (font-price)" istedi)

  **Must NOT do**:
  - TradingViewChart widget CDN script koduna dokunma (sadece config `interval` parametresi dynamic)
  - Mevcut executeTrade handler'ı değiştirme (lines 63-102)
  - Mevcut requestTrade handler'ı değiştirme (lines 53-61)
  - Mevcut useLivePrice hook çağrısını değiştirme (line 48)
  - Mevcut callEdgeFunction("execute-trade") çağrısını değiştirme (line 82)
  - Mevcut CustomEvent dispatch'leri değiştirme (lines 69-70, 92, 99)
  - Mevcut Tabs/TabsContent yapısını değiştirme (sadece araya stat bar girer)
  - Mevcut OrderTicket/AlertsPanel/IntentDialog child component'leri değiştirme
  - 24h high/low için edge function çağrısı EKLEME (veri yok, "—" göster)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Stat bar + timeframe chip UI + minimal TradingViewChart prop ekleme. Frontend layout work.
  - **Skills**: []
    - No special skill needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 2 (with Task 2)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1 (tokens required)

  **References**:

  **Pattern References**:
  - `src/components/trading/ChartPanel.tsx:1-22` — Mevcut imports (PRESERVE + Badge ekle)
  - `src/components/trading/ChartPanel.tsx:40-51` — Props + hooks (PRESERVE, yeni state ekle)
  - `src/components/trading/ChartPanel.tsx:53-102` — requestTrade + executeTrade (FROZEN — DOKUNMA)
  - `src/components/trading/ChartPanel.tsx:109-148` — Header bar (REPLACE with stat bar)
  - `src/components/trading/ChartPanel.tsx:150-155` — TabsList (PRESERVE)
  - `src/components/trading/ChartPanel.tsx:158-160` — TradingViewChart usage (ADD interval prop)
  - `src/components/TradingViewChart.tsx:1-94` — Full file (ADD interval prop, minimal change)
  - `src/components/TradingViewChart.tsx:33-49` — Widget config (interval: "60" → interval: interval ?? "60")

  **API/Type References**:
  - `src/hooks/useLivePrices.ts:LivePrice` — `{symbol, price, change_pct_24h, change_24h, updated_at}`. NO high_24h, NO low_24h. Stat bar "—" gösterir.
  - `src/integrations/supabase/types.ts:622` — price_cache Row: `{asset_class, change_24h, change_pct_24h, price, symbol, updated_at, volume_24h}`. volume_24h BURADAN gelir (direct query).
  - TradingView interval values: "1" (1m), "5" (5m), "15" (15m), "60" (1h), "240" (4h), "D" (1D)

  **Test References**:
  - `src/components/TradingViewChart.tsx:23` — `ref.current.innerHTML = ""` (cleanup pattern, preserved)
  - `src/components/TradingViewChart.tsx:55-60` — Error state with retry (preserved)

  **External References**:
  - TradingView widget config docs: https://www.tradingview.com/widget/advanced-chart/ — interval parameter values

  **WHY Each Reference Matters**:
  - Lines 53-102 (executeTrade/requestTrade): Bu FROZEN. Tüm trade logic, edge function call, CustomEvent dispatch burada. DOKUNMA.
  - TradingViewChart interval: Widget CDN script'e dokunmadan sadece config parametresi dynamic yapılır. useEffect dependency'ye interval eklenince widget re-init olur.
  - price_cache volume_24h: LivePrice hook'unda YOK ama DB'de VAR. Direct query (hook değiştirmeden) ile alabiliriz. Bu RED LINE değil — sadece component içinde read query.
  - 24h high/low: Kullanıcı "mevcut state kullan" dedi. Veri yok → "—" göster. Edge function ekleme (red line).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Stat bar renders above chart with price and timeframe chips
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user on dashboard with a symbol selected
    Steps:
      1. Navigate to `http://localhost:5173/`
      2. Wait for ChartPanel to render
      3. Check for stat bar element (h-9, contains price in font-price, timeframe chips)
      4. Verify 6 timeframe chips visible: 1m, 5m, 15m, 1h, 4h, 1D
      5. Verify price uses font-price class
      6. Verify 24h H and 24h L show "—" (no data available)
      7. Verify Vol shows a number or "—"
      8. Screenshot the ChartPanel
    Expected Result: 36px stat bar with price, change%, H/L (—), Vol, and 6 timeframe chips
    Failure Indicators: No stat bar, no timeframe chips, missing price, missing H/L
    Evidence: .omo/evidence/task-3-stat-bar.png

  Scenario: Timeframe chip click updates TradingView widget
    Tool: Playwright (playwright skill)
    Preconditions: Chart panel visible, chart loaded
    Steps:
      1. Note current chart (screenshot baseline)
      2. Click "5m" timeframe chip
      3. Wait 3s for widget re-init
      4. Screenshot the chart
      5. Compare: chart should show different timeframe (candle density changed)
      6. Click "1D" chip, wait 3s, screenshot again
    Expected Result: Chart updates to selected timeframe
    Failure Indicators: Chart doesn't change, widget doesn't re-init
    Evidence: .omo/evidence/task-3-timeframe-5m.png, .omo/evidence/task-3-timeframe-1d.png

  Scenario: TradingViewChart accepts interval prop
    Tool: Bash (grep)
    Preconditions: TradingViewChart.tsx updated
    Steps:
      1. `grep "interval" src/components/TradingViewChart.tsx` — expect ≥3 matches (prop, config, dependency)
      2. `grep "interval.*60" src/components/TradingViewChart.tsx` — expect match (default fallback)
      3. `grep "interval.*??" src/components/TradingViewChart.tsx` — expect match (optional prop)
    Expected Result: interval prop added with default fallback
    Failure Indicators: No interval prop, hardcoded "60" still
    Evidence: .omo/evidence/task-3-interval-prop.txt

  Scenario: Original trade logic preserved
    Tool: Bash (grep)
    Preconditions: ChartPanel.tsx updated
    Steps:
      1. `grep "callEdgeFunction.*execute-trade" src/components/trading/ChartPanel.tsx` — expect match
      2. `grep "requestTrade" src/components/trading/ChartPanel.tsx` — expect match
      3. `grep "executeTrade" src/components/trading/ChartPanel.tsx` — expect match
      4. `grep "optimistic-position" src/components/trading/ChartPanel.tsx` — expect ≥2 matches
      5. `grep "celebrateAchievements" src/components/trading/ChartPanel.tsx` — expect match
      6. `grep "IntentDialog" src/components/trading/ChartPanel.tsx` — expect match
    Expected Result: All trade logic preserved
    Failure Indicators: Any grep returns no match
    Evidence: .omo/evidence/task-3-trade-logic-preserved.txt
  ```

  **Commit**: YES
  - Message: `feat(chart-panel): add stat bar + timeframe chips`
  - Files: `src/components/trading/ChartPanel.tsx`, `src/components/TradingViewChart.tsx`
  - Pre-commit: `npm run build`

- [x] 4. OrderTicket — preset butonlar + risk badge + Long/Short toggle + Collapsible TP/SL

  **What to do**:
  - **src/components/trading/OrderTicket.tsx** (170 lines) — Mevcut imports PRESERVE (lines 1-14: useEffect, useState, useApp, supabase, callEdgeFunction, useLivePrice, SymbolDef, formatPrice, isStale, t, Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, toast, icons, cn)
  - **Yeni import EKLE**:
    ```typescript
    import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
    import { motion } from 'framer-motion';
    import { useApp } from '@/contexts/AppContext'; // already imported, just destructure realBalance
    ```
  - **realBalance EKLE** — mevcut `const { user, lang } = useApp()` (line 19) → `const { user, lang, realBalance } = useApp()`
  - **Preset butonlar EKLE** — quantity input'unun üstüne:
    ```jsx
    <div className="flex gap-1">
      {[10, 25, 50, 100].map(pct => (
        <Button key={pct} variant="outline" size="sm" className="flex-1 text-xs"
          onClick={() => {
            if (!realBalance || !lp?.price) return;
            const qty = (realBalance * pct / 100) / lp.price;
            setQty(qty.toFixed(4));
          }}>
          {pct}%
        </Button>
      ))}
    </div>
    ```
    Mevcut setQty setter kullanılır (line 24). Hook değişmez.
  - **Risk badge EKLE** — quantity input'unun altında:
    ```jsx
    {lp?.price && qty && (
      <div className="text-xs text-muted-foreground">
        Toplam: <span className="font-price">${(parseFloat(qty) * lp.price).toFixed(2)}</span>
        <Badge variant="outline" className="ml-2 text-[10px]">
          {realBalance ? ((parseFloat(qty) * lp.price / realBalance) * 100).toFixed(1) : 0}% bakiye
        </Badge>
      </div>
    )}
    ```
  - **Long/Short toggle with framer-motion** — mevcut Select(side) yerine toggle. Mevcut `side` state (line 23) preserved. Mevcut `setSide` setter preserved. Sadece UI değişir:
    ```jsx
    <div className="flex gap-2">
      <motion.button
        onClick={() => setSide("buy")}
        className={cn("flex-1 py-2 rounded-lg font-medium transition-colors",
          side === "buy" ? "bg-up text-white" : "bg-surface-1 text-muted-foreground")}
        whileTap={{ scale: 0.97 }}
        layout
      >
        LONG
      </motion.button>
      <motion.button
        onClick={() => setSide("sell")}
        className={cn("flex-1 py-2 rounded-lg font-medium transition-colors",
          side === "sell" ? "bg-down text-white" : "bg-surface-1 text-muted-foreground")}
        whileTap={{ scale: 0.97 }}
        layout
      >
        SHORT
      </motion.button>
    </div>
    ```
    NOT: Mevcut `side` state'i "buy"/"sell" değerlerini kullanır (line 23: `useState<"buy"|"sell">("buy")`). Bu preserved. Sadece UI toggle'a çevrilir.
  - **Submit loading + success pulse** — mevcut `place()` handler preserved (line 55). Button UI:
    ```jsx
    <Button onClick={place} disabled={submitting || noPrice || stale}
      className={cn("w-full h-9", submitting ? "animate-pulse" : "", "gradient-primary")}>
      {submitting ? <><Loader2 className="animate-spin" /> İşleniyor...</> : tr.place_order}
    </Button>
    ```
    Success pulse için: `place()` başarılı olduğunda kısa bir state toggle ekle (örn `const [justSuccess, setJustSuccess] = useState(false)`) ve button 500ms yeşil pulse yapsın. Bu, mevcut handler'ın RETURN'ünde yapılır (handler logic preserved, sadece UI feedback eklenir).
  - **TP/SL Collapsible** — mevcut trigger price input'unun altında:
    ```jsx
    <Collapsible>
      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground w-full">
        Gelişmiş (TP/SL) <ChevronDown className="size-3" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 mt-2">
        <div>
          <label className="text-xs">Take Profit</label>
          <Input type="number" placeholder="TP fiyatı" onChange={e => setTp(e.target.value)} />
        </div>
        <div>
          <label className="text-xs">Stop Loss</label>
          <Input type="number" placeholder="SL fiyatı" onChange={e => setSl(e.target.value)} />
        </div>
      </CollapsibleContent>
    </Collapsible>
    ```
    NOT: `setTp`/`setSl` yeni state'ler. Bunlar mevcut `place()` handler'ına EKLENMEZ (handler preserved). İleride edge function payload'ına eklenebilir ama bu task'te sadece UI var. Veya: mevcut `place()` zaten TP/SL göndermiyorsa, bu alanlar şu an purely visual. Kullanıcı "TP/SL alanları varsayılan gizli" istedi — Collapsible ile gizli.
  - **Mevcut open orders list PRESERVE** (lines 145-169) — DOKUNMA
  - **Mevcut realtime subscription PRESERVE** (lines 46-53) — DOKUNMA
  - **Mevcut loadOrders PRESERVE** (lines 36-41) — DOKUNMA
  - **Mevcut place()/cancel() handler logic PRESERVE** (lines 55-90) — DOKUNMA

  **Must NOT do**:
  - Mevcut `place()` handler'ın iç logic'ini değiştirme (payload, edge function call, retry logic)
  - Mevcut `cancel()` handler'ı değiştirme
  - Mevcut `loadOrders()` değiştirme
  - Mevcut realtime subscription değiştirme
  - Mevcut Supabase query'leri değiştirme (line 38, 48-50)
  - Mevcut callEdgeFunction("manage-order") çağrısını değiştirme (lines 62, 82)
  - Mevcut useEffect'leri değiştirme (lines 32-34, 44, 46-53)
  - Zod validation ekleme/çıkarma — client-side zod zaten YOK (server-side). "Zod validasyon dokunma" = dokunulmuyor (zaten yok).

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Form UI restyle + preset buttons + framer-motion toggle + Collapsible. Frontend form design.
  - **Skills**: []
    - No special skill needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 5)
  - **Parallel Group**: Wave 3 (with Task 5)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1 (tokens), user sequence requires Tasks 2-3 done first

  **References**:

  **Pattern References**:
  - `src/components/trading/OrderTicket.tsx:1-14` — Mevcut imports (PRESERVE + Collapsible, motion ekle)
  - `src/components/trading/OrderTicket.tsx:18-30` — Props + hooks (PRESERVE, realBalance destruct + new state ekle)
  - `src/components/trading/OrderTicket.tsx:32-34` — useEffect auto-fill trigger (PRESERVE)
  - `src/components/trading/OrderTicket.tsx:36-41` — loadOrders (PRESERVE)
  - `src/components/trading/OrderTicket.tsx:44-53` — useEffect load + realtime (PRESERVE)
  - `src/components/trading/OrderTicket.tsx:55-78` — place() handler (FROZEN — DOKUNMA)
  - `src/components/trading/OrderTicket.tsx:80-90` — cancel() handler (FROZEN — DOKUNMA)
  - `src/components/trading/OrderTicket.tsx:92-169` — JSX (RESTYLE — structure preserved, add presets + toggle + Collapsible)

  **API/Type References**:
  - `src/contexts/AppContext.tsx:AppContextValue` — `realBalance: number` mevcut. Destructure et.
  - `src/hooks/useLivePrices.ts:LivePrice` — `price` field kullanılır (risk calc için)
  - `src/components/ui/collapsible.tsx` — Collapsible, CollapsibleTrigger, CollapsibleContent exports
  - `src/components/ui/badge.tsx` — Badge, badgeVariants (variant="outline")

  **Test References**:
  - `src/components/blitz/BlitzLeaderboard.tsx` — framer-motion pattern: `motion.button` + `whileTap={{scale: 0.97}}` + `layout` prop

  **External References**:
  - framer-motion motion component: https://www.framer.com/motion/component/ — `whileTap`, `layout` props
  - shadcn Collapsible: https://ui.shadcn.com/docs/components/collapsible

  **WHY Each Reference Matters**:
  - Lines 55-90 (place/cancel): FROZEN. Edge function payload + retry logic burada. DOKUNMA.
  - AppContext realBalance: Bakiye bilgisi AppContext'ten gelir. Hook değiştirilmeden destructure ile alınır.
  - BlitzLeaderboard framer-motion pattern: Proje'de motion.button + whileTap + layout pattern'i used. Same convention.
  - Collapsible: shadcn component exists, ready to import. TP/SL "Gelişmiş" altında gizli.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Preset buttons calculate quantity from balance
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user logged in, OrderTicket visible (ChartPanel → orders tab)
    Steps:
      1. Navigate to dashboard, click "orders" tab in ChartPanel
      2. Wait for OrderTicket to render
      3. Verify 4 preset buttons visible: 10%, 25%, 50%, 100%
      4. Click "25%" button
      5. Check quantity input value — should be (realBalance * 0.25 / currentPrice)
      6. Verify risk badge shows percentage of balance
    Expected Result: Preset fills quantity input, risk badge shows % of balance
    Failure Indicators: No preset buttons, clicking does nothing, no risk badge
    Evidence: .omo/evidence/task-4-presets.png

  Scenario: Long/Short toggle switches side with animation
    Tool: Playwright (playwright skill)
    Preconditions: OrderTicket visible
    Steps:
      1. Verify LONG button highlighted (green/bg-up), SHORT not highlighted
      2. Click SHORT button
      3. Verify SHORT now highlighted (red/bg-down), LONG not highlighted
      4. Verify side state changed (place order would send side="sell")
      5. Screenshot both states
    Expected Result: Toggle switches visually with animation, side state updates
    Failure Indicators: No visual change, both highlighted, neither highlighted
    Evidence: .omo/evidence/task-4-toggle-long.png, .omo/evidence/task-4-toggle-short.png

  Scenario: Collapsible TP/SL fields hidden by default, expandable
    Tool: Playwright (playwright skill)
    Preconditions: OrderTicket visible
    Steps:
      1. Verify "Gelişmiş (TP/SL)" trigger visible
      2. Verify TP/SL inputs NOT visible (collapsed)
      3. Click "Gelişmiş (TP/SL)" trigger
      4. Verify TP and SL inputs now visible
      5. Screenshot expanded state
    Expected Result: TP/SL hidden by default, expands on click
    Failure Indicators: TP/SL always visible, or trigger doesn't expand
    Evidence: .omo/evidence/task-4-collapsible.png

  Scenario: Original manage-order edge function call preserved
    Tool: Bash (grep)
    Preconditions: OrderTicket.tsx updated
    Steps:
      1. `grep "callEdgeFunction.*manage-order" src/components/trading/OrderTicket.tsx` — expect ≥2 (place + cancel)
      2. `grep "supabase.from.*orders" src/components/trading/OrderTicket.tsx` — expect match (loadOrders query)
      3. `grep "realtime" src/components/trading/OrderTicket.tsx` — expect match (subscription)
      4. `grep "place" src/components/trading/OrderTicket.tsx` — expect match (handler preserved)
    Expected Result: All edge function calls and queries preserved
    Failure Indicators: Any grep returns no match
    Evidence: .omo/evidence/task-4-edge-fn-preserved.txt
  ```

  **Commit**: YES
  - Message: `feat(order-ticket): add presets, risk badge, Long/Short toggle, Collapsible TP/SL`
  - Files: `src/components/trading/OrderTicket.tsx`
  - Pre-commit: `npm run build`

- [x] 5. OpenPositionsPanel — P&L framer-motion animasyon + mini bar + empty state SVG

  **What to do**:
  - **src/components/trading/OpenPositionsPanel.tsx** (419 lines) — Mevcut imports PRESERVE (lines 1-21: useEffect, useMemo, useState, useCallback, supabase, callEdgeFunction, useApp, t, Card, Button, DropdownMenu components, useLivePrices, recordTrade, findSymbol, formatPrice, SymbolDef, ExecuteTradeResponse, toast, cn, celebrateAchievements, icons)
  - **Yeni import EKLE**: `import { motion, AnimatePresence } from 'framer-motion'`
  - **JSX restyle** (lines 205-418, mevcut structure preserved, visual layer değişir):
    - **Position row** (lines 260-310 civarı, `sorted.map(p => ...)` içinde):
      - Sol: sembol adı + yön badge (`<Badge variant="outline" className={side === "long" ? "border-up text-up" : "border-down text-down"}>LONG/SHORT</Badge>`)
      - Orta: giriş fiyatı (`font-price text-xs`) → anlık fiyat (`font-price text-xs`) / miktar (`font-price text-xs`)
      - Sağ: **P&L framer-motion AnimatePresence**:
        ```jsx
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={pnlValue.toFixed(2)}
            initial={{ y: pnlValue > prevPnl ? -8 : 8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: pnlValue > prevPnl ? 8 : -8, opacity: 0 }}
            transition={{ duration: 0.3, type: "spring", stiffness: 320, damping: 26 }}
            className={cn("font-price text-sm", pnlValue >= 0 ? "text-up" : "text-down")}
          >
            {pnlValue >= 0 ? "+" : ""}{pnlValue.toFixed(2)}$
          </motion.div>
        </AnimatePresence>
        ```
        `prevPnl` için `useRef` ile her pozisyonun önceki P&L değerini sakla. Tick geldiğinde karşılaştır → yukarı/aşağı slide direction belirle.
      - **Mini horizontal bar**: pozisyon büyüklüğünün bakiyeye oranı:
        ```jsx
        <div className="h-1 bg-surface-2 rounded-full overflow-hidden mt-1">
          <div className={cn("h-full rounded-full", pnlValue >= 0 ? "bg-up" : "bg-down")}
            style={{ width: `${Math.min(100, (notional / balance) * 100)}%` }} />
        </div>
        ```
        `balance` için AppContext'ten `realBalance` + `realBalanceLocked` al (toplam = realBalance + realBalanceLocked). `notional` = `p.quantity * p.current_price`.
    - **Empty state** (lines 244-248 civarı, `sorted.length === 0` branch):
      ```jsx
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <svg className="size-12 mb-3 opacity-40" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="6" y="10" width="36" height="28" rx="3" />
          <path d="M14 22h20M14 28h14" strokeLinecap="round" />
          <circle cx="38" cy="28" r="1.5" fill="currentColor" />
        </svg>
        <p className="text-sm">{tr.no_positions ?? "Açık pozisyon yok"}</p>
      </div>
      ```
      Mevcut `Inbox` icon kullanılıyorsa SVG ile değiştir. Mevcut `tr.no_positions` translation key'i varsa kullan, yoksa fallback string.
    - **Summary cards** (lines 231-241) — preserved, sadece font-price ekle (Total P&L, Exposure, Win/Loss değerleri `font-price` class)
    - **TP/SL progress bar** (lines 302-310) — preserved, styling refine
    - **Expanded detail** (lines 312-330) — preserved, Close 50%/100% buttons preserved
  - **Mevcut load() PRESERVE** (lines 76-97) — DOKUNMA
  - **Mevcut closePos() PRESERVE** (lines 167-191) — DOKUNMA
  - **Mevcut focusOnChart() PRESERVE** (lines 193-196) — DOKUNMA
  - **Mevcut enriched/sorted/totals useMemo PRESERVE** (lines 133-165) — DOKUNMA
  - **Mevcut realtime subscription PRESERVE** (lines 122-129) — DOKUNMA
  - **Mevcut CustomEvent listeners PRESERVE** (lines 104-119) — DOKUNMA

  **Must NOT do**:
  - Mevcut closePos() handler'ı değiştirme (edge function call, recordTrade, celebrateAchievements)
  - Mevcut load() handler'ı değiştirme (Supabase queries)
  - Mevcut useMemo'ları değiştirme (enriched, sorted, totals — computed values preserved)
  - Mevcut realtime subscription değiştirme
  - Mevcut CustomEvent listener'ları değiştirme (optimistic-position, rollback)
  - Mevcut callEdgeFunction("execute-trade") çağrısını değiştirme (line 172)
  - Mevcut Supabase query'leri değiştirme (lines 79, 82-88, 124-127)
  - execute-trade payload'ını değiştirme

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: P&L animation (framer-motion), mini bar, empty state SVG. Visual polish work.
  - **Skills**: []
    - No special skill needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 4)
  - **Parallel Group**: Wave 3 (with Task 4)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1 (tokens), user sequence requires Tasks 2-3 done first

  **References**:

  **Pattern References**:
  - `src/components/trading/OpenPositionsPanel.tsx:1-21` — Mevcut imports (PRESERVE + motion/AnimatePresence ekle)
  - `src/components/trading/OpenPositionsPanel.tsx:52-57` — Props interface (PRESERVE)
  - `src/components/trading/OpenPositionsPanel.tsx:66-165` — All hooks + useMemo (FROZEN — DOKUNMA)
  - `src/components/trading/OpenPositionsPanel.tsx:167-196` — closePos + focusOnChart (FROZEN — DOKUNMA)
  - `src/components/trading/OpenPositionsPanel.tsx:205-418` — JSX (RESTYLE — structure preserved, add animations + mini bar + empty state)

  **API/Type References**:
  - `src/contexts/AppContext.tsx:AppContextValue` — `realBalance`, `realBalanceLocked` (mini bar ratio için)
  - `src/hooks/useLivePrices.ts:LivePrice` — `price` field (anlık fiyat için)
  - `src/lib/symbols.ts:formatPrice` — price formatting (preserved, already imported)

  **Test References**:
  - `src/components/blitz/BlitzLeaderboard.tsx` — AnimatePresence + motion.div + spring transition pattern. Key-based re-animation for P&L change.
  - `src/components/blitz/BlitzLeaderboard.tsx` — `key={Math.sign(pnl)}` for P&L color change animation

  **External References**:
  - framer-motion AnimatePresence: https://www.framer.com/motion/animate-presence/ — `mode="popLayout"` for list items
  - framer-motion spring: https://www.framer.com/motion/transition/ — `{type: "spring", stiffness: 320, damping: 26}`

  **WHY Each Reference Matters**:
  - Lines 66-196: ALL FROZEN. Hooks, useMemo (enriched/sorted/totals), closePos, focusOnChart. Edge function call, Supabase queries, realtime. DOKUNMA.
  - BlitzLeaderboard: Proje'de AnimatePresence + spring pattern used. P&L animation için same convention.
  - AppContext realBalance/realBalanceLocked: Mini bar ratio için toplam bakiye = realBalance + realBalanceLocked. Direct destructure (hook değiştirilmez).

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Position row shows P&L with font-price and color
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user has at least 1 open position
    Steps:
      1. Navigate to dashboard
      2. Wait for OpenPositionsPanel to render
      3. If positions exist: verify P&L value has font-price class
      4. Verify P&L color: green (text-up) if positive, red (text-down) if negative
      5. Verify LONG/SHORT badge: green border for LONG, red border for SHORT
      6. Screenshot
    Expected Result: P&L in font-price with correct color, direction badge colored
    Failure Indicators: P&L in sans-serif, no color, no badge
    Evidence: .omo/evidence/task-5-position-row.png
    Note: If no positions exist, test empty state instead

  Scenario: Empty state shows SVG icon and message
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user has NO open positions
    Steps:
      1. Navigate to dashboard
      2. Wait for OpenPositionsPanel
      3. Verify SVG icon visible (42x42 area, opacity-40)
      4. Verify "Açık pozisyon yok" (or equivalent) text visible
      5. Screenshot
    Expected Result: SVG icon + empty state message
    Failure Indicators: No SVG, no message, raw text only
    Evidence: .omo/evidence/task-5-empty-state.png

  Scenario: Mini bar shows position size ratio
    Tool: Playwright (playwright skill)
    Preconditions: User has open position(s)
    Steps:
      1. Navigate to dashboard
      2. Find mini bar element (h-1, rounded-full, inside position row)
      3. Verify bar width > 0 (proportional to notional/balance)
      4. Verify bar color: green (bg-up) if P&L positive, red (bg-down) if negative
      5. Screenshot
    Expected Result: Mini bar visible with proportional width and colored fill
    Failure Indicators: No bar, zero width, wrong color
    Evidence: .omo/evidence/task-5-mini-bar.png

  Scenario: Original closePos and edge function preserved
    Tool: Bash (grep)
    Preconditions: OpenPositionsPanel.tsx updated
    Steps:
      1. `grep "callEdgeFunction.*execute-trade" src/components/trading/OpenPositionsPanel.tsx` — expect match
      2. `grep "closePos" src/components/trading/OpenPositionsPanel.tsx` — expect match
      3. `grep "supabase.from.*positions" src/components/trading/OpenPositionsPanel.tsx` — expect match
      4. `grep "supabase.from.*trades" src/components/trading/OpenPositionsPanel.tsx` — expect match
      5. `grep "celebrateAchievements" src/components/trading/OpenPositionsPanel.tsx` — expect match
      6. `grep "recordTrade" src/components/trading/OpenPositionsPanel.tsx` — expect match
      7. `grep "optimistic-position" src/components/trading/OpenPositionsPanel.tsx` — expect ≥2
    Expected Result: All logic preserved
    Failure Indicators: Any grep returns no match
    Evidence: .omo/evidence/task-5-logic-preserved.txt
  ```

  **Commit**: YES
  - Message: `feat(open-positions): add P&L animation, mini bar, empty state`
  - Files: `src/components/trading/OpenPositionsPanel.tsx`
  - Pre-commit: `npm run build`

- [x] 6. AccountAIPanel — signal card layout + typing animasyon + sliding tab indicator + Cmd+Enter

  **What to do**:
  - **src/components/trading/AccountAIPanel.tsx** (348 lines) — Mevcut imports PRESERVE (lines 1-17: useEffect, useState, supabase, callEdgeFunction, useApp, t, Card, Tabs components, Button, Input, icons, SymbolDef, useLivePrices, ReactMarkdown, cn, toast, types, AIDisclaimer)
  - **Yeni import EKLE**:
    ```typescript
    import { Badge } from '@/components/ui/badge';
    import { motion } from 'framer-motion';
    ```
  - **Signal card component** (component body içinde veya inline):
    AI yanıtları plain string → signal card formatına çevrilir. Edge function response'ları DEĞİL — sadece RENDER layer değişir:
    ```jsx
    function SignalCard({ title, content, symbol, loading }: { title: string; content: string; symbol: string; loading?: boolean }) {
      if (loading && !content) return <TypingDots />;
      if (!content) return null;
      return (
        <div className="rounded-lg border border-border-subtle bg-surface-1 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">{title}</h4>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">AI</Badge>
              {symbol && <Badge variant="secondary" className="text-[10px]">{symbol}</Badge>}
            </div>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        </div>
      );
    }
    ```
    NOT: Confidence badge "Düşük/Orta/Yüksek" — edge function'lardan confidence data GELMİYOR (response sadece string). Bu yüzden static "AI" badge kullanılır. Kullanıcı confidence badge istedi ama veri yok. "AI" badge'i en yakın alternatif. İleride edge function'lar confidence dönerse, bu badge dynamic yapılabilir. Şimdilik "AI" badge.
  - **Typing animation** (3-dot pulse, CSS keyframe):
    ```jsx
    function TypingDots() {
      return (
        <div className="flex items-center gap-1 py-4">
          <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dots" style={{ animationDelay: '0s' }} />
          <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dots" style={{ animationDelay: '0.2s' }} />
          <span className="size-1.5 rounded-full bg-muted-foreground animate-pulse-dots" style={{ animationDelay: '0.4s' }} />
        </div>
      );
    }
    ```
    `animate-pulse-dots` Task 1'de tailwind config'e eklendi.
  - **Analysis tab** (lines 251-264) — REPLACE plain markdown with SignalCard:
    ```jsx
    <SignalCard
      title={`AI Analysis — ${symbol.symbol}`}
      content={analysis}
      symbol={symbol.symbol}
      loading={loadingA}
    />
    {analysis && <AIDisclaimer />}
    ```
    Mevcut `runAnalysis` handler PRESERVE (lines 115-126). Mevcut `callEdgeFunction("ai-analyze")` PRESERVE.
  - **Brief tab** (lines 266-274) — SignalCard:
    ```jsx
    <SignalCard title="Günlük Özet" content={brief} loading={loadingB} />
    {brief && <AIDisclaimer />}
    ```
  - **Strategy tab** (lines 280-288) — SignalCard:
    ```jsx
    <SignalCard title={`Strateji — ${symbol.symbol}`} content={strategy} symbol={symbol.symbol} loading={loadingS} />
    {strategy && <AIDisclaimer />}
    ```
  - **News tab** (lines 290-314) — news items already card-style, just refine styling. Preserved.
  - **Chat tab** (lines 316-341):
    - Each message → SignalCard format (user messages have "You" label, assistant messages have "AI" label + symbol chip if available)
    - **Typing dots** while streaming: `streaming` state true iken, son assistant message yerine TypingDots göster
    - **Cmd+Enter to send**: mevcut `onKeyDown` handler (line 335: `e.key === "Enter" && send()`) → `e.key === "Enter" && (e.metaKey || e.ctrlKey) && send()`. VEYA: Enter = send (mevcut), Cmd+Enter = send (alternatif). Kullanıcı "Cmd+Enter ile gönderim" istedi — mevcut Enter behavior preserved + Cmd+Enter added:
      ```jsx
      onKeyDown={e => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
        else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } // preserve existing
      }}
      ```
    - **Inline retry on error**: mevcut toast error yerine, chat içinde retry button. `send()` handler'ında error durumunda `setMessages(prev => [...prev, { role: 'error', content: 'Hata oluştu' }])` veya benzeri. Mevcut `send()` logic'i preserved (streaming fetch), sadece error handling UI'sı değişir. Retry button: `<Button onClick={() => send()}>Retry</Button>`
  - **Sliding tab indicator** — mevcut TabsList (line 242) içine framer-motion `layoutId`:
    ```jsx
    <TabsList className="grid grid-cols-5 m-3 mb-0 shrink-0 relative">
      {["analysis","brief","strategy","news","chat"].map(tab => (
        <TabsTrigger key={tab} value={tab} className="relative z-10">
          {/* icon + label */}
          {activeTab === tab && (
            <motion.div layoutId="tab-indicator" className="absolute inset-0 bg-primary/10 rounded-md -z-10"
              transition={{ type: "spring", stiffness: 320, damping: 26 }} />
          )}
        </TabsTrigger>
      ))}
    </TabsList>
    ```
    `activeTab` için Tabs `onValueChange` kullan (shadcn Tabs supports this). Mevcut `defaultValue="analysis"` preserved.
  - **Balance card** (lines 220-238) — preserved, sadece font-price ekle (totalEquity, availableBalance, livePnl değerleri `font-price` class)

  **Must NOT do**:
  - Mevcut 4 edge function handler'ı değiştirme (runAnalysis, runStrategy, runBrief, runNews — lines 115-165)
  - Mevcut send() streaming handler'ın iç logic'ini değiştirme (SSE parsing, ReadableStream reader — lines 167-216). Sadece error UI + Cmd+Enter ekle.
  - Mevcut callEdgeFunction çağrılarını değiştirme (ai-analyze, ai-strategy, daily-brief, news-feed)
  - Mevcut ai-chat raw fetch çağrısını değiştirme (lines 174-212)
  - Mevcut Supabase query'leri değiştirme (profiles line 54, positions line 55)
  - Mevcut realtime subscription değiştirme (lines 90-102)
  - Mevcut useLivePrices çağrısını değiştirme (line 49)
  - Mevcut ReactMarkdown rendering'i silme — SignalCard içine taşınır
  - Mevcut AIDisclaimer component'ini silme — her tab'ta preserved
  - Edge function response format'ını değiştirme (plain string → structured data İSTEMİYORUZ — sadece render layer)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Signal card layout + typing animation + sliding tab indicator. Complex frontend UI.
  - **Skills**: []
    - No special skill needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7)
  - **Parallel Group**: Wave 4 (with Task 7)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1 (tokens), user sequence requires Tasks 4-5 done first

  **References**:

  **Pattern References**:
  - `src/components/trading/AccountAIPanel.tsx:1-17` — Mevcut imports (PRESERVE + Badge, motion ekle)
  - `src/components/trading/AccountAIPanel.tsx:18-27` — Props + interfaces (PRESERVE)
  - `src/components/trading/AccountAIPanel.tsx:29-113` — All hooks + useEffect + derived values (FROZEN — DOKUNMA)
  - `src/components/trading/AccountAIPanel.tsx:115-165` — runAnalysis/runStrategy/runBrief/runNews handlers (FROZEN — DOKUNMA)
  - `src/components/trading/AccountAIPanel.tsx:167-216` — send() streaming handler (FROZEN — DOKUNMA, only error UI + Cmd+Enter added)
  - `src/components/trading/AccountAIPanel.tsx:218-347` — JSX (RESTYLE — signal cards, typing, tab indicator, Cmd+Enter)

  **API/Type References**:
  - `src/lib/edge-function-types.ts:AiAnalyzeResponse` — `{analysis: string, error?}`. Plain string. No confidence field.
  - `src/lib/edge-function-types.ts:AiStrategyResponse` — `{suggestion: string, error?}`
  - `src/lib/edge-function-types.ts:DailyBriefResponse` — `{content: string, error?}`
  - `src/components/ui/badge.tsx` — Badge, badgeVariants (variant="outline", variant="secondary")

  **Test References**:
  - `src/components/blitz/BlitzLeaderboard.tsx` — framer-motion `layout` prop pattern (sliding tab indicator için `layoutId`)

  **External References**:
  - framer-motion layoutId: https://www.framer.com/motion/layout-animations/ — shared layout animations for tab indicator
  - shadcn Badge: https://ui.shadcn.com/docs/components/badge

  **WHY Each Reference Matters**:
  - Lines 115-216: ALL FROZEN. Edge function handlers + streaming chat. DOKUNMA.
  - Edge function response types: Response'lar plain string. Confidence data YOK. Signal card static "AI" badge kullanır (veri yok).
  - ReactMarkdown: SignalCard içine taşınır. Mevcat rendering preserved, sadece wrapper değişir.
  - layoutId pattern: Tab indicator için shared layout animation. BlitzLeaderboard'da layout prop used, layoutId yeni pattern ama framer-motion standard.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: AI analysis renders as signal card
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user on dashboard, AccountAIPanel visible
    Steps:
      1. Navigate to dashboard
      2. Find AccountAIPanel (right side, AI tabs)
      3. Click "Analyze" button in analysis tab
      4. Wait for loading (TypingDots should appear)
      5. Wait for response (up to 15s)
      6. Verify signal card appears: title "AI Analysis — [SYMBOL]", AI badge, symbol chip, markdown content
      7. Verify AIDisclaimer below
      8. Screenshot
    Expected Result: Signal card with title, AI badge, symbol chip, markdown content
    Failure Indicators: Plain markdown, no card border, no badge, no title
    Evidence: .omo/evidence/task-6-signal-card.png

  Scenario: Typing dots animation while loading
    Tool: Playwright (playwright skill)
    Preconditions: AccountAIPanel visible
    Steps:
      1. Click "Analyze" button
      2. Immediately check for 3-dot pulse animation (3 small circles with animate-pulse-dots class)
      3. Screenshot during loading
    Expected Result: 3 pulsing dots visible during AI response wait
    Failure Indicators: No dots, static dots, spinner instead
    Evidence: .omo/evidence/task-6-typing-dots.png

  Scenario: Sliding tab indicator moves between tabs
    Tool: Playwright (playwright skill)
    Preconditions: AccountAIPanel visible
    Steps:
      1. Note "analysis" tab is active (indicator on first tab)
      2. Click "strategy" tab
      3. Verify indicator slides to "strategy" tab position (framer-motion layoutId animation)
      4. Click "chat" tab
      5. Verify indicator slides again
      6. Screenshot
    Expected Result: Tab indicator slides smoothly between tabs
    Failure Indicators: No indicator, indicator jumps without animation
    Evidence: .omo/evidence/task-6-tab-indicator.png

  Scenario: Cmd+Enter sends chat message
    Tool: Playwright (playwright skill)
    Preconditions: AccountAIPanel visible, chat tab open
    Steps:
      1. Click "chat" tab
      2. Type a message in the input field (e.g., "What is BTC?")
      3. Press Cmd+Enter (Meta+Enter on Mac, Ctrl+Enter on Windows/Linux)
      4. Verify message is sent (user message appears in chat)
      5. Verify streaming response starts (typing dots or streaming text)
    Expected Result: Cmd+Enter sends the message
    Failure Indicators: Cmd+Enter does nothing, message not sent
    Evidence: .omo/evidence/task-6-cmd-enter.png

  Scenario: Original edge function calls preserved
    Tool: Bash (grep)
    Preconditions: AccountAIPanel.tsx updated
    Steps:
      1. `grep "callEdgeFunction.*ai-analyze" src/components/trading/AccountAIPanel.tsx` — expect match
      2. `grep "callEdgeFunction.*ai-strategy" src/components/trading/AccountAIPanel.tsx` — expect match
      3. `grep "callEdgeFunction.*daily-brief" src/components/trading/AccountAIPanel.tsx` — expect match
      4. `grep "callEdgeFunction.*news-feed" src/components/trading/AccountAIPanel.tsx` — expect match
      5. `grep "ai-chat" src/components/trading/AccountAIPanel.tsx` — expect match (raw fetch)
      6. `grep "ReactMarkdown" src/components/trading/AccountAIPanel.tsx` — expect match (preserved)
      7. `grep "AIDisclaimer" src/components/trading/AccountAIPanel.tsx` — expect ≥3 (all tabs)
      8. `grep "streaming" src/components/trading/AccountAIPanel.tsx` — expect match
    Expected Result: All edge function calls and ReactMarkdown preserved
    Failure Indicators: Any grep returns no match
    Evidence: .omo/evidence/task-6-edge-fn-preserved.txt
  ```

  **Commit**: YES
  - Message: `feat(ai-panel): add signal cards, typing animation, sliding tabs, Cmd+Enter`
  - Files: `src/components/trading/AccountAIPanel.tsx`
  - Pre-commit: `npm run build`

- [x] 7. CommandPalette — Recent Trades grubu ekle (MEVCUT dosyaya modifikasyon)

  **What to do**:
  - **ÖNEMLİ KEŞİF**: `src/components/CommandPalette.tsx` ZATEN MEVCUT (125 lines) ve `AppShell.tsx:23`'te MOUNT EDİLMİŞ. cmdk v1.1.1 kurulu ve kullanılıyor. Bu task YENİ dosya oluşturmaz — MEVCUT dosyaya "Recent Trades" grubu ekler.
  - **src/components/CommandPalette.tsx** (125 lines) — Mevcut imports PRESERVE (Cmd+K listener, useNavigate, supabase, SYMBOLS, CommandDialog components, etc.)
  - **Recent Trades state + query EKLE** (mevcut useState'lerden sonra):
    ```typescript
    const [recentTrades, setRecentTrades] = useState<Array<{id: string; symbol: string; side: string; quantity: number; price: number; executed_at: string}>>([]);

    useEffect(() => {
      if (!open) return;
      supabase.from("trades")
        .select("id,symbol,side,quantity,price,executed_at")
        .order("executed_at", { ascending: false })
        .limit(5)
        .then(({ data }) => setRecentTrades(data ?? []));
    }, [open]);
    ```
    NOT: supabase client ZATEN imported (line 7). Bu bir READ query — mevcut query'ler değiştirilmez. user_id filter gerekmez (RLS otomatik uygular). Sadece palette açıkken fetch yap (perf).
  - **Recent Trades group EKLE** — JSX'te mevcut CommandGroup'lar (Pages, Symbols, Commands) preserved. Yeni group ekle (Symbols group'tan SONRA, Commands group'tan ÖNCE):
    ```jsx
    {recentTrades.length > 0 && (
      <CommandGroup heading="Recent Trades">
        {recentTrades.map(t => (
          <CommandItem
            key={t.id}
            value={`${t.symbol} trade ${t.side}`}
            onSelect={() => go(`/?symbol=${encodeURIComponent(t.symbol)}`)}
          >
            <div className="flex items-center gap-2 w-full">
              <Badge variant="outline" className={cn("text-[10px]", t.side === "buy" ? "border-up text-up" : "border-down text-down")}>
                {t.side === "buy" ? "LONG" : "SHORT"}
              </Badge>
              <span className="font-medium">{t.symbol}</span>
              <span className="font-price text-xs text-muted-foreground">
                {t.quantity} @ {t.price}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(t.executed_at).toLocaleDateString()}
              </span>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    )}
    ```
    `go()` helper ZATEN mevcut (line 48 civarı, useNavigate wrapper). `cn` ZATEN imported. Badge import EKLE: `import { Badge } from '@/components/ui/badge'`
  - **Mevcut Cmd+K listener PRESERVE** (lines 28-46) — DOKUNMA
  - **Mevcut Pages group PRESERVE** (lines 95-102) — DOKUNMA
  - **Mevcut Symbols group PRESERVE** (lines 79-91) — DOKUNMA
  - **Mevcut Commands group PRESERVE** (lines 106-121) — DOKUNMA
  - **Mevcut open state + event listener PRESERVE** (lines 28-46) — DOKUNMA
  - **Mevcut `go()` helper PRESERVE** (line 48) — DOKUNMA
  - **Mevcut useNavigate PRESERVE** (line 18) — DOKUNMA

  **Must NOT do**:
  - useKeyboardShortcuts.ts'i değiştirme (Cmd+K zaten CommandPalette'te self-contained)
  - App.tsx'i değiştirme (CommandPalette zaten AppShell'de mount)
  - AppShell.tsx'i değiştirme (zaten mount edilmiş)
  - AppContext.tsx'i değiştirme (selectedSymbol yok, URL-driven)
  - Mevcut CommandPalette groups'ları silme (Pages, Symbols, Commands preserved)
  - Mevcut Cmd+K listener'ı değiştirme
  - Mevcut `open-command-palette` CustomEvent handler'ı değiştirme
  - Yeni edge function çağrısı EKLEME (sadece supabase read query)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Sadece 1 dosyaya ekleme (Recent Trades group + state + query). Mevcut structure preserved.
  - **Skills**: []
    - No special skill needed.

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 6)
  - **Parallel Group**: Wave 4 (with Task 6)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 1 (tokens), user sequence requires Tasks 4-5 done first

  **References**:

  **Pattern References**:
  - `src/components/CommandPalette.tsx:1-125` — FULL existing file (PRESERVE structure, ADD Recent Trades group)
  - `src/components/CommandPalette.tsx:7` — `supabase` import (ALREADY imported, use for trades query)
  - `src/components/CommandPalette.tsx:18` — `useNavigate` (ALREADY imported, `go()` helper uses it)
  - `src/components/CommandPalette.tsx:28-46` — Cmd+K + `/` listener (FROZEN — DOKUNMA)
  - `src/components/CommandPalette.tsx:48-51` — `go()` helper (PRESERVE — use for trade navigation)
  - `src/components/CommandPalette.tsx:79-91` — Symbols group (PRESERVE — add Recent Trades AFTER)
  - `src/components/CommandPalette.tsx:95-102` — Pages group (PRESERVE)
  - `src/components/CommandPalette.tsx:106-121` — Commands group (PRESERVE)

  **API/Type References**:
  - `src/integrations/supabase/types.ts:841` — TradeRow: `{id, symbol, side, quantity, price, executed_at, ...}`. Select: `id,symbol,side,quantity,price,executed_at`
  - `src/components/ui/badge.tsx` — Badge (variant="outline")
  - `src/components/ui/command.tsx` — CommandGroup, CommandItem (ALREADY used in file)

  **Test References**:
  - `src/components/CommandPalette.tsx:79-91` — Existing Symbols group pattern (follow same CommandGroup + CommandItem structure)

  **External References**:
  - cmdk CommandGroup: https://cmdk.paco.me/docs/command-group — heading prop

  **WHY Each Reference Matters**:
  - Lines 28-46: Cmd+K listener FROZEN. Self-contained. useKeyboardShortcuts.ts NOT involved.
  - Line 7: supabase ALREADY imported. No new import needed (except Badge).
  - Line 48: `go()` helper ALREADY exists. Use for navigation: `go('/?symbol=...')`.
  - TradeRow: Select only needed fields (id, symbol, side, quantity, price, executed_at). RLS auto-filters by user_id.
  - Existing groups: PRESERVE all. Only ADD new group. No deletion.

  **Acceptance Criteria**:

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Cmd+K opens palette with Recent Trades group
    Tool: Playwright (playwright skill)
    Preconditions: Dev server running, user logged in, user has at least 1 trade history
    Steps:
      1. Navigate to `http://localhost:5173/`
      2. Press Cmd+K (Meta+k or Ctrl+k)
      3. Verify CommandPalette dialog opens
      4. Verify 4 groups visible: Pages, Symbols, Recent Trades, Commands
      5. Verify Recent Trades shows up to 5 trades with symbol + side badge + qty @ price + date
      6. Screenshot
    Expected Result: Palette opens with Recent Trades group showing trade history
    Failure Indicators: No Recent Trades group, palette doesn't open, empty group
    Evidence: .omo/evidence/task-7-command-palette.png

  Scenario: Selecting a trade navigates to that symbol
    Tool: Playwright (playwright skill)
    Preconditions: Palette open with trades visible
    Steps:
      1. Press Cmd+K to open palette
      2. Type a symbol name from Recent Trades (e.g., "BTC")
      3. Verify Recent Trades filters to matching trades
      4. Press Enter on a trade item
      5. Verify palette closes
      6. Verify URL changed to `/?symbol=[SELECTED_SYMBOL]`
      7. Verify dashboard shows the selected symbol's chart
    Expected Result: Selecting trade navigates to symbol page
    Failure Indicators: No navigation, URL doesn't change, wrong symbol
    Evidence: .omo/evidence/task-7-trade-navigation.png

  Scenario: Recent Trades hidden when no trades exist
    Tool: Playwright (playwright skill)
    Preconditions: User with NO trade history (fresh account)
    Steps:
      1. Press Cmd+K
      2. Verify palette opens
      3. Verify Recent Trades group NOT visible (no heading, no items)
      4. Verify Pages, Symbols, Commands groups still visible
    Expected Result: Recent Trades group absent when no trades
    Failure Indicators: Empty group heading visible, "No results" inside group
    Evidence: .omo/evidence/task-7-no-trades.png

  Scenario: Existing palette groups preserved
    Tool: Bash (grep)
    Preconditions: CommandPalette.tsx updated
    Steps:
      1. `grep "Cmd\|Ctrl" src/components/CommandPalette.tsx` — expect match (Cmd+K listener preserved)
      2. `grep "useNavigate" src/components/CommandPalette.tsx` — expect match
      3. `grep "open-command-palette" src/components/CommandPalette.tsx` — expect match (CustomEvent preserved)
      4. `grep "SYMBOLS" src/components/CommandPalette.tsx` — expect match (Symbols group preserved)
      5. `grep "CommandGroup" src/components/CommandPalette.tsx` — expect ≥4 (Pages + Symbols + Recent Trades + Commands)
      6. `grep "trades" src/components/CommandPalette.tsx` — expect match (new query)
    Expected Result: All existing groups + new Recent Trades group
    Failure Indicators: Missing groups, missing listener
    Evidence: .omo/evidence/task-7-groups-preserved.txt
  ```

  **Commit**: YES
  - Message: `feat(command-palette): add Recent Trades group`
  - Files: `src/components/CommandPalette.tsx`
  - Pre-commit: `npm run build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Plan Compliance Audit** — `oracle` (APPROVE — all 11 Must Have categories present, all 7 red-line paths CLEAN)
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check CSS variable, check component). For each "Must NOT Have": search codebase for forbidden patterns (grep supabase/ changes, grep hook modifications) — reject with file:line if found. Check evidence files exist in .omo/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high` (APPROVE — build pass, 0 as any, all imports present, all files <500 lines)
  Run `npm run build` and `npm run lint`. Check exit codes. Review all 9 changed files for: type suppression, empty catches, debug logging, unused imports, AI slop (excessive comments, over-abstraction, generic names). Verify all original imports preserved. Verify no hook logic changed. Verify no edge function payload changed.
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill) (APPROVE — 7 scenarios passed, 7 screenshots in .omo/evidence/final-qa/, e2e/final-qa.spec.ts created)
  Start dev server (`npm run dev`). Use Playwright to: navigate to dashboard, verify SymbolList renders with 52px rows + sparkline + font-price, click a symbol, verify ChartPanel stat bar appears, click timeframe chip, verify chart updates, navigate to OrderTicket, verify preset buttons + Long/Short toggle + Collapsible, check OpenPositions P&L animation, check AccountAIPanel signal cards, press Cmd+K, verify CommandPalette with Recent Trades. Screenshot each. Save to `.omo/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep` (APPROVE — only 9 expected files changed, all 8 red-line paths CLEAN)
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance — verify NO changes to: supabase/, src/hooks/, src/contexts/AppContext.tsx, src/integrations/supabase/, src/lib/, useKeyboardShortcuts.ts, App.tsx. Check TradingViewChart.tsx change is ONLY interval prop (no widget code change). Check CommandPalette.tsx change is ONLY Recent Trades group addition.
  Output: `Tasks [N/N compliant] | Red Lines [CLEAN/N violations] | VERDICT`

---

## Commit Strategy

- **1**: `feat(design): add trading UX tokens — color-up/down, surface, font-price, tick-flash` - src/index.css, tailwind.config.ts
- **2**: `feat(symbol-list): add sparkline, tick flash, font-price rows` - src/components/trading/SymbolList.tsx
- **3**: `feat(chart-panel): add stat bar + timeframe chips` - src/components/trading/ChartPanel.tsx, src/components/TradingViewChart.tsx
- **4**: `feat(order-ticket): add presets, risk badge, Long/Short toggle, Collapsible TP/SL` - src/components/trading/OrderTicket.tsx
- **5**: `feat(open-positions): add P&L animation, mini bar, empty state` - src/components/trading/OpenPositionsPanel.tsx
- **6**: `feat(ai-panel): add signal cards, typing animation, sliding tabs, Cmd+Enter` - src/components/trading/AccountAIPanel.tsx
- **7**: `feat(command-palette): add Recent Trades group` - src/components/CommandPalette.tsx

---

## Success Criteria

### Verification Commands
```bash
npm run build  # Expected: 0 errors, build successful
npm run lint   # Expected: 0 errors (warnings OK)
```

### Final Checklist
- [ ] All "Must Have" present (CSS variables in 3 themes, .font-price, @keyframes, 5 component restyles, CommandPalette Recent Trades)
- [ ] All "Must NOT Have" absent (NO changes to supabase/, hooks/, contexts/, integrations/, lib/, useKeyboardShortcuts.ts, App.tsx)
- [ ] `npm run build` passes
- [ ] `npm run lint` passes
- [ ] All original imports preserved in 5 trading components
- [ ] All edge function calls preserved (same function names, same payloads)
- [ ] All Supabase queries preserved
- [ ] All Realtime subscriptions preserved
- [ ] TradingViewChart change is ONLY interval prop (widget CDN code untouched)
- [ ] CommandPalette change is ONLY Recent Trades group (existing groups untouched)
