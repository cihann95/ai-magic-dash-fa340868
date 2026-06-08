// Blitz oda durumu için realtime hook
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface BlitzRoom {
  id: string;
  symbol: string;
  entry_fee: number;
  status: "waiting" | "active" | "settling" | "finished" | "cancelled";
  mode: "public" | "private";
  invite_code: string | null;
  max_players: number;
  starts_at: string | null;
  ends_at: string | null;
  start_price: number | null;
  winner_id: string | null;
  pot: number;
  fee_collected: number;
  created_by: string | null;
}

export interface BlitzParticipant {
  id: string;
  room_id: string;
  user_id: string;
  joined_at: string;
  final_pnl: number | null;
  rank: number | null;
}

export interface BlitzOrder {
  id: string;
  room_id: string;
  user_id: string;
  side: "long" | "short";
  amount: number;
  entry_price: number;
  exit_price: number | null;
  pnl: number | null;
  opened_at: string;
  closed_at: string | null;
}

export function useBlitzRoom(roomId: string | undefined) {
  const [room, setRoom] = useState<BlitzRoom | null>(null);
  const [participants, setParticipants] = useState<BlitzParticipant[]>([]);
  const [orders, setOrders] = useState<BlitzOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;

    async function load() {
      const [r, p, o] = await Promise.all([
        supabase.from("blitz_rooms").select("*").eq("id", roomId!).maybeSingle(),
        supabase.from("blitz_participants").select("*").eq("room_id", roomId!),
        supabase.from("blitz_orders").select("*").eq("room_id", roomId!).order("opened_at", { ascending: true }),
      ]);
      if (cancelled) return;
      setRoom((r.data as any) ?? null);
      setParticipants((p.data as any) ?? []);
      setOrders((o.data as any) ?? []);
      setLoading(false);
    }
    load();

    const ch = supabase.channel(`blitz_room_${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "blitz_rooms", filter: `id=eq.${roomId}` },
        (payload: any) => { if (payload.new) setRoom(payload.new as BlitzRoom); })
      .on("postgres_changes", { event: "*", schema: "public", table: "blitz_participants", filter: `room_id=eq.${roomId}` },
        () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "blitz_orders", filter: `room_id=eq.${roomId}` },
        () => { load(); })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [roomId]);

  return { room, participants, orders, loading };
}
