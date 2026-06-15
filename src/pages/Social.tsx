// Sosyal trading sayfası: aktivite akışı + öne çıkan trader'lar + copy ayarları
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { TrendingUp, Trophy, Users, Copy, X, Activity } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

interface Activity {
  event_id: string; event_type: string; user_id: string; username: string;
  symbol: string | null; asset_class: string | null; side: string | null;
  action: string; quantity: number | null; price: number | null; pnl: number | null;
  event_at: string;
}

interface Leader {
  user_id: string; username: string; level: number; xp: number;
  total_pnl: number; total_trades: number; win_rate: number;
  copyable?: boolean;
}

interface CopySetting {
  id: string; leader_id: string; enabled: boolean;
  ratio: number; max_position_usd: number;
}

function SocialInner() {
  const { user, lang } = useApp();
  const [feed, setFeed] = useState<Activity[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [copySettings, setCopySettings] = useState<Record<string, CopySetting>>({});
  const [loading, setLoading] = useState(true);
  const [copyDialog, setCopyDialog] = useState<Leader | null>(null);
  const [ratio, setRatio] = useState("1.0");
  const [maxPos, setMaxPos] = useState("5000");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: followsRows } = await supabase.from("followers")
      .select("following_id").eq("follower_id", user.id);
    const followIds = new Set((followsRows ?? []).map((r) => r.following_id));
    setFollowing(followIds);

    const ids = Array.from(followIds);
    let feedRows: Activity[] = [];
    if (ids.length > 0) {
      // activity_feed is a View — cast table name to satisfy .from() constraint
      const VIEW_TABLE = "activity_feed" as keyof Database["public"]["Tables"];
      const { data: f } = await supabase.from(VIEW_TABLE)
        .select("*").in("user_id", ids).order("event_at", { ascending: false }).limit(50);
      feedRows = (f as unknown as Activity[]) ?? [];
    }
    setFeed(feedRows);

    const { data: lb } = await supabase.rpc("get_leaderboard", { _limit: 30 });
    const lbRows = (lb ?? []) as Leader[];
    if (lbRows.length > 0) {
      const userIds = lbRows.map((r) => r.user_id);
      const { data: pps } = await supabase.from("public_profiles")
        .select("user_id, copyable").in("user_id", userIds);
      const copyMap = new Map((pps ?? []).map((p) => [p.user_id, p.copyable]));
      lbRows.forEach((r) => { r.copyable = copyMap.get(r.user_id) ?? false; });
    }
    setLeaders(lbRows);

    const { data: cs } = await supabase.from("copy_settings").select("*").eq("follower_id", user.id);
    const csMap: Record<string, CopySetting> = {};
    (cs ?? []).forEach((c) => { csMap[c.leader_id] = c as CopySetting; });
    setCopySettings(csMap);

    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel("activity-trades")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trades" }, () => {
        load();
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, load]);

  const toggleFollow = async (leaderId: string) => {
    if (!user) return;
    if (following.has(leaderId)) {
      await supabase.from("followers").delete()
        .eq("follower_id", user.id).eq("following_id", leaderId);
      following.delete(leaderId); setFollowing(new Set(following));
      toast({ title: lang === "tr" ? "Takipten çıkıldı" : "Unfollowed" });
    } else {
      await supabase.from("followers").insert({ follower_id: user.id, following_id: leaderId });
      following.add(leaderId); setFollowing(new Set(following));
      toast({ title: lang === "tr" ? "Takip edildi" : "Followed" });
    }
    load();
  };

  const openCopyDialog = (l: Leader) => {
    const existing = copySettings[l.user_id];
    setRatio(existing ? String(existing.ratio) : "1.0");
    setMaxPos(existing ? String(existing.max_position_usd) : "5000");
    setCopyDialog(l);
  };

  const saveCopy = async () => {
    if (!user || !copyDialog) return;
    const r = parseFloat(ratio); const m = parseFloat(maxPos);
    if (!(r > 0) || !(m > 0)) {
      toast({ title: lang === "tr" ? "Geçersiz değer" : "Invalid value", variant: "destructive" });
      return;
    }
    await supabase.from("copy_settings").upsert({
      follower_id: user.id, leader_id: copyDialog.user_id,
      ratio: r, max_position_usd: m, enabled: true,
    }, { onConflict: "follower_id,leader_id" });
    setCopyDialog(null);
    toast({ title: lang === "tr" ? "Copy aktif" : "Copy active" });
    load();
  };

  const stopCopy = async (leaderId: string) => {
    if (!user) return;
    await supabase.from("copy_settings").delete()
      .eq("follower_id", user.id).eq("leader_id", leaderId);
    toast({ title: lang === "tr" ? "Copy durduruldu" : "Copy stopped" });
    load();
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="size-6 text-primary" />
            {lang === "tr" ? "Sosyal Trading" : "Social Trading"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "tr" ? "Takip ettiklerinin işlemlerini gör, başarılı trader'ları kopyala." : "See your follows' trades, copy top traders."}
          </p>
        </header>

        <Tabs defaultValue="feed" className="w-full">
          <TabsList className="grid grid-cols-2 max-w-md">
            <TabsTrigger value="feed"><Activity className="size-4" /> {lang === "tr" ? "Akış" : "Feed"}</TabsTrigger>
            <TabsTrigger value="leaders"><Trophy className="size-4" /> {lang === "tr" ? "Trader'lar" : "Traders"}</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="mt-4 space-y-2">
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
            ) : feed.length === 0 ? (
              <Card className="p-8 text-center glass border-border/40">
                <Users className="size-10 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {lang === "tr" ? "Akış boş. Bir trader takip et." : "Feed is empty. Follow a trader."}
                </p>
              </Card>
            ) : feed.map((e) => (
              <Card key={e.event_id} className="p-3 glass border-border/40 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="size-9 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold text-xs">
                    {e.username[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">
                      {e.username}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {e.event_type === "trade" ? (
                          <>
                            {e.action === "open" ? (lang === "tr" ? "açtı" : "opened") : (lang === "tr" ? "kapattı" : "closed")}
                            {" "}
                            <Badge variant="outline" className="text-[10px] mx-1">{e.side?.toUpperCase()}</Badge>
                            <span className="font-mono">{e.symbol}</span>
                          </>
                        ) : (
                          <>{lang === "tr" ? "rozet kazandı" : "earned achievement"}: <span className="font-mono">{e.action}</span></>
                        )}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(e.event_at).toLocaleString(lang === "tr" ? "tr-TR" : "en-US", {
                        hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short",
                      })}
                      {e.pnl !== null && (
                        <span className={`ml-2 font-semibold ${e.pnl >= 0 ? "text-bull" : "text-bear"}`}>
                          {e.pnl >= 0 ? "+" : ""}${Number(e.pnl).toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {e.symbol && (
                  <Link to={`/?symbol=${e.symbol}`} className="text-xs text-primary hover:underline shrink-0">
                    {lang === "tr" ? "Aç" : "Open"}
                  </Link>
                )}
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="leaders" className="mt-4 space-y-2">
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : leaders.map((l, idx) => {
              const isMe = l.user_id === user?.id;
              const isFollowed = following.has(l.user_id);
              const isCopying = !!copySettings[l.user_id];
              return (
                <Card key={l.user_id} className="p-3 glass border-border/40 flex items-center gap-3">
                  <div className="text-base font-bold w-6 text-center text-muted-foreground">{idx + 1}</div>
                  <div className="size-10 rounded-full gradient-primary flex items-center justify-center text-primary-foreground font-bold">
                    {l.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold flex items-center gap-2">
                      {l.username}
                      <Badge variant="outline" className="text-[10px]">Lv {l.level}</Badge>
                      {isMe && <Badge className="text-[10px] gradient-primary text-primary-foreground">{lang === "tr" ? "Sen" : "You"}</Badge>}
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-3">
                      <span><TrendingUp className="size-3 inline" /> {l.total_trades} {lang === "tr" ? "işlem" : "trades"}</span>
                      <span>{lang === "tr" ? "Kazanç" : "Win"}: %{l.win_rate}</span>
                      <span className={Number(l.total_pnl) >= 0 ? "text-bull" : "text-bear"}>
                        ${Number(l.total_pnl).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  {!isMe && (
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant={isFollowed ? "default" : "outline"} onClick={() => toggleFollow(l.user_id)}>
                        {isFollowed ? (lang === "tr" ? "Takip ✓" : "Following") : (lang === "tr" ? "Takip" : "Follow")}
                      </Button>
                      {l.copyable && (
                        isCopying ? (
                          <Button size="sm" variant="destructive" onClick={() => stopCopy(l.user_id)}>
                            <X className="size-3" /> {lang === "tr" ? "Copy Durdur" : "Stop"}
                          </Button>
                        ) : (
                          <Button size="sm" className="gradient-primary text-primary-foreground" onClick={() => openCopyDialog(l)}>
                            <Copy className="size-3" /> Copy
                          </Button>
                        )
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!copyDialog} onOpenChange={(o) => !o && setCopyDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Copy className="size-4 inline" /> {lang === "tr" ? "Copy-Trade Ayarla" : "Configure Copy-Trade"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold">{copyDialog?.username}</span>
              {" "}{lang === "tr" ? "trader'ının her işlemi otomatik olarak senin hesabında belirlediğin oranla açılır." : "trader's trades will be auto-opened in your account at your set ratio."}
            </p>
            <div className="space-y-2">
              <Label>{lang === "tr" ? "Kopya Oranı" : "Copy Ratio"} (0.1 - 10)</Label>
              <Input type="number" step="0.1" min="0.1" max="10" value={ratio} onChange={(e) => setRatio(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                {lang === "tr" ? "Lider 1 BTC alırsa, sen" : "If leader buys 1 BTC, you buy"} {ratio} BTC.
              </p>
            </div>
            <div className="space-y-2">
              <Label>{lang === "tr" ? "Max Pozisyon (USD)" : "Max Position (USD)"}</Label>
              <Input type="number" min="100" step="100" value={maxPos} onChange={(e) => setMaxPos(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCopyDialog(null)}>{lang === "tr" ? "İptal" : "Cancel"}</Button>
            <Button onClick={saveCopy} className="gradient-primary text-primary-foreground">{lang === "tr" ? "Aktif Et" : "Activate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function Social() { return <ProtectedRoute><SocialInner /></ProtectedRoute>; }
