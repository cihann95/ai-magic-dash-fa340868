// Ana Sahne (featured room) hook — fetch, realtime, presence, viewer count
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";


/**
 * ana_sahne_view is a Postgres view not included in the auto-generated Supabase types.
 * Narrow type for querying unregistered tables/views.
 */
interface UnregisteredTableClient {
  from(table: string): {
    select(cols?: string): {
      single(): Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

/** Shape returned by ana_sahne_view (SECURITY DEFINER — no PII) */
export interface AnaSahneRoom {
  id: string;
  symbol: string;
  entry_fee: number;
  status: "waiting" | "active" | "settling" | "finished" | "cancelled";
  mode: "public" | "private";
  max_players: number;
  starts_at: string | null;
  ends_at: string | null;
  start_price: number | null;
  pot: number;
  fee_collected: number;
  created_at: string;
  updated_at: string;
  is_featured: boolean;
  participants: AnaSahneParticipant[];
}

export interface AnaSahneParticipant {
  username: string;
  side: "long" | "short" | null;
  pnl: number;
  pnlPct: number;
}

export interface AnaSahneState {
  room: AnaSahneRoom | null;
  participants: AnaSahneParticipant[];
  timeLeft: number | null;
  viewers: number;
  isLoading: boolean;
  isFinished: boolean;
  error: string | null;
}

/** Calculate seconds left before room start (starts_at + 60s − now) */
function computeTimeLeft(startsAt: string | null): number | null {
  if (!startsAt) return null;
  const target = new Date(startsAt).getTime() + 60_000; // 60s countdown after start
  const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
  return diff;
}

export function useAnaSahne(): AnaSahneState {
  const [room, setRoom] = useState<AnaSahneRoom | null>(null);
  const [participants, setParticipants] = useState<AnaSahneParticipant[]>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [viewers, setViewers] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFinished, setIsFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ref to track latest room for the timer closure
  const roomRef = useRef<AnaSahneRoom | null>(null);
  roomRef.current = room;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data, error: fetchErr } = await (supabase as unknown as UnregisteredTableClient)
          .from("ana_sahne_view")
          .select("*")
          .maybeSingle();

        if (cancelled) return;

        if (fetchErr) {
          setError(fetchErr.message);
          setIsLoading(false);
          return;
        }

        if (!data) {
          setRoom(null);
          setParticipants([]);
          setIsLoading(false);
          return;
        }

        const row = data as unknown as AnaSahneRoom;
        setRoom(row);
        setParticipants(row.participants ?? []);
        setIsFinished(row.status === "finished");
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
        setIsLoading(false);
      }
    }

    load();

    // Realtime channel — postgres_changes on the view table + presence
    const channel = supabase
      .channel("ana-sahne")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ana_sahne_view" },
        () => {
          if (!cancelled) load();
        }
      )
      .on("presence", { event: "sync" }, () => {
        if (cancelled) return;
        const state = channel.presenceState();
        const count = Object.keys(state).reduce(
          (acc, key) => acc + ((state[key] as unknown[])?.length ?? 0),
          0
        );
        setViewers(count);
      })
      .subscribe();

    // Track presence (ephemeral — no PII)
    channel.track({ user_id: "anonymous" });

    // 250ms countdown timer
    const timer = setInterval(() => {
      if (cancelled) return;
      const current = roomRef.current;
      if (current?.starts_at) {
        setTimeLeft(computeTimeLeft(current.starts_at));
      }
    }, 250);

    return () => {
      cancelled = true;
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, []);

  return {
    room,
    participants,
    timeLeft,
    viewers,
    isLoading,
    isFinished,
    error,
  };
}
