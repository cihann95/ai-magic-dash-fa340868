import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, ShieldAlert, Search, X, Eye, Ban, CheckCircle } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { callEdgeFunction } from "@/lib/edge-error";
import type { Database } from "@/integrations/supabase/types";

type BlitzStatus = Database["public"]["Enums"]["blitz_status"];
type BlitzMode = Database["public"]["Enums"]["blitz_mode"];

interface Room {
  id: string;
  symbol: string;
  entry_fee: number;
  status: BlitzStatus;
  mode: BlitzMode;
  invite_code: string | null;
  max_players: number;
  starts_at: string | null;
  ends_at: string | null;
  start_price: number | null;
  winner_id: string | null;
  pot: number;
  fee_collected: number;
  created_at: string;
  created_by: string | null;
}

interface Participant {
  user_id: string;
  joined_at: string;
  final_pnl: number | null;
  rank: number | null;
}

interface SettlementEntry {
  id: string;
  room_id: string;
  settlement_type: string;
  winner_id: string | null;
  prize_amount: number;
  fee_collected: number;
  pot_total: number;
  participant_count: number;
  status: string;
  created_at: string;
}

const SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD", "BNBUSD", "XRPUSD", "DOGEUSD", "ADAUSD", "AVAXUSD"];
const STATUS_OPTIONS: { label: string; value: string }[] = [
  { label: "Tümü", value: "all" },
  { label: "Beklemede", value: "waiting" },
  { label: "Aktif", value: "active" },
  { label: "Settling", value: "settling" },
  { label: "Tamamlandı", value: "finished" },
  { label: "İptal", value: "cancelled" },
];
const MODE_OPTIONS = [
  { label: "Tümü", value: "all" },
  { label: "Herkese Açık", value: "public" },
  { label: "Özel", value: "private" },
];
const DATE_RANGES = [
  { label: "Son 7 gün", days: 7 },
  { label: "Son 30 gün", days: 30 },
  { label: "Son 90 gün", days: 90 },
  { label: "Tümü", days: 0 },
];

function statusBadge(s: BlitzStatus) {
  const map: Record<BlitzStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    waiting: { label: "Beklemede", variant: "secondary" },
    active: { label: "Aktif", variant: "default" },
    settling: { label: "Settling", variant: "outline" },
    finished: { label: "Tamamlandı", variant: "default" },
    cancelled: { label: "İptal", variant: "destructive" },
  };
  const b = map[s] ?? { label: s, variant: "outline" as const };
  return <Badge variant={b.variant}>{b.label}</Badge>;
}

