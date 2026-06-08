// Blitz Lobi: Hızlı maç + private oda oluştur/katıl
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Swords, Plus, KeyRound, Zap, X } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SYMBOLS } from "@/lib/symbols";
import { supabase } from "@/integrations/supabase/client";
import { useApp } from "@/contexts/AppContext";

const ENTRY_FEES = [5, 10, 25, 50];

export default function Blitz() {
  const { user } = useApp();
  const navigate = useNavigate();
  const [symbol, setSymbol] = useState("BTCUSD");
  const [entryFee, setEntryFee] = useState(5);
  const [queueing, setQueueing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [waitingRoomId, setWaitingRoomId] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ real: number; locked: number } | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("real_balance, real_balance_locked").eq("id", user.id).maybeSingle()
      .then(({ data }) => {
        if (data) setBalance({ real: Number(data.real_balance), locked: Number(data.real_balance_locked) });
      });
  }, [user]);

  // Kuyrukta beklerken yeni oda açıldığında dinle
  useEffect(() => {
    if (!queueing || !user) return;
    const ch = supabase.channel("blitz_lobby_wait")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "blitz_participants", filter: `user_id=eq.${user.id}` },
        async (payload: any) => {
          const roomId = payload.new?.room_id;
          if (roomId) {
            setQueueing(false);
            navigate(`/blitz/${roomId}`);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queueing, user, navigate]);

  async function quickMatch() {
    if (!user) { navigate("/auth"); return; }
    setQueueing(true);
    const { data, error } = await supabase.functions.invoke("blitz-matchmake", {
      body: { mode: "quick", symbol, entry_fee: entryFee },
    });
    if (error) {
      setQueueing(false);
      toast.error(error.message ?? "Eşleştirme hatası");
      return;
    }
    if (data?.status === "active" && data?.room_id) {
      setQueueing(false);
      navigate(`/blitz/${data.room_id}`);
      return;
    }
    if (data?.error) {
      setQueueing(false);
      toast.error(data.error);
      return;
    }
    toast.success("Kuyruğa eklendi. Rakip aranıyor...");
  }

  async function cancelQueue() {
    await supabase.functions.invoke("blitz-matchmake", {
      body: { mode: "cancel", symbol, entry_fee: entryFee },
    });
    setQueueing(false);
    toast.info("Kuyruktan çıktın");
  }

  async function createPrivate() {
    if (!user) { navigate("/auth"); return; }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("blitz-matchmake", {
      body: { mode: "create_private", symbol, entry_fee: entryFee },
    });
    setCreating(false);
    if (error || data?.error) {
      toast.error(error?.message ?? data?.error ?? "Oluşturulamadı");
      return;
    }
    setWaitingRoomId(data.room_id);
    toast.success(`Davet kodu: ${data.invite_code}`);
  }

  async function joinPrivate() {
    if (!user) { navigate("/auth"); return; }
    if (!inviteCode.trim()) return;
    setJoining(true);
    const { data, error } = await supabase.functions.invoke("blitz-join-private", {
      body: { invite_code: inviteCode.trim() },
    });
    setJoining(false);
    if (error || data?.error) {
      toast.error(error?.message ?? data?.error ?? "Katılım hatası");
      return;
    }
    navigate(`/blitz/${data.room_id}`);
  }

  // Waiting room takip
  useEffect(() => {
    if (!waitingRoomId) return;
    const ch = supabase.channel(`blitz_wait_${waitingRoomId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "blitz_rooms", filter: `id=eq.${waitingRoomId}` },
        (payload: any) => {
          if (payload.new?.status === "active") {
            navigate(`/blitz/${waitingRoomId}`);
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [waitingRoomId, navigate]);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
        <header className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full bg-primary/15 text-primary">
            <Zap className="size-3" /> BETA
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            <span className="text-gradient">Blitz</span> Arena
          </h1>
          <p className="text-sm text-muted-foreground">60 saniye. 1v1. Kazanan havuzu alır.</p>
        </header>

        {balance && (
          <Card className="p-4 flex items-center justify-between glass">
            <div>
              <div className="text-xs text-muted-foreground">Blitz cüzdanı</div>
              <div className="text-2xl font-bold">${(balance.real - balance.locked).toFixed(2)}</div>
              {balance.locked > 0 && (
                <div className="text-[11px] text-muted-foreground">Kilitli: ${balance.locked.toFixed(2)}</div>
              )}
            </div>
            <div className="text-xs text-muted-foreground text-right max-w-[180px]">
              Bakiye yetersizse yöneticiyle iletişime geç.
            </div>
          </Card>
        )}

        <Card className="p-5 space-y-5 glass">
          <div className="space-y-2">
            <Label>Sembol</Label>
            <div className="flex flex-wrap gap-2">
              {SYMBOLS.filter((s) => s.market_open).slice(0, 12).map((s) => (
                <Button key={s.symbol} size="sm"
                  variant={symbol === s.symbol ? "default" : "outline"}
                  onClick={() => setSymbol(s.symbol)}>
                  {s.symbol}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Giriş Ücreti</Label>
            <div className="flex gap-2">
              {ENTRY_FEES.map((f) => (
                <Button key={f} size="sm"
                  variant={entryFee === f ? "default" : "outline"}
                  onClick={() => setEntryFee(f)}>
                  ${f}
                </Button>
              ))}
            </div>
          </div>

          <Tabs defaultValue="quick" className="w-full">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="quick"><Swords className="size-4 mr-1" /> Hızlı Maç</TabsTrigger>
              <TabsTrigger value="private"><KeyRound className="size-4 mr-1" /> Özel Oda</TabsTrigger>
            </TabsList>

            <TabsContent value="quick" className="pt-4">
              {!queueing ? (
                <Button className="w-full h-12 gradient-primary text-primary-foreground" onClick={quickMatch}>
                  <Swords className="size-4 mr-2" /> Eşleşme bul
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-3 py-4">
                    <Loader2 className="size-5 animate-spin text-primary" />
                    <span className="text-sm">Rakip aranıyor...</span>
                  </div>
                  <Button variant="outline" className="w-full" onClick={cancelQueue}>
                    <X className="size-4 mr-2" /> İptal
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="private" className="pt-4 space-y-4">
              <Button className="w-full" variant="outline" onClick={createPrivate} disabled={creating || !!waitingRoomId}>
                {creating ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plus className="size-4 mr-2" />}
                Davet kodu oluştur
              </Button>
              {waitingRoomId && (
                <div className="text-center text-xs text-muted-foreground">Oda bekliyor, rakibin katılmasını bekle.</div>
              )}
              <div className="flex gap-2">
                <Input placeholder="DAVET KODU" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.toUpperCase())} maxLength={8} />
                <Button onClick={joinPrivate} disabled={joining || !inviteCode}>
                  {joining ? <Loader2 className="size-4 animate-spin" /> : "Katıl"}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        <p className="text-[11px] text-muted-foreground text-center">
          ⚠️ Demo bakiyenden ayrı, gerçek-para benzeri bir cüzdandır. Ödeme entegrasyonu yok — bakiye manuel kredilenir.
        </p>
      </div>
    </AppShell>
  );
}
