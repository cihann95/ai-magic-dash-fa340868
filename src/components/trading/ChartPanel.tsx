import { useEffect, useState } from "react";
import TradingViewChart from "@/components/TradingViewChart";
import { SymbolDef, mockPrice, isMarketOpen } from "@/lib/symbols";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { TrendingDown, TrendingUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props { symbol: SymbolDef; onTradeDone: () => void; }

export default function ChartPanel({ symbol, onTradeDone }: Props) {
  const { lang, theme, user } = useApp();
  const tr = t(lang);
  const [qty, setQty] = useState("1");
  const [submitting, setSubmitting] = useState<"buy" | "sell" | null>(null);
  const [price, setPrice] = useState(mockPrice(symbol.symbol).price);

  useEffect(() => {
    setPrice(mockPrice(symbol.symbol).price);
    const id = setInterval(() => setPrice(mockPrice(symbol.symbol).price), 4000);
    return () => clearInterval(id);
  }, [symbol.symbol]);

  const trade = async (side: "buy" | "sell") => {
    if (!user) return toast({ title: tr.error, description: tr.signin });
    const q = parseFloat(qty);
    if (!q || q <= 0) return toast({ title: tr.error, description: tr.quantity, variant: "destructive" });
    setSubmitting(side);
    try {
      const { data, error } = await supabase.functions.invoke("execute-trade", {
        body: { symbol: symbol.symbol, asset_class: symbol.asset_class, side, quantity: q, price },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: tr.trade_success, description: `${side.toUpperCase()} ${q} ${symbol.symbol} @ ${price}` });
      onTradeDone();
    } catch (e) {
      toast({ title: tr.error, description: e instanceof Error ? e.message : "Unknown", variant: "destructive" });
    } finally { setSubmitting(null); }
  };

  const open = isMarketOpen(symbol);
  const total = (parseFloat(qty || "0") * price);

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="chart" className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between p-3 border-b border-border/40 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 rounded-lg gradient-primary shadow-glow flex items-center justify-center font-bold text-primary-foreground shrink-0">
              {symbol.symbol.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-lg truncate">{symbol.symbol}</h2>
                <span className={cn("text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded", open ? "bg-bull/15 text-bull" : "bg-muted text-muted-foreground")}>
                  {open ? tr.market_open : tr.market_closed}
                </span>
              </div>
              <div className="text-xs text-muted-foreground truncate">{symbol.name}</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-xl font-bold">{price.toLocaleString(undefined, { minimumFractionDigits: price < 5 ? 4 : 2, maximumFractionDigits: price < 5 ? 4 : 2 })}</div>
          </div>
        </div>

        <TabsList className="mx-3 mt-3 w-fit">
          <TabsTrigger value="chart">{tr.chart}</TabsTrigger>
          <TabsTrigger value="info">{tr.info}</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="flex-1 m-0 mt-3 px-3 min-h-0">
          <div className="rounded-xl overflow-hidden border border-border/40 h-full min-h-[400px]">
            <TradingViewChart symbol={symbol.tv} theme={theme} />
          </div>
        </TabsContent>

        <TabsContent value="info" className="flex-1 m-0 mt-3 px-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Symbol", symbol.symbol],
              ["Asset Class", symbol.asset_class],
              ["TradingView", symbol.tv],
              ["Status", open ? tr.market_open : tr.market_closed],
              [tr.price, price.toString()],
            ].map(([k, v]) => (
              <div key={k} className="p-4 rounded-xl bg-accent/30 border border-border/40">
                <div className="text-xs text-muted-foreground uppercase">{k}</div>
                <div className="font-mono font-semibold mt-1 truncate">{v}</div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Trade bar */}
      <div className="p-3 border-t border-border/40 bg-card/50">
        <div className="flex flex-col sm:flex-row gap-2 items-stretch">
          <Button variant="outline" disabled={!!submitting} onClick={() => trade("sell")}
            className="flex-1 h-12 border-bear/40 text-bear hover:bg-bear hover:text-bear-foreground font-semibold">
            {submitting === "sell" ? <Loader2 className="size-4 animate-spin" /> : <TrendingDown className="size-4" />}
            {tr.sell}
          </Button>
          <div className="relative sm:w-32">
            <Input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)}
              className="h-12 text-center font-mono font-bold text-base bg-background" />
            <div className="text-[10px] text-muted-foreground text-center mt-1 font-mono">≈ ${total.toFixed(2)}</div>
          </div>
          <Button disabled={!!submitting} onClick={() => trade("buy")}
            className="flex-1 h-12 gradient-bull text-bull-foreground font-semibold hover:opacity-90">
            {submitting === "buy" ? <Loader2 className="size-4 animate-spin" /> : <TrendingUp className="size-4" />}
            {tr.buy}
          </Button>
        </div>
      </div>
    </div>
  );
}
