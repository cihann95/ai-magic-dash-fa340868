// Exchange provider abstraction — multi-exchange support
// ponytail: add real WS streams for Alpaca/Kraken/Bybit when needed
// ponytail: move config storage to Supabase edge function (encrypted vault)

export interface Tick {
  symbol: string;
  price: number;
  change_pct_24h: number | null;
  high_24h: number | null;
  low_24h: number | null;
  updated_at: string;
}

export type TickListener = (t: Tick) => void;

export interface ExchangeProvider {
  readonly id: string;
  readonly name: string;
  connect(config: { apiKey?: string; secret?: string }): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;
  testConnection(config: { apiKey?: string; secret?: string }): Promise<{ ok: boolean; error?: string }>;
  subscribe(symbol: string, callback: TickListener): () => void;
  getSupportedSymbols(): string[];
}

// ─── Binance provider (real WS) ──────────────────────────────────────────────

const BINANCE_PAIRS: Record<string, string> = {
  BTCUSD: "btcusdt", ETHUSD: "ethusdt", SOLUSD: "solusdt", BNBUSD: "bnbusdt",
  XRPUSD: "xrpusdt", DOGEUSD: "dogeusdt", ADAUSD: "adausdt", AVAXUSD: "avaxusdt",
  DOTUSD: "dotusdt", LINKUSD: "linkusdt", MATICUSD: "maticusdt", UNIUSD: "uniusdt",
  ATOMUSD: "atomusdt", TRXUSD: "trxusdt", LTCUSD: "ltcusdt", FILUSD: "filusdt",
  BCHUSD: "bchusdt", ETCUSD: "etcusdt", XLMUSD: "xlmusdt", ICPUSD: "icpusdt",
  NEARUSD: "nearusdt", APTUSD: "aptusdt", ARBUSD: "arbusdt", OPUSD: "opusdt",
  SUIUSD: "suiusdt", SEIUSD: "seiusdt", PYTHUSD: "pythusdt", RENDERUSD: "renderusdt",
  TONUSD: "tonusdt", BONKUSD: "bonkusdt", PEPEUSD: "pepeusdt",
};

const BINANCE_REVERSE = Object.fromEntries(
  Object.entries(BINANCE_PAIRS).map(([k, v]) => [v.toUpperCase(), k])
);

class BinanceProvider implements ExchangeProvider {
  readonly id = "binance";
  readonly name = "Binance";

  private listeners = new Set<{ symbol: string; cb: TickListener }>();
  private ws: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private backoff = 1000;
  private last24hPct: Record<string, number> = {};
  private last24hHL: Record<string, { high: number; low: number }> = {};
  private lastMessageTime = 0;
  private heartbeatInterval: number | null = null;
  private _connected = false;

  isConnected() { return this._connected; }

  async connect() { this.connectWS(); return true; }
  disconnect() { this.close(); }
  async testConnection() { return { ok: true }; }

  private close() {
    if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
    this.ws?.close();
    this.ws = null;
    this._connected = false;
  }

  subscribe(symbol: string, callback: TickListener): () => void {
    const entry = { symbol, cb: callback };
    this.listeners.add(entry);
    this.connectWS();
    return () => { this.listeners.delete(entry); };
  }

  getSupportedSymbols(): string[] {
    return Object.keys(BINANCE_PAIRS);
  }

  private connectWS() {
    if (typeof window === "undefined") return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }

    const streams = [
      ...Object.values(BINANCE_PAIRS).map((s) => `${s}@trade`),
      ...Object.values(BINANCE_PAIRS).map((s) => `${s}@ticker`),
    ].join("/");
    const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    try { this.ws = new WebSocket(url); } catch { this.scheduleReconnect(); return; }

    this.ws.onopen = () => {
      this._connected = true;
      this.backoff = 1000;
      this.lastMessageTime = Date.now();
      this.heartbeatInterval = window.setInterval(() => {
        if (Date.now() - this.lastMessageTime > 45000) {
          console.warn("[BinanceProvider] heartbeat timeout");
          this.ws?.close();
        }
      }, 30000);
    };

    this.ws.onmessage = (e: MessageEvent) => {
      this.lastMessageTime = Date.now();
      try {
        const msg = JSON.parse(e.data);
        const stream: string = msg?.stream ?? "";
        const d = msg?.data;
        if (!d || !d.s) return;
        const symbol = BINANCE_REVERSE[d.s];
        if (!symbol) return;

        if (stream.endsWith("@ticker")) {
          const pct = parseFloat(d.P);
          if (isFinite(pct)) this.last24hPct[symbol] = pct;
          const high = parseFloat(d.h);
          const low = parseFloat(d.l);
          if (isFinite(high) && isFinite(low)) this.last24hHL[symbol] = { high, low };
          return;
        }
        const price = parseFloat(d.p);
        if (!isFinite(price) || price <= 0) return;
        const hl = this.last24hHL[symbol];
        const tick: Tick = {
          symbol,
          price,
          change_pct_24h: this.last24hPct[symbol] ?? null,
          high_24h: hl?.high ?? null,
          low_24h: hl?.low ?? null,
          updated_at: new Date().toISOString(),
        };
        for (const entry of this.listeners) {
          if (entry.symbol === symbol || entry.symbol === "*") entry.cb(tick);
        }
      } catch { /* noop */ }
    };

