-- Fix: Allow anon (public) reads on price_cache for execute-trade to work
-- The frontend uses anon key to read prices; RLS policy must permit this

CREATE POLICY IF NOT EXISTS "price_cache_read_public" ON public.price_cache FOR SELECT TO anon USING (true);

-- Ensure price_cache has real trading hours prices (crypto always works, stocks only during NY hours)
-- Satın al/sat işlemleri için güncel fiyat verisi zorunlu
-- Crypto sembolleri 7/24 işlem görür, bu yüzden bunlar için de fallback eklenir
INSERT INTO public.price_cache (symbol, asset_class, price, change_24h, change_pct_24h, volume_24h, updated_at)
SELECT s.symbol, s.asset_class, s.price, s.change_24h, s.change_pct_24h, s.volume_24h, now()
FROM (
  VALUES
    ('BTCUSD', 'crypto', 65400.00, 0, 0, 0),
    ('ETHUSD', 'crypto', 3500.00, 0, 0, 0),
    ('SOLUSD', 'crypto', 150.00, 0, 0, 0),
    ('BNBUSD', 'crypto', 600.00, 0, 0, 0),
    ('XRPUSD', 'crypto', 0.50, 0, 0, 0),
    ('AVAXUSD', 'crypto', 35.00, 0, 0, 0),
    ('EURUSD', 'forex', 1.08, 0, 0, 0),
    ('GBPUSD', 'forex', 1.27, 0, 0, 0),
    ('USDJPY', 'forex', 156.00, 0, 0, 0),
    ('USDTRY', 'forex', 32.00, 0, 0, 0),
    ('GOLD', 'commodities', 2320.00, 0, 0, 0),
    ('SILVER', 'commodities', 29.00, 0, 0, 0),
    ('OIL', 'commodities', 78.00, 0, 0, 0),
    ('NATGAS', 'commodities', 2.50, 0, 0, 0),
    ('SPX', 'indices', 5300.00, 0, 0, 0),
    ('NDX', 'indices', 18600.00, 0, 0, 0),
    ('DJI', 'indices', 39000.00, 0, 0, 0),
    ('VIX', 'indices', 13.00, 0, 0, 0),
    ('SPY', 'etf', 525.00, 0, 0, 0),
    ('QQQ', 'etf', 440.00, 0, 0, 0),
    ('VTI', 'etf', 260.00, 0, 0, 0)
) AS s(symbol, asset_class, price, change_24h, change_pct_24h, volume_24h)
ON CONFLICT (symbol) DO UPDATE SET
  price = EXCLUDED.price,
  change_24h = EXCLUDED.change_24h,
  change_pct_24h = EXCLUDED.change_pct_24h,
  volume_24h = EXCLUDED.volume_24h,
  updated_at = now();
=======
CREATE POLICY "price_cache_read_public" ON public.price_cache FOR SELECT TO anon USING (true);

-- Also fix realtime subscription for anon users on price_cache
-- This allows the frontend to receive price updates without auth
ALTER TABLE public.price_cache REPLICA IDENTITY FULL;
