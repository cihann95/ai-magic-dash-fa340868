import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import VerifiedBadge from "@/components/VerifiedBadge";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge-error";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import {
  TrendingUp, TrendingDown, Copy, X, Users,
  ArrowLeft, BarChart3,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── types ───
interface Trade {
  id: string;
  symbol: string;
  side: string;
  action: string;
  price: number;
  quantity: number;
  pnl: number | null;
  executed_at: string;
  asset_class: string;
}

interface Profile {
  username: string;
  bio: string | null;
  verified: boolean;
  verified_at: string | null;
  copyable: boolean;
  show_trades: boolean;
  show_portfolio: boolean;
  user_id: string;
}

interface Stats {
  total_pnl: number;
  total_trades: number;
  win_rate: number;
  level: number;
  xp: number;
  max_drawdown: number;
  sharpe_ratio: number;
}

// ─── simple equity series from trades ───
function equityCurve(trades: Trade[]): { date: string; equity: number }[] {
  let running = 10000;
  const pts: { date: string; equity: number }[] = [{ date: trades.length ? trades[trades.length - 1].executed_at.split("T")[0] : new Date().toISOString().split("T")[0], equity: running }];
  for (let i = trades.length - 1; i >= 0; i--) {
    const t = trades[i];
    if (t.pnl != null) running += t.pnl;
    pts.push({ date: t.executed_at.split("T")[0], equity: running });
  }
  return pts.reverse();
}

