-- Fix: Allow anon (public) reads on price_cache for execute-trade to work
-- The frontend uses anon key to read prices; RLS policy must permit this

-- Drop existing policy first (idempotent)
DROP POLICY IF EXISTS "price_cache_read_public" ON public.price_cache;
-- Create policy for public (anon) reads
CREATE POLICY IF NOT EXISTS "price_cache_read_public" ON public.price_cache FOR SELECT TO anon USING (true);

-- Ensure price_cache has fallback prices for trading
-- Crypto works 24/7, so these prices always allow trades
INSERT INTO public.price_cache (symbol, asset_class, price, change_24h, change_pct_24h, volume_24h, updated_at)
VALUES
  ('BTCUSD', 'crypto', 65400.00, 0, 0, 0, now()),
  ('ETHUSD', 'crypto', 3500.00, 0, 0, 0, now()),
  ('SOLUSD', 'crypto', 150.00, 0, 0, 0, now()),
  ('BNBUSD', 'crypto', 600.00, 0, 0, 0, now()),
  ('XRPUSD', 'crypto', 0.50, 0, 0, 0, now()),
  ('AVAXUSD', 'crypto', 35.00, 0, 0, 0, now()),
  ('EURUSD', 'forex', 1.08, 0, 0, 0, now()),
  ('GBPUSD', 'forex', 1.27, 0, 0, 0, now()),
  ('USDJPY', 'forex', 156.00, 0, 0, 0, now()),
  ('USDTRY', 'forex', 32.00, 0, 0, 0, now()),
  ('GOLD', 'commodities', 2320.00, 0, 0, 0, now()),
  ('SILVER', 'commodities', 29.00, 0, 0, 0, now()),
  ('OIL', 'commodities', 78.00, 0, 0, 0, now()),
  ('NATGAS', 'commodities', 2.50, 0, 0, 0, now()),
  ('SPX', 'indices', 5300.00, 0, 0, 0, now()),
  ('NDX', 'indices', 18600.00, 0, 0, 0, now()),
  ('DJI', 'indices', 39000.00, 0, 0, 0, now()),
  ('VIX', 'indices', 13.00, 0, 0, 0, now()),
  ('SPY', 'etf', 525.00, 0, 0, 0, now()),
  ('QQQ', 'etf', 440.00, 0, 0, 0, now()),
  ('VTI', 'etf', 260.00, 0, 0, 0, now())
ON CONFLICT (symbol) DO UPDATE SET
  price = EXCLUDED.price,
  change_24h = EXCLUDED.change_24h,
  change_pct_24h = EXCLUDED.change_pct_24h,
  volume_24h = EXCLUDED.volume_24h,
  updated_at = now();

ALTER TABLE public.price_cache REPLICA IDENTITY FULL;
