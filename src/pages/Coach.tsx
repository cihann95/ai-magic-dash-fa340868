// AI Trade Coach sayfası: davranışsal analiz içgörüleri, manuel tetikleme
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useApp } from "@/contexts/AppContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Brain, Sparkles, AlertTriangle, Info, ShieldAlert, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import AIDisclaimer from "@/components/AIDisclaimer";

interface Insight {
  id: string; category: string; severity: string;
  title: string; body: string; metadata: Json;
  acknowledged: boolean; created_at: string;
}

const SEVERITY_ICON = {
  info: { icon: Info, cls: "text-primary" },
  warning: { icon: AlertTriangle, cls: "text-yellow-500" },
  critical: { icon: ShieldAlert, cls: "text-bear" },
} as const;

function CoachInner() {
  const { user, lang } = useApp();
  const [items, setItems] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from("coach_insights")
      .select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(30);
    setItems((data ?? []) as Insight[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`coach_${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "coach_insights", filter: `user_id=eq.${user.id}` },
        (p: { new: Database["public"]["Tables"]["coach_insights"]["Row"] }) => { setItems((prev) => [p.new as Insight, ...prev]); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const generate = async () => {
    if (!user) return;
    setGenerating(true);
    const { data, error } = await supabase.functions.invoke("ai-trade-coach", {
      body: { user_id: user.id },
    });
    setGenerating(false);
    if (error || data?.skipped) {
      toast({
        title: lang === "tr" ? "Yetersiz veri" : "Not enough data",
        description: lang === "tr" ? "Analiz için en az 3 işlem gerekir." : "At least 3 trades needed.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: lang === "tr" ? "Yeni içgörü hazır" : "New insight ready" });
    load();
  };

  const acknowledge = async (id: string) => {
    await supabase.from("coach_insights").update({ acknowledged: true }).eq("id", id);
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, acknowledged: true } : i));
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="size-6 text-primary" />
              {lang === "tr" ? "AI Trade Coach" : "AI Trade Coach"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "tr"
                ? "İşlem davranışını analiz eder, kişiselleşmiş öneriler verir."
                : "Analyzes your trading behavior and gives personalized advice."}
            </p>
          </div>
          <Button onClick={generate} disabled={generating} className="gradient-primary text-primary-foreground shrink-0">
            <Sparkles className="size-4" />
            {generating
              ? (lang === "tr" ? "Analiz ediliyor..." : "Analyzing...")
              : (lang === "tr" ? "Analiz Yap" : "Run Analysis")}
          </Button>
        </header>

        <AIDisclaimer />

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
        ) : items.length === 0 ? (
          <Card className="p-10 glass border-border/40 text-center">
            <Brain className="size-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">
              {lang === "tr"
                ? "Henüz içgörü yok. En az 3 işlem yaptıktan sonra analiz başlatabilirsin."
                : "No insights yet. Run analysis after making at least 3 trades."}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((it) => {
              const sev = SEVERITY_ICON[it.severity as keyof typeof SEVERITY_ICON] ?? SEVERITY_ICON.info;
              const Icon = sev.icon;
              return (
                <Card key={it.id} className={`p-4 glass border-border/40 ${it.acknowledged ? "opacity-60" : ""}`}>
                  <div className="flex items-start gap-3">
                    <div className={`size-10 rounded-xl flex items-center justify-center bg-card ${sev.cls}`}>
                      <Icon className="size-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge variant="outline" className="text-[10px] uppercase">{it.category}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{it.severity}</Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(it.created_at).toLocaleString(lang === "tr" ? "tr-TR" : "en-US", {
                            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <h3 className="font-semibold mb-1">{it.title}</h3>
                      <p className="text-sm text-muted-foreground">{it.body}</p>
                      {it.metadata?.stats && (
                        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                          <Stat label={lang === "tr" ? "İşlem" : "Trades"} value={it.metadata.stats.totalTrades} />
                          <Stat label={lang === "tr" ? "Kazanç %" : "Win %"} value={it.metadata.stats.winRate} />
                          <Stat label="P&L" value={`$${it.metadata.stats.totalPnl}`} />
                          <Stat label={lang === "tr" ? "W/L Oranı" : "W/L Ratio"} value={it.metadata.stats.winLossRatio} />
                        </div>
                      )}
                    </div>
                    {!it.acknowledged && (
                      <Button size="sm" variant="ghost" onClick={() => acknowledge(it.id)} className="shrink-0">
                        <Check className="size-4" />
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-card/50 rounded p-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="font-mono font-semibold">{value}</div>
    </div>
  );
}

export default function Coach() { return <ProtectedRoute><CoachInner /></ProtectedRoute>; }
