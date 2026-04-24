import { useEffect, useState } from "react";
import TradingViewChart from "@/components/TradingViewChart";
import { SymbolDef, isMarketOpen, formatPrice, isStale } from "@/lib/symbols";
import { useLivePrice } from "@/hooks/useLivePrices";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { TrendingDown, TrendingUp, Loader2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import OrderTicket from "./OrderTicket";
import AlertsPanel from "./AlertsPanel";
import { celebrateAchievements } from "@/lib/achievements";
import AnimatedNumber from "@/components/AnimatedNumber";
import IntentDialog from "./IntentDialog";
import { detectSignal, recordTrade, type EmotionalSignal } from "@/hooks/useEmotionalSignal";

interface Props { symbol: SymbolDef; onTradeDone: () => void; }

export default function ChartPanel({ symbol, onTradeDone }: Props) {
  const { lang, theme, user } = useApp();
  const tr = t(lang);
  const [qty, setQty] = useState("1");
  const [submitting, setSubmitting] = useState<"buy" | "sell" | null>(null);
  const [intentOpen, setIntentOpen] = useState<null | { side: "buy" | "sell"; signal: EmotionalSignal }>(null);
  const lp = useLivePrice(symbol.symbol);
  const price = lp?.price ?? null;
  const stale = isStale(lp?.updated_at);
  const noPrice = price == null;

  const requestTrade = (side: "buy" | "sell") => {
    if (!user) return toast({ title: tr.error, description: tr.signin });
    if (noPrice) return toast({ title: tr.error, description: tr.price_unavailable, variant: "destructive" });
    if (stale) return toast({ title: tr.error, description: tr.stale_data, variant: "destructive" });
    const q = parseFloat(qty);
    if (!q || q <= 0) return toast({ title: tr.error, description: tr.quantity, variant: "destructive" });
    const signal = detectSignal(q * (price ?? 0));
    setIntentOpen({ side, signal });
  };

  const executeTrade = async (intent: import("./IntentDialog").IntentResult) => {
    if (!intentOpen || !user) return;
    const side = intentOpen.side;
    const q = parseFloat(qty);
    setSubmitting(side);
    const optimisticId = `optimistic-${Date.now()}`;
    window.dispatchEvent(new CustomEvent("optimistic-position", {
      detail: {
        id: optimisticId,
        symbol: symbol.symbol,
        asset_class: symbol.asset_class,
        side: side === "buy" ? "long" : "short",
        quantity: q,
        entry_price: price,
        current_price: price,
        pending: true,
      },
    }));
    try {
      const { data, error } = await supabase.functions.invoke("execute-trade", {
        body: {
          symbol: symbol.symbol, asset_class: symbol.asset_class, side, quantity: q,
          intent_tag: intent.tag, intent_note: intent.note || null,
          planned_tp: intent.planned_tp, planned_sl: intent.planned_sl,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const fillPrice = (data as any)?.price ?? price;
      recordTrade(q * (fillPrice ?? 0), false);
      toast({ title: tr.trade_success, description: `${side.toUpperCase()} ${q} ${symbol.symbol} @ ${formatPrice(fillPrice)}` });
      const ach = (data as any)?.achievements as string[] | undefined;
      if (ach?.length) celebrateAchievements(ach, lang);
      setIntentOpen(null);
      onTradeDone();
    } catch (e) {
      window.dispatchEvent(new CustomEvent("optimistic-position-rollback", { detail: { id: optimisticId } }));
      toast({ title: tr.error, description: e instanceof Error ? e.message : "Unknown", variant: "destructive" });
    } finally { setSubmitting(null); }
  };

  const open = isMarketOpen(symbol);
  const total = (parseFloat(qty || "0") * (price ?? 0));
  const change = lp?.change_pct_24h ?? null;
  const tradeDisabled = !!submitting || noPrice || stale;

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="chart" className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between p-3 border-b border-border/40 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="size-10 rounded-lg gradient-primary shadow-glow flex items-center justify-center font-bold text-primary-foreground shrink-0">
              {symbol.symbol.slice(0, 2)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-lg truncate">{symbol.symbol}</h2>
                <span className={cn("text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded", open ? "bg-bull/15 text-bull" : "bg-muted text-muted-foreground")}>
                  {open ? tr.market_open : tr.market_closed}
                </span>
                {price !== null && stale && (
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 inline-flex items-center gap-1">
                    <Clock className="size-2.5" /> {tr.stale_data}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground truncate">{symbol.name}</div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono text-xl font-bold">
              {noPrice ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />—
                </span>
              ) : (
                <AnimatedNumber value={price} format={formatPrice} />
              )}
            </div>
            {change !== null ? (
              <div className={cn("text-xs font-mono", change >= 0 ? "text-bull" : "text-bear")}>
                {change >= 0 ? "+" : ""}{change.toFixed(2)}%
              </div>
            ) : <div className="text-xs font-mono text-muted-foreground">—</div>}
          </div>
        </div>

        <TabsList className="mx-3 mt-3 w-fit">
          <TabsTrigger value="chart">{tr.chart}</TabsTrigger>
          <TabsTrigger value="orders">{tr.orders}</TabsTrigger>
          <TabsTrigger value="alerts">{tr.alerts}</TabsTrigger>
          <TabsTrigger value="info">{tr.info}</TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="flex-1 m-0 mt-3 px-3 min-h-0">
          <div className="rounded-xl overflow-hidden border border-border/40 h-full min-h-[400px]">
            <TradingViewChart symbol={symbol.tv} theme={theme} />
          </div>
        </TabsContent>

        <TabsContent value="orders" className="flex-1 m-0 mt-3 px-3 overflow-y-auto scrollbar-thin">
          <OrderTicket symbol={symbol} />
        </TabsContent>

        <TabsContent value="alerts" className="flex-1 m-0 mt-3 px-3 overflow-y-auto scrollbar-thin">
          <AlertsPanel symbol={symbol} />
        </TabsContent>

        <TabsContent value="info" className="flex-1 m-0 mt-3 px-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Symbol", symbol.symbol],
              ["Asset Class", symbol.asset_class],
              ["TradingView", symbol.tv],
              ["Status", open ? tr.market_open : tr.market_closed],
              [tr.price, formatPrice(price)],
              ["24h Change", change !== null ? `${change.toFixed(2)}%` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="p-4 rounded-xl bg-accent/30 border border-border/40">
                <div className="text-xs text-muted-foreground uppercase">{k}</div>
                <div className="font-mono font-semibold mt-1 truncate">{v}</div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <div className="p-3 border-t border-border/40 bg-card/50">
        {noPrice && (
          <div className="text-[11px] text-muted-foreground text-center mb-2 flex items-center justify-center gap-1.5">
            <Loader2 className="size-3 animate-spin" /> {tr.price_loading}
          </div>
        )}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch">
          <Button variant="outline" disabled={tradeDisabled} onClick={() => requestTrade("sell")}
            className="flex-1 h-12 border-bear/40 text-bear hover:bg-bear hover:text-bear-foreground font-semibold">
            {submitting === "sell" ? <Loader2 className="size-4 animate-spin" /> : <TrendingDown className="size-4" />}
            {tr.sell}
          </Button>
          <div className="relative sm:w-32">
            <Input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)}
              className="h-12 text-center font-mono font-bold text-base bg-background" />
            <div className="text-[10px] text-muted-foreground text-center mt-1 font-mono">≈ ${total.toFixed(2)}</div>
          </div>
          <Button disabled={tradeDisabled} onClick={() => requestTrade("buy")}
            className="flex-1 h-12 gradient-bull text-bull-foreground font-semibold hover:opacity-90">
            {submitting === "buy" ? <Loader2 className="size-4 animate-spin" /> : <TrendingUp className="size-4" />}
            {tr.buy}
          </Button>
        </div>
      </div>

      <IntentDialog
        open={!!intentOpen}
        side={intentOpen?.side ?? "buy"}
        symbol={symbol.symbol}
        qty={parseFloat(qty) || 0}
        price={price}
        signal={intentOpen?.signal ?? null}
        submitting={!!submitting}
        onCancel={() => setIntentOpen(null)}
        onConfirm={executeTrade}
      />
    </div>
  );
}
