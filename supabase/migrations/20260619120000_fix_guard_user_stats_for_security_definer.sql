-- Fix guard_user_stats_update to allow SECURITY DEFINER functions
-- The trigger checks request.jwt.claim.role, but when touch_streak/award_xp (SECURITY DEFINER)
-- are called from Edge Functions, the JWT context may not propagate correctly through PostgREST.
-- This fix also allows calls from SECURITY DEFINER function context (current_user = postgres/supabase_admin).
-- Mirrors the fix already applied to guard_profiles_financial_update in 20260619000000.

CREATE OR REPLACE FUNCTION public.guard_user_stats_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  -- Allow if: service_role JWT OR SECURITY DEFINER function context (postgres/supabase_admin)
  IF caller_role IS DISTINCT FROM 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin')
  THEN
    IF NEW.xp IS DISTINCT FROM OLD.xp
      OR NEW.level IS DISTINCT FROM OLD.level
      OR NEW.total_pnl IS DISTINCT FROM OLD.total_pnl
      OR NEW.total_trades IS DISTINCT FROM OLD.total_trades
      OR NEW.profitable_trades IS DISTINCT FROM OLD.profitable_trades
      OR NEW.best_trade_pnl IS DISTINCT FROM OLD.best_trade_pnl
      OR NEW.current_streak IS DISTINCT FROM OLD.current_streak
      OR NEW.longest_streak IS DISTINCT FROM OLD.longest_streak
      OR NEW.last_active_date IS DISTINCT FROM OLD.last_active_date
      OR NEW.ai_uses IS DISTINCT FROM OLD.ai_uses
      OR NEW.asset_classes_traded IS DISTINCT FROM OLD.asset_classes_traded
    THEN
      RAISE EXCEPTION 'user_stats: this column can only be modified by the backend';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
