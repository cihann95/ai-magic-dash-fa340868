ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trader_persona jsonb,
  ADD COLUMN IF NOT EXISTS last_weekly_digest_at timestamptz;

ALTER TABLE public.trades
  ADD COLUMN IF NOT EXISTS planned_tp numeric,
  ADD COLUMN IF NOT EXISTS planned_sl numeric,
  ADD COLUMN IF NOT EXISTS plan_adherence numeric;