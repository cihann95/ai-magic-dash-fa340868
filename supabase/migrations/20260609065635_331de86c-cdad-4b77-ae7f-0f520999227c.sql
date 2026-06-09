
-- FAZ 4: Platform gelir kayıtları
CREATE TABLE IF NOT EXISTS public.platform_revenue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'blitz',
  room_id uuid REFERENCES public.blitz_rooms(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'USD',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_revenue TO authenticated;
GRANT ALL ON public.platform_revenue TO service_role;

ALTER TABLE public.platform_revenue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all platform revenue"
ON public.platform_revenue FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_platform_revenue_created_at ON public.platform_revenue (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_revenue_source ON public.platform_revenue (source, created_at DESC);

-- Admin top-up logu (manuel real_balance kredisi)
CREATE TABLE IF NOT EXISTS public.real_balance_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.real_balance_ledger TO authenticated;
GRANT ALL ON public.real_balance_ledger TO service_role;

ALTER TABLE public.real_balance_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ledger"
ON public.real_balance_ledger FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_real_balance_ledger_user ON public.real_balance_ledger (user_id, created_at DESC);

-- Günlük/haftalık rapor view (admin)
CREATE OR REPLACE VIEW public.platform_revenue_daily AS
SELECT
  date_trunc('day', created_at)::date AS day,
  source,
  COUNT(*)::int AS tx_count,
  SUM(amount)::numeric AS total_amount
FROM public.platform_revenue
GROUP BY 1, 2
ORDER BY 1 DESC;

GRANT SELECT ON public.platform_revenue_daily TO authenticated;
