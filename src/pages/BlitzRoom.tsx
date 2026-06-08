// Blitz Oda: 60s sayaç, 1m TradingView grafik, LONG/SHORT butonları, canlı PnL listesi.
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Trophy, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TradingViewChart from "@/components/TradingViewChart";
import { useBlitzRoom } from "@/hooks/useBlitzRoom";
import { useLivePrice } from "@/hooks/useLivePrices";
import { findSymbol, formatPrice } from "@/lib/symbols";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { cn } from "@/lib/utils";

const QUICK_AMOUNTS = [5, 10, 25, 50];

export default function BlitzRoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { user } = useApp();
  const { room, participants, orders } = useBlitzRoom(roomId);
  const [amount, setAmount] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [resultOpen, setResultOpen] = useState(false);
  const [usernames, setUsernames] = useState<Record<string, string>>({});

  const symbolDef = useMemo(() => room ? findSymbol(room.symbol) : null, [room]);
  const live = useLivePrice(room?.symbol);
  const price = live?.price ?? null;

  // Saniye sayacı
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const secondsLeft = useMemo(() => {
    if (!room?.ends_at || room.status !== "active") return null;
    return Math.max(0, Math.ceil((new Date(room.ends_at).getTime() - now) / 1000));
  }, [room, now]);

  // Süre bittiğinde settle çağır (idempotent)
  useEffect(() => {
    if (secondsLeft === 0 && room?.status === "active") {
      supabase.functions.invoke("blitz-settle-room", { body: { room_id: room.id } });
    }
  }, [secondsLeft, room]);

  // Finished olunca sonuç modali
  useEffect(() => {
    if (room?.status === "finished") setResultOpen(true);
  }, [room?.status]);

  // Kullanıcı adlarını çek
  useEffect(() => {
    if (participants.length === 0) return;
    const ids = participants.map((p) => p.user_id);
    supabase.from("public_profiles").select("user_id, username").in("user_id", ids)
      .then(({ data }) => {
        const map: Record<string, string> = {};
        for (const r of data ?? []) map[r.user_id] = r.username ?? "Oyuncu";
        setUsernames(map);
      });
  }, [participants]);

  const myOpenOrder = useMemo(
    () => orders.find((o) => o.user_id === user?.id && !o.closed_at),
    [orders, user]
  );

  const userPnls = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of participants) out[p.user_id] = 0;
    for (const o of orders) {
      if (o.user_id in out) {
        if (o.closed_at && o.pnl != null) {
          out[o.user_id] += Number(o.pnl);
        } else if (!o.closed_at && price) {
          const dir = o.side === "long" ? 1 : -1;
          const livePnl = ((price - Number(o.entry_price)) / Number(o.entry_price)) * Number(o.amount) * dir;
          out[o.user_id] += livePnl;
        }
      }
    }
    return out;
  }, [participants, orders, price]);

  const ranking = useMemo(
    () => Object.entries(userPnls).sort((a, b) => b[1] - a[1]),
    [userPnls]
  );

  async function openPosition(side: "long" | "short") {
    if (!room) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("blitz-tick-order", {
      body: { room_id: room.id, action: "open", side, amount },
    });
    setSubmitting(false);
    if (error || data?.error) toast.error(error?.message ?? data?.error ?? "Hata");
  }

  async function closePosition() {
    if (!room || !myOpenOrder) return;
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("blitz-tick-order", {
      body: { room_id: room.id, action: "close", order_id: myOpenOrder.id },
    });
    setSubmitting(false);
    if (error || data?.error) toast.error(error?.message ?? data?.error ?? "Hata");
  }

  if (!room) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const isWaiting = room.status === "waiting";
  const isActive = room.status === "active";
  const isFinished = room.status === "finished";
  const myFinalPnl = userPnls[user?.id ?? ""] ?? 0;
  const won = isFinished && room.winner_id === user?.id;
  const tie = isFinished && !room.winner_id;

  return (
    <AppShell>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3 p-3 h-[calc(100vh-4rem)]">
        {/* Ana */}
        <div className="flex flex-col gap-3 min-h-0">
          {/* Sayaç */}
          <Card className="p-4 glass flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">{room.symbol}</div>
              <div className="text-xl font-bold">${formatPrice(price)}</div>
            </div>
            <div className={cn(
              "text-5xl md:text-6xl font-bold tabular-nums tracking-tight",
              secondsLeft !== null && secondsLeft <= 10 ? "text-destructive animate-pulse" : "text-primary"
            )}>
              {isWaiting && "—:—"}
              {isActive && secondsLeft !== null && `0:${secondsLeft.toString().padStart(2, "0")}`}
              {(isFinished || room.status === "settling") && "0:00"}
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Havuz</div>
              <div className="text-xl font-bold">${Number(room.pot).toFixed(2)}</div>
            </div>
          </Card>

          {/* Grafik */}
          <div className="flex-1 min-h-[400px] rounded-2xl overflow-hidden border border-border/40">
            {symbolDef && (
              <TradingViewChart symbol={symbolDef.tv} key={symbolDef.symbol} />
            )}
          </div>

          {/* Aksiyonlar */}
          {isActive && (
            <Card className="p-4 glass space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">Miktar</div>
                <div className="flex gap-1">
                  {QUICK_AMOUNTS.map((a) => (
                    <Button key={a} size="sm" variant={amount === a ? "default" : "outline"}
                      onClick={() => setAmount(a)}>${a}</Button>
                  ))}
                </div>
              </div>

              {!myOpenOrder ? (
                <div className="grid grid-cols-2 gap-3">
                  <Button size="lg" className="h-16 bg-green-600 hover:bg-green-700 text-white text-lg font-bold"
                    onClick={() => openPosition("long")} disabled={submitting}>
                    <ArrowUp className="size-5 mr-1" /> LONG
                  </Button>
                  <Button size="lg" className="h-16 bg-red-600 hover:bg-red-700 text-white text-lg font-bold"
                    onClick={() => openPosition("short")} disabled={submitting}>
                    <ArrowDown className="size-5 mr-1" /> SHORT
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {myOpenOrder.side.toUpperCase()} ${Number(myOpenOrder.amount)}
                    </span>
                    <span className="text-muted-foreground">
                      @ {formatPrice(Number(myOpenOrder.entry_price))}
                    </span>
                  </div>
                  <Button size="lg" className="w-full h-14" variant="outline"
                    onClick={closePosition} disabled={submitting}>
                    {submitting ? <Loader2 className="size-4 animate-spin" /> : "Pozisyonu Kapat"}
                  </Button>
                </div>
              )}
            </Card>
          )}

          {isWaiting && (
            <Card className="p-6 glass text-center space-y-2">
              <Loader2 className="size-6 animate-spin mx-auto text-primary" />
              <div className="text-sm">Rakip bekleniyor...</div>
              {room.invite_code && (
                <div className="text-xs text-muted-foreground">
                  Davet kodu: <span className="font-mono font-bold text-foreground">{room.invite_code}</span>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Leaderboard */}
        <aside className="rounded-2xl glass border border-border/40 p-4 overflow-auto">
          <div className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Trophy className="size-4 text-primary" /> Canlı Sıralama
          </div>
          <div className="space-y-2">
            {ranking.map(([uid, pnl], idx) => {
              const isMe = uid === user?.id;
              const pnlPct = room.entry_fee > 0 ? (pnl / Number(room.entry_fee)) * 100 : 0;
              return (
                <div key={uid} className={cn(
                  "flex items-center justify-between p-2 rounded-lg border border-border/40 transition-all",
                  isMe && "bg-primary/10 border-primary/40"
                )}>
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-muted text-xs flex items-center justify-center font-bold">
                      {idx + 1}
                    </div>
                    <div className="text-sm font-medium truncate max-w-[110px]">
                      {usernames[uid] ?? (isMe ? "Sen" : "Oyuncu")}
                      {isMe && <span className="text-[10px] text-primary ml-1">(siz)</span>}
                    </div>
                  </div>
                  <div className={cn(
                    "text-sm font-bold tabular-nums",
                    pnl > 0 ? "text-green-500" : pnl < 0 ? "text-red-500" : "text-muted-foreground"
                  )}>
                    {pnl >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                  </div>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Sonuç modali */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              {won ? "🏆 Kazandın!" : tie ? "🤝 Berabere" : "😔 Kaybettin"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-center py-4">
            <div className="text-4xl font-bold tabular-nums">
              <span className={myFinalPnl >= 0 ? "text-green-500" : "text-red-500"}>
                {myFinalPnl >= 0 ? "+" : ""}${myFinalPnl.toFixed(2)}
              </span>
            </div>
            {won && (
              <div className="text-sm text-muted-foreground">
                Net ödül: <span className="font-bold text-foreground">
                  ${(Number(room.pot) - Number(room.fee_collected)).toFixed(2)}
                </span>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => navigate("/blitz")}>
                <X className="size-4 mr-2" /> Çık
              </Button>
              <Button className="flex-1 gradient-primary text-primary-foreground"
                onClick={() => navigate(`/blitz?symbol=${room.symbol}&fee=${room.entry_fee}`)}>
                Rövanş
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