export default function AdminRooms() {
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const [rooms, setRooms] = useState<Room[]>([]);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("all");
  const [symbolFilter, setSymbolFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [dateRange, setDateRange] = useState(30);

  // Cancel dialog
  const [cancelRoom, setCancelRoom] = useState<Room | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [canceling, setCanceling] = useState(false);

  // Settle dialog
  const [settleRoom, setSettleRoom] = useState<Room | null>(null);
  const [settling, setSettling] = useState(false);

  // Detail dialog
  const [detailRoom, setDetailRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [settlements, setSettlements] = useState<SettlementEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { navigate("/auth"); return; }
      supabase.rpc("has_role", { _user_id: session.user.id, _role: "admin" })
        .then(({ data }) => setIsAdmin(data === true));
    });
  }, [navigate]);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("blitz_rooms")
      .select("id, symbol, entry_fee, status, mode, invite_code, max_players, starts_at, ends_at, start_price, winner_id, pot, fee_collected, created_at, created_by")
      .order("created_at", { ascending: false })
      .limit(50);

    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (symbolFilter !== "all") query = query.eq("symbol", symbolFilter);
    if (modeFilter !== "all") query = query.eq("mode", modeFilter);
    if (dateRange > 0) {
      const from = new Date(Date.now() - dateRange * 86400000).toISOString();
      query = query.gte("created_at", from);
    }

    const { data, error } = await query;
    if (error) { toast.error("Odalar yüklenemedi"); setLoading(false); return; }

    const roomList = (data ?? []) as unknown as Room[];
    setRooms(roomList);

    if (roomList.length === 0) { setParticipantCounts({}); setLoading(false); return; }

    const ids = roomList.map((r) => r.id);
    const { data: counts } = await supabase
      .from("blitz_participants" as keyof Database["public"]["Tables"])
      .select("room_id")
      .in("room_id", ids);

    const map: Record<string, number> = {};
    (counts ?? []).forEach((p: { room_id: string }) => { map[p.room_id] = (map[p.room_id] ?? 0) + 1; });
    setParticipantCounts(map);
    setLoading(false);
  }, [statusFilter, symbolFilter, modeFilter, dateRange]);

  useEffect(() => { if (isAdmin === true) fetchRooms(); }, [isAdmin, fetchRooms]);

  async function handleCancel() {
    if (!cancelRoom) return;
    setCanceling(true);
    try {
      await callEdgeFunction("admin-cancel-room", { room_id: cancelRoom.id, reason: cancelReason || undefined });
      toast.success("Oda iptal edildi");
      setCancelRoom(null); setCancelReason("");
      fetchRooms();
    } catch { /* toast from callEdgeFunction */ }
    setCanceling(false);
  }

  async function handleSettle() {
    if (!settleRoom) return;
    setSettling(true);
    try {
      await callEdgeFunction("admin-settle-room", { room_id: settleRoom.id });
      toast.success("Oda sonuçlandırıldı");
      setSettleRoom(null);
      fetchRooms();
    } catch { /* toast from callEdgeFunction */ }
    setSettling(false);
  }

  async function openDetail(room: Room) {
    setDetailRoom(room);
    setDetailLoading(true);
    const [pRes, sRes] = await Promise.all([
      supabase.from("blitz_participants" as keyof Database["public"]["Tables"]).select("user_id, joined_at, final_pnl, rank").eq("room_id", room.id),
      supabase.from("settlement_ledger" as keyof Database["public"]["Tables"]).select("*").eq("room_id", room.id),
    ]);
    setParticipants((pRes.data ?? []) as unknown as Participant[]);
    setSettlements((sRes.data ?? []) as unknown as SettlementEntry[]);
    setDetailLoading(false);
  }

  if (isAdmin === null) {
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
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-bold">Oda Yönetimi</h1>
          <p className="text-sm text-muted-foreground">Blitz odalarını görüntüle, iptal et veya sonuçlandır</p>
        </header>

        {/* Filters */}
        <Card className="p-4 glass">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Durum</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Sembol</Label>
              <Select value={symbolFilter} onValueChange={setSymbolFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {SYMBOLS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mod</Label>
              <Select value={modeFilter} onValueChange={setModeFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tarih Aralığı</Label>
              <Select value={String(dateRange)} onValueChange={(v) => setDateRange(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DATE_RANGES.map((d) => <SelectItem key={d.days} value={String(d.days)}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Table */}
        <Card className="p-4 glass">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Oda ID</TableHead>
                  <TableHead>Sembol</TableHead>
                  <TableHead className="text-right">Entry</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Mod</TableHead>
                  <TableHead className="text-right">Kişi</TableHead>
                  <TableHead className="text-right">Pot</TableHead>
                  <TableHead className="text-right">Fee</TableHead>
                  <TableHead>Kazanan</TableHead>
                  <TableHead>Oluşturma</TableHead>
                  <TableHead>Aksiyon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 11 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : rooms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center text-muted-foreground py-12">
                      Filtrelere uygun oda bulunamadı
                    </TableCell>
                  </TableRow>
                ) : rooms.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell className="font-mono text-xs">{room.id.slice(0, 8)}</TableCell>
                    <TableCell><Badge variant="outline">{room.symbol}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">${room.entry_fee}</TableCell>
                    <TableCell>{statusBadge(room.status)}</TableCell>
                    <TableCell className="text-xs capitalize">{room.mode}</TableCell>
                    <TableCell className="text-right">{participantCounts[room.id] ?? 0}/{room.max_players}</TableCell>
                    <TableCell className="text-right tabular-nums">${Number(room.pot).toFixed(2)}</TableCell>
                    <TableCell className="text-right tabular-nums">${Number(room.fee_collected).toFixed(4)}</TableCell>
                    <TableCell className="text-xs font-mono">{room.winner_id ? room.winner_id.slice(0, 8) : "—"}</TableCell>
                    <TableCell className="text-xs">{new Date(room.created_at).toLocaleDateString("tr-TR")}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {(room.status === "waiting" || room.status === "active") && (
                          <Button size="sm" variant="destructive" onClick={() => setCancelRoom(room)}>
                            <Ban className="size-3" />
                          </Button>
                        )}
                        {room.status === "active" && (
                          <Button size="sm" variant="outline" onClick={() => setSettleRoom(room)}>
                            <CheckCircle className="size-3" />
                          </Button>
                        )}
                        {(room.status === "finished" || room.status === "cancelled") && (
                          <Button size="sm" variant="ghost" onClick={() => openDetail(room)}>
                            <Eye className="size-3" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Cancel Dialog */}
        <Dialog open={!!cancelRoom} onOpenChange={(o) => { if (!o) { setCancelRoom(null); setCancelReason(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Odayı İptal Et</DialogTitle>
              <DialogDescription>
                Bu oda iptal edilecek. Katılımcı bakiyeleri iade edilecek.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-xs">Sebep (opsiyonel)</Label>
              <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="İptal sebebi..." />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCancelRoom(null); setCancelReason(""); }}>Vazgeç</Button>
              <Button variant="destructive" onClick={handleCancel} disabled={canceling}>
                {canceling ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                İptal Et
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Settle Dialog */}
        <Dialog open={!!settleRoom} onOpenChange={(o) => { if (!o) setSettleRoom(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Odayı Sonuçlandır</DialogTitle>
              <DialogDescription>
                Bu oda manuel sonuçlandırılacak. Sistem otomatik kazanan belirleyecek.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSettleRoom(null)}>Vazgeç</Button>
              <Button onClick={handleSettle} disabled={settling}>
                {settling ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                Sonuçlandır
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={!!detailRoom} onOpenChange={(o) => { if (!o) setDetailRoom(null); }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Oda Detayı</DialogTitle>
              <DialogDescription>{detailRoom?.id.slice(0, 8)} — {detailRoom?.symbol} — {detailRoom?.status}</DialogDescription>
            </DialogHeader>
            {detailLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold mb-2">Katılımcılar ({participants.length})</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Kullanıcı</TableHead>
                        <TableHead>Katılım</TableHead>
                        <TableHead className="text-right">PnL</TableHead>
                        <TableHead className="text-right">Sıra</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {participants.map((p) => (
                        <TableRow key={p.user_id}>
                          <TableCell className="font-mono text-xs">{p.user_id.slice(0, 8)}</TableCell>
                          <TableCell className="text-xs">{new Date(p.joined_at).toLocaleString("tr-TR")}</TableCell>
                          <TableCell className={`text-right tabular-nums ${(p.final_pnl ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {p.final_pnl != null ? `$${Number(p.final_pnl).toFixed(2)}` : "—"}
                          </TableCell>
                          <TableCell className="text-right">{p.rank ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                      {participants.length === 0 && (
                        <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Katılımcı yok</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-2">Settlement Kayıtları ({settlements.length})</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tür</TableHead>
                        <TableHead>Durum</TableHead>
                        <TableHead className="text-right">Ödül</TableHead>
                        <TableHead className="text-right">Fee</TableHead>
                        <TableHead>Tarih</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {settlements.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell><Badge variant="outline">{s.settlement_type}</Badge></TableCell>
                          <TableCell><Badge variant={s.status === "completed" ? "default" : "destructive"}>{s.status}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">${Number(s.prize_amount).toFixed(2)}</TableCell>
                          <TableCell className="text-right tabular-nums">${Number(s.fee_collected).toFixed(4)}</TableCell>
                          <TableCell className="text-xs">{new Date(s.created_at).toLocaleString("tr-TR")}</TableCell>
                        </TableRow>
                      ))}
                      {settlements.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Settlement kaydı yok</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
