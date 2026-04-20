import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { useLivePrices } from "@/hooks/useLivePrices";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, AreaChart, Area, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";

const COLORS = ["hsl(var(--primary))", "hsl(var(--bull))", "hsl(var(--primary-glow))", "hsl(var(--bear))", "hsl(var(--muted-foreground))"];

function PortfolioInner() {
  const { user, lang } = useApp();
  const tr = t(lang);
  const [positions, setPositions] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);
  const [initial, setInitial] = useState(100000);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("positions").select("*").eq("user_id", user.id),
      supabase.from("trades").select("*").eq("user_id", user.id).order("executed_at"),
      supabase.from("profiles").select("demo_balance, initial_balance").eq("id", user.id).single(),
    ]).then(([p, t, pr]) => {
      setPositions(p.data || []);
      setTrades(t.data || []);
      if (pr.data) { setBalance(Number(pr.data.demo_balance)); setInitial(Number(pr.data.initial_balance)); }
    });
  }, [user]);

  const livePrices = useLivePrices(positions.map((p) => p.symbol));
  const livePnl = positions.reduce((acc, p) => {
    const cur = livePrices[p.symbol]?.price ?? Number(p.current_price ?? p.entry_price);
    const v = p.side === "long" ? (cur - Number(p.entry_price)) * Number(p.quantity)
                                : (Number(p.entry_price) - cur) * Number(p.quantity);
    return acc + v;
  }, 0);
  const equity = balance + positions.reduce((a, p) => a + Number(p.entry_price) * Number(p.quantity), 0) + livePnl;

  // Allocation by asset class
  const alloc: Record<string, number> = {};
  positions.forEach((p) => {
    const v = Number(p.entry_price) * Number(p.quantity);
    alloc[p.asset_class] = (alloc[p.asset_class] || 0) + v;
  });
  const allocData = Object.entries(alloc).map(([name, value]) => ({ name, value }));

  // P&L over time from trades
  let cum = initial;
  const pnlSeries = trades.filter((t) => t.action === "close").map((t) => {
    cum += Number(t.pnl || 0);
    return { date: new Date(t.executed_at).toLocaleDateString(), value: cum };
  });
  if (pnlSeries.length === 0) pnlSeries.push({ date: "Start", value: initial }, { date: "Now", value: equity });

  return (
    <AppShell>
      <div className="p-4 md:p-6 space-y-4">
        <h1 className="text-2xl font-bold">{tr.portfolio}</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 glass border-border/40">
            <div className="text-xs text-muted-foreground uppercase">{tr.balance}</div>
            <div className="font-mono text-2xl font-bold mt-1">${equity.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </Card>
          <Card className="p-5 glass border-border/40">
            <div className="text-xs text-muted-foreground uppercase">{tr.pnl}</div>
            <div className={cn("font-mono text-2xl font-bold mt-1", (equity - initial) >= 0 ? "text-bull" : "text-bear")}>
              {(equity - initial) >= 0 ? "+" : ""}${(equity - initial).toFixed(2)}
            </div>
          </Card>
          <Card className="p-5 glass border-border/40">
            <div className="text-xs text-muted-foreground uppercase">{tr.open_positions}</div>
            <div className="font-mono text-2xl font-bold mt-1">{positions.length}</div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5 glass border-border/40">
            <div className="text-sm font-semibold mb-3">{lang === "tr" ? "Kâr/Zarar Eğrisi" : "P&L Curve"}</div>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={pnlSeries}>
                <defs>
                  <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Area type="monotone" dataKey="value" stroke="hsl(var(--primary))" fill="url(#pnlGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
          <Card className="p-5 glass border-border/40">
            <div className="text-sm font-semibold mb-3">{lang === "tr" ? "Varlık Dağılımı" : "Asset Allocation"}</div>
            {allocData.length === 0 ? (
              <div className="text-xs text-muted-foreground text-center py-12">{tr.no_positions}</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={allocData} dataKey="value" nameKey="name" outerRadius={80} innerRadius={50}>
                    {allocData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

export default function Portfolio() {
  return <ProtectedRoute><PortfolioInner /></ProtectedRoute>;
}
