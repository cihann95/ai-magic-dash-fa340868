# Lumen Trade Design System

> Developer reference for tokens, components, conventions, and migration history.
> React 18 + TypeScript + Tailwind + shadcn/ui.

---

## 1. Color Tokens

### Light (`:root`)

| Token | CSS Variable | HSL |
|---|---|---|
| Background | `--background` | `0 0% 100%` |
| Foreground (primary text) | `--foreground` | `222 47% 11%` |
| Card | `--card` | `0 0% 100%` |
| Card foreground | `--card-foreground` | `222 47% 11%` |
| Primary | `--primary` | `250 95% 64%` |
| Primary glow | `--primary-glow` | `270 95% 70%` |
| Muted foreground (secondary text) | `--muted-foreground` | `215 16% 52%` |
| Bull (up) | `--bull` | `142 80% 38%` |
| Bear (down) | `--bear` | `0 84% 60%` |
| Destructive | `--destructive` | `0 84% 60%` |
| Border | `--border` | `214 32% 91%` |
| Ring (focus) | `--ring` | `250 95% 64%` |
| Radius | `--radius` | `0.875rem` |

**Gradients (light):**
- `--gradient-primary`: `linear-gradient(135deg, hsl(250 95% 64%), hsl(270 95% 70%))`
- `--gradient-bull`: `linear-gradient(135deg, hsl(142 80% 38%), hsl(160 84% 39%))`
- `--gradient-bear`: `linear-gradient(135deg, hsl(0 84% 60%), hsl(340 82% 52%))`
- `--gradient-surface`: `linear-gradient(180deg, hsl(0 0% 100% / 0.6), hsl(0 0% 100% / 0.2))`

**Shadows (light):**
- `--shadow-glow`: `0 0 40px hsl(250 95% 64% / 0.3)`
- `--shadow-elegant`: `0 10px 40px -10px hsl(222 47% 11% / 0.15)`
- `--shadow-card`: `0 1px 3px hsl(222 47% 11% / 0.05), 0 4px 16px hsl(222 47% 11% / 0.04)`

### Dark (`.dark`)

| Token | HSL |
|---|---|
| `--background` | `230 25% 7%` |
| `--foreground` | `210 20% 98%` |
| `--card` | `230 22% 10%` |
| `--primary` | `255 92% 70%` |
| `--primary-glow` | `275 92% 75%` |
| `--muted-foreground` | `215 16% 65%` |
| `--bull` | `142 76% 50%` |
| `--bear` | `0 84% 62%` |
| `--border` | `230 18% 18%` |
| `--ring` | `255 92% 70%` |
| `--radius` | `0.875rem` |

**Shadows (dark):**
- `--shadow-glow`: `0 0 60px hsl(255 92% 70% / 0.35)`
- `--shadow-elegant`: `0 20px 60px -20px hsl(0 0% 0% / 0.6)`
- `--shadow-card`: `0 1px 0 hsl(0 0% 100% / 0.04) inset, 0 8px 32px hsl(0 0% 0% / 0.4)`

### Terminal (`.terminal`)

| Token | HSL |
|---|---|
| `--background` | `220 30% 7%` |
| `--foreground` | `210 20% 82%` |
| `--primary` | `212 100% 67%` |
| `--primary-glow` | `212 100% 75%` |
| `--muted-foreground` | `210 20% 65%` |
| `--bull` | `137 49% 47%` |
| `--bear` | `356 92% 63%` |
| `--border` | `213 7% 21%` |
| `--ring` | `212 100% 67%` |
| `--radius` | `0.625rem` |

### Shared Utility Tokens

| Token | Purpose |
|---|---|
| `--color-up` | Alias for `--bull` |
| `--color-down` | Alias for `--bear` |
| `--color-neutral` | `220 10% 50%` (light) / `220 10% 55%` (dark) / `180 10% 50%` (terminal) |
| `--success` | Same as `--bull` |
| `--warning` | `38 92% 50%` |
| `--danger` | Same as `--bear` |
| `--color-surface-1/2/3` | Surface elevation (1=lightest) |
| `--color-border-subtle` | Subtle border for cards |
| `--transition-tick` | `120ms ease-out` (price tick flash) |
| `--transition-panel` | `200ms ease` (panel transitions) |

### CSS Utility Classes

```css
.text-primary-strong { color: hsl(var(--foreground)); }
.text-secondary      { color: hsl(var(--muted-foreground)); }
.text-tertiary       { color: hsl(var(--muted-foreground) / 0.7); }

/* Background utilities */
.glass              { background: var(--gradient-surface); backdrop-filter: blur(16px) saturate(140%); }
.mesh-bg            { background: var(--gradient-mesh); }
.gradient-primary   { background: var(--gradient-primary); }
.gradient-bull      { background: var(--gradient-bull); }
.gradient-bear      { background: var(--gradient-bear); }
.text-gradient      { background: var(--gradient-primary); -webkit-background-clip: text; background-clip: text; color: transparent; }
.shadow-glow        { box-shadow: var(--shadow-glow); }
.shadow-elegant     { box-shadow: var(--shadow-elegant); }
.shadow-card        { box-shadow: var(--shadow-card); }
```

