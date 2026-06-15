// Blitz oda durumu için realtime hook
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { RealtimePostgresChangesPayload } from "@supabase/realtime-js";

export type BlitzRoom = Tables<"blitz_rooms">;
export type BlitzParticipant = Tables<"blitz_participants">;
export type BlitzOrder = Tables<"blitz_orders">;

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
      setRoom(r.data ?? null);
      setParticipants(p.data ?? []);
      setOrders(o.data ?? []);
      setLoading(false);
    }
    load();

    const ch = supabase.channel(`blitz_room_${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "blitz_rooms", filter: `id=eq.${roomId}` },
        (payload: RealtimePostgresChangesPayload<BlitzRoom>) => {
          if (payload.eventType !== "DELETE" && payload.new) setRoom(payload.new as BlitzRoom);
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "blitz_participants", filter: `room_id=eq.${roomId}` },
        () => { load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "blitz_orders", filter: `room_id=eq.${roomId}` },
        () => { load(); })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [roomId]);

  return { room, participants, orders, loading };
}
