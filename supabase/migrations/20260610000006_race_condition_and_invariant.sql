-- T1.3: Race condition fix + settlement_ledger invariant
-- Created: 2026-06-10
--
-- 1. positions.closed_at column for optimistic locking on position close
-- 2. settlement_ledger invariant trigger: pot_total = prize_amount + fee_collected

-- ============================================================================
-- 1) Add closed_at column to positions for optimistic locking
-- ============================================================================
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Index for efficient filtering of open positions
CREATE INDEX IF NOT EXISTS idx_positions_open
  ON public.positions (user_id, symbol)
  WHERE closed_at IS NULL;

-- ============================================================================
-- 2) settlement_ledger invariant trigger
-- Enforces: pot_total = prize_amount + fee_collected when status = 'completed'
-- ============================================================================
CREATE OR REPLACE FUNCTION public.validate_settlement_invariant()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND NEW.pot_total != (NEW.prize_amount + NEW.fee_collected) THEN
    RAISE EXCEPTION 'Invariant violation: pot_total (%) must equal prize_amount (%) + fee_collected (%)',
      NEW.pot_total, NEW.prize_amount, NEW.fee_collected;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS settlement_invariant_check ON public.settlement_ledger;
CREATE TRIGGER settlement_invariant_check
  BEFORE INSERT OR UPDATE ON public.settlement_ledger
  FOR EACH ROW EXECUTE FUNCTION public.validate_settlement_invariant();
