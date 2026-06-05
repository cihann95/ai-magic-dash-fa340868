// Davranışsal sinyal motoru - hızlı sıralı işlem, tepkisel açma, aşırı pozisyon tespiti
// Tamamen client-side, KVKK uyumlu (sadece localStorage'da kullanıcının kendi cihazında).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type EmotionalSignal = "rapid_fire" | "reactive" | "oversize" | null;

interface RecentTrade { ts: number; total: number; closed_ts?: number }

const KEY = "lumen_recent_trades_v1";
const WINDOW_MS = 5 * 60 * 1000; // 5dk
const MAX_TRADES = 20;

function read(): RecentTrade[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function write(arr: RecentTrade[]) {
  try { localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX_TRADES))); } catch { /* noop */ }
}

export function recordTrade(total: number, closed = false) {
  const arr = read();
  const now = Date.now();
  if (closed && arr.length) arr[arr.length - 1].closed_ts = now;
  else arr.push({ ts: now, total: Math.abs(total) });
  write(arr);
}

/**
 * Returns the strongest current emotional signal for a contemplated trade.
 * `prospectiveTotal` = qty * price for the trade about to be placed.
 */
export function detectSignal(prospectiveTotal: number): EmotionalSignal {
  const arr = read();
  const now = Date.now();
  const recent = arr.filter((t) => now - t.ts < WINDOW_MS);

  // 1) rapid fire: 3+ trades in 5 min
  if (recent.length >= 3) return "rapid_fire";

  // 2) reactive: last trade closed <60s ago
  const last = arr[arr.length - 1];
  if (last?.closed_ts && now - last.closed_ts < 60_000) return "reactive";

  // 3) oversize: prospective > 3x median of last 20
  if (arr.length >= 5 && prospectiveTotal > 0) {
    const totals = arr.map((t) => t.total).filter((x) => x > 0).sort((a, b) => a - b);
    if (totals.length) {
      const median = totals[Math.floor(totals.length / 2)];
      if (median > 0 && prospectiveTotal > median * 3) return "oversize";
    }
  }
  return null;
}

/** Sends mood/signal log to backend (best-effort, non-blocking). */
export async function logEmotion(params: {
  userId: string;
  signalType: string;
  mood: string | null;
  symbol?: string;
  tradeId?: string;
}) {
  try {
    await supabase.from("emotional_logs").insert({
      user_id: params.userId,
      signal_type: params.signalType,
      mood: params.mood,
      symbol: params.symbol ?? null,
      trade_id: params.tradeId ?? null,
    });
  } catch (e) {
    console.warn("emotional log insert failed", e);
  }
}

/** Hook variant for components that want reactive state. */
export function useEmotionalSignal(prospectiveTotal: number): EmotionalSignal {
  const [sig, setSig] = useState<EmotionalSignal>(null);
  const refresh = useCallback(() => setSig(detectSignal(prospectiveTotal)), [prospectiveTotal]);
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);
  return sig;
}
