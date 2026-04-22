// Binance WebSocket — kripto fiyatları için anlık (sub-saniye) tick stream.
// Tek bir bağlantı tüm kripto sembollerini paylaşır; otomatik reconnect ve heartbeat.
// price_cache fallback'i bozmaz; sadece taze veri varsa cache'i ezer.

type Tick = { symbol: string; price: number; change_pct_24h: number | null; updated_at: string };
type Listener = (t: Tick) => void;

// internal symbol -> binance symbol
const PAIRS: Record<string, string> = {
  BTCUSD: "btcusdt", ETHUSD: "ethusdt", SOLUSD: "solusdt", BNBUSD: "bnbusdt",
  XRPUSD: "xrpusdt", DOGEUSD: "dogeusdt", ADAUSD: "adausdt", AVAXUSD: "avaxusdt",
};
const REVERSE: Record<string, string> = Object.fromEntries(
  Object.entries(PAIRS).map(([k, v]) => [v.toUpperCase(), k])
);

const listeners = new Set<Listener>();
let ws: WebSocket | null = null;
let reconnectTimer: number | null = null;
let backoff = 1000;

function connect() {
  if (typeof window === "undefined") return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  const streams = Object.values(PAIRS).map((s) => `${s}@ticker`).join("/");
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
  try {
    ws = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => { backoff = 1000; };
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      const d = msg?.data;
      if (!d || !d.s) return;
      const symbol = REVERSE[d.s];
      if (!symbol) return;
      const price = parseFloat(d.c);
      if (!isFinite(price) || price <= 0) return;
      const tick: Tick = {
        symbol,
        price,
        change_pct_24h: parseFloat(d.P),
        updated_at: new Date().toISOString(),
      };
      for (const l of listeners) l(tick);
    } catch { /* noop */ }
  };
  ws.onerror = () => { /* will close */ };
  ws.onclose = () => { ws = null; scheduleReconnect(); };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    backoff = Math.min(backoff * 2, 30000);
    connect();
  }, backoff);
}

export function startBinanceStream(onTick: Listener): () => void {
  listeners.add(onTick);
  connect();
  return () => { listeners.delete(onTick); };
}

export const CRYPTO_SYMBOLS = Object.keys(PAIRS);
