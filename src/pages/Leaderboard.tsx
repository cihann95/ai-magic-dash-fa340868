import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Medal, Award } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";

function LeaderboardInner() {
  const { user, lang } = useApp();
  const tr = t(lang);
  const [rows, setRows] = useState<any[]>([]);
  const [pp, setPp] = useState<any>(null);
  const [username, setUsername] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("get_leaderboard", { _limit: 100 });
    setRows(data ?? []);
    if (user) {
      const { data: my } = await supabase.from("public_profiles").select("*").eq("user_id", user.id).maybeSingle();
      setPp(my); if (my?.username) setUsername(my.username);
    }
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
      <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
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
            <div className="text-xs">@{pp.username} <span className="text-muted-foreground">— {tr.active}</span></div>
            <Button size="sm" variant="ghost" onClick={leave}>{tr.cancel}</Button>
          </Card>
        )}

        <Card className="glass border-border/40 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{tr.username}</TableHead>
                <TableHead>{tr.level}</TableHead>
                <TableHead className="text-right">{tr.pnl}</TableHead>
                <TableHead className="text-right">{tr.win_rate}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">—</TableCell></TableRow>
              ) : rows.map((r, i) => (
                <TableRow key={r.user_id} className={cn(user?.id === r.user_id && "bg-primary/5")}>
                  <TableCell>
                    {i === 0 ? <Trophy className="size-4 text-yellow-500" /> :
                     i === 1 ? <Medal className="size-4 text-gray-400" /> :
                     i === 2 ? <Award className="size-4 text-orange-500" /> : <span className="text-xs text-muted-foreground">{i + 1}</span>}
                  </TableCell>
                  <TableCell className="font-semibold">@{r.username}</TableCell>
                  <TableCell><span className="font-mono text-xs px-2 py-0.5 rounded bg-primary/15 text-primary">Lv {r.level}</span></TableCell>
                  <TableCell className={cn("text-right font-mono font-semibold", Number(r.total_pnl) >= 0 ? "text-bull" : "text-bear")}>
                    {Number(r.total_pnl) >= 0 ? "+" : ""}${Number(r.total_pnl).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{r.win_rate}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </AppShell>
  );
}

export default function Leaderboard() { return <ProtectedRoute><LeaderboardInner /></ProtectedRoute>; }
