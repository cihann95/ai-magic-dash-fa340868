// Blitz Oda: 60s sayaç, 1m TradingView grafik, LONG/SHORT butonları, canlı PnL listesi.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Loader2, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import TradingViewChart from "@/components/TradingViewChart";
import { BlitzTimer, TradeActions, BlitzLeaderboard } from "@/components/blitz";
import { useBlitzRoom } from "@/hooks/useBlitzRoom";
import { useLivePrice } from "@/hooks/useLivePrices";
import { findSymbol } from "@/lib/symbols";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";
import { blitzSfx, vibrate } from "@/lib/blitzSfx";
import { cn } from "@/lib/utils";

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
  const [sfxOn, setSfxOn] = useState(() => typeof window !== "undefined" && localStorage.getItem("blitz_sfx_off") !== "1");
  const lastTickRef = useRef<number | null>(null);
  const resultFiredRef = useRef(false);

  function toggleSfx() {
    const next = !sfxOn;
    setSfxOn(next);
    localStorage.setItem("blitz_sfx_off", next ? "0" : "1");
  }

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

  // Son 5 saniye tick sesi + haptik
  useEffect(() => {
    if (secondsLeft == null || room?.status !== "active") return;
    if (secondsLeft <= 5 && secondsLeft > 0 && lastTickRef.current !== secondsLeft) {
      lastTickRef.current = secondsLeft;
      blitzSfx.countdown();
      vibrate(30);
    }
  }, [secondsLeft, room?.status]);

  // Finished olunca sonuç modali + ses + konfeti
  useEffect(() => {
    if (room?.status !== "finished" || resultFiredRef.current) return;
    resultFiredRef.current = true;
    setResultOpen(true);
    const won = room.winner_id === user?.id;
    const tie = !room.winner_id;
    if (won) {
      blitzSfx.win();
      vibrate([60, 40, 60, 40, 120]);
      // Konfeti — sol ve sağ kenardan
      const duration = 1500;
      const end = Date.now() + duration;
      (function frame() {
        confetti({ particleCount: 5, angle: 60, spread: 65, origin: { x: 0, y: 0.7 }, colors: ["#fbbf24", "#22c55e", "#3b82f6"] });
        confetti({ particleCount: 5, angle: 120, spread: 65, origin: { x: 1, y: 0.7 }, colors: ["#fbbf24", "#22c55e", "#3b82f6"] });
        if (Date.now() < end) requestAnimationFrame(frame);
      })();
    } else if (tie) {
      blitzSfx.close();
    } else {
      blitzSfx.lose();
      vibrate([180]);
    }
  }, [room?.status, room?.winner_id, user?.id]);

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
    blitzSfx.open(); vibrate(40);
    const { data, error } = await supabase.functions.invoke("blitz-tick-order", {
      body: { room_id: room.id, action: "open", side, amount },
    });
    setSubmitting(false);
    if (error || data?.error) toast.error(error?.message ?? data?.error ?? "Hata");
  }

  async function closePosition() {
    if (!room || !myOpenOrder) return;
    setSubmitting(true);
    blitzSfx.close(); vibrate(40);
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
          <BlitzTimer
            secondsLeft={secondsLeft}
            status={room.status}
            isActive={isActive}
            symbol={room.symbol}
            price={price}
            pot={room.pot}
            sfxOn={sfxOn}
            onToggleSfx={toggleSfx}
          />

          {/* Grafik */}
          <div className="flex-1 min-h-[400px] rounded-2xl overflow-hidden border border-border/40">
            {symbolDef && (
              <TradingViewChart symbol={symbolDef.tv} key={symbolDef.symbol} />
            )}
          </div>

          {/* Aksiyonlar */}
          <TradeActions
            isActive={isActive}
            myOpenOrder={myOpenOrder}
            amount={amount}
            submitting={submitting}
            onAmountChange={setAmount}
            onOpenPosition={openPosition}
            onClosePosition={closePosition}
          />

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
        <BlitzLeaderboard
          ranking={ranking}
          usernames={usernames}
          userId={user?.id ?? ""}
          entryFee={Number(room.entry_fee)}
          isActive={isActive}
        />
      </div>

      {/* Sonuç modali */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              {won ? "🏆 Kazandın!" : tie ? "🤝 Berabere" : "😔 Kaybettin"}
            </DialogTitle>
          </DialogHeader>
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            className="space-y-4 text-center py-4"
          >
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 220 }}
              className="text-5xl font-bold tabular-nums"
            >
              <span className={myFinalPnl >= 0 ? "text-green-500" : "text-red-500"}>
                {myFinalPnl >= 0 ? "+" : ""}${myFinalPnl.toFixed(2)}
              </span>
            </motion.div>
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
          </motion.div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
