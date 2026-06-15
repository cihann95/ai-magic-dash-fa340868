// Fiyat alarmları - oluştur, listele, sil
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
import { Bell, X, Check, Loader2, Clock } from "lucide-react";

export default function AlertsPanel({ symbol }: { symbol: SymbolDef }) {
  const { user, lang } = useApp();
  const tr = t(lang);
  const lp = useLivePrice(symbol.symbol);
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [alerts, setAlerts] = useState<any[]>([]);
  const noPrice = !lp?.price;
  const stale = isStale(lp?.updated_at);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("price_alerts").select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(20);
    setAlerts(data ?? []);
  };

  useEffect(() => { load(); }, [user]);
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("alerts_user")
      .on("postgres_changes", { event: "*", schema: "public", table: "price_alerts", filter: `user_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const create = async () => {
    if (!user) return;
    if (noPrice || stale) return toast({ title: tr.error, description: stale ? tr.stale_data : tr.price_unavailable, variant: "destructive" });
    const tp = parseFloat(target);
    if (!tp || tp <= 0) return toast({ title: tr.error, variant: "destructive" });
    const { error } = await supabase.from("price_alerts").insert({
      user_id: user.id, symbol: symbol.symbol, asset_class: symbol.asset_class,
      direction, target_price: tp, note: note || null,
    });
    if (error) return toast({ title: tr.error, description: error.message, variant: "destructive" });
    setTarget(""); setNote("");
    toast({ title: tr.success, description: `${symbol.symbol} ${direction === "above" ? "≥" : "≤"} ${tp}` });
  };

  const remove = async (id: string) => {
    await supabase.from("price_alerts").delete().eq("id", id);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg bg-accent/30 border border-border/30 px-3 py-2 text-xs">
        <span className="text-muted-foreground">{symbol.symbol}</span>
        <span className="font-mono font-semibold text-foreground">
          {noPrice ? <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="size-3 animate-spin" />—</span> : formatPrice(lp.price)}
        </span>
        {stale && !noPrice && <span className="inline-flex items-center gap-1 text-[10px] text-yellow-600 dark:text-yellow-400"><Clock className="size-3" />{tr.stale_data}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={direction} onValueChange={(v) => setDirection(v as "above" | "below")}>
          <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="above">{tr.price_above}</SelectItem>
            <SelectItem value="below">{tr.price_below}</SelectItem>
          </SelectContent>
        </Select>
        <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)}
          placeholder={tr.target} className="h-9 font-mono" />
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr.note_optional} className="h-9 text-xs" />
      <Button onClick={create} disabled={noPrice || stale} title={noPrice ? tr.price_unavailable : stale ? tr.stale_data : undefined} className="w-full h-9 gradient-primary text-primary-foreground">
        <Bell className="size-3.5 mr-1.5" />{tr.create}
      </Button>
      {(noPrice || stale) && <div className="text-[11px] text-muted-foreground text-center">{noPrice ? tr.price_loading : tr.stale_data}</div>}

      <div className="border-t border-border/40 pt-3 space-y-1.5 max-h-64 overflow-y-auto scrollbar-thin">
        {alerts.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">{tr.no_alerts}</div>
        ) : alerts.map((a) => (
          <div key={a.id} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-accent/30 border border-border/30">
            <Bell className={`size-3 ${a.triggered ? "text-bull" : "text-muted-foreground"}`} />
            <span className="font-semibold">{a.symbol}</span>
            <span className="text-muted-foreground">{a.direction === "above" ? "≥" : "≤"}</span>
            <span className="font-mono">{formatPrice(Number(a.target_price))}</span>
            <span className="ml-auto text-[10px]">
              {a.triggered ? <span className="text-bull flex items-center gap-1"><Check className="size-3" />{tr.triggered}</span> :
                <span className="text-muted-foreground">{tr.active}</span>}
            </span>
            <Button size="icon" variant="ghost" className="size-6" onClick={() => remove(a.id)}>
              <X className="size-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
