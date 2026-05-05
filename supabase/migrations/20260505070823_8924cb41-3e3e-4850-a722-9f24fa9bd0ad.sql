-- Financial integrity hardening for demo trading and leaderboard data

-- 1) Profiles: block direct client tampering with demo/initial balances.
CREATE OR REPLACE FUNCTION public.guard_profiles_financial_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF caller_role IS DISTINCT FROM 'service_role' THEN
    IF NEW.demo_balance IS DISTINCT FROM OLD.demo_balance
      OR NEW.initial_balance IS DISTINCT FROM OLD.initial_balance
    THEN
      RAISE EXCEPTION 'profiles: balance fields can only be modified by the backend';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profiles_financial_update ON public.profiles;
CREATE TRIGGER guard_profiles_financial_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profiles_financial_update();

-- Restrict client column privileges on profiles to non-financial settings only.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (display_name, avatar_url, preferred_theme, preferred_language, trader_persona, preferred_view, updated_at)
ON public.profiles TO authenticated;

-- 2) Positions: block direct client tampering with fields used for PnL computation.
CREATE OR REPLACE FUNCTION public.guard_positions_financial_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF caller_role IS DISTINCT FROM 'service_role' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.symbol IS DISTINCT FROM OLD.symbol
      OR NEW.asset_class IS DISTINCT FROM OLD.asset_class
      OR NEW.side IS DISTINCT FROM OLD.side
      OR NEW.quantity IS DISTINCT FROM OLD.quantity
      OR NEW.entry_price IS DISTINCT FROM OLD.entry_price
      OR NEW.opened_at IS DISTINCT FROM OLD.opened_at
    THEN
      RAISE EXCEPTION 'positions: financial position fields can only be modified by the backend';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_positions_financial_update ON public.positions;
CREATE TRIGGER guard_positions_financial_update
BEFORE UPDATE ON public.positions
FOR EACH ROW
EXECUTE FUNCTION public.guard_positions_financial_update();

-- Only allow clients to refresh non-authoritative display price fields if ever needed.
REVOKE UPDATE ON public.positions FROM anon, authenticated;
GRANT UPDATE (current_price, updated_at) ON public.positions TO authenticated;

-- 3) User stats: keep onboarding completion client-writable but prevent direct stats/leaderboard edits at the privilege layer.
REVOKE UPDATE ON public.user_stats FROM anon, authenticated;
GRANT UPDATE (onboarding_completed, updated_at) ON public.user_stats TO authenticated;

-- 4) Trades: make client-side trade rows immutable and backend-created only, preventing forged copy-trade attribution.
REVOKE INSERT, UPDATE, DELETE ON public.trades FROM anon, authenticated;
GRANT SELECT ON public.trades TO authenticated;

-- Keep public execute permissions locked down for sensitive SECURITY DEFINER helpers.
REVOKE EXECUTE ON FUNCTION public.guard_profiles_financial_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_positions_financial_update() FROM PUBLIC, anon, authenticated;