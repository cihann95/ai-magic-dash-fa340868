import { useEffect, useState, lazy, Suspense } from "react";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLivePrices } from "@/hooks/useLivePrices";
import { cn } from "@/lib/utils";
import { Heart, EyeOff, Eye, TrendingUp, Loader2, WifiOff } from "lucide-react";
import { Link } from "react-router-dom";
import { cacheSet, cacheGet, getOfflineKeys } from "@/lib/offlineCache";

const PortfolioPieChart = lazy(() => import("@/components/PortfolioPieChart"));
const PortfolioAreaChart = lazy(() => import("@/components/PortfolioAreaChart"));

const COLORS = ["hsl(var(--primary))", "hsl(var(--bull))", "hsl(var(--primary-glow))", "hsl(var(--bear))", "hsl(var(--muted-foreground))"];

function PortfolioInner() {
  const { user, lang } = useApp();
  const tr = t(lang);
  const [positions, setPositions] = useState<Database["public"]["Tables"]["positions"]["Row"][]>([]);
  const [trades, setTrades] = useState<Database["public"]["Tables"]["trades"]["Row"][]>([]);
  const [_balance, setBalance] = useState(0);
  const [initial, setInitial] = useState(100000);
  const [healthMode, setHealthMode] = useState(false);

  useEffect(() => {
    if (!user) return;
    const isOffline = !navigator.onLine;
    Promise.all([
      supabase.from("positions").select("*").eq("user_id", user.id),
      supabase.from("trades").select("*").eq("user_id", user.id).order("executed_at"),
      supabase.from("profiles").select("demo_balance, initial_balance, preferred_view").eq("id", user.id).maybeSingle(),
    ]).then(([p, t, pr]) => {
      const positionsData = p.data || [];
      const tradesData = t.data || [];
      // Cache for offline use
      cacheSet(`positions_${user.id}`, positionsData);
      cacheSet(`trades_${user.id}`, tradesData);
      if (pr.data) {
        cacheSet(`profile_${user.id}`, pr.data);
      }
      setPositions(positionsData);
      setTrades(tradesData);
      if (pr.data) {
        setBalance(Number(pr.data.demo_balance));
        setInitial(Number(pr.data.initial_balance));
        setHealthMode(pr.data.preferred_view === "health");
      }
    }).catch((err) => {
      console.warn('Portfolio fetch failed, trying cache', err);
      // Fallback to cache
      const cp = cacheGet<Database["public"]["Tables"]["positions"]["Row"][]>(`positions_${user.id}`);
      const ct = cacheGet<Database["public"]["Tables"]["trades"]["Row"][]>(`trades_${user.id}`);
      const cpr = cacheGet<{ demo_balance: number; initial_balance: number; preferred_view: string | null }>(`profile_${user.id}`);
      if (cp) setPositions(cp.data);
      if (ct) setTrades(ct.data);
      if (cpr) {
        setBalance(Number(cpr.data.demo_balance));
        setInitial(Number(cpr.data.initial_balance));
        setHealthMode(cpr.data.preferred_view === "health");
      }
    });
  }, [user]);

  const livePrices = useLivePrices(positions.map((p) => p.symbol));
  const livePnl = positions.reduce((acc, p) => {
    const cur = livePrices[p.symbol]?.price ?? Number(p.current_price ?? p.entry_price);
    const v = p.side === "long" ? (cur - Number(p.entry_price)) * Number(p.quantity)
                                : (Number(p.entry_price) - cur) * Number(p.quantity);
    return acc + v;
  }, 0);
  const realizedPnl = trades.reduce((sum, t) => sum + Number(t.pnl ?? 0), 0);
  const equity = initial + realizedPnl + livePnl;

  const alloc: Record<string, number> = {};
  positions.forEach((p) => {
    const v = Number(p.entry_price) * Number(p.quantity);
    alloc[p.asset_class] = (alloc[p.asset_class] || 0) + v;
  });
  const allocData = Object.entries(alloc).map(([name, value]) => ({ name, value }));

  let cum = initial;
  const pnlSeries = trades.filter((t) => t.action === "close").map((t) => {
    cum += Number(t.pnl || 0);
    return { date: new Date(t.executed_at).toLocaleDateString(), value: cum };
  });
  if (pnlSeries.length === 0) pnlSeries.push({ date: "Start", value: initial }, { date: "Now", value: equity });

  const toggleHealthMode = async (v: boolean) => {
    setHealthMode(v);
    if (user) {
      await supabase.from("profiles").update({ preferred_view: v ? "health" : "pnl" }).eq("id", user.id);
    }
  };

  // Position health metric: relative distance from entry (lower = healthier hold)
  const positionsWithHealth = positions.map((p) => {
    const cur = livePrices[p.symbol]?.price ?? Number(p.current_price ?? p.entry_price);
    const entry = Number(p.entry_price);
    const distancePct = entry > 0 ? ((cur - entry) / entry) * 100 : 0;
    const heldHours = (Date.now() - new Date(p.opened_at).getTime()) / (1000 * 60 * 60);
    return { ...p, cur, distancePct, heldHours };
  });

  return (
    <AppShell>
      <main role="main" aria-label="Portfolio" className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold">{tr.portfolio}</h1>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/50 border border-border/40">
            {healthMode ? <EyeOff className="size-4 text-muted-foreground" /> : <Eye className="size-4 text-muted-foreground" />}
            <Label htmlFor="health-mode" className="text-xs cursor-pointer select-none">
              {healthMode ? tr.health_view : tr.pnl_view}
            </Label>
            <Switch id="health-mode" checked={healthMode} onCheckedChange={toggleHealthMode} />
          </div>
        </div>

        {!navigator.onLine && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-yellow-600/20 border border-yellow-600/40 text-sm">
            <WifiOff className="size-4 shrink-0 text-yellow-600" />
            <span className="text-yellow-600 dark:text-yellow-400 font-medium">
              {lang === "tr" ? "Çevrimdışı mod — önbellekteki veriler gösteriliyor" : "Offline mode — showing cached data"}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 glass border-border/40">
            <div className="text-xs text-muted-foreground uppercase">{tr.balance}</div>
            <div className="font-mono text-2xl font-bold mt-1">
              {healthMode
                ? <span className="text-muted-foreground">•••••</span>
                : `$${equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
            </div>
          </Card>
          <Card className="p-5 glass border-border/40">
            <div className="text-xs text-muted-foreground uppercase">{healthMode ? (lang === "tr" ? "Pozisyon Sağlığı" : "Position Health") : tr.pnl}</div>
            {healthMode ? (
              <div className="font-mono text-2xl font-bold mt-1 flex items-center gap-2">
                <Heart className="size-5 text-bull" />
                <span className="text-base">{positions.length === 0 ? "—" : (lang === "tr" ? "İzleniyor" : "Monitoring")}</span>
              </div>
            ) : (
              <div className={cn("font-mono text-2xl font-bold mt-1", (equity - initial) >= 0 ? "text-bull" : "text-bear")}>
                {(equity - initial) >= 0 ? "+" : ""}${(equity - initial).toFixed(2)}
              </div>
            )}
          </Card>
          <Card className="p-5 glass border-border/40">
            <div className="text-xs text-muted-foreground uppercase">{tr.open_positions}</div>
            <div className="font-mono text-2xl font-bold mt-1">{positions.length}</div>
          </Card>
        </div>

        {positions.length === 0 && trades.length === 0 ? (
          <Card className="p-12 text-center glass border-border/40 space-y-4">
            <TrendingUp className="size-12 text-muted-foreground mx-auto" />
            <div className="text-muted-foreground">
              {lang === "tr" ? "Henüz pozisyonunuz yok. İşlem yapmaya başlayın!" : "No positions yet. Start trading!"}
            </div>
            <Button asChild className="gradient-primary text-primary-foreground">
              <Link to="/">{lang === "tr" ? "İşlem Sayfasına Git" : "Go to Trading"}</Link>
            </Button>
          </Card>
        ) : healthMode ? (
          <Card className="p-5 glass border-border/40">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Heart className="size-4 text-bull" />
              {lang === "tr" ? "Pozisyon Sağlığı" : "Position Health"}
            </div>
            {positionsWithHealth.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-8">{tr.no_positions}</div>
            ) : (
              <div className="space-y-2">
                {positionsWithHealth.map((p) => {
                  const heldLabel = p.heldHours < 1
                    ? `${Math.round(p.heldHours * 60)}${lang === "tr" ? "dk" : "m"}`
                    : p.heldHours < 24 ? `${Math.round(p.heldHours)}${lang === "tr" ? "sa" : "h"}`
                    : `${Math.round(p.heldHours / 24)}${lang === "tr" ? "g" : "d"}`;
                  // healthy if movement aligns with side
                  const alignedMove = p.side === "long" ? p.distancePct >= -2 : p.distancePct <= 2;
                  return (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg bg-accent/30 border border-border/30">
                      <div className={cn("size-2 rounded-full", alignedMove ? "bg-bull" : "bg-bear")} />
                      <div className="font-mono font-semibold min-w-0 flex-1 truncate">{p.symbol}</div>
                      <span className={cn("text-[10px] uppercase font-bold px-1.5 py-0.5 rounded",
                        p.side === "long" ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear")}>{p.side}</span>
                      <div className="text-xs text-muted-foreground hidden sm:block">
                        {lang === "tr" ? "Tutuldu" : "Held"} <span className="font-mono font-semibold">{heldLabel}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {lang === "tr" ? "Hareket" : "Move"} <span className={cn("font-mono font-semibold", alignedMove ? "text-bull" : "text-bear")}>
                          {p.distancePct >= 0 ? "+" : ""}{p.distancePct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
                <div className="text-[11px] text-muted-foreground text-center pt-2 italic">
                  {lang === "tr" ? "P&L gizli — sağlık moduna odaklı görünüm." : "P&L hidden — focused health view."}
                </div>
              </div>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5 glass border-border/40">
              <div className="text-sm font-semibold mb-3">{lang === "tr" ? "Kâr/Zarar Eğrisi" : "P&L Curve"}</div>
              <Suspense fallback={<div className="h-[240px] flex items-center justify-center"><Loader2 className="size-6 animate-spin" /></div>}>
                <PortfolioAreaChart data={pnlSeries} />
              </Suspense>
            </Card>
            <Card className="p-5 glass border-border/40">
              <div className="text-sm font-semibold mb-3">{lang === "tr" ? "Varlık Dağılımı" : "Asset Allocation"}</div>
              {allocData.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-12">{tr.no_positions}</div>
              ) : (
                <Suspense fallback={<div className="h-[240px] flex items-center justify-center"><Loader2 className="size-6 animate-spin" /></div>}>
                  <PortfolioPieChart data={allocData} colors={COLORS} />
                </Suspense>
              )}
            </Card>
          </div>
        )}
      </main>
    </AppShell>
  );
}

export default function Portfolio() {
  return <ProtectedRoute><PortfolioInner /></ProtectedRoute>;
}
