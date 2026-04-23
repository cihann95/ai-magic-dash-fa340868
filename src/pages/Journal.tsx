// Trade Journal sayfası: işlemlere not, tez, ders, duygu ekleme
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import ProtectedRoute from "@/components/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BookOpen, Plus, Star } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface JournalEntry {
  id: string; symbol: string; thesis: string | null; lessons: string | null;
  emotion: string | null; rating: number | null; created_at: string;
  trade_id: string | null;
}

interface Trade {
  id: string; symbol: string; side: string; action: string;
  quantity: number; price: number; pnl: number | null; executed_at: string;
}

function JournalInner() {
  const { user, lang } = useApp();
  const tr = t(lang);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);

  const [tradeId, setTradeId] = useState<string>("");
  const [symbol, setSymbol] = useState("");
  const [thesis, setThesis] = useState("");
  const [lessons, setLessons] = useState("");
  const [emotion, setEmotion] = useState("calm");
  const [rating, setRating] = useState("3");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [e, tr] = await Promise.all([
      supabase.from("trade_journal").select("*").eq("user_id", user.id)
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("trades").select("id, symbol, side, action, quantity, price, pnl, executed_at")
        .eq("user_id", user.id).order("executed_at", { ascending: false }).limit(20),
    ]);
    setEntries((e.data ?? []) as JournalEntry[]);
    setTrades((tr.data ?? []) as Trade[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const reset = () => {
    setEditing(null); setTradeId(""); setSymbol(""); setThesis("");
    setLessons(""); setEmotion("calm"); setRating("3");
  };

  const startNew = () => { reset(); setOpen(true); };
  const startEdit = (e: JournalEntry) => {
    setEditing(e); setTradeId(e.trade_id ?? ""); setSymbol(e.symbol);
    setThesis(e.thesis ?? ""); setLessons(e.lessons ?? "");
    setEmotion(e.emotion ?? "calm"); setRating(String(e.rating ?? 3));
    setOpen(true);
  };

  const save = async () => {
    if (!user) return;
    const sym = symbol.trim() || trades.find((t) => t.id === tradeId)?.symbol || "";
    if (!sym) {
      toast({ title: lang === "tr" ? "Sembol gerekli" : "Symbol required", variant: "destructive" });
      return;
    }
    const payload = {
      user_id: user.id, symbol: sym,
      trade_id: tradeId || null,
      thesis: thesis || null, lessons: lessons || null,
      emotion, rating: parseInt(rating, 10),
    };
    if (editing) {
      await supabase.from("trade_journal").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("trade_journal").insert(payload);
    }
    setOpen(false); reset(); load();
    toast({ title: tr.success });
  };

  const remove = async (id: string) => {
    await supabase.from("trade_journal").delete().eq("id", id);
    load();
  };

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookOpen className="size-6 text-primary" />
              {tr.journal}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "tr" ? "İşlem tezlerini ve derslerini kaydet, daha iyi trader ol." : "Log theses and lessons to become a better trader."}
            </p>
          </div>
          <Button onClick={startNew} className="gradient-primary text-primary-foreground">
            <Plus className="size-4" /> {tr.add_note}
          </Button>
        </header>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        ) : entries.length === 0 ? (
          <Card className="p-10 glass border-border/40 text-center">
            <BookOpen className="size-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {lang === "tr" ? "Henüz günlük girişin yok." : "No journal entries yet."}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <Card key={e.id} className="p-4 glass border-border/40">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge variant="outline" className="font-mono">{e.symbol}</Badge>
                  {e.emotion && <Badge variant="secondary" className="text-[10px]">{e.emotion}</Badge>}
                  {e.rating && (
                    <span className="flex items-center gap-0.5">
                      {Array.from({ length: e.rating }).map((_, i) => <Star key={i} className="size-3 fill-primary text-primary" />)}
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground ml-auto">
                    {new Date(e.created_at).toLocaleDateString(lang === "tr" ? "tr-TR" : "en-US")}
                  </span>
                </div>
                {e.thesis && <div className="text-sm mb-2"><strong>{tr.thesis}:</strong> {e.thesis}</div>}
                {e.lessons && <div className="text-sm text-muted-foreground"><strong>{tr.lessons}:</strong> {e.lessons}</div>}
                <div className="flex gap-2 mt-3">
                  <Button size="sm" variant="ghost" onClick={() => startEdit(e)}>{lang === "tr" ? "Düzenle" : "Edit"}</Button>
                  <Button size="sm" variant="ghost" className="text-bear" onClick={() => remove(e.id)}>{lang === "tr" ? "Sil" : "Delete"}</Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? (lang === "tr" ? "Notu Düzenle" : "Edit Note") : tr.add_note}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {trades.length > 0 && (
              <div className="space-y-2">
                <Label>{lang === "tr" ? "İşlem (opsiyonel)" : "Trade (optional)"}</Label>
                <Select value={tradeId} onValueChange={(v) => {
                  setTradeId(v);
                  const t = trades.find((x) => x.id === v); if (t) setSymbol(t.symbol);
                }}>
                  <SelectTrigger><SelectValue placeholder={lang === "tr" ? "İşlem seç..." : "Pick trade..."} /></SelectTrigger>
                  <SelectContent>
                    {trades.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.symbol} {t.side.toUpperCase()} {t.action} • {new Date(t.executed_at).toLocaleDateString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{lang === "tr" ? "Sembol" : "Symbol"}</Label>
              <Input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="BTCUSD" />
            </div>
            <div className="space-y-2">
              <Label>{tr.thesis}</Label>
              <Textarea value={thesis} onChange={(e) => setThesis(e.target.value)} rows={3} placeholder={lang === "tr" ? "Neden bu işlemi yaptın?" : "Why this trade?"} />
            </div>
            <div className="space-y-2">
              <Label>{tr.lessons}</Label>
              <Textarea value={lessons} onChange={(e) => setLessons(e.target.value)} rows={3} placeholder={lang === "tr" ? "Ne öğrendin?" : "What did you learn?"} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{tr.emotion}</Label>
                <Select value={emotion} onValueChange={setEmotion}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confident">{tr.emotion_confident}</SelectItem>
                    <SelectItem value="uncertain">{tr.emotion_uncertain}</SelectItem>
                    <SelectItem value="fearful">{tr.emotion_fearful}</SelectItem>
                    <SelectItem value="greedy">{tr.emotion_greedy}</SelectItem>
                    <SelectItem value="calm">{tr.emotion_calm}</SelectItem>
                    <SelectItem value="excited">{tr.emotion_excited}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{tr.rating} (1-5)</Label>
                <Select value={rating} onValueChange={setRating}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{tr.cancel}</Button>
            <Button onClick={save} className="gradient-primary text-primary-foreground">{tr.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

export default function Journal() { return <ProtectedRoute><JournalInner /></ProtectedRoute>; }
