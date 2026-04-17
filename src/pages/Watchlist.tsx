import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { findSymbol, formatPrice, fallbackPrice, SYMBOLS } from "@/lib/symbols";
import { useLivePrices } from "@/hooks/useLivePrices";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

function WatchlistInner() {
  const { user, lang } = useApp();
  const tr = t(lang);
  const [items, setItems] = useState<any[]>([]);
  const livePrices = useLivePrices(SYMBOLS.map((s) => s.symbol));
  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("watchlist").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setItems(data || []);
  };
  useEffect(() => { load(); }, [user]);

  const remove = async (id: string) => {
    await supabase.from("watchlist").delete().eq("id", id);
    load();
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-bold">{tr.watchlist}</h1>
        {items.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground glass border-border/40">
            {lang === "tr" ? "İzleme listenize sembol ekleyin (yıldız ikonu)" : "Add symbols by clicking the star icon"}
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((it) => {
              const sym = findSymbol(it.symbol);
              const lp = livePrices[it.symbol];
              const price = lp?.price ?? fallbackPrice(it.symbol);
              const change = lp?.change_pct_24h ?? 0;
              return (
                <Card key={it.id} className="p-4 glass border-border/40 flex items-center gap-3">
                  <div className="size-10 rounded-lg gradient-primary shadow-glow flex items-center justify-center font-bold text-primary-foreground text-xs shrink-0">
                    {it.symbol.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{it.symbol}</div>
                    <div className="text-xs text-muted-foreground truncate">{sym?.name || it.display_name}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-semibold">{formatPrice(price)}</div>
                    <div className={cn("text-xs font-mono", change >= 0 ? "text-bull" : "text-bear")}>
                      {change >= 0 ? "+" : ""}{change.toFixed(2)}%
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(it.id)}><Trash2 className="size-4" /></Button>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function Watchlist() { return <ProtectedRoute><WatchlistInner /></ProtectedRoute>; }
