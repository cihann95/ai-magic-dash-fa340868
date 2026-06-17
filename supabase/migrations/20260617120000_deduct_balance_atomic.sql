-- Atomic balance deduction to prevent race conditions on concurrent trades
-- Old approach: read profile.demo_balance → compute newBalance → UPDATE (NOT atomic)
-- New approach: SET demo_balance = demo_balance - amount WHERE balance >= amount (ATOMIC)

CREATE OR REPLACE FUNCTION public.deduct_balance(p_user_id UUID, p_amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_balance NUMERIC;
BEGIN
  UPDATE public.profiles
  SET demo_balance = demo_balance - p_amount
  WHERE id = p_user_id AND demo_balance >= p_amount
  RETURNING demo_balance INTO v_balance;
  RETURN v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deduct_balance(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_balance(UUID, NUMERIC) TO service_role;
