// Limit / stop / TP / SL emir formu + açık emirler listesi
import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useLivePrice } from "@/hooks/useLivePrices";
import { SymbolDef, formatPrice, isStale } from "@/lib/symbols";
import { t } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Clock, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type OrderType = "limit" | "stop" | "take_profit" | "stop_loss";

export default function OrderTicket({ symbol }: { symbol: SymbolDef }) {
  const { user, lang } = useApp();
  const tr = t(lang);
  const lp = useLivePrice(symbol.symbol);
  const [orderType, setOrderType] = useState<OrderType>("limit");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qty, setQty] = useState("1");
  const [trigger, setTrigger] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const noPrice = !lp?.price;
  const stale = isStale(lp?.updated_at);

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
    const ch = supabase.channel("orders_user")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const place = async () => {
    if (!user) return toast({ title: tr.error, description: tr.signin });
    if (noPrice || stale) return toast({ title: tr.error, description: stale ? tr.stale_data : tr.price_unavailable, variant: "destructive" });
    const q = parseFloat(qty); const tp = parseFloat(trigger);
    if (!q || q <= 0 || !tp || tp <= 0) return toast({ title: tr.error, variant: "destructive" });
    setSubmitting(true);
    try {
      const { data, error, response } = await supabase.functions.invoke("manage-order", {
        body: {
          action: "place",
          symbol: symbol.symbol,
          asset_class: symbol.asset_class,
          order_type: orderType,
          side,
          quantity: q,
          trigger_price: tp,
        },
      });
      if (error) {
        let errorMsg = error.message || "Unknown error";
        try {
          const body = await response?.json();
          if (body?.error) errorMsg = body.error;
        } catch { /* response body already consumed */ }
        throw new Error(errorMsg);
      }
      toast({ title: tr.success, description: `${orderType.toUpperCase()} ${side.toUpperCase()} ${q} ${symbol.symbol} @ ${tp}` });
      loadOrders();
    } catch (e) {
      toast({ title: tr.error, description: e instanceof Error ? e.message : "Unknown", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const cancel = async (id: string) => {
    try {
      const { error, response } = await supabase.functions.invoke("manage-order", {
        body: { action: "cancel", order_id: id },
      });
      if (error) {
        let errorMsg = error.message || "Unknown error";
        try {
          const body = await response?.json();
          if (body?.error) errorMsg = body.error;
        } catch { /* response body already consumed */ }
        throw new Error(errorMsg);
      }
      toast({ title: tr.cancel, description: id.slice(0, 8) });
      loadOrders();
    } catch (e) {
      toast({ title: tr.error, description: e instanceof Error ? e.message : "Unknown", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg bg-accent/30 border border-border/30 px-3 py-2 text-xs">
        <span className="text-muted-foreground">{symbol.symbol}</span>
        <span className="font-mono font-semibold">
          {noPrice ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3 animate-spin" />—</span> : formatPrice(lp.price)}
        </span>
        {stale && !noPrice && <span className="inline-flex items-center gap-1 text-[10px] text-yellow-600 dark:text-yellow-400"><Clock className="size-3" />{tr.stale_data}</span>}
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
        <Select value={side} onValueChange={(v) => setSide(v as "buy" | "sell")}>
          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="buy">{tr.buy}</SelectItem>
            <SelectItem value="sell">{tr.sell}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground uppercase">{tr.quantity}</label>
          <Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="h-9 font-mono" />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground uppercase">{tr.trigger_price}</label>
          <Input type="number" value={trigger} onChange={(e) => setTrigger(e.target.value)} className="h-9 font-mono" />
        </div>
      </div>
      <Button onClick={place} disabled={submitting || noPrice || stale} title={noPrice ? tr.price_unavailable : stale ? tr.stale_data : undefined} className="w-full h-9 gradient-primary text-primary-foreground">
        {submitting ? <Loader2 className="size-4 animate-spin" /> : tr.place_order}
      </Button>
      {(noPrice || stale) && <div className="text-[11px] text-muted-foreground text-center">{noPrice ? tr.price_loading : tr.stale_data}</div>}

      <div className="border-t border-border/40 pt-3">
        <div className="text-[10px] uppercase text-muted-foreground font-semibold mb-2">{tr.open_orders} ({orders.length})</div>
        {orders.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-3">{tr.no_open_orders}</div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-accent/30 border border-border/30">
                <span className={cn("text-[9px] uppercase font-bold px-1.5 py-0.5 rounded",
                  o.side === "buy" ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear")}>{o.side}</span>
                <span className="font-semibold">{o.symbol}</span>
                <span className="text-muted-foreground capitalize">{o.order_type.replace("_", " ")}</span>
                <span className="font-mono ml-auto">{Number(o.quantity)} @ {formatPrice(Number(o.trigger_price))}</span>
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
