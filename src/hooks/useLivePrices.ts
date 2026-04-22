// Canlı fiyatlar için merkezi hook.
// - Kripto: Binance WebSocket (sub-saniye tick)
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

const cache: Record<string, LivePrice> = {};
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

let initialized = false;
let pollInterval: number | null = null;

async function fetchAll() {
  const { data } = await supabase.from("price_cache").select("*");
  if (data) {
    for (const row of data) {
      cache[row.symbol] = {
        symbol: row.symbol,
        price: Number(row.price),
        change_pct_24h: row.change_pct_24h !== null ? Number(row.change_pct_24h) : null,
        change_24h: row.change_24h !== null ? Number(row.change_24h) : null,
        updated_at: row.updated_at,
      };
    }
    notify();
  }
}

function init() {
  if (initialized) return;
  initialized = true;
  fetchAll();
  // Realtime
  const channel = supabase
    .channel("price_cache_live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "price_cache" },
      (payload: any) => {
        const row = payload.new;
        if (row?.symbol) {
          cache[row.symbol] = {
            symbol: row.symbol,
            price: Number(row.price),
            change_pct_24h: row.change_pct_24h !== null ? Number(row.change_pct_24h) : null,
            change_24h: row.change_24h !== null ? Number(row.change_24h) : null,
            updated_at: row.updated_at,
          };
          notify();
        }
      }
    )
    .subscribe();
  // Daha agresif polling: 5 saniyede bir taze veri çek (realtime düşse de fiyatlar gecikmesin)
  pollInterval = window.setInterval(fetchAll, 5000);
  // Kripto için Binance WebSocket - sub-saniye tick
  startBinanceStream((tick) => {
    const existing = cache[tick.symbol];
    cache[tick.symbol] = {
      symbol: tick.symbol,
      price: tick.price,
      change_pct_24h: tick.change_pct_24h,
      change_24h: existing?.change_24h ?? null,
      updated_at: tick.updated_at,
    };
    notify();
  });
  (window as any).__price_channel = channel;
}

export function useLivePrice(symbol?: string): LivePrice | null {
  const [, force] = useState(0);
  useEffect(() => {
    init();
    const cb = () => force((x) => x + 1);
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);
  if (!symbol) return null;
  return cache[symbol] ?? null;
}

export function useLivePrices(symbols: string[]): Record<string, LivePrice> {
  const [, force] = useState(0);
  useEffect(() => {
    init();
    const cb = () => force((x) => x + 1);
    listeners.add(cb);
    return () => { listeners.delete(cb); };
  }, []);
  const out: Record<string, LivePrice> = {};
  for (const s of symbols) {
    if (cache[s]) out[s] = cache[s];
  }
  return out;
}

export function refreshPrices() { fetchAll(); }
