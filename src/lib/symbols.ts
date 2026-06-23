export type AssetClass = "crypto" | "stocks" | "forex" | "commodities" | "indices" | "etf";

export interface SymbolDef {
  symbol: string;          // internal — must match price_cache.symbol & price-feed
  tv: string;              // TradingView prefix:symbol
  yahoo?: string;          // Yahoo Finance ticker (for non-crypto live prices)
  binance?: string;        // Binance ticker (crypto live prices)
  name: string;
  asset_class: AssetClass;
  market_open?: boolean;   // crypto/forex 24/7
  logo_url?: string;       // token/asset logo — crypto via CoinGecko CDN
}

export const SYMBOLS: SymbolDef[] = [
  // crypto - Binance — logos from CoinGecko CDN (https://www.coingecko.com/en/coins/)
  { symbol: "BTCUSD", tv: "BINANCE:BTCUSDT", binance: "BTCUSDT", name: "Bitcoin", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png" },
  { symbol: "ETHUSD", tv: "BINANCE:ETHUSDT", binance: "ETHUSDT", name: "Ethereum", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" },
  { symbol: "SOLUSD", tv: "BINANCE:SOLUSDT", binance: "SOLUSDT", name: "Solana", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/4128/small/solana.png" },
  { symbol: "BNBUSD", tv: "BINANCE:BNBUSDT", binance: "BNBUSDT", name: "BNB", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png" },
  { symbol: "XRPUSD", tv: "BINANCE:XRPUSDT", binance: "XRPUSDT", name: "XRP", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png" },
  { symbol: "DOGEUSD", tv: "BINANCE:DOGEUSDT", binance: "DOGEUSDT", name: "Dogecoin", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/5/small/dogecoin.png" },
  { symbol: "ADAUSD", tv: "BINANCE:ADAUSDT", binance: "ADAUSDT", name: "Cardano", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/975/small/cardano.png" },
  { symbol: "AVAXUSD", tv: "BINANCE:AVAXUSDT", binance: "AVAXUSDT", name: "Avalanche", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png" },
  { symbol: "DOTUSD", tv: "BINANCE:DOTUSDT", binance: "DOTUSDT", name: "Polkadot", asset_class: "crypto", market_open: true },
  { symbol: "LINKUSD", tv: "BINANCE:LINKUSDT", binance: "LINKUSDT", name: "Chainlink", asset_class: "crypto", market_open: true },
  { symbol: "MATICUSD", tv: "BINANCE:MATICUSDT", binance: "MATICUSDT", name: "Polygon", asset_class: "crypto", market_open: true },
  { symbol: "UNIUSD", tv: "BINANCE:UNIUSDT", binance: "UNIUSDT", name: "Uniswap", asset_class: "crypto", market_open: true },
  { symbol: "ATOMUSD", tv: "BINANCE:ATOMUSDT", binance: "ATOMUSDT", name: "Cosmos", asset_class: "crypto", market_open: true },
  { symbol: "TRXUSD", tv: "BINANCE:TRXUSDT", binance: "TRXUSDT", name: "TRON", asset_class: "crypto", market_open: true },
  { symbol: "LTCUSD", tv: "BINANCE:LTCUSDT", binance: "LTCUSDT", name: "Litecoin", asset_class: "crypto", market_open: true },
  { symbol: "FILUSD", tv: "BINANCE:FILUSDT", binance: "FILUSDT", name: "Filecoin", asset_class: "crypto", market_open: true },
  { symbol: "BCHUSD", tv: "BINANCE:BCHUSDT", binance: "BCHUSDT", name: "Bitcoin Cash", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/780/small/bitcoin-cash-circle.png" },
  { symbol: "ETCUSD", tv: "BINANCE:ETCUSDT", binance: "ETCUSDT", name: "Ethereum Classic", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/26115/small/ethereum-classic-logo.png" },
  { symbol: "XLMUSD", tv: "BINANCE:XLMUSDT", binance: "XLMUSDT", name: "Stellar", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/100/small/Stellar_symbol_black_RGB.png" },
  { symbol: "ICPUSD", tv: "BINANCE:ICPUSDT", binance: "ICPUSDT", name: "Internet Computer", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/14495/small/Internet_Computer_logo.png" },
  { symbol: "NEARUSD", tv: "BINANCE:NEARUSDT", binance: "NEARUSDT", name: "NEAR Protocol", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/10365/small/near_icon.png" },
  { symbol: "APTUSD", tv: "BINANCE:APTUSDT", binance: "APTUSDT", name: "Aptos", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/26455/small/aptos_round.png" },
  { symbol: "ARBUSD", tv: "BINANCE:ARBUSDT", binance: "ARBUSDT", name: "Arbitrum", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/16547/small/arb.png" },
  { symbol: "OPUSD", tv: "BINANCE:OPUSDT", binance: "OPUSDT", name: "Optimism", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/25244/small/Optimism.png" },
  { symbol: "SUIUSD", tv: "BINANCE:SUIUSDT", binance: "SUIUSDT", name: "Sui", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/26369/small/sui-o.png" },
  { symbol: "SEIUSD", tv: "BINANCE:SEIUSDT", binance: "SEIUSDT", name: "Sei", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/28205/small/Sei_Logo_-_Transparent.png" },
  { symbol: "PYTHUSD", tv: "BINANCE:PYTHUSDT", binance: "PYTHUSDT", name: "Pyth Network", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/34024/small/pyth.png" },
  { symbol: "RENDERUSD", tv: "BINANCE:RENDERUSDT", binance: "RENDERUSDT", name: "Render", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/11636/small/Render.png" },
  { symbol: "TONUSD", tv: "BINANCE:TONUSDT", binance: "TONUSDT", name: "Toncoin", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/17980/small/ton_symbol.png" },
  { symbol: "BONKUSD", tv: "BINANCE:BONKUSDT", binance: "BONKUSDT", name: "Bonk", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/28600/small/bonk.png" },
  { symbol: "PEPEUSD", tv: "BINANCE:PEPEUSDT", binance: "PEPEUSDT", name: "Pepe", asset_class: "crypto", market_open: true, logo_url: "https://assets.coingecko.com/coins/images/29850/small/pepe-token.png" },
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
  { symbol: "XAUUSD", tv: "OANDA:XAUUSD", yahoo: "XAUUSD=X", name: "Gold Spot / USD", asset_class: "forex", market_open: true },
  { symbol: "XAGUSD", tv: "OANDA:XAGUSD", yahoo: "XAGUSD=X", name: "Silver Spot / USD", asset_class: "forex", market_open: true },
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
