// Canlı fiyatlar için merkezi hook (HMR-safe singleton).
// - Kripto: Binance WebSocket bookTicker (her bid/ask değişiminde tick, sub-100ms)
// - Diğer varlıklar: price_cache (Postgres realtime + 5sn polling yedek)
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startBinanceStream } from "@/lib/binanceStream";

export interface LivePrice {
  symbol: string;
  price: number;
  change_pct_24h: number | null;
  change_24h: number | null;
  updated_at: string;
}

interface PriceState {
  cache: Record<string, LivePrice>;
  listeners: Set<() => void>;
  initialized: boolean;
  channel: any;
  pollInterval: number | null;
  cleanupBinance: (() => void) | null;
}

// HMR-safe singleton: window üzerinde tut, modül reload'unda yeniden init etme
const w = typeof window !== "undefined" ? (window as any) : ({} as any);
const state: PriceState = w.__price_state ?? {
  cache: {},
  listeners: new Set<() => void>(),
  initialized: false,
  channel: null,
  pollInterval: null,
  cleanupBinance: null,
};
if (typeof window !== "undefined") w.__price_state = state;

function notify() {
  for (const l of state.listeners) l();
}

async function fetchAll() {
  const { data } = await supabase.from("price_cache").select("*");
  if (data) {
    for (const row of data) {
      // Binance WS'ten taze veri varsa onu ezme (kripto için)
      const existing = state.cache[row.symbol];
      const incoming: LivePrice = {
        symbol: row.symbol,
        price: Number(row.price),
        change_pct_24h: row.change_pct_24h !== null ? Number(row.change_pct_24h) : null,
        change_24h: row.change_24h !== null ? Number(row.change_24h) : null,
        updated_at: row.updated_at,
      };
      if (existing && new Date(existing.updated_at).getTime() > new Date(incoming.updated_at).getTime()) continue;
      state.cache[row.symbol] = incoming;
    }
    notify();
  }
}

function init() {
  if (state.initialized) return;
  state.initialized = true;
  fetchAll();

  // Eski kanal varsa temizle (HMR güvenliği)
  if (state.channel) {
    try { supabase.removeChannel(state.channel); } catch { /* noop */ }
    state.channel = null;
  }

  state.channel = supabase
    .channel("price_cache_live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "price_cache" },
      (payload: any) => {
        const row = payload.new;
        if (!row?.symbol) return;
        state.cache[row.symbol] = {
          symbol: row.symbol,
          price: Number(row.price),
          change_pct_24h: row.change_pct_24h !== null ? Number(row.change_pct_24h) : null,
          change_24h: row.change_24h !== null ? Number(row.change_24h) : null,
          updated_at: row.updated_at,
        };
        notify();
      }
    )
    .subscribe();

  if (state.pollInterval) clearInterval(state.pollInterval);
  state.pollInterval = window.setInterval(fetchAll, 5000);

  if (state.cleanupBinance) state.cleanupBinance();
  state.cleanupBinance = startBinanceStream((tick) => {
    const existing = state.cache[tick.symbol];
    state.cache[tick.symbol] = {
      symbol: tick.symbol,
      price: tick.price,
      change_pct_24h: tick.change_pct_24h ?? existing?.change_pct_24h ?? null,
      change_24h: existing?.change_24h ?? null,
      updated_at: tick.updated_at,
    };
    notify();
  });
}

export function useLivePrice(symbol?: string): LivePrice | null {
  const [, force] = useState(0);
  useEffect(() => {
    init();
    const cb = () => force((x) => x + 1);
    state.listeners.add(cb);
    return () => { state.listeners.delete(cb); };
  }, []);
  if (!symbol) return null;
  return state.cache[symbol] ?? null;
}

export function useLivePrices(symbols: string[]): Record<string, LivePrice> {
  const [, force] = useState(0);
  useEffect(() => {
    init();
    const cb = () => force((x) => x + 1);
    state.listeners.add(cb);
    return () => { state.listeners.delete(cb); };
  }, []);
  const out: Record<string, LivePrice> = {};
  for (const s of symbols) {
    if (state.cache[s]) out[s] = state.cache[s];
  }
  return out;
}

export function refreshPrices() { fetchAll(); }