    this.ws.onerror = () => {};
    this.ws.onclose = () => {
      this._connected = false;
      if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.backoff = Math.min(this.backoff * 2, 30000);
      this.connectWS();
    }, this.backoff);
  }
}

// ─── Stub providers ──────────────────────────────────────────────────────────

class AlpacaProvider implements ExchangeProvider {
  readonly id = "alpaca";
  readonly name = "Alpaca";
  private _connected = false;

  isConnected() { return this._connected; }
  async connect(config: { apiKey?: string; secret?: string }) {
    if (!config.apiKey || !config.secret) return false;
    this._connected = true;
    return true;
  }
  disconnect() { this._connected = false; }
  async testConnection(config: { apiKey?: string; secret?: string }) {
    if (!config.apiKey || !config.secret) return { ok: false, error: "API key and secret required" };
    return { ok: true };
  }
  subscribe(_symbol: string, _cb: TickListener): () => void { return () => {}; }
  getSupportedSymbols(): string[] {
    return ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "SPY", "QQQ"];
  }
}

class KrakenProvider implements ExchangeProvider {
  readonly id = "kraken";
  readonly name = "Kraken";
  private _connected = false;

  isConnected() { return this._connected; }
  async connect() { this._connected = true; return true; }
  disconnect() { this._connected = false; }
  async testConnection() { return { ok: true }; }
  subscribe(_symbol: string, _cb: TickListener): () => void { return () => {}; }
  getSupportedSymbols(): string[] { return ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "ADAUSD"]; }
}

class BybitProvider implements ExchangeProvider {
  readonly id = "bybit";
  readonly name = "Bybit";
  private _connected = false;

  isConnected() { return this._connected; }
  async connect() { this._connected = true; return true; }
  disconnect() { this._connected = false; }
  async testConnection() { return { ok: true }; }
  subscribe(_symbol: string, _cb: TickListener): () => void { return () => {}; }
  getSupportedSymbols(): string[] { return ["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD"]; }
}

// ─── Registry ────────────────────────────────────────────────────────────────

const PROVIDERS: Record<string, ExchangeProvider> = {
  binance: new BinanceProvider(),
  alpaca: new AlpacaProvider(),
  kraken: new KrakenProvider(),
  bybit: new BybitProvider(),
};

export function getProvider(id: string): ExchangeProvider | undefined {
  return PROVIDERS[id];
}

export function getAllProviders(): ExchangeProvider[] {
  return Object.values(PROVIDERS);
}

// ─── Active exchange (reactive singleton) ────────────────────────────────────

let activeExchangeId = "binance";
const activeExchangeListeners = new Set<(id: string) => void>();

export function getActiveExchangeId(): string {
  return activeExchangeId;
}

export function setActiveExchangeId(id: string): void {
  if (id === activeExchangeId || !PROVIDERS[id]) return;
  const old = PROVIDERS[activeExchangeId];
  if (old && old.id !== id) old.disconnect();
  activeExchangeId = id;
  const config = loadStoredConfig(id);
  if (config) PROVIDERS[id].connect(config);
  for (const l of activeExchangeListeners) l(id);
}

export function onActiveExchangeChange(cb: (id: string) => void): () => void {
  activeExchangeListeners.add(cb);
  return () => { activeExchangeListeners.delete(cb); };
}

// ─── Config persistence (localStorage; ponytail: edge function encrypted vault) ─

interface StoredBrokerConfig {
  apiKey: string;
  secret: string;
}

function loadStoredConfig(id: string): StoredBrokerConfig | undefined {
  try {
    const raw = localStorage.getItem(`broker_${id}`);
    return raw ? JSON.parse(raw) : undefined;
  } catch { return undefined; }
}

export function saveBrokerConfig(id: string, apiKey: string, secret: string): void {
  localStorage.setItem(`broker_${id}`, JSON.stringify({ apiKey, secret }));
  const p = PROVIDERS[id];
  if (p) p.connect({ apiKey, secret });
}

export function clearBrokerConfig(id: string): void {
  localStorage.removeItem(`broker_${id}`);
  PROVIDERS[id]?.disconnect();
}

export function getBrokerConfig(id: string): StoredBrokerConfig | undefined {
  return loadStoredConfig(id);
}
