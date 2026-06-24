// Limit / stop / TP / SL emir formu + açık emirler listesi
import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge-error";
import { useLivePrice } from "@/hooks/useLivePrices";
import { SymbolDef, formatPrice, isStale } from "@/lib/symbols";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import { Clock, Loader2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

type OrderType = "limit" | "stop" | "take_profit" | "stop_loss";

export default function OrderTicket({ symbol }: { symbol: SymbolDef }) {
  const { user, lang, realBalance } = useApp();
  const tr = t(lang);
  const lp = useLivePrice(symbol.symbol);
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("1");
  const [trigger, setTrigger] = useState("");
  const [tp, setTp] = useState("");
  const [sl, setSl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [retryContext, setRetryContext] = useState<{ action: 'place' | 'cancel'; id?: string } | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const noPrice = !lp?.price;
  const stale = isStale(lp?.updated_at);

  const qtyNum = parseFloat(qty);
  const totalCost = !isNaN(qtyNum) && qtyNum > 0 && lp?.price ? qtyNum * lp.price : 0;
  const hasInsufficientBalance = realBalance != null && totalCost > realBalance;
  const isQtyInvalid = isNaN(qtyNum) || qtyNum <= 0;
  const isFormInvalid = isQtyInvalid || hasInsufficientBalance || noPrice || stale;

  useEffect(() => {
    if (lp?.price && !trigger) setTrigger(String(lp.price));
  }, [lp?.price, trigger]);

  const loadOrders = async () => {
    if (!user) return;
    const { data } = await supabase.from("orders").select("*").eq("user_id", user.id)
      .eq("status", "open").order("created_at", { ascending: false });
    setOrders(data ?? []);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadOrders(); }, [user, symbol.symbol]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`orders_${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const place = async () => {
    if (!user) return toast({ title: tr.error, description: tr.signin });
    if (noPrice || stale) return toast({ title: tr.error, description: stale ? tr.stale_data : tr.price_unavailable, variant: "destructive" });
    const q = parseFloat(qty); const tPrice = parseFloat(trigger);
    if (!q || q <= 0 || !tPrice || tPrice <= 0) return toast({ title: tr.error, variant: "destructive" });
    setSubmitting(true);
    try {
      await callEdgeFunction("manage-order", {
        action: "place",
        symbol: symbol.symbol,
        asset_class: symbol.asset_class,
        order_type: orderType,
        side,
        quantity: q,
        trigger_price: tPrice,
      });
      setRetryContext(null);
      toast({ title: tr.success, description: `${orderType.toUpperCase()} ${side.toUpperCase()} ${q} ${symbol.symbol} @ ${tPrice}` });
      loadOrders();
    } catch (e) {
      const edgeErr = e as { retryable?: boolean };
      if (edgeErr?.retryable) setRetryContext({ action: 'place' });
    } finally { setSubmitting(false); }
  };

  const cancel = async (id: string) => {
    try {
      await callEdgeFunction("manage-order", { action: "cancel", order_id: id });
      setRetryContext(null);
      toast({ title: tr.cancel, description: id.slice(0, 8) });
      loadOrders();
    } catch (e) {
      const edgeErr = e as { retryable?: boolean };
      if (edgeErr?.retryable) setRetryContext({ action: 'cancel', id });
    }
  };

  return (
    <div className="space-y-3" aria-label="Place order">
      <div className="rounded-lg border border-border/40 p-3 bg-surface-1/30">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">{symbol.symbol}</span>
          <span className="font-price text-sm">
            {noPrice ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3 animate-spin" />—</span> : formatPrice(lp?.price ?? null)}
          </span>
        </div>
        {stale && <div className="text-[10px] text-yellow-600 dark:text-yellow-400 inline-flex items-center gap-1 mt-1"><Clock className="size-2.5" />{tr.stale_data}</div>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="limit">{tr.limit}</SelectItem>
            <SelectItem value="stop">{tr.stop}</SelectItem>
            <SelectItem value="take_profit">{tr.take_profit}</SelectItem>
            <SelectItem value="stop_loss">{tr.stop_loss}</SelectItem>
          </SelectContent>
        </Select>
        <div className="grid grid-cols-2 gap-1">
          <motion.button
            onClick={() => setSide("buy")}
            whileTap={{ scale: 0.97 }}
            disabled={submitting}
            className={cn("h-9 rounded-md font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              side === "buy" ? "bg-up text-white" : "bg-surface-1 text-muted-foreground hover:text-foreground")}
          >
            {submitting && side === "buy" ? <Loader2 className="size-3 animate-spin mr-1 inline" /> : null}
            LONG
          </motion.button>
          <motion.button
            onClick={() => setSide("sell")}
            whileTap={{ scale: 0.97 }}
            disabled={submitting}
            className={cn("h-9 rounded-md font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              side === "sell" ? "bg-down text-white" : "bg-surface-1 text-muted-foreground hover:text-foreground")}
          >
            {submitting && side === "sell" ? <Loader2 className="size-3 animate-spin mr-1 inline" /> : null}
            SHORT
          </motion.button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex gap-1">
          {[10, 25, 50, 100].map(pct => (
            <Button key={pct} variant="outline" size="sm" className="flex-1 h-7 text-xs"
              onClick={() => {
                if (!realBalance || !lp?.price) return;
                setQty(((realBalance * pct / 100) / lp.price).toFixed(4));
              }}>
              {pct}%
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase">{tr.quantity}</label>
            <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="h-9 font-price" aria-invalid={isQtyInvalid || hasInsufficientBalance} />
            {isQtyInvalid && qty !== "" && (
              <p className="text-[10px] text-destructive mt-1">{lang === "tr" ? "Miktar 0'dan büyük olmalı" : "Amount must be greater than 0"}</p>
            )}
            {hasInsufficientBalance && !isQtyInvalid && (
              <p className="text-[10px] text-destructive mt-1">{lang === "tr" ? "Yetersiz bakiye" : "Insufficient balance"}</p>
            )}
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase">{tr.trigger_price}</label>
            <Input type="number" value={trigger} onChange={(e) => setTrigger(e.target.value)} className="h-9 font-price" />
          </div>
        </div>
        {lp?.price && qty && parseFloat(qty) > 0 && (
          <div className="text-xs text-muted-foreground flex items-center justify-between px-1">
            <span>Toplam: <span className="font-price text-foreground">${(parseFloat(qty) * lp.price).toFixed(2)}</span></span>
            <Badge variant="outline" className="text-[10px]">
              {realBalance ? ((parseFloat(qty) * lp.price / realBalance) * 100).toFixed(1) : "0.0"}% bakiye
            </Badge>
          </div>
        )}
      </div>

      <Button onClick={place} disabled={submitting || isFormInvalid}
        className={cn("w-full h-10", submitting ? "animate-pulse" : "", "gradient-primary text-primary-foreground")}>
        {submitting ? <><Loader2 className="size-4 animate-spin mr-1" />{lang === "tr" ? "İşleniyor..." : "Processing..."}</> : tr.place_order}
      </Button>

      {retryContext && (
        <Button onClick={() => { if (retryContext.action === 'place') place(); setRetryContext(null); }}
          variant="outline" className="w-full h-8 text-xs">
          <RefreshCw className="size-3 mr-1" />{lang === "tr" ? "Tekrar Dene" : "Retry"}
        </Button>
      )}

      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground w-full hover:text-foreground transition-colors py-1">
          {lang === "tr" ? "Gelişmiş (TP/SL)" : "Advanced (TP/SL)"}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 mt-2">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase">Take Profit</label>
            <Input type="number" min="0" step="any" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="TP fiyatı" className="h-9 font-price" />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase">Stop Loss</label>
            <Input type="number" min="0" step="any" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="SL fiyatı" className="h-9 font-price" />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {(noPrice || stale) && (
        <div className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1.5">
          <Clock className="size-3" />{stale ? tr.stale_data : tr.price_loading}
        </div>
      )}

      <div className="border-t border-border/40 pt-3">
        <div className="text-[10px] uppercase text-muted-foreground font-semibold mb-2">{tr.open_orders} ({orders.length})</div>
        {orders.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-3">{tr.no_open_orders}</div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-accent/30 border border-border/30">
                <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded",
                  o.side === "buy" ? "bg-up/15 text-up" : "bg-down/15 text-down")}>{o.side}</span>
                <span className="font-semibold">{o.symbol}</span>
                <span className="text-muted-foreground capitalize">{o.order_type.replace("_", " ")}</span>
                <span className="font-price ml-auto">{Number(o.quantity)} @ {formatPrice(Number(o.trigger_price))}</span>
                <Button size="icon" variant="ghost" className="size-6" onClick={() => cancel(o.id)}>
                  <X className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
