// Canlı fiyatlar için merkezi hook. price_cache tablosundan başlangıç verisi çeker
// ve realtime subscription ile günceller. 60 saniyede bir de polling yapar (yedek).
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
  // yedek polling (realtime kapalıysa)
  pollInterval = window.setInterval(fetchAll, 30000);
  // unmount durumlarında cleanup için referans saklama (basit hold)
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
