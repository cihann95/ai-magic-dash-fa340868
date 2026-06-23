import { useState, useEffect, useMemo, useRef } from "react";
import TradingViewChart from "@/components/TradingViewChart";
import { SymbolDef, isMarketOpen, formatPrice, isStale } from "@/lib/symbols";
import { useLivePrice } from "@/hooks/useLivePrices";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { TrendingDown, TrendingUp, Loader2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge-error";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import OrderTicket from "./OrderTicket";
import AlertsPanel from "./AlertsPanel";
import { celebrateAchievements } from "@/lib/achievements";
import type { ExecuteTradeResponse } from "../../lib/edge-function-types";
import AnimatedNumber from "@/components/AnimatedNumber";
import IntentDialog from "./IntentDialog";
import { detectSignal, recordTrade, type EmotionalSignal } from "@/hooks/useEmotionalSignal";

function getTradeErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "context" in error) {
    const ctx = (error as { context?: { body?: string } }).context;
    if (ctx?.body) {
      try {
        const parsed = JSON.parse(ctx.body);
        if (parsed.error) return parsed.error;
      } catch { /* not json */ }
    }
  }
  if (error && typeof error === "object" && "message" in error) {
    const msg = (error as { message?: string }).message;
    if (msg) return msg;
  }
  return "Unknown error";
}

interface Props { symbol: SymbolDef; onTradeDone: () => void; }

const PCT_OPTIONS = [25, 50, 75, 100] as const;
type Pct = typeof PCT_OPTIONS[number];

interface DbPosition {
  id: string;
  symbol: string;
  side: string;
  quantity: number | string;
  entry_price: number | string;
  pending?: boolean;
}

