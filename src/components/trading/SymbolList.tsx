import { useEffect, useMemo, useState } from "react";
import { Search, Star, StarOff } from "lucide-react";
import { ASSET_LABELS, AssetClass, isMarketOpen, formatPrice, fallbackPrice, SymbolDef, SYMBOLS } from "@/lib/symbols";
import { useLivePrices } from "@/hooks/useLivePrices";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
  const livePrices = useLivePrices(SYMBOLS.map((s) => s.symbol));

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

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 space-y-2 border-b border-border/40">
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr.search_symbols} className="pl-9 bg-background/50" />
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-thin pb-1">
          {CATS.map((c) => (
            <Button key={c} variant={cat === c ? "secondary" : "ghost"} size="sm"
              onClick={() => setCat(c)}
              className={cn("text-xs whitespace-nowrap shrink-0", cat === c && "bg-primary/15 text-primary hover:bg-primary/20")}>
              {c === "all" ? tr.cat_all : ASSET_LABELS[c][lang]}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {filtered.map((s) => {
          const lp = livePrices[s.symbol];
          const price = lp?.price ?? fallbackPrice(s.symbol);
          const change = lp?.change_pct_24h ?? 0;
          const open = isMarketOpen(s);
          const isActive = active.symbol === s.symbol;
          const watched = watch.has(s.symbol);
          return (
            <button key={s.symbol} onClick={() => onSelect(s)}
              className={cn(
                "w-full px-3 py-3 flex items-center gap-3 border-b border-border/30 text-left transition-colors hover:bg-accent/40",
                isActive && "bg-primary/10 hover:bg-primary/15 border-l-2 border-l-primary"
              )}>
              <div className="size-9 rounded-lg gradient-primary shadow-glow shrink-0 flex items-center justify-center text-xs font-bold text-primary-foreground">
                {s.symbol.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">{s.symbol}</span>
                  <span className={cn("size-1.5 rounded-full", open ? "bg-bull animate-pulse" : "bg-muted-foreground/40")} />
                </div>
                <div className="text-xs text-muted-foreground truncate">{s.name}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm font-semibold">{formatPrice(price)}</div>
                <div className={cn("text-xs font-mono", change >= 0 ? "text-bull" : "text-bear")}>
                  {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                </div>
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
