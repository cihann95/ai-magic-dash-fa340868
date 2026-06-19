-- Fix guard_profiles_financial_update to allow SECURITY DEFINER functions
-- The trigger checks request.jwt.claim.role, but when deduct_balance (SECURITY DEFINER)
-- is called from Edge Functions, the JWT context may not propagate correctly through PostgREST.
-- This fix also allows calls from SECURITY DEFINER function context (current_user = postgres/supabase_admin).

CREATE OR REPLACE FUNCTION public.guard_profiles_financial_update()
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
    IF NEW.demo_balance IS DISTINCT FROM OLD.demo_balance
      OR NEW.initial_balance IS DISTINCT FROM OLD.initial_balance
      OR NEW.real_balance IS DISTINCT FROM OLD.real_balance
      OR NEW.real_balance_locked IS DISTINCT FROM OLD.real_balance_locked
    THEN
      RAISE EXCEPTION 'profiles: balance fields can only be modified by the backend';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
