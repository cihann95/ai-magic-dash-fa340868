-- Fix user_stats initialization for accounts missing stats rows
-- Also auto-create user_stats when profiles are created (new signups)

-- Backfill: create user_stats for any user who has a profile but no stats
INSERT INTO public.user_stats (user_id, xp, level, current_streak, longest_streak, total_trades, profitable_trades, total_pnl)
SELECT p.id, 0, 1, 0, 0, 0, 0, 0
FROM public.profiles p
LEFT JOIN public.user_stats s ON s.user_id = p.id
WHERE s.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Trigger: auto-create user_stats when a profile is inserted
CREATE OR REPLACE FUNCTION public.create_user_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_stats (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_user_stats ON public.profiles;
CREATE TRIGGER trg_create_user_stats
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_user_stats();
