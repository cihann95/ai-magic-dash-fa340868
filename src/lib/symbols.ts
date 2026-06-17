export type AssetClass = "crypto" | "stocks" | "forex" | "commodities" | "indices" | "etf";

export interface SymbolDef {
  symbol: string;          // internal — must match price_cache.symbol & price-feed
  tv: string;              // TradingView prefix:symbol
  yahoo?: string;          // Yahoo Finance ticker (for non-crypto live prices)
  binance?: string;        // Binance ticker (crypto live prices)
  name: string;
  asset_class: AssetClass;
  market_open?: boolean;   // crypto/forex 24/7
}

export const SYMBOLS: SymbolDef[] = [
  // crypto - Binance
  { symbol: "BTCUSD", tv: "BINANCE:BTCUSDT", binance: "BTCUSDT", name: "Bitcoin", asset_class: "crypto", market_open: true },
  { symbol: "ETHUSD", tv: "BINANCE:ETHUSDT", binance: "ETHUSDT", name: "Ethereum", asset_class: "crypto", market_open: true },
  { symbol: "SOLUSD", tv: "BINANCE:SOLUSDT", binance: "SOLUSDT", name: "Solana", asset_class: "crypto", market_open: true },
  { symbol: "BNBUSD", tv: "BINANCE:BNBUSDT", binance: "BNBUSDT", name: "BNB", asset_class: "crypto", market_open: true },
  { symbol: "XRPUSD", tv: "BINANCE:XRPUSDT", binance: "XRPUSDT", name: "XRP", asset_class: "crypto", market_open: true },
  { symbol: "DOGEUSD", tv: "BINANCE:DOGEUSDT", binance: "DOGEUSDT", name: "Dogecoin", asset_class: "crypto", market_open: true },
  { symbol: "ADAUSD", tv: "BINANCE:ADAUSDT", binance: "ADAUSDT", name: "Cardano", asset_class: "crypto", market_open: true },
  { symbol: "AVAXUSD", tv: "BINANCE:AVAXUSDT", binance: "AVAXUSDT", name: "Avalanche", asset_class: "crypto", market_open: true },
  // stocks - Yahoo
  { symbol: "AAPL", tv: "NASDAQ:AAPL", yahoo: "AAPL", name: "Apple Inc.", asset_class: "stocks" },
  { symbol: "MSFT", tv: "NASDAQ:MSFT", yahoo: "MSFT", name: "Microsoft", asset_class: "stocks" },
  { symbol: "NVDA", tv: "NASDAQ:NVDA", yahoo: "NVDA", name: "NVIDIA", asset_class: "stocks" },
  { symbol: "TSLA", tv: "NASDAQ:TSLA", yahoo: "TSLA", name: "Tesla", asset_class: "stocks" },
  { symbol: "AMZN", tv: "NASDAQ:AMZN", yahoo: "AMZN", name: "Amazon", asset_class: "stocks" },
  { symbol: "GOOGL", tv: "NASDAQ:GOOGL", yahoo: "GOOGL", name: "Alphabet", asset_class: "stocks" },
  { symbol: "META", tv: "NASDAQ:META", yahoo: "META", name: "Meta Platforms", asset_class: "stocks" },
  // forex - Yahoo
  { symbol: "EURUSD", tv: "FX:EURUSD", yahoo: "EURUSD=X", name: "Euro / US Dollar", asset_class: "forex", market_open: true },
  { symbol: "GBPUSD", tv: "FX:GBPUSD", yahoo: "GBPUSD=X", name: "British Pound / USD", asset_class: "forex", market_open: true },
  { symbol: "USDJPY", tv: "FX:USDJPY", yahoo: "JPY=X", name: "USD / Japanese Yen", asset_class: "forex", market_open: true },
  { symbol: "USDTRY", tv: "FX:USDTRY", yahoo: "TRY=X", name: "USD / Turkish Lira", asset_class: "forex", market_open: true },
  // commodities - TV symbols aligned to Yahoo futures source (GC=F=COMEX, SI=F=COMEX, CL=F=NYMEX, NG=F=NYMEX)
  { symbol: "GOLD", tv: "COMEX:GC1!", yahoo: "GC=F", name: "Gold Futures", asset_class: "commodities", market_open: true },
  { symbol: "SILVER", tv: "COMEX:SI1!", yahoo: "SI=F", name: "Silver Futures", asset_class: "commodities", market_open: true },
  { symbol: "OIL", tv: "NYMEX:CL1!", yahoo: "CL=F", name: "WTI Crude Oil Futures", asset_class: "commodities", market_open: true },
  { symbol: "NATGAS", tv: "NYMEX:NG1!", yahoo: "NG=F", name: "Natural Gas Futures", asset_class: "commodities", market_open: true },
  // indices - Yahoo
  { symbol: "SPX", tv: "TVC:SPX", yahoo: "^GSPC", name: "S&P 500", asset_class: "indices" },
  { symbol: "NDX", tv: "TVC:NDX", yahoo: "^NDX", name: "Nasdaq 100", asset_class: "indices" },
  { symbol: "DJI", tv: "TVC:DJI", yahoo: "^DJI", name: "Dow Jones 30", asset_class: "indices" },
  { symbol: "VIX", tv: "TVC:VIX", yahoo: "^VIX", name: "Volatility Index", asset_class: "indices" },
  // etf - Yahoo
  { symbol: "SPY", tv: "AMEX:SPY", yahoo: "SPY", name: "SPDR S&P 500 ETF", asset_class: "etf" },
  { symbol: "QQQ", tv: "NASDAQ:QQQ", yahoo: "QQQ", name: "Invesco QQQ", asset_class: "etf" },
  { symbol: "VTI", tv: "AMEX:VTI", yahoo: "VTI", name: "Vanguard Total Stock", asset_class: "etf" },
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

export const STALE_THRESHOLD_MS = 30_000;

export function isStale(updatedAt?: string | null): boolean {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() > STALE_THRESHOLD_MS;
}
