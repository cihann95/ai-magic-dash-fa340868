import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Star, StarOff } from "lucide-react";
import { ASSET_LABELS, AssetClass, formatPrice, SymbolDef, SYMBOLS } from "@/lib/symbols";
import { useLivePrices } from "@/hooks/useLivePrices";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import BullBearIcon from "@/components/ui/BullBearIcon";

interface Props {
  active: SymbolDef;
  onSelect: (s: SymbolDef) => void;
}

const CATS: (AssetClass | "all")[] = ["all", "crypto", "stocks", "forex", "commodities", "indices", "etf"];

export default function SymbolList({ active, onSelect }: Props) {
  const { lang, user } = useApp();
  const tr = t(lang);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<AssetClass | "all">("all");
  const [watch, setWatch] = useState<Set<string>>(new Set());
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [pricesLoading, setPricesLoading] = useState(true);
  const livePrices = useLivePrices(SYMBOLS.map((s) => s.symbol));

  useEffect(() => {
    // Wait for initial prices to load
    const timer = setTimeout(() => setPricesLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase.from("watchlist").select("symbol").eq("user_id", user.id).then(({ data }) => {
      if (data) setWatch(new Set(data.map((d) => d.symbol)));
    });
  }, [user]);

  const filtered = useMemo(() => {
    return SYMBOLS.filter((s) => (cat === "all" || s.asset_class === cat) &&
      (q === "" || s.symbol.toLowerCase().includes(q.toLowerCase()) || s.name.toLowerCase().includes(q.toLowerCase()))
    );
  }, [q, cat]);

  // Tick flash detection
  const prevPricesRef = useRef<Record<string, number>>({});
  const getFlashClass = (sym: string, currentPrice: number | null): string => {
    if (currentPrice == null) return "";
    const prev = prevPricesRef.current[sym];
    prevPricesRef.current[sym] = currentPrice;
    if (prev == null || prev === currentPrice) return "";
    return currentPrice > prev ? "animate-tick-flash-up" : "animate-tick-flash-down";
  };

  const toggleWatch = async (s: SymbolDef, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return toast({ title: tr.error, description: tr.signin });
    if (watch.has(s.symbol)) {
      await supabase.from("watchlist").delete().eq("user_id", user.id).eq("symbol", s.symbol);
      const next = new Set(watch); next.delete(s.symbol); setWatch(next);
    } else {
      await supabase.from("watchlist").insert({ user_id: user.id, symbol: s.symbol, asset_class: s.asset_class, display_name: s.name });
      setWatch(new Set(watch).add(s.symbol));
    }
  };

  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && highlightedIndex >= 0 && highlightedIndex < filtered.length) {
      e.preventDefault();
      onSelect(filtered[highlightedIndex]);
    }
  };

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[role="option"]');
      items[highlightedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  return (
    <div className="flex flex-col h-full" aria-label="Symbol list">
      <div className="p-3 space-y-2 border-b border-border/40">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.search_symbols} className="pl-9 bg-background/50" />
        </div>
        <div className="flex flex-wrap gap-1 pb-1">
          {CATS.map((c) => (
            <Button key={c} variant={cat === c ? "secondary" : "ghost"} size="sm"
              onClick={() => setCat(c)}
              className={cn("text-xs whitespace-nowrap shrink-0", cat === c && "bg-primary/15 text-primary hover:bg-primary/20")}>
              {c === "all" ? tr.cat_all : ASSET_LABELS[c][lang]}
            </Button>
          ))}
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto scrollbar-thin" role="listbox" tabIndex={0} onKeyDown={handleKeyDown}>
        {filtered.map((s, idx) => {
          const lp = livePrices[s.symbol];
          const price = lp?.price ?? null;
          const change = lp?.change_pct_24h ?? null;
          const isActive = active.symbol === s.symbol;
          const watched = watch.has(s.symbol);
          const flashClass = getFlashClass(s.symbol, price);
          const showSkeleton = pricesLoading && price === null;
          
          return (
            <button key={s.symbol} onClick={() => onSelect(s)} role="option" aria-selected={isActive}
              className={cn(
                "w-full h-[52px] px-3 flex items-center gap-3 border-b border-border/30 text-left transition-colors duration-panel",
                "hover:bg-surface-1",
                isActive && (change !== null && change >= 0
                  ? "bg-up/5 hover:bg-up/10 border-l-2 border-l-up"
                  : "bg-down/5 hover:bg-down/10 border-l-2 border-l-down"),
                idx === highlightedIndex && "bg-surface-1 outline outline-1 outline-primary/40"
              )}>
              {s.logo_url ? (
                <img src={s.logo_url} alt={s.symbol} className="size-9 rounded-lg shrink-0 object-contain bg-surface-1" />
              ) : (
                <div className="size-9 rounded-lg gradient-primary shadow-glow shrink-0 flex items-center justify-center text-xs font-bold text-primary-foreground">
                  {s.symbol.slice(0, 2)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">{s.symbol}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1 py-0">
                    {ASSET_LABELS[s.asset_class]?.[lang] ?? s.asset_class}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">{s.name}</div>
              </div>
              <div className="text-right shrink-0">
                {showSkeleton ? (
                  <>
                    <div className="h-4 w-16 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-12 bg-muted animate-pulse rounded mt-1" />
                  </>
                ) : (
                  <>
                    <div className={cn("font-price text-sm font-semibold", flashClass)}>{formatPrice(price)}</div>
                    {change !== null ? (
                      <div className={cn("text-xs font-price flex items-center justify-end gap-0.5", change >= 0 ? "text-up" : "text-down")}>
                        <BullBearIcon type={change >= 0 ? "bull" : "bear"} size="xs" />
                        {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                      </div>
                    ) : (
                      <div className="text-xs font-price text-muted-foreground flex items-center justify-end gap-0.5">
                        <BullBearIcon type="neutral" size="xs" />
                        —
                      </div>
                    )}
                  </>
                )}
              </div>
              <button onClick={(e) => toggleWatch(s, e)} className="ml-1 text-muted-foreground hover:text-primary transition-colors p-1">
                {watched ? <Star className="size-3.5 fill-primary text-primary" /> : <StarOff className="size-3.5" />}
              </button>
            </button>
          );
        })}
      </div>
    </div>
  );
}
