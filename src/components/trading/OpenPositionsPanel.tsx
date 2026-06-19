import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowUpDown, ChevronDown, ChevronUp, Loader2, Sparkles, Target,
  TrendingDown, TrendingUp, X, Crosshair, Clock, Layers, Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { findSymbol, formatPrice, SymbolDef } from "@/lib/symbols";
import { useLivePrices } from "@/hooks/useLivePrices";
import { toast } from "@/hooks/use-toast";
import { celebrateAchievements } from "@/lib/achievements";
import { recordTrade } from "@/hooks/useEmotionalSignal";
import type { ExecuteTradeResponse } from "../../lib/edge-function-types";

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

interface DbPosition {
  id: string;
  symbol: string;
  asset_class: string;
  side: string;
  quantity: number | string;
  entry_price: number | string;
  current_price?: number | string | null;
  opened_at: string;
  pending?: boolean;
}

interface Props {
  refreshKey: number;
  onTradeDone: () => void;
  onSelectSymbol?: (s: SymbolDef) => void;
  activeSymbol?: string;
}

type SortKey = "pnl" | "newest" | "symbol" | "size";

const ASSET_LABEL: Record<string, string> = {
  crypto: "Crypto", stocks: "Stocks", forex: "FX",
  commodities: "Comm.", indices: "Index", etf: "ETF",
};

export default function OpenPositionsPanel({ refreshKey, onTradeDone, onSelectSymbol, activeSymbol }: Props) {
  const { user, lang } = useApp();
  const tr = t(lang);
  const [positions, setPositions] = useState<DbPosition[]>([]);
  const [tradeMeta, setTradeMeta] = useState<Record<string, { tp?: number | null; sl?: number | null; intent?: string | null; note?: string | null }>>({});
  const [closing, setClosing] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("pnl");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("positions").select("*").eq("user_id", user.id).order("opened_at", { ascending: false });
    setPositions(data || []);
    // Fetch latest open trade metadata for TP/SL/intent
    const { data: trades } = await supabase
      .from("trades")
      .select("symbol,planned_tp,planned_sl,intent_tag,intent_note,executed_at,action")
      .eq("user_id", user.id)
      .eq("action", "open")
      .order("executed_at", { ascending: false })
      .limit(50);
    const meta: typeof tradeMeta = {};
    (trades || []).forEach((tr: any) => {
      if (!meta[tr.symbol]) {
        meta[tr.symbol] = { tp: tr.planned_tp, sl: tr.planned_sl, intent: tr.intent_tag, note: tr.intent_note };
      }
    });
    setTradeMeta(meta);
    setLoading(false);
  }, [user]);

// eslint-disable-next-line react-hooks/exhaustive-deps
   useEffect(() => { load(); }, [user, refreshKey]);
   

  // optimistic events from chart
  useEffect(() => {
    const add = (e: Event) => {
      const next = (e as CustomEvent<DbPosition>).detail;
      if (next) setPositions((cur) => [next, ...cur.filter((p) => p.id !== next.id)]);
    };
    const rollback = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id) setPositions((cur) => cur.filter((p) => p.id !== id));
    };
    window.addEventListener("optimistic-position", add);
    window.addEventListener("optimistic-position-rollback", rollback);
    return () => {
      window.removeEventListener("optimistic-position", add);
      window.removeEventListener("optimistic-position-rollback", rollback);
    };
  }, []);