**Rule:** Use semantic `bull`/`bear` only. No `text-green-400`, `bg-red-950`, etc.

---

## 2. Typography

### Font Stack

| Usage | Font | CSS |
|---|---|---|
| UI (sans) | **Inter** (400, 500, 600, 700, 800) | `font-family: 'Inter', system-ui, sans-serif` |
| Mono (code) | **JetBrains Mono** (400, 500, 600) | `.font-mono` |
| Price numbers | **JetBrains Mono** tabular | `.font-price` |

### Price Number Format

```css
.font-price {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.font-price-strong {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-feature-settings: 'tnum';
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
```

| Size | Class | Use |
|---|---|---|
| 14px | `text-sm font-semibold` | Primary price display |
| 24px | `text-2xl font-bold .font-price-strong` | Equity / large numbers |

### Text Hierarchy

| Level | Light | Dark | Terminal | Contrast |
|---|---|---|---|---|
| Primary | `text-primary-strong` | `hsl(222 47% 11%)` | `hsl(210 20% 98%)` | `hsl(210 20% 82%)` | 18:1+ AAA |
| Secondary | `text-secondary` | `hsl(215 16% 52%)` | `hsl(215 16% 65%)` | `hsl(210 20% 65%)` | 4.76:1+ AA |
| Tertiary | `text-tertiary` | `hsl(215 16% 52% / 0.7)` | `hsl(215 16% 65% / 0.7)` | `hsl(210 20% 65% / 0.7)` | 3:1+ AA-large |

### Spacing Tokens

| Name | px | Tailwind | Use |
|---|---|---|---|
| Micro | 2px | `gap-0.5` | Price ⇔ change % inline gap |
| Small | 4px | `gap-1` | Icon ⇔ label, badge spacing |
| Medium | 8px | `gap-2` | Symbol row items, stat pairs |
| Large | 16px | `gap-4` | Card sections, panel gaps |
| XLarge | 24px | `gap-6` | Major section separation |

### Migration (from ad-hoc to semantic)

| Before | After |
|---|---|
| `text-muted-foreground` (labels) | `text-secondary` |
| `text-muted-foreground` (hints) | `text-tertiary` |
| `font-price font-bold tabular-nums` | `font-price-strong font-bold` |
| `text-foreground` (explicit) | `text-primary-strong` |
| `text-[10px]` / `text-[11px]` | `text-xs` or `text-sm` |
| `text-green-400` / `bg-red-950` | `text-bull` / `bg-bear/15` |

> Do **not** migrate `text-muted-foreground` on interactive elements (buttons, links) — those use different hover/focus semantics.

---

## 3. Components & Conventions

### shadcn/ui Primitives

40+ components in `src/components/ui/`. Radix-based, CVA variants, Tailwind styled. Key ones:

| Component | File | Notes |
|---|---|---|
| Button | `button.tsx` | Variants: default, destructive, outline, secondary, ghost, link. Focus-visible ring. |
| Card | `card.tsx` | Header, content, footer sub-components. Use with `.shadow-card` or `.glass`. |
| Dialog | `dialog.tsx` | Radix Dialog. IntentDialog custom wrapper. |
| Badge | `badge.tsx` | Variants: default, secondary, outline, destructive. Used for signal badges. |
| Tabs | `tabs.tsx` | Radix Tabs. Used in dashboard right panel (Positions/AI). |
| Sheet | `sheet.tsx` | Drawer panel. Vaul for mobile bottom sheets. |

### Custom Component Patterns

#### Glass Panel
```tsx
<div className="glass rounded-xl border border-border/40 shadow-card">
```

#### Gradient Primary Button
```tsx
<Button className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow">
```

#### Price Row
```tsx
<button className="flex items-center justify-between py-2 px-3">
  <div className="flex flex-col gap-0.5">
    <span className="text-primary-strong text-sm font-semibold">{symbol}</span>
    <span className="text-tertiary text-xs">{name}</span>
  </div>
  <div className="text-right">
    <div className="font-price text-sm font-semibold">{formatPrice(price)}</div>
    <div className={cn("text-xs font-price", change >= 0 ? "text-up" : "text-down")}>
      {change >= 0 ? "+" : ""}{change.toFixed(2)}%
    </div>
  </div>
</button>
```

#### Animated Price Tick
- Up flash: `animate-[tick-flash-up_120ms_ease-out]`
- Down flash: `animate-[tick-flash-down_120ms_ease-out]`

#### BullBearIcon
```tsx
// Semantic up/down indicator. Use instead of ad-hoc arrows.
<BullBearIcon value={change} /> // up → green ▲, down → red ▼
```

### Animations

