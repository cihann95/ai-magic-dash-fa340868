export type AssetClass = "crypto" | "stocks" | "forex" | "commodities" | "indices" | "etf";

export interface SymbolDef {
  symbol: string;          // internal — must match price_cache.symbol & price-feed
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
  { symbol: "ADAUSD", tv: "BINANCE:ADAUSDT", name: "Cardano", asset_class: "crypto", market_open: true },
  { symbol: "AVAXUSD", tv: "BINANCE:AVAXUSDT", name: "Avalanche", asset_class: "crypto", market_open: true },
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
  { symbol: "GOLD", tv: "OANDA:XAUUSD", name: "Gold Spot", asset_class: "commodities", market_open: true },
  { symbol: "SILVER", tv: "OANDA:XAGUSD", name: "Silver Spot", asset_class: "commodities", market_open: true },
  { symbol: "OIL", tv: "TVC:USOIL", name: "WTI Crude Oil", asset_class: "commodities", market_open: true },
  { symbol: "NATGAS", tv: "TVC:NATURALGAS", name: "Natural Gas", asset_class: "commodities", market_open: true },
  // indices
  { symbol: "SPX", tv: "TVC:SPX", name: "S&P 500", asset_class: "indices" },
  { symbol: "NDX", tv: "TVC:NDX", name: "Nasdaq 100", asset_class: "indices" },
  { symbol: "DJI", tv: "TVC:DJI", name: "Dow Jones 30", asset_class: "indices" },
  { symbol: "VIX", tv: "TVC:VIX", name: "Volatility Index", asset_class: "indices" },
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

export function findSymbol(s: string): SymbolDef | undefined {
  return SYMBOLS.find((x) => x.symbol === s);
}

export function formatPrice(p: number | null | undefined): string {
  if (p == null || isNaN(p as number)) return "—";
  const v = Number(p);
  const dec = v < 5 ? 4 : 2;
  return v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export function isMarketOpen(s: SymbolDef): boolean {
  if (s.market_open) return true;
  const now = new Date();
  const utcHour = now.getUTCHours();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false;
  return utcHour >= 13 && utcHour < 21;
}

// Geriye dönük uyumluluk - eski mockPrice çağrıları için fallback
const FALLBACK_PRICES: Record<string, number> = {
  BTCUSD: 67500, ETHUSD: 3450, SOLUSD: 168, BNBUSD: 590, XRPUSD: 0.58, DOGEUSD: 0.16, ADAUSD: 0.45, AVAXUSD: 35,
  AAPL: 195, MSFT: 432, NVDA: 880, TSLA: 178, AMZN: 185, GOOGL: 165, META: 510,
  EURUSD: 1.085, GBPUSD: 1.265, USDJPY: 152.4, USDTRY: 32.5,
  GOLD: 2380, SILVER: 28.5, OIL: 82.4, NATGAS: 2.1,
  SPX: 5230, NDX: 18250, DJI: 39200, VIX: 14.5,
  SPY: 521, QQQ: 445, VTI: 258,
};
export function fallbackPrice(symbol: string): number {
  return FALLBACK_PRICES[symbol] ?? 100;
}