export default function ChartPanel({ symbol, onTradeDone }: Props) {
  const { lang, theme, user, demoBalance, balanceLoaded } = useApp();
  const tr = t(lang);
  const [qty, setQty] = useState("1");
  const [selectedPct, setSelectedPct] = useState<Pct | null>(null);
  const [positions, setPositions] = useState<DbPosition[]>([]);
  const [submitting, setSubmitting] = useState<"buy" | "sell" | null>(null);
  const [intentOpen, setIntentOpen] = useState<null | { side: "buy" | "sell"; signal: EmotionalSignal }>(null);
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [volume24h, setVolume24h] = useState<number | null>(null);
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
      const result = await callEdgeFunction<ExecuteTradeResponse>("execute-trade", {
        symbol: symbol.symbol, asset_class: symbol.asset_class, side, quantity: q,
        intent_tag: intent.tag, intent_note: intent.note || null,
        planned_tp: intent.planned_tp, planned_sl: intent.planned_sl,
      });
      if (result?.error) throw new Error(result.error);
      const fillPrice = result?.price ?? price;
      recordTrade(q * (fillPrice ?? 0), false);
      toast({ title: tr.trade_success, description: `${side.toUpperCase()} ${q} ${symbol.symbol} @ ${formatPrice(fillPrice)}` });
      if (typeof result?.balance === 'number') {
        window.dispatchEvent(new CustomEvent('balance-update', { detail: { balance: result.balance } }));
      }
      const ach = result?.achievements;
      if (ach?.length) celebrateAchievements(ach, lang);
      setIntentOpen(null);
      onTradeDone();
    } catch (e) {
      window.dispatchEvent(new CustomEvent("optimistic-position-rollback", { detail: { id: optimisticId } }));
      toast({ title: tr.error, description: getTradeErrorMessage(e), variant: "destructive" });
    } finally { setSubmitting(null); }
  };

  const handlePctClick = (pct: Pct) => {
    if (!price || price <= 0 || !demoBalance) return;
    setSelectedPct(pct);
    const rawQty = (demoBalance * pct / 100) / price;
    setQty(parseFloat(rawQty.toFixed(4)).toString());
  };

  const handleQtyChange = (val: string) => {
    setQty(val);
    if (selectedPct) setSelectedPct(null);
  };

  const loadSymbolPositions = async () => {
    if (!user) { setPositions([]); return; }
    const { data } = await supabase
      .from("positions")
      .select("id, symbol, side, quantity, entry_price")
      .eq("user_id", user.id)
      .eq("symbol", symbol.symbol)
      .eq("status", "open");
    setPositions(data ?? []);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSymbolPositions(); }, [user, symbol.symbol]);

  useEffect(() => {
    const add = (e: Event) => {
      const next = (e as CustomEvent<DbPosition>).detail;
      if (next?.symbol === symbol.symbol) setPositions((cur) => [next, ...cur.filter((p) => p.id !== next.id)]);
    };
    const rollback = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id) setPositions((cur) => cur.filter((p) => p.id !== id));
    };
    const refresh = () => loadSymbolPositions();
    window.addEventListener("optimistic-position", add);
    window.addEventListener("optimistic-position-rollback", rollback);
    window.addEventListener("balance-update", refresh);
    return () => {
      window.removeEventListener("optimistic-position", add);
      window.removeEventListener("optimistic-position-rollback", rollback);
      window.removeEventListener("balance-update", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol.symbol]);

  const symbolPnl = useMemo(() => {
    if (price == null || !positions.length) return 0;
    return positions.reduce((acc, p) => {
      const qtyPos = Number(p.quantity);
      const entry = Number(p.entry_price);
      if (!qtyPos || !entry) return acc;
      const isLong = p.side === "long";
      return acc + qtyPos * (isLong ? price - entry : entry - price);
    }, 0);
  }, [positions, price]);

  const fmtPnl = (n: number) => {
    const sign = n >= 0 ? "+" : "";
    return `${sign}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const open = isMarketOpen(symbol);
  const total = parseFloat(qty || "0") * (price ?? 0);
  const change = lp?.change_pct_24h ?? null;
  const tradeDisabled = !!submitting || noPrice || stale || !open;

  const TF_MAP: Record<string, string> = { "1m": "1", "5m": "5", "15m": "15", "1h": "60", "4h": "240", "1D": "D" };

  const prevPriceRef = useRef<number | null>(null);
  const flashClass = useMemo(() => {
    if (price == null || prevPriceRef.current == null || prevPriceRef.current === price) return "";
    const cls = price > prevPriceRef.current ? "animate-tick-flash-up" : "animate-tick-flash-down";
    return cls;
  }, [price]);
  useEffect(() => {
    if (price != null) prevPriceRef.current = price;
  }, [price]);

  useEffect(() => {
    if (!symbol?.symbol) return;
    supabase
      .from("price_cache")
      .select("volume_24h")
      .eq("symbol", symbol.symbol)
      .single()
      .then(({ data }) => setVolume24h(data?.volume_24h ?? null));
  }, [symbol?.symbol]);

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

        <div className="flex items-center gap-4 px-3 h-9 border-b border-border-subtle bg-surface-1/50 text-sm shrink-0">
          <span className={cn("font-price text-lg font-semibold", flashClass)}>
            {price != null ? formatPrice(price) : "—"}
          </span>
          <span className={cn("text-xs font-medium", (change ?? 0) >= 0 ? "text-up" : "text-down")}>
            {(change ?? 0) >= 0 ? "+" : ""}{change?.toFixed(2)}%
          </span>
          <span className="text-xs text-muted-foreground">
            24h H: <span className="font-price">—</span>
          </span>
          <span className="text-xs text-muted-foreground">
            24h L: <span className="font-price">—</span>
          </span>
          <span className="text-xs text-muted-foreground">
            Vol: <span className="font-price">{volume24h != null ? formatPrice(volume24h) : "—"}</span>
          </span>
          <div className="ml-auto flex gap-1">
            {(["1m","5m","15m","1h","4h","1D"] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded transition-colors duration-panel",
                  timeframe === tf
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tf}
              </button>
            ))}
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
            <TradingViewChart symbol={symbol.tv} theme={theme} interval={TF_MAP[timeframe]} />
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

      {/* Bottom Action Bar */}
      <div className="p-3 border-t border-border/40 bg-card/50 space-y-2">
        {noPrice && (
          <div className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1.5">
            <Loader2 className="size-3 animate-spin" /> {tr.price_loading}
          </div>
        )}

        {/* Row 1: Balance & Unrealized P&L */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">{tr.available}</span>
            <span className="text-[11px] font-medium text-foreground tabular-nums">
              {balanceLoaded ? (demoBalance).toLocaleString('en-US', {
                style: 'currency', currency: 'USD', minimumFractionDigits: 2
              }) : '—'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">{tr.pnl}</span>
            <span className={cn(
              "text-[11px] font-medium tabular-nums",
              symbolPnl >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {fmtPnl(symbolPnl)}
            </span>
          </div>
        </div>

        {/* Row 2: Percentage Pills + Slider */}
        <div className="px-3 pb-1">
          <div className="grid grid-cols-4 gap-1">
            {PCT_OPTIONS.map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={tradeDisabled || !demoBalance}
                onClick={() => handlePctClick(pct)}
                className={cn(
                  "h-7 rounded text-[11px] font-medium transition-all duration-150 border",
                  "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  selectedPct === pct
                    ? "bg-blue-950/80 border-blue-700/60 text-blue-300"
                    : "bg-secondary/60 border-border/40 text-muted-foreground hover:bg-secondary hover:text-foreground hover:border-border"
                )}
              >
                %{pct}
              </button>
            ))}
          </div>

          <div className="relative mt-2 mb-1 h-[3px] bg-secondary rounded-full">
            <div
              className="absolute inset-y-0 left-0 bg-blue-600 rounded-full transition-all duration-200"
              style={{ width: selectedPct ? `${selectedPct}%` : '0%' }}
            />
            {selectedPct && (
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border-2 border-background rounded-full shadow-sm transition-all duration-200"
                style={{ left: `${selectedPct}%` }}
              />
            )}
          </div>
        </div>

        {/* Row 3: Quantity + Price Inputs */}
        <div className="px-3 pb-1 grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              {tr.quantity}
            </label>
            <div className="relative">
              <Input
                type="number"
                min={0}
                step={0.0001}
                value={qty}
                onChange={(e) => handleQtyChange(e.target.value)}
                className="h-8 text-sm pr-10 tabular-nums bg-secondary/40 border-border/50 focus:border-blue-600/60"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
                {symbol.symbol.replace('USD', '')}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
              {lang === "tr" ? "Piyasa Fiyatı" : "Market Price"}
            </label>
            <Input
              type="text"
              readOnly
              value={price != null ? formatPrice(price) : "—"}
              className="h-8 text-sm tabular-nums bg-secondary/20 border-border/30 text-muted-foreground cursor-default"
            />
          </div>
        </div>

        {/* Row 4: Total Amount */}
        <div className="px-3 pb-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">{lang === "tr" ? "Toplam Tutar" : "Total Amount"}</span>
          <span className="text-[11px] font-medium tabular-nums text-foreground">
            ≈ {(parseFloat(qty || "0") * (price ?? 0)).toLocaleString('en-US', {
              style: 'currency', currency: 'USD', minimumFractionDigits: 2
            })}
          </span>
        </div>

        {/* Row 5: Sell / Buy Buttons */}
        <div className="px-3 pb-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => requestTrade('sell')}
            disabled={tradeDisabled || parseFloat(qty || "0") <= 0}
            className={cn(
              "h-11 rounded-md text-sm font-medium transition-all duration-150 border",
              "bg-red-950/60 border-red-900/50 text-red-400",
              "hover:bg-red-900/70 hover:border-red-800/60",
              "active:scale-[0.98]",
              "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
              "flex items-center justify-center gap-1.5"
            )}
          >
            {submitting === "sell" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {tr.sell}
          </button>
          <button
            type="button"
            onClick={() => requestTrade('buy')}
            disabled={tradeDisabled || parseFloat(qty || "0") <= 0}
            className={cn(
              "h-11 rounded-md text-sm font-medium transition-all duration-150 border",
              "bg-green-950/60 border-green-900/50 text-green-400",
              "hover:bg-green-900/70 hover:border-green-800/60",
              "active:scale-[0.98]",
              "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
              "flex items-center justify-center gap-1.5"
            )}
          >
            {submitting === "buy" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <TrendingUp className="w-3.5 h-3.5" />}
            {tr.buy}
          </button>
        </div>

        {/* Row 6: Price Footnote */}
        <p className="text-center text-[10px] text-muted-foreground pb-2">
          @ {price != null ? formatPrice(price) : "—"}
        </p>
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
