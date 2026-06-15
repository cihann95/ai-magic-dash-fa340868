// Admin: Blitz komisyon dashboard'u + manuel real_balance kredi.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Wallet, TrendingUp, ShieldAlert } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { useApp } from "@/contexts/AppContext";

interface DailyRow { day: string; source: string; tx_count: number; total_amount: number; }
interface RevenueRow { id: string; created_at: string; amount: number; source: string; metadata: Json; room_id: string | null; }

export default function AdminBlitz() {
  const { user, loading: authLoading } = useApp();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [recent, setRecent] = useState<RevenueRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Top-up form
  const [targetUser, setTargetUser] = useState("");
  const [amount, setAmount] = useState<number>(100);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/auth"); return; }
    supabase.rpc("has_role", { _user_id: user.id, _role: "admin" })
      .then(({ data }) => setIsAdmin(data === true));
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin !== true) return;
    Promise.all([
      supabase.from("platform_revenue_daily" as keyof Database["public"]["Tables"]).select("*").limit(30),
      supabase.from("platform_revenue").select("*").order("created_at", { ascending: false }).limit(50),
    ]).then(([d, r]) => {
      setDaily((d.data as DailyRow[]) ?? []);
      setRecent((r.data as RevenueRow[]) ?? []);
      setLoading(false);
    });
  }, [isAdmin]);

  const totals = useMemo(() => {
    const total = recent.reduce((s, r) => s + Number(r.amount), 0);
    const today = daily.find((d) => d.day === new Date().toISOString().slice(0, 10));
    return { total, today: Number(today?.total_amount ?? 0), today_count: today?.tx_count ?? 0 };
  }, [recent, daily]);

  const chartData = useMemo(() =>
    [...daily].reverse().map((d) => ({ day: d.day.slice(5), gelir: Number(d.total_amount) })),
    [daily]
  );

  async function submitTopup() {
    if (!targetUser || !amount) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("blitz-admin-topup", {
      body: { user_id: targetUser.trim(), amount: Number(amount), reason: reason || null },
    });
    setSubmitting(false);
    if (error || data?.error) {
      toast.error(error?.message ?? data?.error ?? "Hata");
      return;
    }
    toast.success(`Yeni bakiye: $${data.new_balance}`);
    setTargetUser(""); setAmount(100); setReason("");
  }

  if (authLoading || isAdmin === null) {
    return <AppShell><div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div></AppShell>;
  }

  if (isAdmin === false) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto p-6 text-center space-y-3">
          <ShieldAlert className="size-12 mx-auto text-destructive" />
          <h1 className="text-xl font-bold">Erişim Yok</h1>
          <p className="text-sm text-muted-foreground">Bu sayfa yalnızca yöneticiler içindir.</p>
          <Button variant="outline" onClick={() => navigate("/blitz")}>Blitz'e dön</Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Blitz Admin</h1>
            <p className="text-sm text-muted-foreground">Komisyon raporu + manuel bakiye yönetimi</p>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="p-4 glass">
            <div className="text-xs text-muted-foreground">Bugün</div>
            <div className="text-2xl font-bold tabular-nums">${totals.today.toFixed(2)}</div>
            <div className="text-[11px] text-muted-foreground">{totals.today_count} işlem</div>
          </Card>
          <Card className="p-4 glass">
            <div className="text-xs text-muted-foreground">Son 50 kayıt toplam</div>
            <div className="text-2xl font-bold tabular-nums">${totals.total.toFixed(2)}</div>
          </Card>
          <Card className="p-4 glass">
            <div className="text-xs text-muted-foreground">Komisyon oranı</div>
            <div className="text-2xl font-bold">5%</div>
          </Card>
        </div>

        <Card className="p-4 glass">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Günlük Gelir Trendi (son 30 gün)</h2>
          </div>
          <div className="h-56">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="gelir" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Henüz veri yok</div>
            )}
          </div>
        </Card>

        <Card className="p-4 glass space-y-3">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Manuel Bakiye Kredisi</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_1fr_auto] gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Kullanıcı ID (UUID)</Label>
              <Input value={targetUser} onChange={(e) => setTargetUser(e.target.value)} placeholder="00000000-..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tutar ($)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} step="0.01" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Açıklama</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Promo / iade vb." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs opacity-0">.</Label>
              <Button onClick={submitTopup} disabled={submitting || !targetUser || !amount}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : "Uygula"}
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Negatif tutar girersen bakiye düşülür. Kilitli fonun altına inilemez.
          </p>
        </Card>

        <Card className="p-4 glass">
          <h2 className="text-sm font-semibold mb-3">Son 50 Komisyon Kaydı</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Zaman</TableHead>
                  <TableHead>Kaynak</TableHead>
                  <TableHead>Oda</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground"><Loader2 className="size-4 animate-spin inline" /></TableCell></TableRow>
                ) : recent.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Henüz komisyon kaydı yok</TableCell></TableRow>
                ) : recent.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("tr-TR")}</TableCell>
                    <TableCell><span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{r.source}</span></TableCell>
                    <TableCell className="text-xs font-mono">{r.room_id?.slice(0, 8) ?? "—"}</TableCell>
                    <TableCell className="text-right font-bold tabular-nums">${Number(r.amount).toFixed(4)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
