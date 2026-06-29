-- P2: OrderBook snapshots + Referral system
-- 20260629100001

-- ===== ORDERBOOK SNAPSHOTS (per symbol) =====
CREATE TABLE IF NOT EXISTS public.orderbook_snapshots (
  symbol TEXT NOT NULL,
  bids JSONB NOT NULL DEFAULT '[]'::jsonb,
  asks JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol)
);
ALTER TABLE public.orderbook_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "obs_select_all" ON public.orderbook_snapshots FOR SELECT USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS public.orderbook_snapshots;

-- ===== REFERRAL SYSTEM =====
ALTER TABLE public.public_profiles ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_public_profiles_referral_code ON public.public_profiles(referral_code) WHERE referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  bonus_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ref_select_own" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
CREATE POLICY "ref_insert_own" ON public.referrals FOR INSERT WITH CHECK (auth.uid() = referrer_id);
CREATE POLICY "ref_update_own" ON public.referrals FOR UPDATE USING (auth.uid() = referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(status);
