import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Medal, Award, AlertCircle, RefreshCw, TrendingDown, Activity } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

type Period = "weekly" | "monthly" | "all";

const periodLabel = (lang: string): Record<Period, string> => ({
  weekly: lang === "tr" ? "Haftalık" : "Weekly",
  monthly: lang === "tr" ? "Aylık" : "Monthly",
  all: lang === "tr" ? "Tüm Zamanlar" : "All Time",
});

function LeaderboardInner() {
  const { user, lang } = useApp();
  const tr = t(lang);
  const [rows, setRows] = useState<any[]>([]);
  const [pp, setPp] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("get_leaderboard", { _limit: 100 });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setRows(data ?? []);
    if (user) {
      const { data: my } = await supabase.from("public_profiles").select("*").eq("user_id", user.id).maybeSingle();
      setPp(my); if (my?.username) setUsername(my.username);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const join = async () => {
    if (!user || !username.trim()) return;
    const { error } = await supabase.from("public_profiles").upsert({
      user_id: user.id, username: username.trim().toLowerCase(), is_active: true,
    }, { onConflict: "user_id" });
    if (error) return toast({ title: tr.error, description: error.message, variant: "destructive" });
    toast({ title: tr.success });
    load();
  };

  const leave = async () => {
    if (!user) return;
    await supabase.from("public_profiles").update({ is_active: false }).eq("user_id", user.id);
    setPp({ ...pp, is_active: false }); load();
  };

  return (
    <AppShell>
      <main role="main" aria-label="Leaderboard" className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Trophy className="size-6 text-primary" />{tr.leaderboard}</h1>

        {!pp?.is_active && (
          <Card className="p-5 glass border-border/40">
            <div className="text-sm font-semibold mb-2">{tr.activate_public}</div>
            <div className="text-xs text-muted-foreground mb-3">{tr.public_profile}</div>
            <div className="flex gap-2">
              <Input placeholder={tr.username} value={username} onChange={(e) => setUsername(e.target.value)} />
              <Button onClick={join} className="gradient-primary text-primary-foreground">{tr.create}</Button>
            </div>
          </Card>
        )}
        {pp?.is_active && (
          <Card className="p-3 glass border-border/40 flex items-center justify-between">
            <div className="text-xs flex items-center gap-1">
              @{pp.username} {pp.verified && <VerifiedBadge size="sm" />}
              <span className="text-muted-foreground">— {tr.active}</span>
            </div>
            <Button size="sm" variant="ghost" onClick={leave}>{tr.cancel}</Button>
          </Card>
        )}

        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="w-full">
          <TabsList className="grid grid-cols-3 max-w-xs">
            {(["weekly", "monthly", "all"] as Period[]).map((p) => (
              <TabsTrigger key={p} value={p}>{periodLabel(lang)[p]}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Card className="glass border-border/40 overflow-hidden">
          {loading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-4 w-20 ml-auto" />
                  <Skeleton className="h-4 w-14 ml-2" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <AlertCircle className="size-8 text-bear" />
              <div className="text-sm text-muted-foreground">{error}</div>
              <Button variant="outline" size="sm" onClick={load}>
                <RefreshCw className="size-4 mr-1" /> {lang === "tr" ? "Tekrar Dene" : "Retry"}
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>{tr.username}</TableHead>
                  <TableHead>{tr.level}</TableHead>
                  <TableHead className="text-right">{tr.pnl}</TableHead>
                  <TableHead className="text-right">{tr.win_rate}</TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center gap-1 justify-end">
                      <TrendingDown className="size-3" /> Max DD
                    </span>
                  </TableHead>
                  <TableHead className="text-right">
                    <span className="flex items-center gap-1 justify-end">
                      <Activity className="size-3" /> Sharpe
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">—</TableCell></TableRow>
                ) : rows.map((r, i) => (
                  <TableRow key={r.user_id} className={cn(user?.id === r.user_id && "bg-primary/5")}>
                    <TableCell>
                      {i === 0 ? <Trophy className="size-4 text-yellow-500" /> :
                       i === 1 ? <Medal className="size-4 text-gray-400" /> :
                       i === 2 ? <Award className="size-4 text-orange-500" /> : <span className="text-xs text-muted-foreground">{i + 1}</span>}
                    </TableCell>
                    <TableCell className="font-semibold">
                      <Link to={`/trader/${r.username}`} className="hover:underline flex items-center gap-1">
                        @{r.username}
                        {r.verified && <VerifiedBadge size="sm" />}
                      </Link>
                    </TableCell>
                    <TableCell><span className="font-mono text-xs px-2 py-0.5 rounded bg-primary/15 text-primary">Lv {r.level}</span></TableCell>
                    <TableCell className={cn("text-right font-mono font-semibold", Number(r.total_pnl) >= 0 ? "text-bull" : "text-bear")}>
                      {Number(r.total_pnl) >= 0 ? "+" : ""}${Number(r.total_pnl).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{r.win_rate}%</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {r.max_drawdown != null ? `${Number(r.max_drawdown).toFixed(1)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {r.sharpe_ratio != null ? Number(r.sharpe_ratio).toFixed(2) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </main>
    </AppShell>
  );
}

export default function Leaderboard() { return <ProtectedRoute><LeaderboardInner /></ProtectedRoute>; }
