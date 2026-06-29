import { useState, useEffect } from "react";
import { useLivePrice } from "@/hooks/useLivePrices";
import { SymbolDef, formatPrice } from "@/lib/symbols";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import BullBearIcon from "@/components/ui/BullBearIcon";
import { TrendingUp, TrendingDown, BarChart3, Activity } from "lucide-react";

interface Props {
  symbol: SymbolDef;
}

export default function MarketOverview({ symbol }: Props) {
  const { lang } = useApp();
  const lp = useLivePrice(symbol.symbol);
  const [volume24h, setVolume24h] = useState<number | null>(null);

  useEffect(() => {
    if (!symbol?.symbol) return;
    supabase
      .from("price_cache")
      .select("volume_24h")
      .eq("symbol", symbol.symbol)
      .single()
      .then(({ data }) => setVolume24h(data?.volume_24h ?? null));
  }, [symbol?.symbol]);

  const change = lp?.change_pct_24h ?? null;
  const isPositive = change !== null && change >= 0;

  const stats = [
    {
      label: lang === "tr" ? "24s Yüksek" : "24h High",
      value: lp?.high_24h != null ? formatPrice(lp.high_24h) : "—",
      icon: TrendingUp,
      color: "text-up",
    },
    {
      label: lang === "tr" ? "24s Düşük" : "24h Low",
      value: lp?.low_24h != null ? formatPrice(lp.low_24h) : "—",
      icon: TrendingDown,
      color: "text-down",
    },
    {
      label: lang === "tr" ? "Hacim" : "Volume",
      value: volume24h != null ? formatPrice(volume24h) : "—",
      icon: BarChart3,
      color: "text-foreground",
    },
    {
      label: lang === "tr" ? "Değişim" : "Change",
      value: change !== null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—",
      icon: Activity,
      color: isPositive ? "text-up" : "text-down",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2" aria-label="Market overview">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={cn(
            "flex flex-col items-center gap-1 p-3 rounded-lg",
            "bg-surface-1/50 border border-border/30"
          )}
        >
          <stat.icon className={cn("size-4", stat.color)} />
          <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
            {stat.label}
          </span>
          <span className={cn("font-price text-sm font-semibold inline-flex items-center gap-0.5", stat.color)}>
            {stat.label === (lang === "tr" ? "Değişim" : "Change") && (
              <BullBearIcon type={isPositive ? "bull" : change !== null ? "bear" : "neutral"} size="xs" />
            )}
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}
