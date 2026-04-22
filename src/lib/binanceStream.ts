// Binance WebSocket — kripto fiyatları için anlık tick stream.
// Görsel chart ile daha iyi hizalama için ekranda son gerçekleşen işlem fiyatını kullanırız.
// Tek bağlantı tüm sembolleri paylaşır; auto-reconnect + exp backoff.

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

// HMR-safe singleton
const w = typeof window !== "undefined" ? (window as any) : ({} as any);
const S = w.__binance_stream ?? {
  listeners: new Set<Listener>(),
  ws: null as WebSocket | null,
  reconnectTimer: null as number | null,
  backoff: 1000,
  last24hPct: {} as Record<string, number>,
};
if (typeof window !== "undefined") w.__binance_stream = S;

function connect() {
  if (typeof window === "undefined") return;
  if (S.ws && (S.ws.readyState === WebSocket.OPEN || S.ws.readyState === WebSocket.CONNECTING)) return;
  // trade = son gerçekleşen işlem fiyatı; TradingView chart ile book mid-price'tan daha uyumlu.
  // ticker = 24h yüzde için (1sn)
  const streams = [
    ...Object.values(PAIRS).map((s) => `${s}@trade`),
    ...Object.values(PAIRS).map((s) => `${s}@ticker`),
  ].join("/");
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
  try {
    S.ws = new WebSocket(url);
  } catch {
    scheduleReconnect();
    return;
  }
  S.ws.onopen = () => { S.backoff = 1000; };
  S.ws.onmessage = (e: MessageEvent) => {
    try {
      const msg = JSON.parse(e.data);
      const stream: string = msg?.stream ?? "";
      const d = msg?.data;
      if (!d || !d.s) return;
      const symbol = REVERSE[d.s];
      if (!symbol) return;

      if (stream.endsWith("@ticker")) {
        const pct = parseFloat(d.P);
        if (isFinite(pct)) S.last24hPct[symbol] = pct;
        return;
      }
      const price = parseFloat(d.p);
      if (!isFinite(price) || price <= 0) return;
      const tick: Tick = {
        symbol,
        price,
        change_pct_24h: S.last24hPct[symbol] ?? null,
        updated_at: new Date().toISOString(),
      };
      for (const l of S.listeners) l(tick);
    } catch { /* noop */ }
  };
  S.ws.onerror = () => { /* will close */ };
  S.ws.onclose = () => { S.ws = null; scheduleReconnect(); };
}

function scheduleReconnect() {
  if (S.reconnectTimer) return;
  S.reconnectTimer = window.setTimeout(() => {
    S.reconnectTimer = null;
    S.backoff = Math.min(S.backoff * 2, 30000);
    connect();
  }, S.backoff);
}

export function startBinanceStream(onTick: Listener): () => void {
  S.listeners.add(onTick);
  connect();
  return () => { S.listeners.delete(onTick); };
}

export const CRYPTO_SYMBOLS = Object.keys(PAIRS);