// realtime sync
   useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`positions-panel-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "positions", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const livePrices = useLivePrices(positions.map((p) => p.symbol));

  const enriched = useMemo(() => {
    return positions.map((p) => {
      const cur = livePrices[p.symbol]?.price ?? Number(p.current_price ?? p.entry_price);
      const entry = Number(p.entry_price);
      const qty = Number(p.quantity);
      const notional = entry * qty;
      const pnl = p.side === "long" ? (cur - entry) * qty : (entry - cur) * qty;
      const pnlPct = entry > 0 ? ((p.side === "long" ? cur - entry : entry - cur) / entry) * 100 : 0;
      const heldMs = Date.now() - new Date(p.opened_at).getTime();
      return { ...p, cur, entry, qty, notional, pnl, pnlPct, heldMs };
    });
  }, [positions, livePrices]);

  const sorted = useMemo(() => {
    const arr = [...enriched];
    switch (sort) {
      case "pnl": arr.sort((a, b) => b.pnl - a.pnl); break;
      case "newest": arr.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime()); break;
      case "symbol": arr.sort((a, b) => a.symbol.localeCompare(b.symbol)); break;
      case "size": arr.sort((a, b) => b.notional - a.notional); break;
    }
    return arr;
  }, [enriched, sort]);

  const totals = useMemo(() => {
    const totalPnl = enriched.reduce((s, p) => s + p.pnl, 0);
    const totalNotional = enriched.reduce((s, p) => s + p.notional, 0);
    const winners = enriched.filter((p) => p.pnl > 0).length;
    return { totalPnl, totalNotional, winners, losers: enriched.length - winners };
  }, [enriched]);

  const closePos = async (p: typeof enriched[number], fraction = 1) => {
    setClosing((c) => ({ ...c, [p.id]: true }));
    try {
      const qty = fraction === 1 ? p.qty : Number((p.qty * fraction).toFixed(8));
      if (qty <= 0) throw new Error("Invalid quantity");
      const { data, error, response } = await supabase.functions.invoke("execute-trade", {
        body: {
          symbol: p.symbol, asset_class: p.asset_class,
          side: p.side === "long" ? "sell" : "buy",
          quantity: qty, position_id: p.id,
        },
      });
      if (error) {
        let errorMsg = error.message || "Unknown error";
        try {
          const body = await response?.json();
          if (body?.error) errorMsg = body.error;
        } catch { /* response body already consumed or not json */ }
        throw new Error(errorMsg);
      }
      const result = data as ExecuteTradeResponse;
      if (result?.error) throw new Error(result.error);
      try { recordTrade(p.entry * qty, true); } catch { /* noop */ }
      toast({
        title: tr.success,
        description: `${fraction === 1 ? tr.close_success : tr.partial_close} ${p.symbol}`,
      });
      const ach = result?.achievements;
      if (ach?.length) celebrateAchievements(ach, lang);
      onTradeDone();
} catch (e) {
       toast({ title: tr.error, description: getTradeErrorMessage(e), variant: "destructive" });
     } finally {
      setClosing((c) => ({ ...c, [p.id]: false }));
    }
  };

  const focusOnChart = (symbol: string) => {
    const def = findSymbol(symbol);
    if (def && onSelectSymbol) onSelectSymbol(def);
  };

  const sortLabels: Record<SortKey, string> = {
    pnl: lang === "tr" ? "K/Z'ye göre" : "By P&L",
    newest: lang === "tr" ? "En yeni" : "Newest",
    symbol: lang === "tr" ? "Sembol" : "Symbol",
    size: lang === "tr" ? "Büyüklük" : "Size",
  };

  return (
    <Card className="glass border-border/40 shadow-card flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" />
            <span className="text-sm font-semibold tracking-wide">{tr.open_positions}</span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground">{enriched.length}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px] px-2">
                <ArrowUpDown className="size-3" /> {sortLabels[sort]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              {(Object.keys(sortLabels) as SortKey[]).map((k) => (
                <DropdownMenuItem key={k} onClick={() => setSort(k)} className="text-xs">
                  {sortLabels[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {enriched.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="rounded-lg bg-accent/30 px-2 py-1.5">
              <div className="text-[9px] uppercase text-muted-foreground tracking-wide">{lang === "tr" ? "Toplam K/Z" : "Total P&L"}</div>
              <div className={cn("font-mono font-bold text-sm tabular-nums", totals.totalPnl >= 0 ? "text-bull" : "text-bear")}>
                {totals.totalPnl >= 0 ? "+" : ""}${totals.totalPnl.toFixed(2)}
              </div>
            </div>
            <div className="rounded-lg bg-accent/30 px-2 py-1.5">
              <div className="text-[9px] uppercase text-muted-foreground tracking-wide">{lang === "tr" ? "Maruziyet" : "Exposure"}</div>
              <div className="font-mono font-bold text-sm tabular-nums">${totals.totalNotional.toFixed(0)}</div>
            </div>
            <div className="rounded-lg bg-accent/30 px-2 py-1.5">
              <div className="text-[9px] uppercase text-muted-foreground tracking-wide">{lang === "tr" ? "Kazan/Kayıp" : "Win/Loss"}</div>
              <div className="font-mono font-bold text-sm tabular-nums">
                <span className="text-bull">{totals.winners}</span>
                <span className="text-muted-foreground mx-0.5">/</span>
                <span className="text-bear">{totals.losers}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && positions.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin mr-2" /> {tr.ai_loading}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-2">
            <div className="size-12 rounded-full bg-muted/40 flex items-center justify-center">
              <Inbox className="size-5 text-muted-foreground" />
            </div>
            <div className="text-sm font-medium">{tr.no_positions}</div>
            <div className="text-[11px] text-muted-foreground max-w-[220px]">
              {lang === "tr" ? "İlk pozisyonunu açtığında burada gerçek zamanlı izleyeceksin." : "When you open your first position, you'll track it here in real time."}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {sorted.map((p) => {
              const isExpanded = expanded === p.id;
              const isActive = p.symbol === activeSymbol;
              const meta = tradeMeta[p.symbol] || {};
              const tp = meta.tp ? Number(meta.tp) : null;
              const sl = meta.sl ? Number(meta.sl) : null;
              // progress bar between SL and TP based on current price
              let progressPct: number | null = null;
              if (tp && sl) {
                const lo = Math.min(tp, sl), hi = Math.max(tp, sl);
                progressPct = Math.max(0, Math.min(100, ((p.cur - lo) / (hi - lo)) * 100));
              }
              const hours = p.heldMs / 36e5;
              const heldLabel = hours < 1
                ? `${Math.round(hours * 60)}${lang === "tr" ? "dk" : "m"}`
                : hours < 24 ? `${Math.round(hours)}${lang === "tr" ? "sa" : "h"}`
                : `${Math.round(hours / 24)}${lang === "tr" ? "g" : "d"}`;

              return (
                <div
                  key={p.id}
                  className={cn(
                    "px-3 py-2.5 transition-colors",
                    p.pending && "opacity-60 animate-pulse",
                    isActive && "bg-primary/5 border-l-2 border-l-primary",
                  )}
                >
                  {/* Row */}
                  <button
                    onClick={() => setExpanded(isExpanded ? null : p.id)}
                    className="w-full text-left flex items-center gap-2.5"
                  >
                    <div className={cn(
                      "size-8 rounded-lg flex items-center justify-center shrink-0",
                      p.side === "long" ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear",
                    )}>
                      {p.side === "long" ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm truncate">{p.symbol}</span>
                        <span className="text-[9px] uppercase font-medium px-1 py-0.5 rounded bg-muted/60 text-muted-foreground shrink-0">
                          {ASSET_LABEL[p.asset_class] || p.asset_class}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-0.5">
                        <span>{p.qty}</span>
                        <span className="text-muted-foreground/60">@</span>
                        <span>{formatPrice(p.entry)}</span>
                        <span className="text-muted-foreground/40">→</span>
                        <span className="text-foreground/80">{formatPrice(p.cur)}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn("font-mono font-bold text-sm tabular-nums", p.pnl >= 0 ? "text-bull" : "text-bear")}>
                        {p.pnl >= 0 ? "+" : ""}${p.pnl.toFixed(2)}
                      </div>
                      <div className={cn("text-[10px] font-mono tabular-nums", p.pnl >= 0 ? "text-bull/80" : "text-bear/80")}>
                        {p.pnlPct >= 0 ? "+" : ""}{p.pnlPct.toFixed(2)}%
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="size-3.5 text-muted-foreground shrink-0" /> : <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />}
                  </button>

                  {/* TP/SL progress bar (compact, always-on if planned) */}
                  {progressPct !== null && (
                    <div className="mt-2 pl-10">
                      <div className="relative h-1 rounded-full bg-muted/40 overflow-hidden">
                        <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-bear/40 via-muted-foreground/30 to-bull/40 w-full" />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 size-2 rounded-full bg-foreground border border-background shadow-glow"
                          style={{ left: `calc(${progressPct}% - 4px)` }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] font-mono text-muted-foreground mt-0.5">
                        <span className="text-bear">SL {formatPrice(sl!)}</span>
                        <span className="text-bull">TP {formatPrice(tp!)}</span>
                      </div>
                    </div>
                  )}

                  {/* Expanded actions / details */}
                  {isExpanded && (
                    <div className="mt-3 pl-10 space-y-2 animate-fade-in">
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="rounded bg-accent/30 px-2 py-1">
                          <div className="text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                            <Clock className="size-2.5" /> {lang === "tr" ? "Süre" : "Held"}
                          </div>
                          <div className="font-mono font-semibold mt-0.5">{heldLabel}</div>
                        </div>
                        <div className="rounded bg-accent/30 px-2 py-1">
                          <div className="text-muted-foreground uppercase tracking-wide">{lang === "tr" ? "Notional" : "Notional"}</div>
                          <div className="font-mono font-semibold mt-0.5">${p.notional.toFixed(2)}</div>
                        </div>
                        {meta.intent && (
                          <div className="rounded bg-accent/30 px-2 py-1 col-span-2">
                            <div className="text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                              <Sparkles className="size-2.5" /> {lang === "tr" ? "Niyet" : "Intent"}
                            </div>
                            <div className="font-medium mt-0.5 capitalize">{meta.intent}{meta.note ? ` — ${meta.note}` : ""}</div>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-1.5">
                        {onSelectSymbol && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => { e.stopPropagation(); focusOnChart(p.symbol); }}
                            className="h-7 text-[11px] flex-1"
                          >
                            <Crosshair className="size-3" /> {lang === "tr" ? "Grafiğe git" : "Focus chart"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => { e.stopPropagation(); closePos(p, 0.5); }}
                          disabled={closing[p.id] || p.pending}
                          className="h-7 text-[11px] flex-1"
                        >
                          <Target className="size-3" /> 50%
                        </Button>
                        <Button
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); closePos(p, 1); }}
                          disabled={closing[p.id] || p.pending}
                          className="h-7 text-[11px] flex-1 bg-bear/90 hover:bg-bear text-white"
                        >
                          {closing[p.id] ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                          {tr.close}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
