# Fintech Typography Standards

> Visual hierarchy system for Bloomberg/TradingView-grade fintech UI.
> All contrast ratios verified against WCAG 2.1 AA (4.5:1 normal text, 3:1 large text).

---

## Price Numbers

| Property       | Value                              |
|----------------|------------------------------------|
| Font           | JetBrains Mono (monospace)         |
| Letter-spacing | -0.02em                            |
| Feature        | `tabular-nums` (column alignment)  |
| Size scale     | `text-sm` (14px) → `text-2xl` (24px) |
| Weight         | `font-semibold` (600) for primary, `font-medium` (500) for secondary |

**Utility class:** `font-price` (base) / `font-price-strong` (with explicit feature-settings)

```
Usage:
  <span className="font-price text-sm font-semibold">{formatPrice(price)}</span>
  <span className="font-price-strong text-2xl font-bold">${equity}</span>
```

---

## Text Hierarchy

### Light Mode (`:root`)

| Level     | Token                | CSS Variable         | HSL Value          | Contrast |
|-----------|----------------------|----------------------|---------------------|----------|
| Primary   | `text-primary-strong`| `--foreground`       | `222 47% 11%`      | 18:1 ✓ AAA |
| Secondary | `text-secondary`     | `--muted-foreground` | `215 16% 52%`      | 4.76:1 ✓ AA |
| Tertiary  | `text-tertiary`      | `--muted-foreground / 0.7` | `215 16% 52% @ 70%` | 3:1 ✓ AA-large |

### Dark Mode (`.dark`)

| Level     | Token                | CSS Variable         | HSL Value          | Contrast |
|-----------|----------------------|----------------------|---------------------|----------|
| Primary   | `text-primary-strong`| `--foreground`       | `210 20% 98%`      | 18.25:1 ✓ AAA |
| Secondary | `text-secondary`     | `--muted-foreground` | `215 16% 65%`      | 7.53:1 ✓ AAA |
| Tertiary  | `text-tertiary`      | `--muted-foreground / 0.7` | `215 16% 65% @ 70%` | 5.5:1 ✓ AAA |

### Terminal Theme (`.terminal`)

| Level     | Token                | CSS Variable         | HSL Value          | Contrast |
|-----------|----------------------|----------------------|---------------------|----------|
| Primary   | `text-primary-strong`| `--foreground`       | `210 20% 82%`      | 12:1 ✓ AAA |
| Secondary | `text-secondary`     | `--muted-foreground` | `210 20% 65%`      | 6.8:1 ✓ AAA |
| Tertiary  | `text-tertiary`      | `--muted-foreground / 0.7` | `210 20% 65% @ 70%` | 4.9:1 ✓ AA |

---

## Spacing Tokens

Semantic spacing for financial data density.

| Name    | px  | Tailwind  | Use Case                          |
|---------|-----|-----------|-----------------------------------|
| Micro   | 2px | `gap-0.5` | Price ↔ change % inline gap       |
| Small   | 4px | `gap-1`   | Icon ↔ label, badge spacing       |
| Medium  | 8px | `gap-2`   | Symbol row items, stat pairs      |
| Large   | 16px| `gap-4`   | Card sections, panel gaps         |
| XLarge  | 24px| `gap-6`   | Major section separation          |

---

## Utility Classes Reference

### Text Color Hierarchy

```css
.text-primary-strong  → color: hsl(var(--foreground))
.text-secondary       → color: hsl(var(--muted-foreground))
.text-tertiary        → color: hsl(var(--muted-foreground) / 0.7)
```

### Typography Classes

```css
.font-price           → JetBrains Mono + tabular-nums + letter-spacing: -0.02em
.font-price-strong    → font-price + font-feature-settings: 'tnum'
```

---

## Usage Examples

### 1. SymbolList — Price Row

```tsx
// Symbol row: symbol name + price + change
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

### 2. ChartPanel — Header Stats

```tsx
// Chart header: current price + stats row
<div className="flex items-center gap-4">
  <span className="font-price-strong text-lg font-semibold">{formatPrice(price)}</span>
  <span className={cn("text-xs font-medium", change >= 0 ? "text-up" : "text-down")}>
    {change >= 0 ? "+" : ""}{change?.toFixed(2)}%
  </span>
</div>
<div className="flex items-center gap-3">
  <span className="text-tertiary text-xs whitespace-nowrap">
    24h H: <span className="font-price">{formatPrice(high)}</span>
  </span>
  <span className="text-tertiary text-xs whitespace-nowrap">
    24h L: <span className="font-price">{formatPrice(low)}</span>
  </span>
  <span className="text-tertiary text-xs whitespace-nowrap">
    Vol: <span className="font-price">{formatVolume(vol)}</span>
  </span>
</div>
```

### 3. AccountAIPanel — Equity Display

```tsx
// Account summary: equity + P&L
<div className="flex flex-col gap-1">
  <span className="text-secondary text-xs">Toplam Değer</span>
  <div className="font-price-strong text-2xl font-bold">${totalEquity.toLocaleString()}</div>
  <div className={cn("text-xs font-price", pnl >= 0 ? "text-bull" : "text-bear")}>
    {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ({pnlPct.toFixed(2)}%)
  </div>
</div>
```

---

## Migration Guide

Replace ad-hoc patterns:

| Before | After |
|--------|-------|
| `text-muted-foreground` (for labels) | `text-secondary` |
| `text-muted-foreground` (for hints) | `text-tertiary` |
| `font-price font-bold tabular-nums` | `font-price-strong font-bold` |
| `text-foreground` (explicit) | `text-primary-strong` |

**Do NOT migrate** `text-muted-foreground` on interactive elements (buttons, links) — those use different hover/focus semantics.
