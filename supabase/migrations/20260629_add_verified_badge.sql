-- Add pro metrics columns to user_stats
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS max_drawdown NUMERIC DEFAULT 0;
ALTER TABLE public.user_stats ADD COLUMN IF NOT EXISTS sharpe_ratio NUMERIC DEFAULT 0;

-- Update leaderboard function to include verified + pro metrics
CREATE OR REPLACE FUNCTION public.get_leaderboard(_limit INTEGER DEFAULT 50)
RETURNS TABLE(
  user_id UUID, username TEXT, level INTEGER, xp INTEGER,
  total_pnl NUMERIC, total_trades INTEGER, win_rate NUMERIC,
  verified BOOLEAN, max_drawdown NUMERIC, sharpe_ratio NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT pp.user_id, pp.username, us.level, us.xp, us.total_pnl, us.total_trades,
    CASE WHEN us.total_trades > 0
      THEN ROUND((us.profitable_trades::numeric / us.total_trades) * 100, 1)
      ELSE 0 END AS win_rate,
    COALESCE(pp.verified, false),
    COALESCE(us.max_drawdown, 0),
    COALESCE(us.sharpe_ratio, 0)
  FROM public.public_profiles pp
  JOIN public.user_stats us ON us.user_id = pp.user_id
  WHERE pp.is_active = true
  ORDER BY us.total_pnl DESC NULLS LAST
  LIMIT _limit;
$$;