function TraderProfileInner() {
  const { username } = useParams<{ username: string }>();
  const { user, lang } = useApp();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [following, setFollowing] = useState(false);
  const [copySetting, setCopySetting] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copyDialog, setCopyDialog] = useState(false);
  const [ratio, setRatio] = useState("1.0");
  const [maxPos, setMaxPos] = useState("5000");

  const load = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    try {
      // profile
      const { data: pp } = await supabase.from("public_profiles")
        .select("*").eq("username", username.toLowerCase().trim()).maybeSingle();
      if (!pp) { setLoading(false); return; }
      setProfile(pp as Profile);

      // stats
      const { data: us } = await supabase.from("user_stats")
        .select("*").eq("user_id", pp.user_id).maybeSingle();
      if (us) {
        const s: Stats = {
          total_pnl: us.total_pnl,
          total_trades: us.total_trades,
          win_rate: us.total_trades > 0
            ? Math.round((us.profitable_trades / us.total_trades) * 1000) / 10
            : 0,
          level: us.level,
          xp: us.xp,
          max_drawdown: us.max_drawdown ?? 0,
          sharpe_ratio: us.sharpe_ratio ?? 0,
        };
        setStats(s);
      }

      // recent 20 trades
      const { data: tr } = await supabase.from("trades")
        .select("*").eq("user_id", pp.user_id)
        .order("executed_at", { ascending: false }).limit(20);
      setTrades((tr ?? []) as Trade[]);

      // follow state
      if (user) {
        const { data: f } = await supabase.from("followers")
          .select("id").eq("follower_id", user.id).eq("following_id", pp.user_id).maybeSingle();
        setFollowing(!!f);

        const { data: cs } = await supabase.from("copy_settings")
          .select("*").eq("follower_id", user.id).eq("leader_id", pp.user_id).maybeSingle();
        setCopySetting(cs);
        if (cs) { setRatio(String(cs.ratio)); setMaxPos(String(cs.max_position_usd)); }
      }
    } catch (e) {
      console.error("[TraderProfile] load error", e);
    } finally {
      setLoading(false);
    }
  }, [username, user]);

  useEffect(() => { load(); }, [load]);

  const toggleFollow = async () => {
    if (!user || !profile) return;
    setActionLoading("follow");
    try {
      await callEdgeFunction("manage-follow", {
        action: following ? "unfollow" : "follow",
        leader_id: profile.user_id,
      });
      setFollowing(!following);
      toast({ title: following ? (lang === "tr" ? "Takipten çıkıldı" : "Unfollowed") : (lang === "tr" ? "Takip edildi" : "Followed") });
    } catch { /* handled */ }
    finally { setActionLoading(null); }
  };

  const saveCopy = async () => {
    if (!user || !profile) return;
    const r = parseFloat(ratio); const m = parseFloat(maxPos);
    if (!(r > 0) || !(m > 0)) {
      toast({ title: lang === "tr" ? "Geçersiz değer" : "Invalid value", variant: "destructive" });
      return;
    }
    setActionLoading("copy-save");
    try {
      await callEdgeFunction("manage-copy-settings", {
        leader_id: profile.user_id,
        enabled: true,
        ratio: r,
        max_position_usd: m,
      });
      setCopyDialog(false);
      setCopySetting({ ratio: r, max_position_usd: m });
      toast({ title: lang === "tr" ? "Copy aktif" : "Copy active" });
    } catch { /* handled */ }
    finally { setActionLoading(null); }
  };

  const stopCopy = async () => {
    if (!user || !profile) return;
    setActionLoading("copy-stop");
    try {
      await callEdgeFunction("manage-copy-settings", {
        leader_id: profile.user_id,
        enabled: false,
      });
      setCopySetting(null);
      toast({ title: lang === "tr" ? "Copy durduruldu" : "Copy stopped" });
    } catch { /* handled */ }
    finally { setActionLoading(null); }
  };

  const isMe = user?.id === profile?.user_id;

  if (loading) {
    return (
      <AppShell>
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32" />
          <Skeleton className="h-64" />
        </div>
      </AppShell>
    );
  }

  if (!profile) {
    return (
      <AppShell>
        <div className="p-4 md:p-6 max-w-4xl mx-auto text-center">
          <p className="text-muted-foreground">{lang === "tr" ? "Trader bulunamadı" : "Trader not found"}</p>
          <Button variant="outline" className="mt-4" asChild>
            <Link to="/leaderboard"><ArrowLeft className="size-4 mr-1" /> {lang === "tr" ? "Geri" : "Back"}</Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  const eq = equityCurve(trades);
  const eqMin = Math.min(...eq.map(p => p.equity));
  const eqMax = Math.max(...eq.map(p => p.equity));
  const eqRange = eqMax - eqMin || 1;
  const chartH = 200;
  const chartW = 700;
  const polyPoints = eq.map((p, i) => {
    const x = eq.length > 1 ? (i / (eq.length - 1)) * chartW : chartW / 2;
    const y = chartH - ((p.equity - eqMin) / eqRange) * (chartH - 20) - 10;
    return `${x},${y}`;
  }).join(" ");

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        {/* back */}
        <Link to="/leaderboard" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="size-4" /> {lang === "tr" ? "Liderlik Tablosu" : "Leaderboard"}
        </Link>

        {/* header */}
        <Card className="p-6 glass border-border/40">
          <div className="flex items-start gap-4 flex-wrap">
            <Avatar className="size-16">
              <AvatarFallback className="text-lg bg-primary/10 text-primary">
                {profile.username[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">@{profile.username}</h1>
                {profile.verified && <VerifiedBadge size="lg" />}
                {isMe && <Badge className="gradient-primary text-primary-foreground">{lang === "tr" ? "Sen" : "You"}</Badge>}
              </div>
              {profile.bio && <p className="text-sm text-muted-foreground mt-1">{profile.bio}</p>}
              {profile.verified && profile.verified_at && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  ✓ {lang === "tr" ? "Doğrulanmış Trader" : "Verified Trader"} — {new Date(profile.verified_at).toLocaleDateString()}
                </p>
              )}
            </div>
            {!isMe && (
              <div className="flex gap-2 shrink-0">
                <Button
                  variant={following ? "default" : "outline"}
                  onClick={toggleFollow}
                  disabled={actionLoading === "follow"}
                >
                  <Users className="size-4 mr-1" />
                  {actionLoading === "follow" ? "..." : (
                    following
                      ? (lang === "tr" ? "Takip Ediliyor" : "Following")
                      : (lang === "tr" ? "Takip Et" : "Follow")
                  )}
                </Button>
                {profile.copyable && (
                  copySetting ? (
                    <Button variant="destructive" onClick={stopCopy} disabled={actionLoading === "copy-stop"}>
                      <X className="size-4 mr-1" />
                      {actionLoading === "copy-stop" ? "..." : (lang === "tr" ? "Copy Durdur" : "Stop Copy")}
                    </Button>
                  ) : (
                    <Button className="gradient-primary text-primary-foreground" onClick={() => setCopyDialog(true)} disabled={actionLoading === "copy-save"}>
                      <Copy className="size-4 mr-1" /> Copy
                    </Button>
                  )
                )}
              </div>
            )}
          </div>
        </Card>

        {/* stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4 glass border-border/40 text-center">
            <p className="text-xs text-muted-foreground">{lang === "tr" ? "Toplam K/Z" : "Total P&L"}</p>
            <p className={`text-xl font-bold font-mono ${(stats?.total_pnl ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>
              {(stats?.total_pnl ?? 0) >= 0 ? "+" : ""}${(stats?.total_pnl ?? 0).toFixed(2)}
            </p>
          </Card>
          <Card className="p-4 glass border-border/40 text-center">
            <p className="text-xs text-muted-foreground">{lang === "tr" ? "Kazanç Oranı" : "Win Rate"}</p>
            <p className="text-xl font-bold font-mono text-primary">{stats?.win_rate ?? 0}%</p>
          </Card>
          <Card className="p-4 glass border-border/40 text-center">
            <p className="text-xs text-muted-foreground">{lang === "tr" ? "Max Drawdown" : "Max Drawdown"}</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-xl font-bold font-mono text-bear">{stats?.max_drawdown ?? 0}%</p>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">{lang === "tr" ? "En yüksek düşüş" : "Largest peak-to-trough decline"}</p></TooltipContent>
            </Tooltip>
          </Card>
          <Card className="p-4 glass border-border/40 text-center">
            <p className="text-xs text-muted-foreground">Sharpe Ratio</p>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className={`text-xl font-bold font-mono ${(stats?.sharpe_ratio ?? 0) >= 1 ? "text-bull" : "text-muted-foreground"}`}>
                  {stats?.sharpe_ratio?.toFixed(2) ?? "—"}
                </p>
              </TooltipTrigger>
              <TooltipContent><p className="text-xs">{lang === "tr" ? "Risk ayarlı getiri" : "Risk-adjusted return"}</p></TooltipContent>
            </Tooltip>
          </Card>
        </div>

        {/* equity curve */}
        {profile.show_portfolio && eq.length > 1 && (
          <Card className="p-4 glass border-border/40">
            <h2 className="text-sm font-semibold flex items-center gap-1 mb-3">
              <BarChart3 className="size-4" /> {lang === "tr" ? "Portföy" : "Portfolio"}
            </h2>
            <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-48" preserveAspectRatio="none">
              <polyline
                points={polyPoints}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </Card>
        )}

        {/* trades */}
        {profile.show_trades && (
          <Card className="glass border-border/40 overflow-hidden">
            <div className="p-4 border-b border-border/40">
              <h2 className="text-sm font-semibold">
                {lang === "tr" ? "Son 20 İşlem" : "Last 20 Trades"}
              </h2>
            </div>
            {trades.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">—</div>
            ) : (
              <div className="divide-y divide-border/40">
                {trades.map((t) => (
                  <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                        t.side === "buy" ? "bg-bull/10 text-bull" : "bg-bear/10 text-bear"
                      }`}>
                        {t.side.toUpperCase()}
                      </span>
                      <span className="font-mono font-semibold">{t.symbol}</span>
                      <span className="text-muted-foreground hidden sm:inline">{t.asset_class}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-muted-foreground">{t.quantity} @ ${Number(t.price).toFixed(2)}</span>
                      {t.pnl != null && (
                        <span className={`font-mono font-semibold ${t.pnl >= 0 ? "text-bull" : "text-bear"}`}>
                          {t.pnl >= 0 ? "+" : ""}${t.pnl.toFixed(2)}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground w-16 text-right">
                        {new Date(t.executed_at).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-US", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* copy dialog */}
      {copyDialog && profile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCopyDialog(false)}>
          <Card className="p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1">
              <Copy className="size-4 inline" /> {lang === "tr" ? "Copy-Trade Ayarla" : "Configure Copy-Trade"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {lang === "tr" ? "Her işlem otomatik açılır." : "Trades auto-opened at ratio."}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium">{lang === "tr" ? "Oran" : "Ratio"}</label>
                <input className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" type="number" step="0.1" min="0.1" max="10" value={ratio} onChange={(e) => setRatio(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium">{lang === "tr" ? "Max Pozisyon (USD)" : "Max Position (USD)"}</label>
                <input className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" type="number" min="100" step="100" value={maxPos} onChange={(e) => setMaxPos(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setCopyDialog(false)}>{lang === "tr" ? "İptal" : "Cancel"}</Button>
              <Button size="sm" className="gradient-primary text-primary-foreground" onClick={saveCopy} disabled={actionLoading === "copy-save"}>
                {actionLoading === "copy-save" ? "..." : (lang === "tr" ? "Aktif Et" : "Activate")}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </AppShell>
  );
}

export default function TraderProfile() { return <ProtectedRoute><TraderProfileInner /></ProtectedRoute>; }
