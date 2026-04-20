// Heatmap - tüm semboller kare grid, renk = % değişim, boyut = volume veya equal
import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useApp } from "@/contexts/AppContext";
import { SYMBOLS, ASSET_LABELS, AssetClass, formatPrice, isStale } from "@/lib/symbols";
import { useLivePrices } from "@/hooks/useLivePrices";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CATS: (AssetClass | "all")[] = ["all", "crypto", "stocks", "forex", "commodities", "indices", "etf"];

function colorFor(pct: number): string {
  // -10% → koyu bear, 0 → muted, +10% → koyu bull
  const clamped = Math.max(-10, Math.min(10, pct));
  const intensity = Math.abs(clamped) / 10; // 0..1
  if (clamped > 0.1) {
    // bull: hsl(142, 76%, 36% to 26%)
    const lightness = 36 - intensity * 12;
    return `hsl(142, 76%, ${lightness}%)`;
  } else if (clamped < -0.1) {
    const lightness = 50 - intensity * 16;
    return `hsl(0, 84%, ${lightness}%)`;
  }
  return `hsl(var(--muted))`;
}

function HeatmapInner() {
  const { lang } = useApp();
  const navigate = useNavigate();
  const [cat, setCat] = useState<AssetClass | "all">("all");
  const livePrices = useLivePrices(SYMBOLS.map((s) => s.symbol));

  const filtered = useMemo(
    () => SYMBOLS.filter((s) => cat === "all" || s.asset_class === cat),
    [cat]
  );

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">{lang === "tr" ? "Piyasa Isı Haritası" : "Market Heatmap"}</h1>
            <p className="text-sm text-muted-foreground">
              {lang === "tr" ? "Renk yoğunluğu = 24s % değişim. Bir karenin üzerine tıkla işleme git." : "Color intensity = 24h % change. Click a tile to trade."}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {CATS.map((c) => (
              <Button
                key={c}
                variant={cat === c ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setCat(c)}
                className={cn("text-xs whitespace-nowrap", cat === c && "bg-primary/15 text-primary hover:bg-primary/20")}
              >
                {c === "all" ? (lang === "tr" ? "Tümü" : "All") : ASSET_LABELS[c][lang]}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
          {filtered.map((s) => {
            const lp = livePrices[s.symbol];
            const pct = lp?.change_pct_24h ?? 0;
            const bg = lp ? colorFor(pct) : "hsl(var(--muted))";
            const stale = isStale(lp?.updated_at);
            return (
              <button
                key={s.symbol}
                onClick={() => navigate(`/?symbol=${s.symbol}`)}
                style={{ backgroundColor: bg }}
                className={cn(
                  "aspect-square rounded-xl p-2 sm:p-3 text-left transition-all hover:scale-[1.03] hover:shadow-glow",
                  "flex flex-col justify-between min-h-[80px] border border-border/20",
                  "text-white relative overflow-hidden"
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="font-bold text-xs sm:text-sm truncate drop-shadow">{s.symbol}</div>
                  {stale && <span className="text-[8px] opacity-70 shrink-0">⏱</span>}
                </div>
                <div>
                  <div className="font-mono text-[10px] sm:text-xs font-semibold opacity-90 truncate">
                    {formatPrice(lp?.price)}
                  </div>
                  <div className="font-mono text-[10px] sm:text-xs font-bold drop-shadow">
                    {pct >= 0 ? "+" : ""}{pct.toFixed(2)}%
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
          <div className="flex items-center gap-1.5"><span className="size-3 rounded" style={{ backgroundColor: "hsl(142, 76%, 24%)" }} /> +10%</div>
          <div className="flex items-center gap-1.5"><span className="size-3 rounded" style={{ backgroundColor: "hsl(142, 76%, 36%)" }} /> +0%</div>
          <div className="flex items-center gap-1.5"><span className="size-3 rounded bg-muted" /> 0%</div>
          <div className="flex items-center gap-1.5"><span className="size-3 rounded" style={{ backgroundColor: "hsl(0, 84%, 50%)" }} /> -0%</div>
          <div className="flex items-center gap-1.5"><span className="size-3 rounded" style={{ backgroundColor: "hsl(0, 84%, 34%)" }} /> -10%</div>
        </div>
      </div>
    </AppShell>
  );
}

export default function Heatmap() {
  return <ProtectedRoute><HeatmapInner /></ProtectedRoute>;
}
