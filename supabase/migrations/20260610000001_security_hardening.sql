-- Security hardening: server-authoritative order timestamps
-- Created: 2026-06-10
--
-- Purpose: Provide an immutable server-side timestamp function that
-- eliminates any possibility of client-supplied timestamps being used
-- for order lifecycle fields (opened_at, closed_at, created_at).
--
-- Usage in Edge Functions:
--   const { data: ts } = await admin.rpc('order_timestamp');
--   // ts is the authoritative PostgreSQL now() timestamp

CREATE OR REPLACE FUNCTION public.order_timestamp()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT now()
$$;

-- Grant execute to service_role and authenticated
GRANT EXECUTE ON FUNCTION public.order_timestamp() TO service_role;
GRANT EXECUTE ON FUNCTION public.order_timestamp() TO authenticated;

-- ============================================================================
-- Slippage validation layer
-- ============================================================================
-- Per-symbol slippage thresholds prevent orders from filling at unreasonable
-- prices. Server-side validation only — clients cannot specify tolerance.

-- Table: per-symbol slippage thresholds
CREATE TABLE IF NOT EXISTS public.slippage_config (
  symbol text PRIMARY KEY,
  max_slippage_pct numeric NOT NULL DEFAULT 5.0 CHECK (max_slippage_pct > 0 AND max_slippage_pct <= 100),
  mode text NOT NULL DEFAULT 'fixed' CHECK (mode IN ('fixed', 'dynamic')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.slippage_config ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated can read, service_role has full access
CREATE POLICY "slippage_config_read_all" ON public.slippage_config
  FOR SELECT TO authenticated USING (true);

GRANT ALL ON public.slippage_config TO service_role;

-- Seed default symbols
INSERT INTO public.slippage_config (symbol, max_slippage_pct, mode) VALUES
  ('BTCUSD', 2.0, 'fixed'),
  ('ETHUSD', 3.0, 'fixed'),
  ('SOLUSD', 5.0, 'fixed')
ON CONFLICT (symbol) DO NOTHING;

-- Function: validate entry price against reference price
CREATE OR REPLACE FUNCTION public.validate_slippage(
  _symbol text,
  _entry_price numeric,
  _reference_price numeric
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _max_slip numeric;
  _actual_slip numeric;
BEGIN
  -- Look up symbol-specific threshold, default to 5%
  SELECT max_slippage_pct INTO _max_slip
    FROM public.slippage_config
   WHERE symbol = _symbol;

  IF _max_slip IS NULL THEN
    _max_slip := 5.0;
  END IF;

  -- Guard against invalid prices
  IF _reference_price <= 0 OR _entry_price <= 0 THEN
    RETURN false;
  END IF;

  -- Calculate actual slippage percentage
  _actual_slip := abs((_entry_price - _reference_price) / _reference_price * 100);

  RETURN _actual_slip <= _max_slip;
END;
$$;

-- Only service_role can execute — no client access
GRANT EXECUTE ON FUNCTION public.validate_slippage(text, numeric, numeric) TO service_role;

-- ============================================================================
-- Anti-cheat guard triggers for blitz game tables
-- ============================================================================
-- Defense-in-depth alongside RLS: even if RLS is bypassed (e.g. SECURITY DEFINER
-- functions), these BEFORE triggers reject non-service_role mutations.

-- 1) blitz_orders: block non-service-role UPDATE/DELETE entirely.
--    Also enforce financial field immutability as a secondary layer.
CREATE OR REPLACE FUNCTION public.guard_blitz_orders_cheat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF caller_role IS DISTINCT FROM 'service_role' THEN
    -- Block all UPDATE and DELETE from non-service-role callers
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'blitz_orders: UPDATE and DELETE are restricted to backend service';
    END IF;
  END IF;

  -- Secondary defense: financial field immutability for UPDATE operations.
  -- Prevents tampering with order economics even if the primary block is
  -- ever relaxed in the future.
  IF TG_OP = 'UPDATE' AND caller_role IS DISTINCT FROM 'service_role' THEN
    IF NEW.entry_price IS DISTINCT FROM OLD.entry_price
      OR NEW.exit_price IS DISTINCT FROM OLD.exit_price
      OR NEW.pnl IS DISTINCT FROM OLD.pnl
      OR NEW.side IS DISTINCT FROM OLD.side
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.user_id IS DISTINCT FROM OLD.user_id
    THEN
      RAISE EXCEPTION 'blitz_orders: financial fields (entry_price, exit_price, pnl, side, amount, user_id) are immutable for non-service callers';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_blitz_orders_cheat_trg ON public.blitz_orders;
CREATE TRIGGER guard_blitz_orders_cheat_trg
BEFORE UPDATE OR DELETE ON public.blitz_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_blitz_orders_cheat();

-- 2) blitz_participants: block non-service-role UPDATE/DELETE entirely.
CREATE OR REPLACE FUNCTION public.guard_blitz_participants_cheat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  caller_role text := current_setting('request.jwt.claim.role', true);
BEGIN
  IF caller_role IS DISTINCT FROM 'service_role' THEN
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'blitz_participants: UPDATE and DELETE are restricted to backend service';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_blitz_participants_cheat_trg ON public.blitz_participants;
CREATE TRIGGER guard_blitz_participants_cheat_trg
BEFORE UPDATE OR DELETE ON public.blitz_participants
FOR EACH ROW
EXECUTE FUNCTION public.guard_blitz_participants_cheat();

-- Lock down execute privileges — only service_role should call these directly
REVOKE EXECUTE ON FUNCTION public.guard_blitz_orders_cheat() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_blitz_participants_cheat() FROM PUBLIC, anon, authenticated;