| Animation | Duration | Use |
|---|---|---|
| `tick-flash-up` | 120ms | Price increase flash |
| `tick-flash-down` | 120ms | Price decrease flash |
| `float-up` | — | Floating particles (confetti-like) |
| `pulse-dots` | 1.4s | Typing indicator (legacy, use skeleton instead) |
| Framer Motion | 200ms | Panel transitions, AnimatedNumber |

### AI Terminology Conventions

Replace hardcoded "AI" labels with human-centric names:

| Before | After |
|---|---|
| "AI Analysis" | "Market Insights" |
| "AI Chat" | "Research Assistant" |
| "AI Strategy" | "Portfolio Review" |
| "AI Coach" | "Trading Mentor" |
| `Badge>AI` | Remove badge, use `text-xs text-muted-foreground` "Analyst insight" |
| `<Sparkles />` icon | `<Activity />` or neutral icon |
| TypingDots animation | Skeleton loader (`.animate-pulse`) |

**Rule:** No hardcoded "AI" in visible UI. System prompts use conversational tone. Use first-person ("I'd watch the $65k level").

### Accessibility

- WCAG 2.1 AA minimum (AAA where feasible)
- Focus-visible ring: `focus-visible:ring-2 focus-visible:ring-ring`
- Touch targets ≥48px (slider thumb, buttons)
- Semantic color only (`text-up`/`text-down`) — never rely on color alone
- ARIA labels on all icon-only buttons
- `font-price` with tabular-nums for price column alignment

---

## 4. Migration Notes

### Recent (June 2026)

#### Bull/Bear Semantic Colors
- Replaced hardcoded `text-green-400` / `text-red-500` with `text-bull` / `text-bear`
- Replaced `bg-green-950/60` / `bg-red-950/60` with `bg-bull/15` / `bg-bear/15`
- Gradient variants: `gradient-bull`, `gradient-bear`
- Reason: Theme consistency, dark/terminal mode compatibility

#### Lazy Loading (Bundle Optimization)
- **Recharts**: Removed from initial bundle (112KB gzip → 0KB). Loaded on-demand in Portfolio + AdminBlitz via `React.lazy()` wrapper components.
- **canvas-confetti**: Dynamic import only on win condition (`import('canvas-confetti')`).
- **vendor-charts** manual chunk removed from `vite.config.ts`.
- **Build time**: 52s → 40.88s (-21.4%).
- **Initial load**: ~478KB → ~366KB gzip (-23.4%).

#### Type Scale Enforcement
- Banished `text-[10px]`, `text-[11px]` — use `text-xs` (12px) or `text-sm` (14px).
- Typography hierarchy: `text-primary-strong` > `text-secondary` > `text-tertiary`.

#### Touch Targets (Mobile)
- Slider thumb increased to 48px min.
- Bottom nav for mobile, tabs for right panel.
- IntentDialog full-screen on mobile (Sheet pattern).

#### AI Masking
- Badge>AI removed from SignalCard.
- Tab labels: "AI" → "Insights", "Chat" → "Research".
- Streaming dots → skeleton placeholders.
- Random 200-400ms delay for "human-like" feel.

### Pending (Not Done Yet)

- `npm audit fix` — 20 vulnerabilities (2 critical, 11 high). vitest 3.2.4 → 3.2.6+, react-router 6.30.1 → 6.30.4+.
- Font self-hosting (Google Fonts adds latency, 8 font files).
- React 19 + React Router v7 migration (waiting for ecosystem).
- Supabase channel pooling (multiple subscriptions without cleanup).
- Zustand for state (replace CustomEvent).
- Spacing token enforcement (some panels still use raw p-3/px-3).

---

## 5. Quick Reference

### File Map

| Path | Purpose |
|---|---|
| `src/index.css` | CSS variables, utility classes, animations (232 lines) |
| `tailwind.config.ts` | Tailwind theme extension (130 lines) |
| `src/components/ui/` | 40+ shadcn/ui primitives |
| `src/components/trading/` | ChartPanel, AccountAIPanel, IntentDialog |
| `src/styles/typography-standards.md` | Typography docs (reference) |
| `src/styles/DESIGN_SYSTEM.md` | **This file** |

### Build Stats (Post-optimization)

| Metric | Value |
|---|---|
| Initial load (gzip) | ~332 KB |
| vendor-ui (Radix + Framer) | 133 KB gzip |
| vendor-supabase | 52 KB gzip |
| index.js (app shell) | 145 KB gzip |
| CSS | 15 KB gzip |
| Lazy chart chunks | ~122 KB gzip (on-demand) |
| Build time | 40.88s |
| Routes lazy-loaded | 19/21 |
| TypeScript files | 181 |
| Components | 87 |

### Key Constraints

- **No hardcoded colors** — use CSS variables or semantic Tailwind classes (`text-bull`, `bg-card`, `border-border`)
- **No "AI" in visible UI** — use "Insights", "Analyst", "Research Assistant"
- **No inline styles** — use Tailwind, shadcn variants, or CSS variables
- **All pages lazy-loaded** via `React.lazy()` in `App.tsx`
- **Accessibility:** focus-visible on all interactive elements, min 48px touch targets
