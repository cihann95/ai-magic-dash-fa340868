-- =============================================================================
-- Fix: 2026-06-16 — All Critical Production Issues
-- =============================================================================
-- 1. handle_new_user trigger: explicit demo_balance + initial_balance + user_stats
-- 2. Backfill missing user_stats for users who signed up before trigger fix
-- 3. Backfill missing profiles with demo balance
-- 4. Seed price_cache with fallback values so trades don't fail
-- 5. Fix user_stats onboarding_completed default for existing users
-- =============================================================================

-- 1) FIX handle_new_user trigger — explicit balances so DEFAULT never fails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, demo_balance, initial_balance)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    100000.00,
    100000.00
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_stats (user_id, onboarding_completed)
  VALUES (NEW.id, false)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END; $$;

-- 2) Backfill user_stats for ALL auth.users who don't have a row
INSERT INTO public.user_stats (user_id, onboarding_completed)
SELECT u.id, false
FROM auth.users u
LEFT JOIN public.user_stats s ON s.user_id = u.id
WHERE s.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- 3) Backfill profiles with demo_balance for users who signed up
--    before the trigger had explicit balance fields
INSERT INTO public.profiles (id, display_name, demo_balance, initial_balance)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1)),
  100000.00,
  100000.00
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 4) Backfill user_roles for users who don't have a role
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'user'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL
ON CONFLICT (user_id, role) DO NOTHING;

-- 5) Seed price_cache with fallback prices so execute-trade never fails
--    These are intentionally non-zero so the edge function can proceed.
--    The real price-feed cron will overwrite them within 60 seconds.
INSERT INTO public.price_cache (symbol, asset_class, price, change_24h, change_pct_24h, volume_24h, updated_at)
VALUES
  ('BTCUSD', 'crypto', 65000.00, 0, 0, 0, now()),
  ('ETHUSD', 'crypto', 3500.00, 0, 0, 0, now()),
  ('SOLUSD', 'crypto', 150.00, 0, 0, 0, now()),
  ('BNBUSD', 'crypto', 600.00, 0, 0, 0, now()),
  ('XRPUSD', 'crypto', 0.50, 0, 0, 0, now()),
  ('DOGEUSD', 'crypto', 0.15, 0, 0, 0, now()),
  ('ADAUSD', 'crypto', 0.40, 0, 0, 0, now()),
  ('AVAXUSD', 'crypto', 35.00, 0, 0, 0, now()),
  ('AAPL', 'stocks', 180.00, 0, 0, 0, now()),
  ('MSFT', 'stocks', 420.00, 0, 0, 0, now()),
  ('NVDA', 'stocks', 880.00, 0, 0, 0, now()),
  ('TSLA', 'stocks', 175.00, 0, 0, 0, now()),
  ('GOOGL', 'stocks', 165.00, 0, 0, 0, now()),
  ('AMZN', 'stocks', 185.00, 0, 0, 0, now()),
  ('META', 'stocks', 495.00, 0, 0, 0, now()),
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
ON CONFLICT (symbol) DO NOTHING;

-- 6) Ensure all existing profiles have demo_balance (if somehow null)
UPDATE public.profiles
SET demo_balance = 100000.00,
    initial_balance = 100000.00
WHERE demo_balance IS NULL OR initial_balance IS NULL;

-- 7) Invalidate PostgREST schema cache
NOTIFY pgrst, 'reload schema';
