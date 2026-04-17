export type AssetClass = "crypto" | "stocks" | "forex" | "commodities" | "indices" | "etf";

export interface SymbolDef {
  symbol: string;          // internal
  tv: string;              // TradingView prefix:symbol
  name: string;
  asset_class: AssetClass;
  market_open?: boolean;   // crypto/forex 24/7
}

export const SYMBOLS: SymbolDef[] = [
  // crypto
  { symbol: "BTCUSD", tv: "BINANCE:BTCUSDT", name: "Bitcoin", asset_class: "crypto", market_open: true },
  { symbol: "ETHUSD", tv: "BINANCE:ETHUSDT", name: "Ethereum", asset_class: "crypto", market_open: true },
  { symbol: "SOLUSD", tv: "BINANCE:SOLUSDT", name: "Solana", asset_class: "crypto", market_open: true },
  { symbol: "BNBUSD", tv: "BINANCE:BNBUSDT", name: "BNB", asset_class: "crypto", market_open: true },
  { symbol: "XRPUSD", tv: "BINANCE:XRPUSDT", name: "XRP", asset_class: "crypto", market_open: true },
  { symbol: "DOGEUSD", tv: "BINANCE:DOGEUSDT", name: "Dogecoin", asset_class: "crypto", market_open: true },
  // stocks
  { symbol: "AAPL", tv: "NASDAQ:AAPL", name: "Apple Inc.", asset_class: "stocks" },
  { symbol: "MSFT", tv: "NASDAQ:MSFT", name: "Microsoft", asset_class: "stocks" },
  { symbol: "NVDA", tv: "NASDAQ:NVDA", name: "NVIDIA", asset_class: "stocks" },
  { symbol: "TSLA", tv: "NASDAQ:TSLA", name: "Tesla", asset_class: "stocks" },
  { symbol: "AMZN", tv: "NASDAQ:AMZN", name: "Amazon", asset_class: "stocks" },
  { symbol: "GOOGL", tv: "NASDAQ:GOOGL", name: "Alphabet", asset_class: "stocks" },
  { symbol: "META", tv: "NASDAQ:META", name: "Meta Platforms", asset_class: "stocks" },
  // forex
  { symbol: "EURUSD", tv: "FX:EURUSD", name: "Euro / US Dollar", asset_class: "forex", market_open: true },
  { symbol: "GBPUSD", tv: "FX:GBPUSD", name: "British Pound / USD", asset_class: "forex", market_open: true },
  { symbol: "USDJPY", tv: "FX:USDJPY", name: "USD / Japanese Yen", asset_class: "forex", market_open: true },
  { symbol: "USDTRY", tv: "FX_IDC:USDTRY", name: "USD / Turkish Lira", asset_class: "forex", market_open: true },
  // commodities
  { symbol: "XAUUSD", tv: "OANDA:XAUUSD", name: "Gold Spot", asset_class: "commodities", market_open: true },
  { symbol: "XAGUSD", tv: "OANDA:XAGUSD", name: "Silver Spot", asset_class: "commodities", market_open: true },
  { symbol: "WTIUSD", tv: "TVC:USOIL", name: "WTI Crude Oil", asset_class: "commodities", market_open: true },
  { symbol: "NATGAS", tv: "TVC:NATURALGAS", name: "Natural Gas", asset_class: "commodities", market_open: true },
  // indices
  { symbol: "SPX", tv: "TVC:SPX", name: "S&P 500", asset_class: "indices" },
  { symbol: "NDX", tv: "TVC:NDX", name: "Nasdaq 100", asset_class: "indices" },
  { symbol: "DJI", tv: "TVC:DJI", name: "Dow Jones 30", asset_class: "indices" },
  { symbol: "XU100", tv: "BIST:XU100", name: "BIST 100", asset_class: "indices" },
  // etf
  { symbol: "SPY", tv: "AMEX:SPY", name: "SPDR S&P 500 ETF", asset_class: "etf" },
  { symbol: "QQQ", tv: "NASDAQ:QQQ", name: "Invesco QQQ", asset_class: "etf" },
  { symbol: "VTI", tv: "AMEX:VTI", name: "Vanguard Total Stock", asset_class: "etf" },
];

export const ASSET_LABELS: Record<AssetClass, { tr: string; en: string }> = {
  crypto: { tr: "Kripto", en: "Crypto" },
  stocks: { tr: "Hisse", en: "Stocks" },
  forex: { tr: "Forex", en: "Forex" },
  commodities: { tr: "Emtia", en: "Commodities" },
  indices: { tr: "Endeks", en: "Indices" },
  etf: { tr: "ETF", en: "ETF" },
};

// Mock price generator (deterministic per symbol)
export function mockPrice(symbol: string): { price: number; change: number } {
  const base: Record<string, number> = {
    BTCUSD: 67500, ETHUSD: 3450, SOLUSD: 168, BNBUSD: 590, XRPUSD: 0.58, DOGEUSD: 0.16,
    AAPL: 228, MSFT: 425, NVDA: 870, TSLA: 245, AMZN: 185, GOOGL: 175, META: 510,
    EURUSD: 1.085, GBPUSD: 1.265, USDJPY: 152.3, USDTRY: 32.6,
    XAUUSD: 2375, XAGUSD: 28.4, WTIUSD: 81.2, NATGAS: 2.15,
    SPX: 5250, NDX: 18450, DJI: 39200, XU100: 9850,
    SPY: 524, QQQ: 449, VTI: 261,
  };
  const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const noise = (Math.sin(seed + Date.now() / 60000) + 1) / 2;
  const p = (base[symbol] || 100) * (1 + (noise - 0.5) * 0.005);
  const change = (Math.sin(seed * 1.7) * 5);
  return { price: Number(p.toFixed(p < 5 ? 4 : 2)), change: Number(change.toFixed(2)) };
}

export function isMarketOpen(s: SymbolDef): boolean {
  if (s.market_open) return true;
  const now = new Date();
  const utcHour = now.getUTCHours();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  // US session ~13:30 - 20:00 UTC
  return utcHour >= 13 && utcHour < 21;
}
