// "Niyet Aynası" - kullanıcının niyet bazlı performansı + duygu özeti
import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Newspaper, Sparkle, Smile, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import AIDisclaimer from "@/components/AIDisclaimer";

interface Trade {
  id: string;
  intent_tag: string | null;
  intent_note: string | null;
  pnl: number | null;
  action: string;
  symbol: string;
  executed_at: string;
  plan_adherence: number | null;
}

interface Emo {
  signal_type: string;
  mood: string | null;
  trade_id: string | null;
  created_at: string;
}

const INTENT_META = {
  technical: { tr: "Teknik sinyal", en: "Technical", icon: Brain, color: "text-primary" },
  news: { tr: "Haber", en: "News", icon: Newspaper, color: "text-yellow-500" },
  intuition: { tr: "Sezgi", en: "Intuition", icon: Sparkle, color: "text-purple-500" },
} as const;

const MOOD_META = {
  calm: { tr: "Sakin", en: "Calm", emoji: "😌" },
  focused: { tr: "Odaklı", en: "Focused", emoji: "🎯" },
  excited: { tr: "Heyecanlı", en: "Excited", emoji: "⚡" },
  angry: { tr: "Kızgın", en: "Angry", emoji: "😤" },
} as const;

function InsightsInner() {
  const { user, lang } = useApp();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [emos, setEmos] = useState<Emo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [t, e] = await Promise.all([
      supabase.from("trades").select("id, intent_tag, intent_note, pnl, action, symbol, executed_at, plan_adherence")
        .eq("user_id", user.id).eq("action", "close").order("executed_at", { ascending: false }).limit(500),
      supabase.from("emotional_logs").select("signal_type, mood, trade_id, created_at")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
    ]);
    setTrades((t.data ?? []) as Trade[]);
    setEmos((e.data ?? []) as Emo[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Per-intent stats
  const intentStats = useMemo(() => {
    const groups: Record<string, { count: number; wins: number; pnl: number; best: number; worst: number }> = {};
    for (const tr of trades) {
      if (!tr.intent_tag) continue;
      const g = groups[tr.intent_tag] ?? { count: 0, wins: 0, pnl: 0, best: -Infinity, worst: Infinity };
      g.count += 1;
      const p = Number(tr.pnl ?? 0);
      g.pnl += p;
      if (p > 0) g.wins += 1;
      if (p > g.best) g.best = p;
      if (p < g.worst) g.worst = p;
      groups[tr.intent_tag] = g;
    }
    return groups;
  }, [trades]);

  const totalTagged = Object.values(intentStats).reduce((a, g) => a + g.count, 0);
  const untagged = trades.length - totalTagged;

  // Mood stats: trade pnl per mood (mood logged before trade, use closest later trade)
  const moodStats = useMemo(() => {
    const groups: Record<string, { count: number; pnl: number }> = {};
    for (const m of emos) {
      if (!m.mood) continue;
      // find the next trade by this user that is a close action after m.created_at
      const t = trades.find((tr) => tr.executed_at > m.created_at);
      const p = Number(t?.pnl ?? 0);
      const g = groups[m.mood] ?? { count: 0, pnl: 0 };
      g.count += 1;
      g.pnl += p;
      groups[m.mood] = g;
    }
    return groups;
  }, [emos, trades]);

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="size-6 text-primary" />
            {lang === "tr" ? "İçgörüler" : "Insights"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === "tr"
              ? "Niyetlerin ve duyguların kazançlarını nasıl etkiliyor — kendi aynan."
              : "How your intentions and emotions shape your returns — your own mirror."}
          </p>
        </header>

        <AIDisclaimer />

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : (
          <>
            {/* Intent mirror */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {lang === "tr" ? "Niyet Aynası" : "Intent Mirror"}
                </h2>
                {untagged > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {untagged} {lang === "tr" ? "etiketsiz işlem" : "untagged trades"}
                  </span>
                )}
              </div>

              {totalTagged === 0 ? (
                <Card className="p-8 glass border-border/40 text-center text-sm text-muted-foreground">
                  {lang === "tr"
                    ? "Henüz etiketli kapanmış işlem yok. Bir sonraki işleminde niyetini seç — burada görünecek."
                    : "No tagged closed trades yet. Tag your next trade's intent — it will appear here."}
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {(Object.keys(INTENT_META) as Array<keyof typeof INTENT_META>).map((k) => {
                    const meta = INTENT_META[k];
                    const Icon = meta.icon;
                    const s = intentStats[k];
                    const winRate = s && s.count > 0 ? Math.round((s.wins / s.count) * 100) : 0;
                    const avg = s && s.count > 0 ? s.pnl / s.count : 0;
                    return (
                      <Card key={k} className="p-5 glass border-border/40">
                        <div className="flex items-center gap-2 mb-3">
                          <Icon className={cn("size-5", meta.color)} />
                          <span className="font-semibold">{lang === "tr" ? meta.tr : meta.en}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto font-mono">
                            {s?.count ?? 0} {lang === "tr" ? "işlem" : "trades"}
                          </span>
                        </div>
                        {s ? (
                          <>
                            <div className="text-2xl font-mono font-bold mb-1 flex items-baseline gap-1.5">
                              <span className={cn(s.pnl >= 0 ? "text-bull" : "text-bear")}>
                                {s.pnl >= 0 ? "+" : ""}${s.pnl.toFixed(2)}
                              </span>
                              <span className="text-xs text-muted-foreground font-normal">
                                {lang === "tr" ? "toplam" : "total"}
                              </span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground mb-2">
                              <span>{lang === "tr" ? "Kazanma" : "Win rate"}: <span className="font-mono font-semibold">{winRate}%</span></span>
                              <span>{lang === "tr" ? "Ort." : "Avg"}: <span className={cn("font-mono font-semibold", avg >= 0 ? "text-bull" : "text-bear")}>{avg >= 0 ? "+" : ""}${avg.toFixed(2)}</span></span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                              <div className={cn("h-full", winRate >= 50 ? "bg-bull" : "bg-bear")} style={{ width: `${winRate}%` }} />
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-muted-foreground py-4">
                            {lang === "tr" ? "Henüz veri yok" : "No data yet"}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Mood summary */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-2">
                <Smile className="size-4" />
                {lang === "tr" ? "Duygu Aynası" : "Emotion Mirror"}
              </h2>

              {Object.keys(moodStats).length === 0 ? (
                <Card className="p-8 glass border-border/40 text-center text-sm text-muted-foreground">
                  {lang === "tr"
                    ? "Hızlı sıralı işlem yaptığında veya bir pozisyon kapattıktan hemen sonra yenisini açtığında platform sana ruh halini soracak. Henüz veri yok."
                    : "When you trade rapidly or right after closing a position, the platform will ask how you feel. No data yet."}
                </Card>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(Object.keys(MOOD_META) as Array<keyof typeof MOOD_META>).map((k) => {
                    const meta = MOOD_META[k];
                    const s = moodStats[k];
                    const avg = s && s.count > 0 ? s.pnl / s.count : 0;
                    return (
                      <Card key={k} className="p-4 glass border-border/40 text-center">
                        <div className="text-3xl mb-1">{meta.emoji}</div>
                        <div className="text-xs font-semibold mb-2">{lang === "tr" ? meta.tr : meta.en}</div>
                        {s ? (
                          <>
                            <div className={cn("font-mono font-bold text-sm", avg >= 0 ? "text-bull" : "text-bear")}>
                              {avg >= 0 ? "+" : ""}${avg.toFixed(2)}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {s.count} {lang === "tr" ? "işlem ort." : "avg / trade"}
                            </div>
                          </>
                        ) : (
                          <div className="text-[10px] text-muted-foreground py-2">—</div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Recent intent log */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                {lang === "tr" ? "Son Etiketli İşlemler" : "Recent Tagged Trades"}
              </h2>
              <Card className="glass border-border/40 divide-y divide-border/30">
                {trades.filter((t) => t.intent_tag).slice(0, 10).map((t) => {
                  const meta = INTENT_META[t.intent_tag as keyof typeof INTENT_META];
                  const Icon = meta?.icon ?? Sparkle;
                  const p = Number(t.pnl ?? 0);
                  return (
                    <div key={t.id} className="flex items-center gap-3 p-3 text-sm">
                      <Icon className={cn("size-4 shrink-0", meta?.color ?? "text-muted-foreground")} />
                      <div className="min-w-0 flex-1">
                        <div className="font-mono font-semibold truncate">{t.symbol}</div>
                        {t.intent_note && (
                          <div className="text-[11px] text-muted-foreground truncate italic">"{t.intent_note}"</div>
                        )}
                      </div>
                      <div className={cn("font-mono font-bold text-sm shrink-0", p >= 0 ? "text-bull" : "text-bear")}>
                        {p >= 0 ? "+" : ""}${p.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
                {trades.filter((t) => t.intent_tag).length === 0 && (
                  <div className="p-6 text-center text-xs text-muted-foreground">
                    {lang === "tr" ? "Etiketli işlem yok." : "No tagged trades."}
                  </div>
                )}
              </Card>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function Insights() { return <ProtectedRoute><InsightsInner /></ProtectedRoute>; }
